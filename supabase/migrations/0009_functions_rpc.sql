-- Transactional RPCs. All business-critical state changes happen here so payment
-- verification, allocation, subscription settlement and reward writes are atomic.
-- Every function is service-role only; the Express API performs authentication and
-- authorization before invoking them.

-- ---------------------------------------------------------------------------
-- Billing helpers
-- ---------------------------------------------------------------------------

create or replace function public.ensure_next_billing_period(
  p_subscription_id uuid,
  p_force boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sub public.subscriptions%rowtype;
  v_start date;
  v_id uuid;
begin
  select * into v_sub from public.subscriptions where id = p_subscription_id for update;
  if not found then
    raise exception 'SUBSCRIPTION_NOT_FOUND';
  end if;

  select max(period_end) into v_start from public.billing_periods where subscription_id = p_subscription_id;
  if v_start is null then v_start := v_sub.current_period_end; end if;

  if not p_force and v_start > (current_date + interval '7 days')::date then
    return null;
  end if;

  if exists (
    select 1 from public.billing_periods
    where subscription_id = p_subscription_id and period_start = v_start
  ) then
    return null;
  end if;

  insert into public.billing_periods (
    subscription_id, plan_id, period_start, period_end, amount_due_minor,
    currency_code, status, due_at
  )
  values (
    p_subscription_id, v_sub.plan_id, v_start, (v_start + interval '1 month')::date,
    v_sub.monthly_price_minor, v_sub.currency_code, 'DUE', v_start::timestamptz
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.allocate_verified_payments(p_subscription_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sub public.subscriptions%rowtype;
  v_period public.billing_periods%rowtype;
  v_payment public.payments%rowtype;
  v_available bigint;
  v_remaining bigint;
  v_allocate bigint;
  v_any boolean := false;
begin
  select * into v_sub from public.subscriptions where id = p_subscription_id for update;
  if not found then raise exception 'SUBSCRIPTION_NOT_FOUND'; end if;

  select * into v_period
  from public.billing_periods
  where subscription_id = p_subscription_id
    and status in ('DUE', 'PARTIAL')
  order by period_start
  for update
  limit 1;

  if not found then return false; end if;

  for v_payment in
    select * from public.payments
    where shop_id = v_sub.shop_id and status = 'VERIFIED'
    order by paid_at
    for update
  loop
    select v_payment.amount_minor - coalesce(sum(allocated_amount_minor), 0)
      into v_available
    from public.payment_allocations
    where payment_id = v_payment.id;

    v_remaining := v_period.amount_due_minor - v_period.amount_paid_minor;
    if v_available <= 0 or v_remaining <= 0 then continue; end if;

    v_allocate := least(v_available, v_remaining);
    insert into public.payment_allocations (payment_id, billing_period_id, allocated_amount_minor)
    values (v_payment.id, v_period.id, v_allocate);

    update public.billing_periods
    set amount_paid_minor = amount_paid_minor + v_allocate,
        status = case when amount_paid_minor + v_allocate >= amount_due_minor then 'PAID' else 'PARTIAL' end,
        settled_at = case when amount_paid_minor + v_allocate >= amount_due_minor then now() else settled_at end
    where id = v_period.id;

    v_period.amount_paid_minor := v_period.amount_paid_minor + v_allocate;
    v_any := true;
    if v_period.amount_paid_minor >= v_period.amount_due_minor then exit; end if;
  end loop;

  return v_any;
end;
$$;

-- ---------------------------------------------------------------------------
-- Shop registration and creation
-- ---------------------------------------------------------------------------

create or replace function public.register_shop(
  p_installation_id uuid,
  p_shop_name text,
  p_owner_name text,
  p_phone text,
  p_email text,
  p_address_line1 text,
  p_city text,
  p_state text,
  p_postal_code text,
  p_country_code text,
  p_gst_number text,
  p_app_version text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_shop public.shops%rowtype;
  v_plan public.subscription_plans%rowtype;
  v_subscription_id uuid;
  v_code text;
begin
  select * into v_shop from public.shops where installation_id = p_installation_id;
  if found then
    select id into v_subscription_id from public.subscriptions where shop_id = v_shop.id;
    return jsonb_build_object(
      'shop_id', v_shop.id,
      'shop_code', v_shop.shop_code,
      'subscription_id', v_subscription_id,
      'created', false
    );
  end if;

  select * into v_plan from public.subscription_plans where is_active = true order by created_at limit 1;
  if not found then
    raise exception 'NO_ACTIVE_PLAN: Configure and activate a monthly plan before shop registration.';
  end if;

  loop
    v_code := 'AR-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 8));
    exit when not exists (select 1 from public.shops where shop_code = v_code);
  end loop;

  insert into public.shops (
    shop_code, shop_name, owner_name, phone, email, address_line1, city, state,
    postal_code, country_code, gst_number, registration_status, registered_at,
    installation_id, app_version, last_seen_at, rewards_enabled
  )
  values (
    v_code, p_shop_name, p_owner_name, p_phone, p_email, p_address_line1, p_city, p_state,
    p_postal_code, p_country_code, p_gst_number, 'ACTIVE', now(),
    p_installation_id, p_app_version, now(), false
  )
  returning * into v_shop;

  insert into public.subscriptions (
    shop_id, plan_id, status, monthly_price_minor, currency_code,
    current_period_start, current_period_end, grace_deadline,
    suspension_reason, suspension_note
  )
  values (
    v_shop.id, v_plan.id, 'SUSPENDED', v_plan.monthly_price_minor, v_plan.currency_code,
    current_date, (current_date + interval '1 month')::date,
    ((current_date + interval '1 month')::date + make_interval(days => v_plan.grace_days)),
    'OTHER', 'Awaiting initial payment verification'
  )
  returning id into v_subscription_id;

  insert into public.billing_periods (
    subscription_id, plan_id, period_start, period_end, amount_due_minor, currency_code, status, due_at
  )
  values (
    v_subscription_id, v_plan.id, current_date, (current_date + interval '1 month')::date,
    v_plan.monthly_price_minor, v_plan.currency_code, 'DUE', now()
  );

  return jsonb_build_object(
    'shop_id', v_shop.id,
    'shop_code', v_shop.shop_code,
    'subscription_id', v_subscription_id,
    'created', true
  );
end;
$$;

create or replace function public.create_shop(
  p_shop_code text,
  p_shop_name text,
  p_owner_name text,
  p_phone text,
  p_email text,
  p_address_line1 text,
  p_city text,
  p_state text,
  p_postal_code text,
  p_country_code text,
  p_gst_number text,
  p_plan_id uuid,
  p_admin_id uuid,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_shop public.shops%rowtype;
  v_plan public.subscription_plans%rowtype;
  v_subscription_id uuid;
begin
  select * into v_plan from public.subscription_plans where id = p_plan_id;
  if not found then raise exception 'PLAN_NOT_FOUND'; end if;

  insert into public.shops (
    shop_code, shop_name, owner_name, phone, email, address_line1, city, state,
    postal_code, country_code, gst_number, registration_status, registered_at
  )
  values (
    p_shop_code, p_shop_name, p_owner_name, p_phone, p_email, p_address_line1, p_city, p_state,
    p_postal_code, p_country_code, p_gst_number, 'ACTIVE', now()
  )
  returning * into v_shop;

  insert into public.subscriptions (
    shop_id, plan_id, status, monthly_price_minor, currency_code,
    current_period_start, current_period_end, grace_deadline, suspension_reason, suspension_note
  )
  values (
    v_shop.id, p_plan_id, 'SUSPENDED', v_plan.monthly_price_minor, v_plan.currency_code,
    current_date, (current_date + interval '1 month')::date,
    ((current_date + interval '1 month')::date + make_interval(days => v_plan.grace_days)),
    'OTHER', 'Awaiting initial payment verification'
  )
  returning id into v_subscription_id;

  insert into public.billing_periods (
    subscription_id, plan_id, period_start, period_end, amount_due_minor, currency_code, status, due_at
  )
  values (
    v_subscription_id, p_plan_id, current_date, (current_date + interval '1 month')::date,
    v_plan.monthly_price_minor, v_plan.currency_code, 'DUE', now()
  );

  insert into public.audit_logs (actor_user_id, actor_type, action, entity_type, entity_id, shop_id, request_id, after_data)
  values (p_admin_id, 'ADMIN', 'SHOP_CREATED', 'shop', v_shop.id::text, v_shop.id, p_request_id,
          jsonb_build_object('shop_code', v_shop.shop_code, 'plan_id', p_plan_id));

  return jsonb_build_object('shop_id', v_shop.id, 'shop_code', v_shop.shop_code, 'subscription_id', v_subscription_id);
end;
$$;

create or replace function public.create_subscription(
  p_shop_id uuid,
  p_plan_id uuid,
  p_monthly_price_minor bigint,
  p_currency_code text,
  p_period_start date,
  p_admin_id uuid,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_plan public.subscription_plans%rowtype;
  v_start date := coalesce(p_period_start, current_date);
  v_sub_id uuid;
begin
  if exists (select 1 from public.subscriptions where shop_id = p_shop_id) then
    raise exception 'SUBSCRIPTION_EXISTS';
  end if;
  select * into v_plan from public.subscription_plans where id = p_plan_id;
  if not found then raise exception 'PLAN_NOT_FOUND'; end if;

  insert into public.subscriptions (
    shop_id, plan_id, status, monthly_price_minor, currency_code,
    current_period_start, current_period_end, grace_deadline, suspension_reason, suspension_note
  )
  values (
    p_shop_id, p_plan_id, 'SUSPENDED', coalesce(p_monthly_price_minor, v_plan.monthly_price_minor), p_currency_code,
    v_start, (v_start + interval '1 month')::date,
    ((v_start + interval '1 month')::date + make_interval(days => v_plan.grace_days)),
    'OTHER', 'Awaiting initial payment verification'
  )
  returning id into v_sub_id;

  insert into public.billing_periods (
    subscription_id, plan_id, period_start, period_end, amount_due_minor, currency_code, status, due_at
  )
  values (
    v_sub_id, p_plan_id, v_start, (v_start + interval '1 month')::date,
    coalesce(p_monthly_price_minor, v_plan.monthly_price_minor), p_currency_code, 'DUE', now()
  );

  insert into public.audit_logs (actor_user_id, actor_type, action, entity_type, entity_id, shop_id, request_id)
  values (p_admin_id, 'ADMIN', 'SUBSCRIPTION_CREATED', 'subscription', v_sub_id::text, p_shop_id, p_request_id);

  return jsonb_build_object('subscription_id', v_sub_id, 'shop_id', p_shop_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Payment verification and subscription lifecycle
-- ---------------------------------------------------------------------------

create or replace function public.verify_payment(
  p_payment_id uuid,
  p_billing_period_id uuid,
  p_admin_id uuid,
  p_allocate_amount_minor bigint,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payment public.payments%rowtype;
  v_period public.billing_periods%rowtype;
  v_sub public.subscriptions%rowtype;
  v_plan public.subscription_plans%rowtype;
  v_allocated bigint;
  v_amount bigint;
  v_new_paid bigint;
  v_period_paid boolean;
  v_period_id uuid := p_billing_period_id;
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  if v_payment.status <> 'PENDING' then raise exception 'PAYMENT_NOT_PENDING'; end if;

  if v_period_id is null then
    select bp.id into v_period_id
    from public.billing_periods bp
    join public.subscriptions sub on sub.id = bp.subscription_id
    where sub.shop_id = v_payment.shop_id and bp.status in ('DUE', 'PARTIAL')
    order by bp.period_start
    for update
    limit 1;
    if v_period_id is null then raise exception 'NO_OPEN_BILLING_PERIOD'; end if;
  end if;

  select * into v_period from public.billing_periods where id = v_period_id for update;
  if not found then raise exception 'BILLING_PERIOD_NOT_FOUND'; end if;

  select * into v_sub from public.subscriptions where id = v_period.subscription_id for update;
  if v_sub.shop_id <> v_payment.shop_id then raise exception 'PAYMENT_PERIOD_SHOP_MISMATCH'; end if;
  if v_period.status in ('PAID', 'VOID') then raise exception 'PERIOD_ALREADY_SETTLED'; end if;

  select coalesce(sum(allocated_amount_minor), 0) into v_allocated
  from public.payment_allocations where payment_id = p_payment_id;

  v_amount := coalesce(p_allocate_amount_minor, v_payment.amount_minor - v_allocated);
  if v_amount <= 0 then raise exception 'INVALID_ALLOCATION_AMOUNT'; end if;
  if v_allocated + v_amount > v_payment.amount_minor then raise exception 'EXCESS_PAYMENT_ALLOCATION'; end if;
  if v_period.amount_paid_minor + v_amount > v_period.amount_due_minor then raise exception 'EXCESS_PERIOD_ALLOCATION'; end if;

  insert into public.payment_allocations (payment_id, billing_period_id, allocated_amount_minor)
  values (p_payment_id, v_period_id, v_amount);

  v_new_paid := v_period.amount_paid_minor + v_amount;
  v_period_paid := v_new_paid >= v_period.amount_due_minor;

  update public.billing_periods
  set amount_paid_minor = v_new_paid,
      status = case when v_period_paid then 'PAID' else 'PARTIAL' end,
      settled_at = case when v_period_paid then now() else null end
  where id = v_period_id;

  update public.payments
  set status = 'VERIFIED', verified_by = p_admin_id, verified_at = now()
  where id = p_payment_id;

  if v_period_paid and v_sub.suspension_reason is distinct from 'MANUAL' and v_sub.status <> 'CANCELLED' then
    select * into v_plan from public.subscription_plans where id = v_sub.plan_id;
    update public.subscriptions
    set status = 'ACTIVE',
        current_period_start = case when v_period.period_start < v_sub.current_period_start then v_period.period_start else v_sub.current_period_start end,
        current_period_end = case when v_period.period_end > v_sub.current_period_end then v_period.period_end else v_sub.current_period_end end,
        grace_deadline = (greatest(v_period.period_end, v_sub.current_period_end) + make_interval(days => v_plan.grace_days)),
        suspension_reason = null,
        suspension_note = null,
        suspended_at = null,
        updated_at = now()
    where id = v_sub.id;
  end if;

  insert into public.audit_logs (
    actor_user_id, actor_type, action, entity_type, entity_id, shop_id, reason, request_id, before_data, after_data
  )
  values (
    p_admin_id, 'ADMIN', 'PAYMENT_VERIFIED', 'payment', p_payment_id::text, v_payment.shop_id,
    'Payment verified and allocated', p_request_id,
    jsonb_build_object('status', v_payment.status),
    jsonb_build_object('status', 'VERIFIED', 'allocated_minor', v_amount, 'billing_period_id', v_period_id)
  );

  return jsonb_build_object(
    'payment_id', p_payment_id,
    'billing_period_id', v_period_id,
    'allocated_minor', v_amount,
    'period_status', case when v_period_paid then 'PAID' else 'PARTIAL' end,
    'manual_hold', v_sub.suspension_reason = 'MANUAL'
  );
end;
$$;

create or replace function public.suspend_subscription(
  p_subscription_id uuid,
  p_admin_id uuid,
  p_reason_code text,
  p_reason text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sub public.subscriptions%rowtype;
begin
  if p_reason_code not in ('MANUAL', 'OVERDUE', 'OTHER') then raise exception 'INVALID_REASON_CODE'; end if;
  if length(trim(p_reason)) < 3 then raise exception 'REASON_REQUIRED'; end if;

  select * into v_sub from public.subscriptions where id = p_subscription_id for update;
  if not found then raise exception 'SUBSCRIPTION_NOT_FOUND'; end if;
  if v_sub.status = 'CANCELLED' then raise exception 'SUBSCRIPTION_CANCELLED'; end if;

  update public.subscriptions
  set status = 'SUSPENDED',
      suspension_reason = p_reason_code,
      suspension_note = p_reason,
      suspended_at = now(),
      updated_at = now()
  where id = p_subscription_id;

  update public.licence_leases
  set revoked_at = now()
  where subscription_id = p_subscription_id and revoked_at is null;

  insert into public.audit_logs (actor_user_id, actor_type, action, entity_type, entity_id, shop_id, reason, request_id, before_data, after_data)
  values (p_admin_id, 'ADMIN', 'SUBSCRIPTION_SUSPENDED', 'subscription', p_subscription_id::text, v_sub.shop_id,
          p_reason, p_request_id, jsonb_build_object('status', v_sub.status),
          jsonb_build_object('status', 'SUSPENDED', 'reason_code', p_reason_code));

  return jsonb_build_object('subscription_id', p_subscription_id, 'status', 'SUSPENDED', 'reason_code', p_reason_code);
end;
$$;

create or replace function public.reactivate_subscription(
  p_subscription_id uuid,
  p_admin_id uuid,
  p_reason text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sub public.subscriptions%rowtype;
  v_paid boolean;
  v_allocated boolean;
begin
  if length(trim(p_reason)) < 3 then raise exception 'REASON_REQUIRED'; end if;
  select * into v_sub from public.subscriptions where id = p_subscription_id for update;
  if not found then raise exception 'SUBSCRIPTION_NOT_FOUND'; end if;
  if v_sub.status = 'CANCELLED' then raise exception 'SUBSCRIPTION_CANCELLED'; end if;

  select exists (
    select 1 from public.billing_periods
    where subscription_id = p_subscription_id and status = 'PAID' and period_end >= current_date
  ) into v_paid;

  v_allocated := public.allocate_verified_payments(p_subscription_id);
  v_paid := v_paid or exists (
    select 1 from public.billing_periods
    where subscription_id = p_subscription_id and status = 'PAID' and period_end >= current_date
  );

  if not v_paid then
    raise exception 'PAYMENT_REQUIRED: A verified payment covering the current period is required before reactivation.';
  end if;

  update public.subscriptions
  set status = 'ACTIVE',
      suspension_reason = null,
      suspension_note = null,
      suspended_at = null,
      updated_at = now()
  where id = p_subscription_id;

  insert into public.audit_logs (actor_user_id, actor_type, action, entity_type, entity_id, shop_id, reason, request_id, before_data, after_data)
  values (p_admin_id, 'ADMIN', 'SUBSCRIPTION_REACTIVATED', 'subscription', p_subscription_id::text, v_sub.shop_id,
          p_reason, p_request_id, jsonb_build_object('status', v_sub.status, 'reason', v_sub.suspension_reason),
          jsonb_build_object('status', 'ACTIVE', 'allocated_from_payments', v_allocated));

  return jsonb_build_object('subscription_id', p_subscription_id, 'status', 'ACTIVE', 'allocated_from_payments', v_allocated);
end;
$$;

create or replace function public.renew_subscription(
  p_subscription_id uuid,
  p_admin_id uuid,
  p_reason text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sub public.subscriptions%rowtype;
  v_period_id uuid;
  v_allocated boolean := false;
  v_paid boolean := false;
begin
  select * into v_sub from public.subscriptions where id = p_subscription_id for update;
  if not found then raise exception 'SUBSCRIPTION_NOT_FOUND'; end if;
  if v_sub.status = 'CANCELLED' then raise exception 'SUBSCRIPTION_CANCELLED'; end if;

  v_period_id := public.ensure_next_billing_period(p_subscription_id, true);
  v_allocated := public.allocate_verified_payments(p_subscription_id);

  select exists (
    select 1 from public.billing_periods
    where subscription_id = p_subscription_id and status = 'PAID' and period_end >= current_date
  ) into v_paid;

  if v_paid and v_sub.suspension_reason is distinct from 'MANUAL' and v_sub.status <> 'CANCELLED' then
    update public.subscriptions set status = 'ACTIVE', suspension_reason = null, suspension_note = null,
      suspended_at = null, updated_at = now()
    where id = p_subscription_id;
  end if;

  insert into public.audit_logs (actor_user_id, actor_type, action, entity_type, entity_id, shop_id, reason, request_id, after_data)
  values (p_admin_id, 'ADMIN', 'SUBSCRIPTION_RENEWED', 'subscription', p_subscription_id::text, v_sub.shop_id,
          p_reason, p_request_id, jsonb_build_object('billing_period_id', v_period_id, 'allocated', v_allocated));

  return jsonb_build_object(
    'subscription_id', p_subscription_id,
    'billing_period_id', v_period_id,
    'allocated_from_payments', v_allocated,
    'status', case when v_paid and v_sub.suspension_reason is distinct from 'MANUAL' then 'ACTIVE' else v_sub.status end
  );
end;
$$;

create or replace function public.process_subscription_lifecycle()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sub public.subscriptions%rowtype;
  v_plan public.subscription_plans%rowtype;
  v_grace timestamptz;
  v_request_id text;
  v_graced integer := 0;
  v_suspended integer := 0;
  v_periods_created integer := 0;
begin
  for v_sub in select * from public.subscriptions where status <> 'CANCELLED' loop
    select * into v_plan from public.subscription_plans where id = v_sub.plan_id;

    if public.ensure_next_billing_period(v_sub.id, false) is not null then
      v_periods_created := v_periods_created + 1;
    end if;

    if v_sub.status = 'ACTIVE' and v_sub.current_period_end < current_date then
      v_grace := coalesce(v_sub.grace_deadline, v_sub.current_period_end::timestamptz + make_interval(days => v_plan.grace_days));
      update public.subscriptions set status = 'GRACE', grace_deadline = v_grace, updated_at = now() where id = v_sub.id;
      v_request_id := 'cron:grace:' || v_sub.id::text || ':' || v_sub.current_period_end::text;
      if not exists (select 1 from public.audit_logs where request_id = v_request_id) then
        insert into public.audit_logs (actor_user_id, actor_type, action, entity_type, entity_id, shop_id, reason, request_id)
        values (null, 'SYSTEM', 'AUTO_GRACE', 'subscription', v_sub.id::text, v_sub.shop_id, 'Billing period expired unpaid', v_request_id);
      end if;
      v_graced := v_graced + 1;
    elsif v_sub.status = 'GRACE' and v_sub.grace_deadline is not null and v_sub.grace_deadline <= now() then
      if not exists (
        select 1 from public.billing_periods
        where subscription_id = v_sub.id and status = 'PAID' and period_end >= v_sub.current_period_end
      ) then
        update public.subscriptions
        set status = 'SUSPENDED', suspension_reason = 'OVERDUE', suspension_note = 'Grace period elapsed without verified payment',
            suspended_at = now(), updated_at = now()
        where id = v_sub.id;

        update public.billing_periods
        set status = 'OVERDUE'
        where subscription_id = v_sub.id and status in ('DUE', 'PARTIAL') and period_end <= current_date;

        update public.licence_leases set revoked_at = now()
        where subscription_id = v_sub.id and revoked_at is null;

        v_request_id := 'cron:suspend:' || v_sub.id::text || ':' || v_sub.grace_deadline::text;
        if not exists (select 1 from public.audit_logs where request_id = v_request_id) then
          insert into public.audit_logs (actor_user_id, actor_type, action, entity_type, entity_id, shop_id, reason, request_id)
          values (null, 'SYSTEM', 'AUTO_SUSPENDED', 'subscription', v_sub.id::text, v_sub.shop_id, 'Seven-day grace period elapsed', v_request_id);
        end if;
        v_suspended := v_suspended + 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'processed_at', now(),
    'grace_transitions', v_graced,
    'suspensions', v_suspended,
    'billing_periods_created', v_periods_created
  );
end;
$$;

create or replace function public.process_reward_expiry()
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'processed_at', now(),
    'expired_entries', 0,
    'note', 'No points expiry policy has been approved; no ledger entries were changed.'
  );
$$;

-- ---------------------------------------------------------------------------
-- Devices
-- ---------------------------------------------------------------------------

create or replace function public.activate_device(
  p_shop_id uuid,
  p_device_name text,
  p_public_key text,
  p_key_fingerprint text,
  p_app_version text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.shop_devices%rowtype;
  v_device_id uuid;
begin
  select * into v_existing from public.shop_devices where key_fingerprint = p_key_fingerprint;
  if found and v_existing.shop_id <> p_shop_id then
    raise exception 'DEVICE_KEY_CONFLICT: This device key belongs to another shop.';
  end if;

  update public.shop_devices
  set status = 'REVOKED', revoked_at = now(), revoked_reason = 'Replaced by a new device activation'
  where shop_id = p_shop_id and status = 'ACTIVE';

  insert into public.shop_devices (
    shop_id, device_name, public_key, key_fingerprint, status, activated_at, last_seen_at
  )
  values (p_shop_id, p_device_name, p_public_key, p_key_fingerprint, 'ACTIVE', now(), now())
  on conflict (key_fingerprint) do update set
    status = 'ACTIVE',
    activated_at = coalesce(public.shop_devices.activated_at, now()),
    revoked_at = null,
    revoked_reason = null,
    last_seen_at = now(),
    device_name = excluded.device_name
  returning id into v_device_id;

  if p_app_version is not null then
    update public.shops set app_version = p_app_version, last_seen_at = now() where id = p_shop_id;
  end if;

  return v_device_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reward processing and corrections
-- ---------------------------------------------------------------------------

create or replace function public.process_reward_event(
  p_event_id uuid,
  p_rule_version_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event public.reward_events%rowtype;
  v_rule public.reward_rule_versions%rowtype;
  v_rate numeric;
  v_rounding text;
  v_points bigint;
  v_result jsonb;
begin
  select * into v_event from public.reward_events where id = p_event_id for update;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;
  if v_event.status = 'PROCESSED' then return coalesce(v_event.result, jsonb_build_object('duplicate', true)); end if;
  if v_event.status = 'REJECTED' then raise exception 'EVENT_REJECTED'; end if;

  select * into v_rule from public.reward_rule_versions where id = p_rule_version_id;
  if not found or not v_rule.is_approved then raise exception 'RULE_NOT_APPROVED'; end if;

  v_rate := nullif(v_rule.configuration ->> 'points_per_minor', '')::numeric;
  if v_rate is null or v_rate <= 0 then
    raise exception 'RULE_CONFIG_INCOMPLETE: points_per_minor must be supplied and approved.';
  end if;
  v_rounding := coalesce(v_rule.configuration ->> 'rounding', 'floor');

  v_points := (v_event.eligible_amount_minor::numeric * v_rate);
  if v_rounding = 'ceil' then v_points := ceil(v_points)::bigint;
  elsif v_rounding = 'round' then v_points := round(v_points)::bigint;
  else v_points := floor(v_points)::bigint; end if;

  if v_event.event_type in ('RETURN', 'REVERSAL') then v_points := -v_points; end if;

  insert into public.reward_ledger (
    membership_id, entry_type, points_delta, source_event_id, rule_version_id, description, idempotency_key
  )
  values (
    v_event.membership_id, case when v_points >= 0 then 'EARN' else 'REVERSAL' end, v_points,
    v_event.id, v_rule.id, 'Reward event ' || v_event.idempotency_key, v_event.id::text || ':points'
  )
  on conflict (idempotency_key) do nothing;

  v_result := jsonb_build_object('points_delta', v_points, 'rule_version_id', v_rule.id, 'event_id', v_event.id);
  update public.reward_events
  set status = 'PROCESSED', result = v_result, processed_at = now()
  where id = v_event.id;

  return v_result;
end;
$$;

create or replace function public.adjust_reward(
  p_membership_id uuid,
  p_adjustment_type text,
  p_amount_delta bigint,
  p_reason text,
  p_admin_id uuid,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_member public.customer_shop_memberships%rowtype;
  v_wallet_id uuid;
  v_entry_id uuid;
  v_request_id uuid;
begin
  if p_adjustment_type not in ('POINTS', 'WALLET') then raise exception 'INVALID_ADJUSTMENT_TYPE'; end if;
  if p_amount_delta = 0 or length(trim(p_reason)) < 3 then raise exception 'INVALID_ADJUSTMENT'; end if;

  select * into v_member from public.customer_shop_memberships where id = p_membership_id for update;
  if not found then raise exception 'MEMBERSHIP_NOT_FOUND'; end if;

  insert into public.reward_adjustment_requests (
    membership_id, adjustment_type, amount_delta, reason, status, requested_by, reviewed_by, reviewed_at
  )
  values (p_membership_id, p_adjustment_type, p_amount_delta, p_reason, 'APPROVED', p_admin_id, p_admin_id, now())
  returning id into v_request_id;

  if p_adjustment_type = 'POINTS' then
    insert into public.reward_ledger (
      membership_id, entry_type, points_delta, description, created_by, idempotency_key
    )
    values (p_membership_id, 'ADJUSTMENT', p_amount_delta, p_reason, p_admin_id::text, p_request_id || ':' || p_request_id::text)
    on conflict (idempotency_key) do nothing
    returning id into v_entry_id;
  else
    select id into v_wallet_id from public.wallet_accounts where membership_id = p_membership_id;
    if v_wallet_id is null then
      insert into public.wallet_accounts (membership_id, currency_code, wallet_type, status)
      values (p_membership_id, 'INR', 'OTHER', 'ACTIVE')
      returning id into v_wallet_id;
    end if;
    insert into public.wallet_ledger (
      wallet_account_id, entry_type, amount_minor_delta, description, created_by, idempotency_key
    )
    values (v_wallet_id, 'ADJUSTMENT', p_amount_delta, p_reason, p_admin_id::text, p_request_id::text || ':wallet')
    on conflict (idempotency_key) do nothing
    returning id into v_entry_id;
  end if;

  insert into public.audit_logs (actor_user_id, actor_type, action, entity_type, entity_id, shop_id, customer_id, reason, request_id, after_data)
  values (p_admin_id, 'ADMIN', 'REWARD_ADJUSTED', p_adjustment_type, v_entry_id::text, v_member.shop_id,
          v_member.customer_id, p_reason, p_request_id,
          jsonb_build_object('amount_delta', p_amount_delta, 'adjustment_type', p_adjustment_type));

  return jsonb_build_object('adjustment_request_id', v_request_id, 'ledger_entry_id', v_entry_id, 'type', p_adjustment_type);
end;
$$;

-- ---------------------------------------------------------------------------
-- Scratch cards and redemptions
-- ---------------------------------------------------------------------------

create or replace function public.issue_scratch_card(
  p_campaign_id uuid,
  p_membership_id uuid,
  p_shop_id uuid,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_campaign public.scratch_card_campaigns%rowtype;
  v_member public.customer_shop_memberships%rowtype;
  v_card public.scratch_cards%rowtype;
  v_prize uuid;
  v_total bigint;
  v_roll bigint;
  v_issued integer;
begin
  select * into v_card from public.scratch_cards where idempotency_key = p_idempotency_key::text;
  if found then return jsonb_build_object('card_id', v_card.id, 'status', v_card.status, 'duplicate', true); end if;

  select * into v_campaign from public.scratch_card_campaigns where id = p_campaign_id for update;
  if not found then raise exception 'CAMPAIGN_NOT_FOUND'; end if;
  if v_campaign.status <> 'ACTIVE' or v_campaign.approved_by is null then raise exception 'CAMPAIGN_NOT_ACTIVE'; end if;
  if now() < v_campaign.starts_at or now() > v_campaign.ends_at then raise exception 'CAMPAIGN_OUTSIDE_WINDOW'; end if;
  if v_campaign.shop_id is not null and v_campaign.shop_id <> p_shop_id then raise exception 'CAMPAIGN_SHOP_MISMATCH'; end if;

  select * into v_member from public.customer_shop_memberships where id = p_membership_id;
  if not found or v_member.status <> 'ACTIVE' or v_member.shop_id <> p_shop_id then raise exception 'MEMBERSHIP_INVALID'; end if;

  if v_campaign.per_customer_limit is not null then
    select count(*) into v_issued
    from public.scratch_cards
    where campaign_id = p_campaign_id and membership_id = p_membership_id;
    if v_issued >= v_campaign.per_customer_limit then raise exception 'CUSTOMER_LIMIT_REACHED'; end if;
  end if;

  select coalesce(sum(probability_weight), 0) into v_total
  from public.scratch_card_prizes
  where campaign_id = p_campaign_id
    and (quantity_limit is null or quantity_limit > (
      select count(*) from public.scratch_cards where prize_id = public.scratch_card_prizes.id
    ));
  if v_total <= 0 then raise exception 'NO_PRIZE_AVAILABLE'; end if;

  v_roll := floor(random() * v_total)::bigint + 1;
  select ranked.id into v_prize
  from (
    select id, sum(probability_weight) over (order by created_at, id) as cumulative
    from public.scratch_card_prizes
    where campaign_id = p_campaign_id
      and (quantity_limit is null or quantity_limit > (
        select count(*) from public.scratch_cards where prize_id = public.scratch_card_prizes.id
      ))
  ) ranked
  where v_roll <= ranked.cumulative
  order by ranked.cumulative
  limit 1;

  if v_prize is null then raise exception 'NO_PRIZE_AVAILABLE'; end if;

  insert into public.scratch_cards (campaign_id, membership_id, prize_id, status, issued_at, expires_at, idempotency_key)
  values (p_campaign_id, p_membership_id, v_prize, 'ISSUED', now(), v_campaign.ends_at, p_idempotency_key::text)
  returning * into v_card;

  return jsonb_build_object('card_id', v_card.id, 'status', 'ISSUED', 'duplicate', false);
end;
$$;

create or replace function public.reveal_scratch_card(
  p_card_id uuid,
  p_customer_id uuid,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_card public.scratch_cards%rowtype;
  v_member public.customer_shop_memberships%rowtype;
  v_prize public.scratch_card_prizes%rowtype;
  v_value bigint;
  v_wallet_id uuid;
  v_prize_json jsonb;
begin
  select c.* into v_card from public.scratch_cards c where c.id = p_card_id for update;
  if not found then return null; end if;

  select m.* into v_member from public.customer_shop_memberships m where m.id = v_card.membership_id;
  if v_member.customer_id <> p_customer_id then raise exception 'CARD_OWNERSHIP_MISMATCH'; end if;

  select p.* into v_prize from public.scratch_card_prizes p where p.id = v_card.prize_id;
  v_prize_json := jsonb_build_object('name', v_prize.name, 'type', v_prize.prize_type, 'value', v_prize.prize_value);

  if v_card.status in ('REVEALED', 'REDEEMED') then
    return jsonb_build_object(
      'card_id', v_card.id, 'status', v_card.status, 'revealed_at', v_card.revealed_at,
      'prize', v_prize_json, 'duplicate_reveal', true, 'reward_applied', v_card.reward_applied
    );
  end if;
  if v_card.status = 'EXPIRED' then raise exception 'CARD_EXPIRED'; end if;

  update public.scratch_cards
  set status = 'REVEALED', revealed_at = now(), reveal_idempotency_key = p_idempotency_key::text
  where id = p_card_id;

  if v_prize.prize_type = 'POINTS' then
    v_value := nullif(v_prize.prize_value ->> 'points', '')::bigint;
    if v_value is null or v_value <= 0 then raise exception 'PRIZE_VALUE_INCOMPLETE'; end if;
    insert into public.reward_ledger (membership_id, entry_type, points_delta, description, idempotency_key)
    values (v_card.membership_id, 'PROMOTION', v_value, 'Scratch card prize: ' || v_prize.name, p_card_id::text || ':reveal')
    on conflict (idempotency_key) do nothing;
  elsif v_prize.prize_type = 'WALLET_CREDIT' then
    v_value := nullif(v_prize.prize_value ->> 'amount_minor', '')::bigint;
    if v_value is null or v_value <= 0 then raise exception 'PRIZE_VALUE_INCOMPLETE'; end if;
    select id into v_wallet_id from public.wallet_accounts where membership_id = v_card.membership_id;
    if v_wallet_id is null then
      insert into public.wallet_accounts (membership_id, currency_code, wallet_type, status)
      values (v_card.membership_id, 'INR', 'OTHER', 'ACTIVE')
      returning id into v_wallet_id;
    end if;
    insert into public.wallet_ledger (wallet_account_id, entry_type, amount_minor_delta, description, idempotency_key)
    values (v_wallet_id, 'CREDIT', v_value, 'Scratch card prize: ' || v_prize.name, p_card_id::text || ':reveal')
    on conflict (idempotency_key) do nothing;
  end if;

  update public.scratch_cards set reward_applied = true where id = p_card_id;

  return jsonb_build_object(
    'card_id', v_card.id, 'status', 'REVEALED', 'revealed_at', now(),
    'prize', v_prize_json, 'duplicate_reveal', false, 'reward_applied', true
  );
end;
$$;

create or replace function public.create_redemption(
  p_customer_id uuid,
  p_reward_id uuid,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reward public.reward_catalogue%rowtype;
  v_member public.customer_shop_memberships%rowtype;
  v_balance bigint;
  v_redemption_id uuid;
  v_hash text := encode(digest(p_idempotency_key::text, 'sha256'), 'hex');
  v_existing public.redemptions%rowtype;
begin
  select * into v_existing from public.redemptions where redemption_code_hash = v_hash;
  if found then
    return jsonb_build_object('redemption_id', v_existing.id, 'status', v_existing.status, 'verification_code', p_idempotency_key::text, 'duplicate', true);
  end if;

  select * into v_reward from public.reward_catalogue where id = p_reward_id for update;
  if not found or v_reward.status <> 'ACTIVE' then raise exception 'REWARD_NOT_AVAILABLE'; end if;
  if now() < v_reward.starts_at or (v_reward.ends_at is not null and now() > v_reward.ends_at) then raise exception 'REWARD_OUTSIDE_WINDOW'; end if;

  select m.* into v_member from public.customer_shop_memberships m
  where m.customer_id = p_customer_id and m.shop_id = v_reward.shop_id and m.status = 'ACTIVE';
  if not found then raise exception 'MEMBERSHIP_INVALID'; end if;

  select coalesce(sum(points_delta), 0) into v_balance from public.reward_ledger where membership_id = v_member.id;
  if v_balance < v_reward.points_cost then raise exception 'INSUFFICIENT_POINTS'; end if;

  insert into public.redemptions (membership_id, reward_id, redemption_code_hash, points_spent, status, completed_at)
  values (v_member.id, p_reward_id, v_hash, v_reward.points_cost, 'COMPLETED', now())
  returning id into v_redemption_id;

  insert into public.reward_ledger (membership_id, entry_type, points_delta, redemption_id, description, idempotency_key)
  values (v_member.id, 'REDEEM', -v_reward.points_cost, v_redemption_id, 'Redemption: ' || v_reward.name, p_idempotency_key::text || ':redeem')
  on conflict (idempotency_key) do nothing;

  return jsonb_build_object('redemption_id', v_redemption_id, 'status', 'COMPLETED', 'verification_code', p_idempotency_key::text, 'duplicate', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin listings and dashboard
-- ---------------------------------------------------------------------------

create or replace function public.admin_list_shops(
  p_search text,
  p_service_status text,
  p_payment_status text,
  p_device_status text,
  p_rewards_enabled boolean,
  p_registration_from timestamptz,
  p_registration_to timestamptz,
  p_renewals_due_days integer,
  p_limit integer,
  p_offset integer,
  p_sort_by text,
  p_sort_direction text
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
with base as (
  select
    s.*,
    sub.id as subscription_id,
    sub.status as service_status,
    sub.current_period_end,
    sub.grace_deadline,
    sp.name as plan_name,
    sp.monthly_price_minor,
    case when exists (select 1 from public.payments p where p.shop_id = s.id and p.status = 'PENDING') then 'PENDING'
         when exists (select 1 from public.billing_periods bp join public.subscriptions su on su.id = bp.subscription_id
                      where su.shop_id = s.id and bp.status in ('OVERDUE') ) then 'OVERDUE'
         when exists (select 1 from public.billing_periods bp join public.subscriptions su on su.id = bp.subscription_id
                      where su.shop_id = s.id and bp.status in ('DUE', 'PARTIAL') and bp.period_end < current_date) then 'OVERDUE'
         else 'PAID' end as payment_status,
    case when exists (select 1 from public.shop_devices d where d.shop_id = s.id and d.status = 'ACTIVE') then 'ACTIVE' else 'NONE' end as device_status
  from public.shops s
  left join public.subscriptions sub on sub.shop_id = s.id
  left join public.subscription_plans sp on sp.id = sub.plan_id
  where (p_search is null or s.shop_code ilike '%' || p_search || '%' or s.shop_name ilike '%' || p_search || '%'
         or s.owner_name ilike '%' || p_search || '%' or s.phone ilike '%' || p_search || '%')
    and (p_service_status is null or p_service_status = 'ALL' or sub.status = p_service_status)
    and (p_payment_status is null or p_payment_status = 'ALL' or
         case when exists (select 1 from public.payments p where p.shop_id = s.id and p.status = 'PENDING') then 'PENDING'
              when exists (select 1 from public.billing_periods bp join public.subscriptions su on su.id = bp.subscription_id
                           where su.shop_id = s.id and bp.status in ('OVERDUE') ) then 'OVERDUE'
              else 'PAID' end = p_payment_status)
    and (p_device_status is null or p_device_status = 'ALL' or
         case when exists (select 1 from public.shop_devices d where d.shop_id = s.id and d.status = 'ACTIVE') then 'ACTIVE' else 'NONE' end = p_device_status)
    and (p_rewards_enabled is null or s.rewards_enabled = p_rewards_enabled)
    and (p_registration_from is null or s.registered_at >= p_registration_from)
    and (p_registration_to is null or s.registered_at <= p_registration_to)
    and (p_renewals_due_days is null or (sub.current_period_end - current_date) between 0 and p_renewals_due_days)
), counted as (
  select count(*)::int as total from base
), page as (
  select * from base
  order by
    case when p_sort_direction = 'asc' then
      case p_sort_by when 'shop_name' then btrim(lower(base.shop_name)) when 'shop_code' then btrim(lower(base.shop_code)) else btrim(base.registered_at::text) end
    end asc nulls last,
    case when p_sort_direction <> 'asc' then
      case p_sort_by when 'shop_name' then btrim(lower(base.shop_name)) when 'shop_code' then btrim(lower(base.shop_code)) else btrim(base.registered_at::text) end
    end desc nulls last
  limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0)
)
select jsonb_build_object(
  'total', (select total from counted),
  'rows', coalesce(jsonb_agg(jsonb_build_object(
    'id', page.id, 'shop_code', page.shop_code, 'shop_name', page.shop_name,
    'owner_name', page.owner_name, 'phone', page.phone, 'email', page.email,
    'registered_at', page.registered_at, 'registration_status', page.registration_status,
    'subscription_id', page.subscription_id, 'service_status', page.service_status,
    'payment_status', page.payment_status, 'device_status', page.device_status,
    'plan_name', page.plan_name, 'monthly_price_minor', page.monthly_price_minor,
    'current_period_end', page.current_period_end, 'grace_deadline', page.grace_deadline,
    'rewards_enabled', page.rewards_enabled
  )) filter (where page.id is not null), '[]'::jsonb)
)
from page;
$$;

create or replace function public.admin_dashboard_data(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
with payments_in_range as (
  select * from public.payments
  where status = 'VERIFIED' and (p_from is null or paid_at >= p_from) and (p_to is null or paid_at <= p_to)
), shops_in_range as (
  select * from public.shops
  where (p_from is null or registered_at >= p_from) and (p_to is null or registered_at <= p_to)
)
select jsonb_build_object(
  'summary', jsonb_build_object(
    'totalShops', (select count(*) from public.shops),
    'activeSubscriptions', (select count(*) from public.subscriptions where status = 'ACTIVE'),
    'graceShops', (select count(*) from public.subscriptions where status = 'GRACE'),
    'suspendedShops', (select count(*) from public.subscriptions where status = 'SUSPENDED'),
    'pendingPayments', (select count(*) from public.payments where status = 'PENDING'),
    'expectedMrrMinor', (select coalesce(sum(monthly_price_minor), 0) from public.subscriptions where status = 'ACTIVE'),
    'activeRewardCustomers', (select count(distinct m.customer_id) from public.customer_shop_memberships m join public.customer_profiles c on c.id = m.customer_id where m.status = 'ACTIVE' and c.status = 'ACTIVE'),
    'activeMemberships', (select count(*) from public.customer_shop_memberships where status = 'ACTIVE'),
    'pendingSyncEvents', (select count(*) from public.reward_events where status = 'RECEIVED'),
    'redemptionsInPeriod', (select count(*) from public.redemptions where (p_from is null or created_at >= p_from) and (p_to is null or created_at <= p_to))
  ),
  'charts', jsonb_build_object(
    'verifiedCollections', coalesce((
      select jsonb_agg(jsonb_build_object('month', to_char(date_trunc('month', paid_at), 'YYYY-MM'), 'amountMinor', amount)) from (
        select date_trunc('month', paid_at) as paid_at, sum(amount_minor) as amount
        from payments_in_range group by 1 order by 1
      ) t
    ), '[]'::jsonb),
    'shopStatus', jsonb_build_object(
      'active', (select count(*) from public.subscriptions where status = 'ACTIVE'),
      'grace', (select count(*) from public.subscriptions where status = 'GRACE'),
      'suspended', (select count(*) from public.subscriptions where status = 'SUSPENDED')
    ),
    'newShops', coalesce((
      select jsonb_agg(jsonb_build_object('month', to_char(month, 'YYYY-MM'), 'count', count)) from (
        select date_trunc('month', registered_at) as month, count(*) as count from shops_in_range group by 1 order by 1
      ) t
    ), '[]'::jsonb),
    'renewalsAndOverdue', jsonb_build_object(
      'dueSoon', (select count(*) from public.billing_periods where status in ('DUE', 'PARTIAL') and period_end between current_date and current_date + 7),
      'overdue', (select count(*) from public.billing_periods where status = 'OVERDUE' or (status in ('DUE', 'PARTIAL') and period_end < current_date))
    ),
    'customerRegistrations', coalesce((
      select jsonb_agg(jsonb_build_object('month', to_char(month, 'YYYY-MM'), 'count', count)) from (
        select date_trunc('month', created_at) as month, count(*) as count from public.customer_profiles
        where (p_from is null or created_at >= p_from) and (p_to is null or created_at <= p_to)
        group by 1 order by 1
      ) t
    ), '[]'::jsonb),
    'rewardActivity', coalesce((
      select jsonb_agg(jsonb_build_object('month', to_char(month, 'YYYY-MM'), 'issued', issued, 'redeemed', redeemed)) from (
        select date_trunc('month', created_at) as month,
               sum(case when points_delta > 0 then points_delta else 0 end) as issued,
               sum(case when points_delta < 0 then abs(points_delta) else 0 end) as redeemed
        from public.reward_ledger
        where (p_from is null or created_at >= p_from) and (p_to is null or created_at <= p_to)
        group by 1 order by 1
      ) t
    ), '[]'::jsonb),
    'scratchCards', coalesce((
      select jsonb_agg(jsonb_build_object('month', to_char(month, 'YYYY-MM'), 'issued', issued, 'revealed', revealed)) from (
        select date_trunc('month', issued_at) as month, count(*) as issued,
               count(*) filter (where status in ('REVEALED', 'REDEEMED')) as revealed
        from public.scratch_cards
        where (p_from is null or issued_at >= p_from) and (p_to is null or issued_at <= p_to)
        group by 1 order by 1
      ) t
    ), '[]'::jsonb)
  ),
  'alerts', jsonb_build_object(
    'pendingPayments', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'shop', s.shop_name, 'amountMinor', p.amount_minor, 'paidAt', p.paid_at))
      from (select * from public.payments where status = 'PENDING' order by paid_at limit 10) p
      join public.shops s on s.id = p.shop_id
    ), '[]'::jsonb),
    'graceEndingSoon', coalesce((
      select jsonb_agg(jsonb_build_object('id', sub.id, 'shop', s.shop_name, 'graceDeadline', sub.grace_deadline))
      from (select * from public.subscriptions where status = 'GRACE' and grace_deadline <= now() + interval '7 days' order by grace_deadline limit 10) sub
      join public.shops s on s.id = sub.shop_id
    ), '[]'::jsonb),
    'suspendedToday', coalesce((
      select jsonb_agg(jsonb_build_object('id', sub.id, 'shop', s.shop_name, 'reason', sub.suspension_reason))
      from (select * from public.subscriptions where status = 'SUSPENDED' and suspended_at::date = current_date limit 10) sub
      join public.shops s on s.id = sub.shop_id
    ), '[]'::jsonb),
    'renewalsDue', coalesce((
      select jsonb_agg(jsonb_build_object('id', bp.id, 'shop', s.shop_name, 'periodEnd', bp.period_end))
      from (select * from public.billing_periods where status in ('DUE', 'PARTIAL') and period_end between current_date and current_date + 7 order by period_end limit 10) bp
      join public.subscriptions sub on sub.id = bp.subscription_id join public.shops s on s.id = sub.shop_id
    ), '[]'::jsonb),
    'failedSync', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'shop', s.shop_name, 'code', e.rejection_code, 'receivedAt', e.received_at))
      from (select * from public.reward_events where status = 'REJECTED' order by received_at desc limit 10) e
      join public.shops s on s.id = e.shop_id
    ), '[]'::jsonb),
    'campaignsEndingSoon', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'endsAt', c.ends_at))
      from (select * from public.scratch_card_campaigns where status = 'ACTIVE' and ends_at <= now() + interval '7 days' order by ends_at limit 10) c
    ), '[]'::jsonb),
    'recentAdminActions', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'action', a.action, 'entityType', a.entity_type, 'createdAt', a.created_at))
      from (select * from public.audit_logs where actor_type = 'ADMIN' order by created_at desc limit 10) a
    ), '[]'::jsonb)
  )
);
$$;

-- Service-role only. Express handles authentication and authorization first.
revoke all on function public.ensure_next_billing_period(uuid, boolean) from public, anon, authenticated;
revoke all on function public.allocate_verified_payments(uuid) from public, anon, authenticated;
revoke all on function public.register_shop(uuid, text, text, text, text, text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.create_shop(text, text, text, text, text, text, text, text, text, text, text, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.create_subscription(uuid, uuid, bigint, text, date, uuid, text) from public, anon, authenticated;
revoke all on function public.verify_payment(uuid, uuid, uuid, bigint, text) from public, anon, authenticated;
revoke all on function public.suspend_subscription(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.reactivate_subscription(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.renew_subscription(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.process_subscription_lifecycle() from public, anon, authenticated;
revoke all on function public.process_reward_expiry() from public, anon, authenticated;
revoke all on function public.activate_device(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.process_reward_event(uuid, uuid) from public, anon, authenticated;
revoke all on function public.adjust_reward(uuid, text, bigint, text, uuid, text) from public, anon, authenticated;
revoke all on function public.issue_scratch_card(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.reveal_scratch_card(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.create_redemption(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_list_shops(text, text, text, text, boolean, timestamptz, timestamptz, integer, integer, integer, text, text) from public, anon, authenticated;
revoke all on function public.admin_dashboard_data(timestamptz, timestamptz) from public, anon, authenticated;

grant execute on all functions in schema public to service_role;

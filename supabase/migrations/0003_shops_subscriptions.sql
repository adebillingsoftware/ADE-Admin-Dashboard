-- Shops, plans, subscriptions, billing periods and payments.
-- Table and column names follow Database Structure v1 §9. Architecture v3 §9.2
-- fields are added as explicitly documented proposed extensions.

create table if not exists public.shops (
  id uuid primary key default gen_random_uuid(),
  shop_code text not null unique,
  shop_name text not null,
  owner_name text not null,
  email text,
  phone text not null,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  postal_code text,
  country_code text not null default 'IN',
  gst_number text,
  registration_status text not null default 'PENDING'
    check (registration_status in ('PENDING', 'ACTIVE', 'REJECTED', 'CLOSED')),
  registered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Proposed extensions from Architecture v3 §9.2
  installation_id uuid unique,
  app_version text,
  last_seen_at timestamptz,
  rewards_enabled boolean not null default false,
  account_status text not null default 'ACTIVE' check (account_status in ('ACTIVE', 'ARCHIVED'))
);

create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  monthly_price_minor bigint not null default 0 check (monthly_price_minor >= 0),
  currency_code text not null default 'INR',
  billing_interval text not null default 'MONTHLY' check (billing_interval = 'MONTHLY'),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),

  -- Proposed extensions from Architecture v3 §9.2. Default 7/1 are fixed policy values.
  grace_days integer not null default 7 check (grace_days >= 0),
  device_limit integer not null default 1 check (device_limit >= 1)
);

-- NOT CONFIGURED: no price is invented. An authorized administrator must set a
-- positive price and activate a plan before shops can register.
insert into public.subscription_plans (name, description, monthly_price_minor, currency_code, is_active)
select 'Monthly', 'Standard monthly subscription — price not configured', 0, 'INR', false
where not exists (select 1 from public.subscription_plans where name = 'Monthly');

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null unique references public.shops(id) on delete restrict,
  plan_id uuid not null references public.subscription_plans(id) on delete restrict,
  status text not null default 'SUSPENDED'
    check (status in ('ACTIVE', 'GRACE', 'SUSPENDED', 'CANCELLED')),
  monthly_price_minor bigint not null check (monthly_price_minor >= 0),
  currency_code text not null default 'INR',
  current_period_start date not null,
  current_period_end date not null,
  grace_deadline timestamptz,
  suspension_reason text check (suspension_reason in ('OVERDUE', 'MANUAL', 'OTHER')),
  suspension_note text,
  suspended_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (current_period_end > current_period_start)
);

create table if not exists public.billing_periods (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete restrict,
  plan_id uuid not null references public.subscription_plans(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  amount_due_minor bigint not null check (amount_due_minor >= 0),
  amount_paid_minor bigint not null default 0 check (amount_paid_minor >= 0),
  status text not null default 'DUE'
    check (status in ('DUE', 'PARTIAL', 'PAID', 'OVERDUE', 'WAIVED')),
  due_at timestamptz not null default now(),
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (subscription_id, period_start, period_end),
  check (period_end > period_start),
  check (amount_paid_minor <= amount_due_minor)
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete restrict,
  amount_minor bigint not null check (amount_minor > 0),
  currency_code text not null default 'INR',
  method text not null check (method in ('UPI', 'BANK_TRANSFER', 'CASH', 'OTHER')),
  transaction_reference text,
  paid_at timestamptz not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'VERIFIED', 'REJECTED')),
  proof_storage_path text,
  notes text,
  recorded_by uuid references public.admin_profiles(user_id) on delete set null,
  verified_by uuid references public.admin_profiles(user_id) on delete set null,
  verified_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete restrict,
  billing_period_id uuid not null references public.billing_periods(id) on delete restrict,
  allocated_amount_minor bigint not null check (allocated_amount_minor > 0),
  created_at timestamptz not null default now(),
  unique (payment_id, billing_period_id)
);

-- Proposed extension: one-time tokens used by the desktop installer to register.
create table if not exists public.shop_registration_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  shop_id uuid references public.shops(id) on delete set null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_by uuid references public.admin_profiles(user_id) on delete set null,
  created_at timestamptz not null default now()
);

-- Proposed extension: shop desktop API keys. Only hashes are stored.
create table if not exists public.shop_api_keys (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  key_hash text not null unique,
  label text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'REVOKED')),
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

drop trigger if exists trg_shops_updated on public.shops;
create trigger trg_shops_updated before update on public.shops
for each row execute function public.set_updated_at();
drop trigger if exists trg_subscriptions_updated on public.subscriptions;
create trigger trg_subscriptions_updated before update on public.subscriptions
for each row execute function public.set_updated_at();

create index if not exists idx_shops_phone on public.shops(phone);
create index if not exists idx_subscriptions_shop_status on public.subscriptions(shop_id, status);
create index if not exists idx_billing_periods_subscription_start on public.billing_periods(subscription_id, period_start);
create index if not exists idx_payments_shop_created on public.payments(shop_id, created_at desc);
create index if not exists idx_payments_status on public.payments(status);

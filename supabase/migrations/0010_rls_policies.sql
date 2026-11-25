-- Row Level Security. The Express API uses the service role and performs its own
-- authorization; these policies are defense-in-depth for any direct anon-key use.
-- No anonymous client can read private administrator, shop, customer or reward data.

-- Enable RLS on every application table.
do $$
declare t text;
begin
  for t in
    select table_name from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Remove blanket client write access. Privileged writes go through the API/RPCs.
revoke all on all tables in schema public from anon, authenticated;
grant select on public.admin_profiles, public.admin_roles, public.admin_user_roles,
  public.role_permissions, public.admin_permissions to authenticated;
grant select on public.shops, public.subscription_plans, public.subscriptions,
  public.billing_periods, public.payments, public.payment_allocations,
  public.shop_devices, public.licence_leases, public.device_reset_requests to authenticated;
grant select on public.customer_profiles, public.customer_shop_memberships,
  public.membership_link_tokens, public.reward_programmes, public.reward_rule_versions,
  public.reward_ledger, public.wallet_accounts, public.wallet_ledger, public.reward_events,
  public.reward_adjustment_requests, public.reward_catalogue, public.redemptions,
  public.scratch_card_campaigns, public.scratch_card_prizes, public.scratch_cards,
  public.dob_reward_issuances, public.customer_support_tickets to authenticated;
grant select on public.audit_logs, public.app_settings, public.cron_runs to authenticated;

-- Provide a stable way for a customer to check membership ownership in policies.
create or replace function public.customer_owns_membership(p_membership_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.customer_shop_memberships m
    join public.customer_profiles c on c.id = m.customer_id
    where m.id = p_membership_id and c.user_id = auth.uid() and c.status = 'ACTIVE'
  );
$$;
grant execute on function public.customer_owns_membership(uuid) to authenticated, service_role;

-- Administrator tables
drop policy if exists admin_profiles_select on public.admin_profiles;
create policy admin_profiles_select on public.admin_profiles for select to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists admin_roles_select on public.admin_roles;
create policy admin_roles_select on public.admin_roles for select to authenticated
using (public.is_admin());

drop policy if exists admin_user_roles_select on public.admin_user_roles;
create policy admin_user_roles_select on public.admin_user_roles for select to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists role_permissions_select on public.role_permissions;
create policy role_permissions_select on public.role_permissions for select to authenticated
using (public.is_admin());

drop policy if exists admin_permissions_select on public.admin_permissions;
create policy admin_permissions_select on public.admin_permissions for select to authenticated
using (user_id = auth.uid() or public.is_admin());

-- Shop and billing tables: administrators only.
drop policy if exists shops_select on public.shops;
create policy shops_select on public.shops for select to authenticated using (public.is_admin());
drop policy if exists plans_select on public.subscription_plans;
create policy plans_select on public.subscription_plans for select to authenticated using (public.is_admin());
drop policy if exists subscriptions_select on public.subscriptions;
create policy subscriptions_select on public.subscriptions for select to authenticated using (public.is_admin());
drop policy if exists billing_periods_select on public.billing_periods;
create policy billing_periods_select on public.billing_periods for select to authenticated using (public.is_admin());
drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments for select to authenticated using (public.is_admin());
drop policy if exists payment_allocations_select on public.payment_allocations;
create policy payment_allocations_select on public.payment_allocations for select to authenticated using (public.is_admin());
drop policy if exists shop_devices_select on public.shop_devices;
create policy shop_devices_select on public.shop_devices for select to authenticated using (public.is_admin());
drop policy if exists licence_leases_select on public.licence_leases;
create policy licence_leases_select on public.licence_leases for select to authenticated using (public.is_admin());
drop policy if exists device_reset_requests_select on public.device_reset_requests;
create policy device_reset_requests_select on public.device_reset_requests for select to authenticated using (public.is_admin());

-- Customer identity: own profile or administrator. No customer write policy;
-- the backend applies audited, field-limited corrections.
drop policy if exists customer_profiles_select on public.customer_profiles;
create policy customer_profiles_select on public.customer_profiles for select to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists memberships_select on public.customer_shop_memberships;
create policy memberships_select on public.customer_shop_memberships for select to authenticated
using (public.customer_owns_membership(id) or public.is_admin());

-- Reward configuration and ledgers.
drop policy if exists programmes_select on public.reward_programmes;
create policy programmes_select on public.reward_programmes for select to authenticated
using (public.is_admin() or status = 'ACTIVE');

drop policy if exists rule_versions_select on public.reward_rule_versions;
create policy rule_versions_select on public.reward_rule_versions for select to authenticated using (public.is_admin());

drop policy if exists reward_ledger_select on public.reward_ledger;
create policy reward_ledger_select on public.reward_ledger for select to authenticated
using (public.customer_owns_membership(membership_id) or public.is_admin());

drop policy if exists wallet_accounts_select on public.wallet_accounts;
create policy wallet_accounts_select on public.wallet_accounts for select to authenticated
using (public.customer_owns_membership(membership_id) or public.is_admin());

drop policy if exists wallet_ledger_select on public.wallet_ledger;
create policy wallet_ledger_select on public.wallet_ledger for select to authenticated
using (public.is_admin() or exists (
  select 1 from public.wallet_accounts wa where wa.id = wallet_account_id and public.customer_owns_membership(wa.membership_id)
));

drop policy if exists reward_events_select on public.reward_events;
create policy reward_events_select on public.reward_events for select to authenticated using (public.is_admin());
drop policy if exists adjustment_requests_select on public.reward_adjustment_requests;
create policy adjustment_requests_select on public.reward_adjustment_requests for select to authenticated using (public.is_admin());
drop policy if exists reward_catalogue_select on public.reward_catalogue;
create policy reward_catalogue_select on public.reward_catalogue for select to authenticated
using (public.is_admin() or status = 'ACTIVE');
drop policy if exists redemptions_select on public.redemptions;
create policy redemptions_select on public.redemptions for select to authenticated
using (public.customer_owns_membership(membership_id) or public.is_admin());

-- Scratch cards: customers see only their own cards; outcomes remain server-controlled.
drop policy if exists campaigns_select on public.scratch_card_campaigns;
create policy campaigns_select on public.scratch_card_campaigns for select to authenticated
using (public.is_admin() or status = 'ACTIVE');
drop policy if exists prizes_select on public.scratch_card_prizes;
create policy prizes_select on public.scratch_card_prizes for select to authenticated
using (public.is_admin() or exists (
  select 1 from public.scratch_card_campaigns c where c.id = campaign_id and c.status = 'ACTIVE'
));
drop policy if exists scratch_cards_select on public.scratch_cards;
create policy scratch_cards_select on public.scratch_cards for select to authenticated
using (public.customer_owns_membership(membership_id) or public.is_admin());
drop policy if exists dob_issuances_select on public.dob_reward_issuances;
create policy dob_issuances_select on public.dob_reward_issuances for select to authenticated
using (public.customer_owns_membership(membership_id) or public.is_admin());

-- Support, audit and settings.
drop policy if exists tickets_select on public.customer_support_tickets;
create policy tickets_select on public.customer_support_tickets for select to authenticated
using (public.is_admin() or exists (
  select 1 from public.customer_profiles c where c.id = customer_id and c.user_id = auth.uid()
));
drop policy if exists audit_select on public.audit_logs;
create policy audit_select on public.audit_logs for select to authenticated using (public.is_admin());
drop policy if exists settings_select on public.app_settings;
create policy settings_select on public.app_settings for select to authenticated using (public.is_admin());
drop policy if exists cron_runs_select on public.cron_runs;
create policy cron_runs_select on public.cron_runs for select to authenticated using (public.is_admin());

-- Tables with no policy are service-role only: shop_registration_tokens,
-- shop_api_keys, membership_link_tokens, api_rate_limits.

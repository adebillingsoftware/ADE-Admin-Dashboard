-- Administrator identities, roles, permissions and role-permission mapping.

create table if not exists public.admin_profiles (
  user_id uuid primary key references auth.users(id) on delete restrict,
  display_name text not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'DISABLED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (name in ('SUPER_ADMIN', 'BILLING_ADMIN', 'SUPPORT', 'ENGAGEMENT_ADMIN', 'READ_ONLY')),
  description text
);

create table if not exists public.admin_user_roles (
  user_id uuid not null references public.admin_profiles(user_id) on delete cascade,
  role_id uuid not null references public.admin_roles(id) on delete cascade,
  assigned_by uuid references public.admin_profiles(user_id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

-- Explicit per-administrator overrides. DENY always wins in the backend.
create table if not exists public.admin_permissions (
  user_id uuid not null references public.admin_profiles(user_id) on delete cascade,
  permission text not null,
  effect text not null check (effect in ('GRANT', 'DENY')),
  primary key (user_id, permission)
);

-- Canonical role -> permission mapping. Backend expands roles using the same IDs
-- in server/config/permissions.ts; keep both files in sync.
create table if not exists public.role_permissions (
  role_name text not null references public.admin_roles(name) on delete cascade,
  permission text not null,
  primary key (role_name, permission)
);

insert into public.admin_roles (name, description) values
  ('SUPER_ADMIN', 'Complete approved administrative access, including administrator management.'),
  ('BILLING_ADMIN', 'Shops, subscriptions, payments and devices.'),
  ('SUPPORT', 'Customer and shop support with limited read/write access.'),
  ('ENGAGEMENT_ADMIN', 'Reward programmes, reward operations and scratch-card campaigns.'),
  ('READ_ONLY', 'Permitted records and reports; no state-changing operations.')
on conflict (name) do nothing;

insert into public.role_permissions (role_name, permission)
select 'SUPER_ADMIN', unnest(array[
  'shops.read','shops.write','shops.register','payments.read','payments.record','payments.verify','payments.reject',
  'subscriptions.read','subscriptions.manage','devices.read','devices.manage','customers.read','customers.write',
  'engagement.read','engagement.manage','rewards.read','rewards.adjust','scratchcards.read','scratchcards.manage',
  'reports.read','audit.read','settings.read','settings.write','admins.manage','integration.shop','integration.customer','cron.run'
])
on conflict do nothing;

insert into public.role_permissions (role_name, permission)
select 'BILLING_ADMIN', unnest(array[
  'shops.read','shops.write','shops.register','payments.read','payments.record','payments.verify','payments.reject',
  'subscriptions.read','subscriptions.manage','devices.read','devices.manage','reports.read','audit.read',
  'settings.read','integration.shop'
])
on conflict do nothing;

insert into public.role_permissions (role_name, permission)
select 'SUPPORT', unnest(array[
  'shops.read','subscriptions.read','devices.read','customers.read','customers.write','rewards.read',
  'scratchcards.read','reports.read','audit.read'
])
on conflict do nothing;

insert into public.role_permissions (role_name, permission)
select 'ENGAGEMENT_ADMIN', unnest(array[
  'shops.read','customers.read','customers.write','engagement.read','engagement.manage','rewards.read',
  'rewards.adjust','scratchcards.read','scratchcards.manage','reports.read','audit.read','settings.read'
])
on conflict do nothing;

insert into public.role_permissions (role_name, permission)
select 'READ_ONLY', unnest(array[
  'shops.read','payments.read','subscriptions.read','devices.read','customers.read','engagement.read',
  'rewards.read','scratchcards.read','reports.read','audit.read','settings.read'
])
on conflict do nothing;

drop trigger if exists trg_admin_profiles_updated on public.admin_profiles;
create trigger trg_admin_profiles_updated before update on public.admin_profiles
for each row execute function public.set_updated_at();

-- Identity helpers used by RLS. SECURITY DEFINER avoids recursive policy checks.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.admin_profiles p
    where p.user_id = auth.uid()
      and p.status = 'ACTIVE'
  );
$$;

create or replace function public.has_admin_role(p_role text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.admin_user_roles ur
    join public.admin_roles r on r.id = ur.role_id
    join public.admin_profiles p on p.user_id = ur.user_id
    where p.user_id = auth.uid()
      and p.status = 'ACTIVE'
      and r.name = p_role
  );
$$;

grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.has_admin_role(text) to authenticated, service_role;

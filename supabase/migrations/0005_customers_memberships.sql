-- Global customer identity and per-shop memberships.

create table if not exists public.customer_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete restrict,
  display_name text not null,
  email text,
  phone text,
  date_of_birth date,
  dob_reward_opt_in boolean not null default false,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'RESTRICTED', 'CLOSED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_shop_memberships (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_profiles(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete restrict,
  status text not null default 'PENDING' check (status in ('PENDING', 'ACTIVE', 'SUSPENDED', 'LEFT')),
  joined_at timestamptz not null default now(),
  consent_version text,
  consented_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, shop_id)
);

-- Proposed extension: short-lived single-use shop-linking token.
create table if not exists public.membership_link_tokens (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  token_hash text not null unique,
  created_by_device_id uuid references public.shop_devices(id) on delete set null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by_customer_id uuid references public.customer_profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

drop trigger if exists trg_customer_profiles_updated on public.customer_profiles;
create trigger trg_customer_profiles_updated before update on public.customer_profiles
for each row execute function public.set_updated_at();
drop trigger if exists trg_memberships_updated on public.customer_shop_memberships;
create trigger trg_memberships_updated before update on public.customer_shop_memberships
for each row execute function public.set_updated_at();

create index if not exists idx_memberships_customer_status on public.customer_shop_memberships(customer_id, status);
create index if not exists idx_memberships_shop_status on public.customer_shop_memberships(shop_id, status);

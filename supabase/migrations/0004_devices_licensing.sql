-- Device activation and signed-licence lease metadata.

create table if not exists public.shop_devices (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  device_name text,
  public_key text not null,
  key_fingerprint text not null unique,
  status text not null default 'PENDING' check (status in ('ACTIVE', 'REVOKED', 'PENDING')),
  activated_at timestamptz,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text,
  created_at timestamptz not null default now()
);

-- One active device per shop (first-release policy).
create unique index if not exists uq_shop_devices_one_active
  on public.shop_devices(shop_id) where status = 'ACTIVE';

create table if not exists public.licence_leases (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  device_id uuid not null references public.shop_devices(id) on delete cascade,
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  payload_hash text not null,
  signature_key_id text not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),

  -- Proposed extension from Architecture v3 §9.2.
  jti text not null unique default gen_random_uuid()::text,
  check (expires_at <= issued_at + interval '72 hours')
);

-- Proposed extension: auditable device replacement workflow.
create table if not exists public.device_reset_requests (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.shop_devices(id) on delete restrict,
  shop_id uuid not null references public.shops(id) on delete restrict,
  requested_by uuid references public.admin_profiles(user_id) on delete set null,
  reason text not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'COMPLETED', 'REJECTED')),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_devices_shop_status on public.shop_devices(shop_id, status);
create index if not exists idx_leases_device on public.licence_leases(device_id, issued_at desc);

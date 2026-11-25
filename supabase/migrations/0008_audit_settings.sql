-- Audit, support, restricted settings and scheduled-job monitoring.

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid,
  actor_type text not null check (actor_type in ('ADMIN', 'SYSTEM', 'SHOP_DEVICE', 'CUSTOMER')),
  action text not null,
  entity_type text not null,
  entity_id text,
  shop_id uuid references public.shops(id) on delete set null,
  customer_id uuid references public.customer_profiles(id) on delete set null,
  reason text,
  before_data jsonb,
  after_data jsonb,
  request_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.customer_support_tickets (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_profiles(id) on delete cascade,
  shop_id uuid references public.shops(id) on delete set null,
  category text not null check (category in ('ACCOUNT', 'POINTS', 'REDEMPTION', 'OTHER')),
  subject text not null,
  description text not null,
  status text not null default 'OPEN' check (status in ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')),
  assigned_to uuid references public.admin_profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Non-secret configuration only. Never store service-role or signing keys here.
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references public.admin_profiles(user_id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.cron_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  status text not null check (status in ('SUCCESS', 'FAILED')),
  details jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

insert into public.app_settings (key, value) values
  ('business.name', '"Arthi Digital Enterprises"'::jsonb),
  ('business.email', '""'::jsonb),
  ('business.phone', '""'::jsonb),
  ('business.address', '""'::jsonb),
  ('business.terms_url', '""'::jsonb),
  ('billing.currency', '"INR"'::jsonb),
  ('billing.grace_days', '7'::jsonb),
  ('billing.device_limit', '1'::jsonb),
  ('licence.offline_hours', '72'::jsonb),
  ('licence.policy_version', '"1.0"'::jsonb),
  ('licence.key_version', '"1"'::jsonb),
  ('engagement.defaults', '{}'::jsonb),
  ('security.retention_days', '""'::jsonb),
  ('security.require_mfa_super_admin', 'true'::jsonb)
on conflict (key) do nothing;

drop trigger if exists trg_support_tickets_updated on public.customer_support_tickets;
create trigger trg_support_tickets_updated before update on public.customer_support_tickets
for each row execute function public.set_updated_at();

create index if not exists idx_audit_created on public.audit_logs(created_at desc);
create index if not exists idx_audit_entity on public.audit_logs(entity_type, entity_id);
create index if not exists idx_audit_shop on public.audit_logs(shop_id, created_at desc);
create index if not exists idx_cron_runs_job on public.cron_runs(job_name, finished_at desc);

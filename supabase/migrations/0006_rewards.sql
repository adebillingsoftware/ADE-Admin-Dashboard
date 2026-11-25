-- Reward programmes, immutable ledgers, events, redemptions.
-- No commercial values are seeded: every rule configuration is administrator-supplied
-- and must be explicitly approved before activation.

create table if not exists public.reward_programmes (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references public.shops(id) on delete cascade,
  name text not null,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'ACTIVE', 'PAUSED', 'ENDED')),
  starts_at timestamptz,
  ends_at timestamptz,
  terms_text text,
  created_by uuid references public.admin_profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table if not exists public.reward_rule_versions (
  id uuid primary key default gen_random_uuid(),
  programme_id uuid not null references public.reward_programmes(id) on delete cascade,
  version_number integer not null,
  rule_type text not null check (rule_type in (
    'POINTS_EARN', 'POINTS_EXPIRY', 'WALLET_CREDIT', 'WALLET_DEBIT',
    'REDEMPTION', 'DOB_REWARD', 'SCRATCHCARD_LIMITS'
  )),
  configuration jsonb not null default '{}'::jsonb check (jsonb_typeof(configuration) = 'object'),
  effective_from timestamptz not null default now(),
  effective_until timestamptz,
  created_by uuid references public.admin_profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),

  -- Proposed extension: no rule can be used until an authorized administrator approves it.
  is_approved boolean not null default false,
  approved_by uuid references public.admin_profiles(user_id) on delete set null,
  approved_at timestamptz,
  unique (programme_id, rule_type, version_number)
);

create table if not exists public.reward_ledger (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.customer_shop_memberships(id) on delete restrict,
  entry_type text not null check (entry_type in ('EARN', 'REDEEM', 'EXPIRE', 'REVERSAL', 'ADJUSTMENT', 'PROMOTION')),
  points_delta bigint not null,
  source_event_id uuid,
  redemption_id uuid,
  rule_version_id uuid references public.reward_rule_versions(id) on delete set null,
  description text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid,

  -- Proposed extension for strict idempotency and reversal tracking.
  idempotency_key text unique
);

create table if not exists public.wallet_accounts (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null unique references public.customer_shop_memberships(id) on delete cascade,
  currency_code text not null default 'INR',
  wallet_type text not null check (wallet_type in ('SHOP_CREDIT', 'DISCOUNT_CREDIT', 'OTHER')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'FROZEN', 'CLOSED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  wallet_account_id uuid not null references public.wallet_accounts(id) on delete restrict,
  entry_type text not null check (entry_type in ('CREDIT', 'DEBIT', 'REVERSAL', 'EXPIRY', 'ADJUSTMENT')),
  amount_minor_delta bigint not null,
  source_event_id uuid,
  redemption_id uuid,
  description text,
  created_at timestamptz not null default now(),
  created_by uuid,
  idempotency_key text unique
);

create table if not exists public.reward_events (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  shop_id uuid not null references public.shops(id) on delete restrict,
  device_id uuid references public.shop_devices(id) on delete set null,
  membership_id uuid not null references public.customer_shop_memberships(id) on delete restrict,
  local_sale_id text not null,
  event_type text not null check (event_type in ('ELIGIBLE_PURCHASE', 'RETURN', 'REVERSAL')),
  eligible_amount_minor bigint not null check (eligible_amount_minor > 0),
  currency_code text not null default 'INR',
  payload_version integer not null default 1,
  status text not null default 'RECEIVED' check (status in ('RECEIVED', 'PROCESSED', 'REJECTED')),
  result jsonb,
  rejection_code text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create table if not exists public.reward_adjustment_requests (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.customer_shop_memberships(id) on delete restrict,
  adjustment_type text not null check (adjustment_type in ('POINTS', 'WALLET')),
  amount_delta bigint not null check (amount_delta <> 0),
  reason text not null,
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  requested_by uuid not null,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.reward_catalogue (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null,
  description text,
  points_cost bigint not null check (points_cost > 0),
  stock_limit integer,
  status text not null default 'PAUSED' check (status in ('ACTIVE', 'PAUSED', 'ENDED')),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.redemptions (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.customer_shop_memberships(id) on delete restrict,
  reward_id uuid not null references public.reward_catalogue(id) on delete restrict,
  redemption_code_hash text not null unique,
  points_spent bigint not null check (points_spent > 0),
  status text not null default 'RESERVED' check (status in ('RESERVED', 'COMPLETED', 'REJECTED', 'EXPIRED', 'CANCELLED')),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  completed_at timestamptz,
  verified_by_device_id uuid references public.shop_devices(id) on delete set null
);

drop trigger if exists trg_reward_programmes_updated on public.reward_programmes;
create trigger trg_reward_programmes_updated before update on public.reward_programmes
for each row execute function public.set_updated_at();
drop trigger if exists trg_wallet_accounts_updated on public.wallet_accounts;
create trigger trg_wallet_accounts_updated before update on public.wallet_accounts
for each row execute function public.set_updated_at();

create index if not exists idx_reward_ledger_membership_created on public.reward_ledger(membership_id, created_at desc);
create index if not exists idx_wallet_ledger_account_created on public.wallet_ledger(wallet_account_id, created_at desc);
create index if not exists idx_reward_events_shop_received on public.reward_events(shop_id, received_at desc);
create index if not exists idx_redemptions_membership_created on public.redemptions(membership_id, created_at desc);

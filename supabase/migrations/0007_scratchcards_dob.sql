-- Scratch-card campaigns, predetermined prizes and DOB reward tracking.

create table if not exists public.scratch_card_campaigns (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references public.shops(id) on delete cascade,
  name text not null,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'ACTIVE', 'PAUSED', 'ENDED')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  per_customer_limit integer,
  configuration jsonb not null default '{}'::jsonb check (jsonb_typeof(configuration) = 'object'),
  created_by uuid references public.admin_profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),

  -- Proposed extension: activation requires explicit approval of prize rules.
  approved_by uuid references public.admin_profiles(user_id) on delete set null,
  approved_at timestamptz
);

create table if not exists public.scratch_card_prizes (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.scratch_card_campaigns(id) on delete cascade,
  name text not null,
  prize_type text not null check (prize_type in ('POINTS', 'WALLET_CREDIT', 'COUPON', 'OTHER')),
  prize_value jsonb not null check (jsonb_typeof(prize_value) = 'object'),
  probability_weight bigint not null check (probability_weight > 0),
  quantity_limit integer check (quantity_limit is null or quantity_limit > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.scratch_cards (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.scratch_card_campaigns(id) on delete restrict,
  membership_id uuid not null references public.customer_shop_memberships(id) on delete restrict,
  prize_id uuid not null references public.scratch_card_prizes(id) on delete restrict,
  status text not null default 'ISSUED' check (status in ('ISSUED', 'REVEALED', 'REDEEMED', 'EXPIRED')),
  issued_at timestamptz not null default now(),
  revealed_at timestamptz,
  expires_at timestamptz,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),

  -- Proposed extensions for one-time reveal and single reward application.
  reveal_idempotency_key text unique,
  reward_applied boolean not null default false
);

create table if not exists public.dob_reward_issuances (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.customer_shop_memberships(id) on delete restrict,
  programme_id uuid not null references public.reward_programmes(id) on delete restrict,
  eligibility_year integer not null,
  reward_ledger_id uuid references public.reward_ledger(id) on delete set null,
  wallet_ledger_id uuid references public.wallet_ledger(id) on delete set null,
  issued_at timestamptz not null default now(),
  status text not null default 'ISSUED' check (status in ('ISSUED', 'REVERSED', 'FAILED')),
  unique (membership_id, programme_id, eligibility_year)
);

create index if not exists idx_scratch_cards_membership_status on public.scratch_cards(membership_id, status);
create index if not exists idx_campaigns_status_dates on public.scratch_card_campaigns(status, ends_at);

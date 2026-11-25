-- Arthi Digital Enterprises — foundation extensions and helper functions.
-- Safe to re-run against an existing Supabase project.

create extension if not exists pgcrypto;

-- Standard updated_at trigger.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Database-backed rate limiter: works across serverless invocations.
create table if not exists public.api_rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  count integer not null default 1
);

create or replace function public.check_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_start timestamptz;
  v_count integer;
begin
  select window_start, count into v_start, v_count
  from public.api_rate_limits
  where key = p_key
  for update;

  if not found or v_start < now() - make_interval(secs => greatest(p_window_seconds, 1)) then
    insert into public.api_rate_limits (key, window_start, count)
    values (p_key, now(), 1)
    on conflict (key) do update set window_start = now(), count = 1;
    return true;
  end if;

  if v_count >= p_limit then
    return false;
  end if;

  update public.api_rate_limits set count = count + 1 where key = p_key;
  return true;
end;
$$;

revoke all on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;

-- Supabase Cron setup (run after deploying the Vercel API).
-- Replace the two placeholders before running. pg_cron and pg_net are enabled in
-- Supabase; if they are not available, use Dashboard > Database > Cron to call
-- the public.process_subscription_lifecycle() RPC on the same schedule.

-- Every 5 minutes: expired billing periods -> GRACE -> suspended after 7 days.
select cron.unschedule('arthi-subscription-lifecycle')
where exists (
  select 1 from cron.job where jobname = 'arthi-subscription-lifecycle'
);

select cron.schedule(
  'arthi-subscription-lifecycle',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://YOUR_VERCEL_DOMAIN/api/v1/cron/process-subscription-lifecycle',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', 'YOUR_CRON_SECRET'
    ),
    body := '{}'::jsonb
  )
  $$
);

-- Daily: reward expiry processing. Currently a no-op until an expiry policy is
-- approved by an administrator; kept scheduled so enabling a policy needs no deploy.
select cron.unschedule('arthi-reward-expiry')
where exists (
  select 1 from cron.job where jobname = 'arthi-reward-expiry'
);

select cron.schedule(
  'arthi-reward-expiry',
  '0 3 * * *',
  $$
  select net.http_post(
    url := 'https://YOUR_VERCEL_DOMAIN/api/v1/cron/process-reward-expiry',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', 'YOUR_CRON_SECRET'
    ),
    body := '{}'::jsonb
  )
  $$
);

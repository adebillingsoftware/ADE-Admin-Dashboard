import { Router } from 'express';
import { requireSupabase, assertNoError } from '../../config/supabase.js';
import { authenticateCron } from '../../middleware/authenticate.js';
import { ok } from '../../utils/ApiResponse.js';
import { processLifecycle } from '../../services/subscription.service.js';

export const cronRoutes = Router();

async function recordRun(jobName: string, status: 'SUCCESS' | 'FAILED', details: unknown) {
  const supabase = requireSupabase();
  await supabase.from('cron_runs').insert({
    job_name: jobName,
    status,
    details: (details ?? {}) as never,
    finished_at: new Date().toISOString(),
  });
}

cronRoutes.post('/cron/process-subscription-lifecycle', authenticateCron, async (req, res, next) => {
  const started = Date.now();
  try {
    const result = await processLifecycle();
    await recordRun('process-subscription-lifecycle', 'SUCCESS', { result, durationMs: Date.now() - started });
    return ok(res, { job: 'process-subscription-lifecycle', result });
  } catch (error) {
    await recordRun('process-subscription-lifecycle', 'FAILED', { message: error instanceof Error ? error.message : String(error) }).catch(() => undefined);
    next(error);
  }
});

cronRoutes.post('/cron/process-reward-expiry', authenticateCron, async (req, res, next) => {
  try {
    const supabase = requireSupabase();
    const { data, error } = await supabase.rpc('process_reward_expiry');
    assertNoError({ error });
    await recordRun('process-reward-expiry', 'SUCCESS', { result: data });
    return ok(res, { job: 'process-reward-expiry', result: data });
  } catch (error) {
    await recordRun('process-reward-expiry', 'FAILED', { message: error instanceof Error ? error.message : String(error) }).catch(() => undefined);
    next(error);
  }
});

cronRoutes.get('/cron/monitor', authenticateCron, async (_req, res, next) => {
  try {
    const supabase = requireSupabase();
    const { data, error } = await supabase.from('cron_runs').select('*').order('finished_at', { ascending: false }).limit(100);
    assertNoError({ error });
    return ok(res, data ?? []);
  } catch (error) { next(error); }
});

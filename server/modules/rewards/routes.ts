import { Router } from 'express';
import { z } from 'zod';
import { requireSupabase, assertNoError } from '../../config/supabase.js';
import { PERMISSIONS } from '../../config/permissions.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { paginationQuery, reasonBody } from '../../schemas/common.js';
import { ok } from '../../utils/ApiResponse.js';
import { paginationMeta } from '../../utils/pagination.js';
import { adjustReward, retrySync } from '../../services/reward.service.js';

export const rewardsRoutes = Router();
rewardsRoutes.use(authenticate);

const adjustBody = reasonBody.extend({
  membershipId: z.string().uuid(),
  adjustmentType: z.enum(['POINTS', 'WALLET']),
  amountDelta: z.number().int().refine((value) => value !== 0, 'Adjustment cannot be zero.'),
});

rewardsRoutes.get('/rewards/ledger', authorize(PERMISSIONS.rewardsRead), validate({ query: paginationQuery }), async (req, res, next) => {
  try {
    const q = req.input.query as { page: number; pageSize: number; membershipId?: string; shopId?: string };
    const supabase = requireSupabase();
    let query = supabase.from('reward_ledger').select('*, customer_shop_memberships(customer_id, shop_id), shops(shop_code, shop_name)', { count: 'exact' }).order('created_at', { ascending: false });
    if (q.membershipId) query = query.eq('membership_id', q.membershipId);
    query = query.range((q.page - 1) * q.pageSize, q.page * q.pageSize - 1);
    const { data, error, count } = await query;
    assertNoError({ error });
    return ok(res, data ?? [], paginationMeta(q.page, q.pageSize, count ?? 0));
  } catch (error) { next(error); }
});

rewardsRoutes.get('/rewards/summary', authorize(PERMISSIONS.rewardsRead), async (_req, res, next) => {
  try {
    const supabase = requireSupabase();
    const [pointsRes, walletRes, redeemsRes, eventsRes] = await Promise.all([
      supabase.from('reward_ledger').select('points_delta, created_at').limit(10000),
      supabase.from('wallet_ledger').select('amount_minor_delta, created_at').limit(10000),
      supabase.from('redemptions').select('id, status, points_spent, created_at').limit(10000),
      supabase.from('reward_events').select('id, status, rejection_code').limit(10000),
    ]);
    for (const result of [pointsRes, walletRes, redeemsRes, eventsRes]) assertNoError({ error: result.error });
    return ok(res, {
      pointsBalance: (pointsRes.data ?? []).reduce((total, row) => total + Number(row.points_delta ?? 0), 0),
      walletBalanceMinor: (walletRes.data ?? []).reduce((total, row) => total + Number(row.amount_minor_delta ?? 0), 0),
      redemptions: redeemsRes.data ?? [],
      sync: {
        total: eventsRes.data?.length ?? 0,
        processed: (eventsRes.data ?? []).filter((row) => row.status === 'PROCESSED').length,
        pending: (eventsRes.data ?? []).filter((row) => row.status === 'RECEIVED').length,
        failed: (eventsRes.data ?? []).filter((row) => row.status === 'REJECTED').length,
      },
    });
  } catch (error) { next(error); }
});

rewardsRoutes.get('/rewards/redemptions', authorize(PERMISSIONS.rewardsRead), validate({ query: paginationQuery }), async (req, res, next) => {
  try {
    const q = req.input.query as { page: number; pageSize: number };
    const supabase = requireSupabase();
    const { data, error, count } = await supabase
      .from('redemptions')
      .select('*, customer_shop_memberships(customer_id, shop_id), reward_catalogue(name)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((q.page - 1) * q.pageSize, q.page * q.pageSize - 1);
    assertNoError({ error });
    return ok(res, data ?? [], paginationMeta(q.page, q.pageSize, count ?? 0));
  } catch (error) { next(error); }
});

rewardsRoutes.get('/rewards/sync-events', authorize(PERMISSIONS.rewardsRead), validate({ query: paginationQuery.extend({ status: z.string().optional() }) }), async (req, res, next) => {
  try {
    const q = req.input.query as { page: number; pageSize: number; status?: string };
    const supabase = requireSupabase();
    let query = supabase.from('reward_events').select('*, shops(shop_code, shop_name)', { count: 'exact' }).order('received_at', { ascending: false });
    if (q.status) query = query.eq('status', q.status);
    query = query.range((q.page - 1) * q.pageSize, q.page * q.pageSize - 1);
    const { data, error, count } = await query;
    assertNoError({ error });
    return ok(res, data ?? [], paginationMeta(q.page, q.pageSize, count ?? 0));
  } catch (error) { next(error); }
});

rewardsRoutes.post('/rewards/:id/adjust', authorize(PERMISSIONS.rewardsAdjust), validate({ params: z.object({ id: z.string().uuid() }), body: adjustBody }), async (req, res, next) => {
  try {
    const { id } = req.input.params as { id: string };
    const body = req.input.body as z.infer<typeof adjustBody>;
    return ok(res, await adjustReward({ ...body, membershipId: id, adminId: req.admin!.userId, requestId: req.requestId }));
  } catch (error) { next(error); }
});

rewardsRoutes.post('/rewards/sync-events/:id/retry', authorize(PERMISSIONS.rewardsAdjust), validate({ params: z.object({ id: z.string().uuid() }) }), async (req, res, next) => {
  try {
    const { id } = req.input.params as { id: string };
    return ok(res, await retrySync(id, req.admin!.userId, req.requestId));
  } catch (error) { next(error); }
});

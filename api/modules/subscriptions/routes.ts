import { Router } from 'express';
import { z } from 'zod';
import { requireSupabase, assertNoError } from '../../config/supabase.js';
import { PERMISSIONS } from '../../config/permissions.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { idParam, paginationQuery, reasonBody, uuid } from '../../schemas/common.js';
import { ok } from '../../utils/ApiResponse.js';
import { ApiError } from '../../utils/ApiError.js';
import { paginationMeta } from '../../utils/pagination.js';
import {
  getSubscription,
  reactivateSubscription,
  renewSubscription,
  suspendSubscription,
} from '../../services/subscription.service.js';

export const subscriptionRoutes = Router();
subscriptionRoutes.use(authenticate);

const listQuery = paginationQuery.extend({
  status: z.enum(['ACTIVE', 'GRACE', 'SUSPENDED', 'CANCELLED', 'ALL']).default('ALL'),
  renewalsDueDays: z.coerce.number().int().min(0).max(365).optional(),
  shopId: uuid.optional(),
});

const createBody = z.object({
  shopId: uuid,
  planId: uuid,
  monthlyPriceMinor: z.number().int().positive().optional(),
  currencyCode: z.string().length(3).default('INR'),
  periodStart: z.string().date().optional(),
});

const suspendBody = reasonBody.extend({
  reasonCode: z.enum(['MANUAL', 'OVERDUE', 'OTHER']).default('MANUAL'),
});

subscriptionRoutes.get('/subscriptions', authorize(PERMISSIONS.subscriptionsRead), validate({ query: listQuery }), async (req, res, next) => {
  try {
    const q = req.input.query as z.infer<typeof listQuery>;
    const supabase = requireSupabase();
    let query = supabase
      .from('subscriptions')
      .select('*, shops(shop_code, shop_name), subscription_plans(name)', { count: 'exact' })
      .order('updated_at', { ascending: false })
      .range((q.page - 1) * q.pageSize, q.page * q.pageSize - 1);
    if (q.status !== 'ALL') query = query.eq('status', q.status);
    if (q.shopId) query = query.eq('shop_id', q.shopId);
    const { data, error, count } = await query;
    assertNoError({ error });
    return ok(res, data ?? [], paginationMeta(q.page, q.pageSize, count ?? 0));
  } catch (error) { next(error); }
});

subscriptionRoutes.get('/billing-periods', authorize(PERMISSIONS.subscriptionsRead), validate({ query: paginationQuery }), async (req, res, next) => {
  try {
    const q = req.input.query as { page: number; pageSize: number };
    const supabase = requireSupabase();
    const { data, error, count } = await supabase
      .from('billing_periods')
      .select('*, subscriptions(shop_id, shops(shop_code, shop_name))', { count: 'exact' })
      .order('period_start', { ascending: false })
      .range((q.page - 1) * q.pageSize, q.page * q.pageSize - 1);
    assertNoError({ error });
    return ok(res, data ?? [], paginationMeta(q.page, q.pageSize, count ?? 0));
  } catch (error) { next(error); }
});

subscriptionRoutes.get('/subscriptions/:id', authorize(PERMISSIONS.subscriptionsRead), validate({ params: idParam }), async (req, res, next) => {
  try {
    const { id } = req.input.params as { id: string };
    return ok(res, await getSubscription(id));
  } catch (error) { next(error); }
});

subscriptionRoutes.post('/subscriptions', authorize(PERMISSIONS.subscriptionsManage), validate({ body: createBody }), async (req, res, next) => {
  try {
    const body = req.input.body as z.infer<typeof createBody>;
    const supabase = requireSupabase();
    const { data, error } = await supabase.rpc('create_subscription', {
      p_shop_id: body.shopId,
      p_plan_id: body.planId,
      p_monthly_price_minor: body.monthlyPriceMinor ?? null,
      p_currency_code: body.currencyCode,
      p_period_start: body.periodStart ?? null,
      p_admin_id: req.admin!.userId,
      p_request_id: req.requestId,
    });
    assertNoError({ error });
    return ok(res, data, undefined, 201);
  } catch (error) { next(error); }
});

subscriptionRoutes.post('/subscriptions/:id/renew', authorize(PERMISSIONS.subscriptionsManage), validate({ params: idParam, body: reasonBody.partial() }), async (req, res, next) => {
  try {
    const { id } = req.input.params as { id: string };
    const { reason } = req.input.body as { reason?: string };
    return ok(res, await renewSubscription(id, req.admin!.userId, reason ?? 'Administrator renewal', req.requestId));
  } catch (error) { next(error); }
});

subscriptionRoutes.post('/subscriptions/:id/suspend', authorize(PERMISSIONS.subscriptionsManage), validate({ params: idParam, body: suspendBody }), async (req, res, next) => {
  try {
    const { id } = req.input.params as { id: string };
    const body = req.input.body as z.infer<typeof suspendBody>;
    return ok(res, await suspendSubscription(id, req.admin!.userId, body.reasonCode, body.reason, req.requestId));
  } catch (error) { next(error); }
});

subscriptionRoutes.post('/subscriptions/:id/reactivate', authorize(PERMISSIONS.subscriptionsManage), validate({ params: idParam, body: reasonBody }), async (req, res, next) => {
  try {
    const { id } = req.input.params as { id: string };
    const { reason } = req.input.body as z.infer<typeof reasonBody>;
    return ok(res, await reactivateSubscription(id, req.admin!.userId, reason, req.requestId));
  } catch (error) { next(error); }
});

subscriptionRoutes.get('/subscriptions/:id/history', authorize(PERMISSIONS.subscriptionsRead), validate({ params: idParam }), async (req, res, next) => {
  try {
    const { id } = req.input.params as { id: string };
    const supabase = requireSupabase();
    const { data: subscription, error: subError } = await supabase.from('subscriptions').select('shop_id').eq('id', id).maybeSingle();
    assertNoError({ error: subError });
    if (!subscription) throw new ApiError(404, 'SUBSCRIPTION_NOT_FOUND', 'Subscription not found.');
    const { data, error } = await supabase
      .from('billing_periods')
      .select('*, payment_allocations(id, allocated_amount_minor, payments(id, status, method, paid_at, transaction_reference))')
      .eq('subscription_id', id)
      .order('period_start', { ascending: false });
    assertNoError({ error });
    return ok(res, data ?? []);
  } catch (error) { next(error); }
});

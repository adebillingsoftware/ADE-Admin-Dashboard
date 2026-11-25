import { Router } from 'express';
import { z } from 'zod';
import { requireSupabase, assertNoError } from '../../config/supabase.js';
import { PERMISSIONS } from '../../config/permissions.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { idParam, paginationQuery, reasonBody, uuid, moneyMinor } from '../../schemas/common.js';
import { ok } from '../../utils/ApiResponse.js';
import { ApiError } from '../../utils/ApiError.js';
import { createPayment, rejectPayment, verifyPayment } from '../../services/payment.service.js';
import { paginationMeta } from '../../utils/pagination.js';

export const paymentRoutes = Router();
paymentRoutes.use(authenticate);

const listQuery = paginationQuery.extend({
  status: z.enum(['PENDING', 'VERIFIED', 'REJECTED', 'ALL']).default('ALL'),
  shopId: uuid.optional(),
  method: z.enum(['UPI', 'BANK_TRANSFER', 'CASH', 'OTHER']).optional(),
});

const createBody = z.object({
  shopId: uuid,
  amountMinor: moneyMinor.refine((value) => value > 0, 'Amount must be greater than zero.'),
  currencyCode: z.string().length(3).default('INR'),
  method: z.enum(['UPI', 'BANK_TRANSFER', 'CASH', 'OTHER']),
  transactionReference: z.string().trim().max(120).optional().nullable(),
  paidAt: z.string().datetime({ offset: true }),
  proofStoragePath: z.string().max(500).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

const verifyBody = z.object({
  billingPeriodId: uuid.optional(),
  amountMinor: moneyMinor.optional(),
});

paymentRoutes.get('/payments', authorize(PERMISSIONS.paymentsRead), validate({ query: listQuery }), async (req, res, next) => {
  try {
    const q = req.input.query as z.infer<typeof listQuery>;
    const supabase = requireSupabase();
    let query = supabase
      .from('payments')
      .select('*, shops(shop_code, shop_name)', { count: 'exact' })
      .order('paid_at', { ascending: false })
      .range((q.page - 1) * q.pageSize, q.page * q.pageSize - 1);
    if (q.status !== 'ALL') query = query.eq('status', q.status);
    if (q.shopId) query = query.eq('shop_id', q.shopId);
    if (q.method) query = query.eq('method', q.method);
    if (q.search) query = query.ilike('transaction_reference', `%${q.search}%`);
    const { data, error, count } = await query;
    assertNoError({ error });
    return ok(res, data ?? [], paginationMeta(q.page, q.pageSize, count ?? 0));
  } catch (error) { next(error); }
});

paymentRoutes.get('/payments/pending', authorize(PERMISSIONS.paymentsRead), validate({ query: paginationQuery }), async (req, res, next) => {
  try {
    const q = req.input.query as z.infer<typeof paginationQuery>;
    const supabase = requireSupabase();
    const { data, error, count } = await supabase
      .from('payments')
      .select('*, shops(shop_code, shop_name)', { count: 'exact' })
      .eq('status', 'PENDING')
      .order('paid_at', { ascending: false })
      .range((q.page - 1) * q.pageSize, q.page * q.pageSize - 1);
    assertNoError({ error });
    return ok(res, data ?? [], paginationMeta(q.page, q.pageSize, count ?? 0));
  } catch (error) { next(error); }
});

paymentRoutes.post('/payments', authorize(PERMISSIONS.paymentsRecord), validate({ body: createBody }), async (req, res, next) => {
  try {
    const body = req.input.body as z.infer<typeof createBody>;
    const payment = await createPayment({ ...body, recordedBy: req.admin!.userId, requestId: req.requestId });
    return ok(res, payment, undefined, 201);
  } catch (error) { next(error); }
});

paymentRoutes.get('/payments/:id', authorize(PERMISSIONS.paymentsRead), validate({ params: idParam }), async (req, res, next) => {
  try {
    const { id } = req.input.params as { id: string };
    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from('payments')
      .select('*, shops(shop_code, shop_name), payment_allocations(*, billing_periods(period_start, period_end))')
      .eq('id', id)
      .maybeSingle();
    assertNoError({ error });
    if (!data) throw new ApiError(404, 'PAYMENT_NOT_FOUND', 'Payment not found.');
    return ok(res, data);
  } catch (error) { next(error); }
});

paymentRoutes.post('/payments/:id/verify', authorize(PERMISSIONS.paymentsVerify), validate({ params: idParam, body: verifyBody }), async (req, res, next) => {
  try {
    const { id } = req.input.params as { id: string };
    const body = req.input.body as z.infer<typeof verifyBody>;
    const result = await verifyPayment(id, req.admin!.userId, body.billingPeriodId, body.amountMinor, req.requestId);
    return ok(res, result);
  } catch (error) { next(error); }
});

paymentRoutes.post('/payments/:id/reject', authorize(PERMISSIONS.paymentsReject), validate({ params: idParam, body: reasonBody }), async (req, res, next) => {
  try {
    const { id } = req.input.params as { id: string };
    const { reason } = req.input.body as z.infer<typeof reasonBody>;
    const result = await rejectPayment(id, req.admin!.userId, reason, req.requestId);
    return ok(res, result);
  } catch (error) { next(error); }
});


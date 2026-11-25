import { Router } from 'express';
import { z } from 'zod';
import { requireSupabase, assertNoError } from '../../config/supabase.js';
import { PERMISSIONS } from '../../config/permissions.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { idParam, paginationQuery, uuid } from '../../schemas/common.js';
import { ok } from '../../utils/ApiResponse.js';
import { ApiError } from '../../utils/ApiError.js';
import { writeAudit } from '../../services/audit.service.js';

export const shopsRoutes = Router();
shopsRoutes.use(authenticate);

const listQuery = paginationQuery.extend({
  q: z.string().max(200).optional(),
  serviceStatus: z.enum(['ACTIVE', 'GRACE', 'SUSPENDED', 'CANCELLED', 'ALL']).default('ALL'),
  paymentStatus: z.enum(['PENDING', 'PAID', 'OVERDUE', 'ALL']).default('ALL'),
  deviceStatus: z.enum(['ACTIVE', 'NONE', 'ALL']).default('ALL'),
  rewardsEnabled: z.enum(['true', 'false', 'all']).default('all'),
  registrationFrom: z.string().max(40).optional(),
  registrationTo: z.string().max(40).optional(),
  renewalsDueDays: z.coerce.number().int().min(0).max(365).optional(),
});

const createBody = z.object({
  shopCode: z.string().trim().min(3).max(40).regex(/^[A-Za-z0-9_-]+$/, 'Use letters, numbers, _ or - only.'),
  shopName: z.string().trim().min(2).max(200),
  ownerName: z.string().trim().min(2).max(200),
  phone: z.string().trim().min(5).max(40),
  email: z.string().email().optional().nullable(),
  addressLine1: z.string().max(200).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  state: z.string().max(100).optional().nullable(),
  postalCode: z.string().max(20).optional().nullable(),
  countryCode: z.string().length(2).default('IN'),
  gstNumber: z.string().max(40).optional().nullable(),
  planId: uuid,
});

const patchBody = createBody.omit({ planId: true, shopCode: true }).partial().extend({
  accountStatus: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
  registrationStatus: z.enum(['PENDING', 'ACTIVE', 'REJECTED', 'CLOSED']).optional(),
  rewardsEnabled: z.boolean().optional(),
});

shopsRoutes.get('/shops', authorize(PERMISSIONS.shopsRead), validate({ query: listQuery }), async (req, res, next) => {
  try {
    const q = req.input.query as z.infer<typeof listQuery>;
    const supabase = requireSupabase();
    const { data, error } = await supabase.rpc('admin_list_shops', {
      p_search: q.q ?? null,
      p_service_status: q.serviceStatus,
      p_payment_status: q.paymentStatus,
      p_device_status: q.deviceStatus,
      p_rewards_enabled: q.rewardsEnabled === 'all' ? null : q.rewardsEnabled === 'true',
      p_registration_from: q.registrationFrom ?? null,
      p_registration_to: q.registrationTo ?? null,
      p_renewals_due_days: q.renewalsDueDays ?? null,
      p_limit: q.pageSize,
      p_offset: (q.page - 1) * q.pageSize,
      p_sort_by: q.sortBy ?? 'registered_at',
      p_sort_direction: q.sortDirection,
    });
    assertNoError({ error });
    const result = (data ?? { rows: [], total: 0 }) as { rows: unknown[]; total: number };
    return ok(res, result.rows, {
      page: q.page,
      pageSize: q.pageSize,
      total: Number(result.total),
      totalPages: Math.max(1, Math.ceil(Number(result.total) / q.pageSize)),
    });
  } catch (error) {
    next(error);
  }
});

shopsRoutes.get('/shops/:id', authorize(PERMISSIONS.shopsRead), validate({ params: idParam }), async (req, res, next) => {
  try {
    const { id } = req.input.params as { id: string };
    const supabase = requireSupabase();
    const [shopRes, subscriptionRes, deviceRes, paymentRes, auditRes] = await Promise.all([
      supabase.from('shops').select('*').eq('id', id).maybeSingle(),
      supabase.from('subscriptions').select('*, subscription_plans(name, monthly_price_minor, currency_code, billing_interval)').eq('shop_id', id).maybeSingle(),
      supabase.from('shop_devices').select('*').eq('shop_id', id).order('created_at', { ascending: false }),
      supabase.from('payments').select('id, amount_minor, currency_code, method, status, paid_at, verified_at').eq('shop_id', id).order('paid_at', { ascending: false }).limit(10),
      supabase.from('audit_logs').select('id, action, reason, created_at').eq('shop_id', id).order('created_at', { ascending: false }).limit(10),
    ]);
    for (const result of [shopRes, subscriptionRes, deviceRes, paymentRes, auditRes]) assertNoError({ error: result.error });
    if (!shopRes.data) throw new ApiError(404, 'SHOP_NOT_FOUND', 'Shop not found.');
    const { data: syncStats } = await supabase
      .from('reward_events')
      .select('status')
      .eq('shop_id', id);
    const { data: programme } = await supabase
      .from('reward_programmes')
      .select('id, name, status')
      .eq('shop_id', id)
      .eq('status', 'ACTIVE')
      .maybeSingle();
    return ok(res, {
      shop: shopRes.data,
      subscription: subscriptionRes.data,
      devices: deviceRes.data ?? [],
      recentPayments: paymentRes.data ?? [],
      recentAudit: auditRes.data ?? [],
      engagement: {
        rewardsEnabled: shopRes.data.rewards_enabled,
        activeProgramme: programme ?? null,
        pendingSync: (syncStats ?? []).filter((row) => row.status === 'RECEIVED').length,
        failedSync: (syncStats ?? []).filter((row) => row.status === 'REJECTED').length,
      },
    });
  } catch (error) {
    next(error);
  }
});

shopsRoutes.post('/shops', authorize(PERMISSIONS.shopsWrite), validate({ body: createBody }), async (req, res, next) => {
  try {
    const body = req.input.body as z.infer<typeof createBody>;
    const supabase = requireSupabase();
    const { data, error } = await supabase.rpc('create_shop', {
      p_shop_code: body.shopCode,
      p_shop_name: body.shopName,
      p_owner_name: body.ownerName,
      p_phone: body.phone,
      p_email: body.email ?? null,
      p_address_line1: body.addressLine1 ?? null,
      p_city: body.city ?? null,
      p_state: body.state ?? null,
      p_postal_code: body.postalCode ?? null,
      p_country_code: body.countryCode,
      p_gst_number: body.gstNumber ?? null,
      p_plan_id: body.planId,
      p_admin_id: req.admin!.userId,
      p_request_id: req.requestId,
    });
    assertNoError({ error });
    return ok(res, data, undefined, 201);
  } catch (error) {
    next(error);
  }
});

shopsRoutes.patch('/shops/:id', authorize(PERMISSIONS.shopsWrite), validate({ params: idParam, body: patchBody }), async (req, res, next) => {
  try {
    const { id } = req.input.params as { id: string };
    const body = req.input.body as z.infer<typeof patchBody>;
    const supabase = requireSupabase();
    const { data: before } = await supabase.from('shops').select('*').eq('id', id).maybeSingle();
    if (!before) throw new ApiError(404, 'SHOP_NOT_FOUND', 'Shop not found.');
    const patch = Object.fromEntries(
      Object.entries(body).map(([key, value]) => [key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`), value]),
    );
    const { data, error } = await supabase.from('shops').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select('*').single();
    assertNoError({ error });
    await writeAudit({
      actorUserId: req.admin!.userId,
      actorType: 'ADMIN',
      action: 'SHOP_UPDATED',
      entityType: 'shop',
      entityId: id,
      shopId: id,
      requestId: req.requestId,
      beforeData: before,
      afterData: data,
    });
    return ok(res, data);
  } catch (error) {
    next(error);
  }
});

shopsRoutes.get('/shops/:id/activity', authorize(PERMISSIONS.shopsRead), validate({ params: idParam }), async (req, res, next) => {
  try {
    const { id } = req.input.params as { id: string };
    const supabase = requireSupabase();
    const { data, error } = await supabase.from('audit_logs').select('*').eq('shop_id', id).order('created_at', { ascending: false }).limit(200);
    assertNoError({ error });
    return ok(res, data ?? []);
  } catch (error) { next(error); }
});

shopsRoutes.get('/shops/:id/subscriptions', authorize(PERMISSIONS.shopsRead), validate({ params: idParam }), async (req, res, next) => {
  try {
    const { id } = req.input.params as { id: string };
    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from('billing_periods')
      .select('*, payment_allocations(id, allocated_amount_minor, payments(id, status, method, paid_at))')
      .eq('subscription_id', (await supabase.from('subscriptions').select('id').eq('shop_id', id).maybeSingle()).data?.id ?? '00000000-0000-0000-0000-000000000000')
      .order('period_start', { ascending: false });
    assertNoError({ error });
    return ok(res, data ?? []);
  } catch (error) { next(error); }
});

shopsRoutes.get('/shops/:id/payments', authorize(PERMISSIONS.paymentsRead), validate({ params: idParam }), async (req, res, next) => {
  try {
    const { id } = req.input.params as { id: string };
    const supabase = requireSupabase();
    const { data, error } = await supabase.from('payments').select('*').eq('shop_id', id).order('paid_at', { ascending: false });
    assertNoError({ error });
    return ok(res, data ?? []);
  } catch (error) { next(error); }
});

shopsRoutes.get('/shops/:id/devices', authorize(PERMISSIONS.devicesRead), validate({ params: idParam }), async (req, res, next) => {
  try {
    const { id } = req.input.params as { id: string };
    const supabase = requireSupabase();
    const { data, error } = await supabase.from('shop_devices').select('*').eq('shop_id', id).order('created_at', { ascending: false });
    assertNoError({ error });
    return ok(res, data ?? []);
  } catch (error) { next(error); }
});

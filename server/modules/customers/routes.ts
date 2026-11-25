import { Router } from 'express';
import { z } from 'zod';
import { requireSupabase, assertNoError } from '../../config/supabase.js';
import { PERMISSIONS } from '../../config/permissions.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { idParam, paginationQuery, reasonBody } from '../../schemas/common.js';
import { ok } from '../../utils/ApiResponse.js';
import { ApiError } from '../../utils/ApiError.js';
import { paginationMeta } from '../../utils/pagination.js';
import { writeAudit } from '../../services/audit.service.js';

export const customerRoutes = Router();
customerRoutes.use(authenticate);

const patchBody = z.object({
  displayName: z.string().trim().min(2).max(200).optional(),
  email: z.string().email().optional().nullable(),
  phone: z.string().trim().min(5).max(40).optional().nullable(),
});

const ticketBody = z.object({
  customerId: z.string().uuid(),
  shopId: z.string().uuid().optional().nullable(),
  category: z.enum(['ACCOUNT', 'POINTS', 'REDEMPTION', 'OTHER']),
  subject: z.string().trim().min(3).max(200),
  description: z.string().trim().min(3).max(2000),
});

customerRoutes.get('/customers', authorize(PERMISSIONS.customersRead), validate({ query: paginationQuery }), async (req, res, next) => {
  try {
    const q = req.input.query as { page: number; pageSize: number; search?: string };
    const supabase = requireSupabase();
    let query = supabase.from('customer_profiles').select('id, display_name, email, phone, status, created_at', { count: 'exact' }).order('created_at', { ascending: false });
    if (q.search) {
      const term = `%${q.search}%`;
      query = query.or(`display_name.ilike.${term},email.ilike.${term},phone.ilike.${term}`);
    }
    query = query.range((q.page - 1) * q.pageSize, q.page * q.pageSize - 1);
    const { data, error, count } = await query;
    assertNoError({ error });
    return ok(res, data ?? [], paginationMeta(q.page, q.pageSize, count ?? 0));
  } catch (error) { next(error); }
});

customerRoutes.get('/customers/:id', authorize(PERMISSIONS.customersRead), validate({ params: idParam }), async (req, res, next) => {
  try {
    const { id } = req.input.params as { id: string };
    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from('customer_profiles')
      .select('id, display_name, email, phone, status, dob_reward_opt_in, created_at, updated_at')
      .eq('id', id)
      .maybeSingle();
    assertNoError({ error });
    if (!data) throw new ApiError(404, 'CUSTOMER_NOT_FOUND', 'Customer not found.');
    const { data: memberships } = await supabase
      .from('customer_shop_memberships')
      .select('id, status, joined_at, shops(shop_code, shop_name)')
      .eq('customer_id', id);
    return ok(res, { customer: data, memberships: memberships ?? [] });
  } catch (error) { next(error); }
});

customerRoutes.get('/customers/:id/memberships', authorize(PERMISSIONS.customersRead), validate({ params: idParam }), async (req, res, next) => {
  try {
    const { id } = req.input.params as { id: string };
    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from('customer_shop_memberships')
      .select('*, shops(shop_code, shop_name)')
      .eq('customer_id', id)
      .order('joined_at', { ascending: false });
    assertNoError({ error });
    return ok(res, data ?? []);
  } catch (error) { next(error); }
});

customerRoutes.get('/customers/:id/rewards', authorize(PERMISSIONS.rewardsRead), validate({ params: idParam }), async (req, res, next) => {
  try {
    const { id } = req.input.params as { id: string };
    const supabase = requireSupabase();
    const { data: memberships, error } = await supabase.from('customer_shop_memberships').select('id').eq('customer_id', id);
    assertNoError({ error });
    const ids = (memberships ?? []).map((row) => row.id);
    const [pointsRes, walletRes, redeemRes, scratchRes] = await Promise.all([
      ids.length ? supabase.from('reward_ledger').select('points_delta, entry_type, created_at').in('membership_id', ids).order('created_at', { ascending: false }).limit(500) : Promise.resolve({ data: [], error: null }),
      ids.length ? supabase.from('wallet_ledger').select('wallet_account_id, amount_minor_delta, entry_type, created_at').in('wallet_account_id', []) : Promise.resolve({ data: [], error: null }),
      ids.length ? supabase.from('redemptions').select('id, status, points_spent, created_at').in('membership_id', ids) : Promise.resolve({ data: [], error: null }),
      ids.length ? supabase.from('scratch_cards').select('id, status, issued_at, revealed_at').in('membership_id', ids) : Promise.resolve({ data: [], error: null }),
    ]);
    for (const result of [pointsRes, walletRes, redeemRes, scratchRes]) assertNoError({ error: result.error });
    const points = (pointsRes.data ?? []).reduce((total, row) => total + Number(row.points_delta ?? 0), 0);
    return ok(res, {
      pointsBalance: points,
      pointsEntries: pointsRes.data ?? [],
      walletEntries: walletRes.data ?? [],
      redemptions: redeemRes.data ?? [],
      scratchCards: scratchRes.data ?? [],
    });
  } catch (error) { next(error); }
});

customerRoutes.get('/customers/:id/activity', authorize(PERMISSIONS.customersRead), validate({ params: idParam }), async (req, res, next) => {
  try {
    const { id } = req.input.params as { id: string };
    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from('audit_logs')
      .select('id, action, reason, created_at')
      .eq('customer_id', id)
      .order('created_at', { ascending: false })
      .limit(200);
    assertNoError({ error });
    return ok(res, data ?? []);
  } catch (error) { next(error); }
});

customerRoutes.patch('/customers/:id', authorize(PERMISSIONS.customersWrite), validate({ params: idParam, body: patchBody }), async (req, res, next) => {
  try {
    const { id } = req.input.params as { id: string };
    const body = req.input.body as z.infer<typeof patchBody>;
    const supabase = requireSupabase();
    const { data: before } = await supabase.from('customer_profiles').select('*').eq('id', id).maybeSingle();
    if (!before) throw new ApiError(404, 'CUSTOMER_NOT_FOUND', 'Customer not found.');
    const { data, error } = await supabase
      .from('customer_profiles')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, display_name, email, phone, status, updated_at')
      .single();
    assertNoError({ error });
    await writeAudit({
      actorUserId: req.admin!.userId,
      actorType: 'ADMIN',
      action: 'CUSTOMER_PROFILE_CORRECTED',
      entityType: 'customer',
      entityId: id,
      customerId: id,
      requestId: req.requestId,
      beforeData: { display_name: before.display_name, email: before.email, phone: before.phone },
      afterData: data,
    });
    return ok(res, data);
  } catch (error) { next(error); }
});

customerRoutes.post('/customers/:id/restrict', authorize(PERMISSIONS.customersWrite), validate({ params: idParam, body: reasonBody }), async (req, res, next) => {
  try {
    const { id } = req.input.params as { id: string };
    const { reason } = req.input.body as { reason: string };
    const supabase = requireSupabase();
    const { error } = await supabase
      .from('customer_profiles')
      .update({ status: 'RESTRICTED', updated_at: new Date().toISOString() })
      .eq('id', id);
    assertNoError({ error });
    await writeAudit({
      actorUserId: req.admin!.userId,
      actorType: 'ADMIN',
      action: 'CUSTOMER_RESTRICTED',
      entityType: 'customer',
      entityId: id,
      customerId: id,
      reason,
      requestId: req.requestId,
    });
    return ok(res, { id, status: 'RESTRICTED' });
  } catch (error) { next(error); }
});

customerRoutes.get('/customers/tickets', authorize(PERMISSIONS.customersRead), validate({ query: paginationQuery }), async (req, res, next) => {
  try {
    const q = req.input.query as { page: number; pageSize: number };
    const supabase = requireSupabase();
    const { data, error, count } = await supabase
      .from('customer_support_tickets')
      .select('*, customer_profiles(display_name), shops(shop_code, shop_name)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((q.page - 1) * q.pageSize, q.page * q.pageSize - 1);
    assertNoError({ error });
    return ok(res, data ?? [], paginationMeta(q.page, q.pageSize, count ?? 0));
  } catch (error) { next(error); }
});

customerRoutes.post('/customers/tickets', authorize(PERMISSIONS.customersWrite), validate({ body: ticketBody }), async (req, res, next) => {
  try {
    const body = req.input.body as z.infer<typeof ticketBody>;
    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from('customer_support_tickets')
      .insert({ ...body, status: 'OPEN', assigned_to: req.admin!.userId })
      .select('*')
      .single();
    assertNoError({ error });
    return ok(res, data, undefined, 201);
  } catch (error) { next(error); }
});

customerRoutes.patch('/customers/tickets/:id', authorize(PERMISSIONS.customersWrite), validate({ params: idParam }), async (req, res, next) => {
  try {
    const { id } = req.input.params as { id: string };
    const status = (req.body as Record<string, unknown>).status;
    if (!['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].includes(String(status))) {
      throw new ApiError(400, 'INVALID_STATUS', 'Invalid ticket status.');
    }
    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from('customer_support_tickets')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    assertNoError({ error });
    return ok(res, data);
  } catch (error) { next(error); }
});

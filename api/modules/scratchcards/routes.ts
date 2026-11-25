import { Router } from 'express';
import { z } from 'zod';
import { requireSupabase, assertNoError } from '../../config/supabase.js';
import { PERMISSIONS } from '../../config/permissions.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { idParam, paginationQuery, reasonBody, uuid } from '../../schemas/common.js';
import { ok } from '../../utils/ApiResponse.js';
import { paginationMeta } from '../../utils/pagination.js';
import { ApiError, forbidden } from '../../utils/ApiError.js';
import { writeAudit } from '../../services/audit.service.js';

export const scratchcardRoutes = Router();
scratchcardRoutes.use(authenticate);

const campaignBody = z.object({
  shopId: uuid.optional().nullable(),
  name: z.string().trim().min(2).max(200),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  perCustomerLimit: z.number().int().positive().optional().nullable(),
  configuration: z.record(z.unknown()).refine((value) => Object.keys(value).length > 0, 'Configuration cannot be empty.'),
});

const prizeBody = z.object({
  campaignId: uuid,
  name: z.string().trim().min(1).max(200),
  prizeType: z.enum(['POINTS', 'WALLET_CREDIT', 'COUPON', 'OTHER']),
  prizeValue: z.record(z.unknown()).refine((value) => Object.keys(value).length > 0, 'A prize value must be supplied.'),
  probabilityWeight: z.number().int().positive(),
  quantityLimit: z.number().int().positive().optional().nullable(),
});

async function requireSuperAdmin(req: { admin?: { roles: string[] } }) {
  if (!req.admin?.roles.includes('SUPER_ADMIN')) throw forbidden('Only a SUPER_ADMIN can approve a prize catalogue.');
}

scratchcardRoutes.get('/scratchcards/campaigns', authorize(PERMISSIONS.scratchcardsRead), validate({ query: paginationQuery }), async (req, res, next) => {
  try {
    const q = req.input.query as { page: number; pageSize: number };
    const supabase = requireSupabase();
    const { data, error, count } = await supabase
      .from('scratch_card_campaigns')
      .select('*, shops(shop_code, shop_name), scratch_card_prizes(id, name, prize_type, probability_weight, quantity_limit)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((q.page - 1) * q.pageSize, q.page * q.pageSize - 1);
    assertNoError({ error });
    return ok(res, data ?? [], paginationMeta(q.page, q.pageSize, count ?? 0));
  } catch (error) { next(error); }
});

scratchcardRoutes.post('/scratchcards/campaigns', authorize(PERMISSIONS.scratchcardsManage), validate({ body: campaignBody }), async (req, res, next) => {
  try {
    const body = req.input.body as z.infer<typeof campaignBody>;
    if (new Date(body.endsAt) <= new Date(body.startsAt)) throw new ApiError(400, 'INVALID_DATES', 'endsAt must be after startsAt.');
    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from('scratch_card_campaigns')
      .insert({ ...body, status: 'DRAFT', created_by: req.admin!.userId })
      .select('*')
      .single();
    assertNoError({ error });
    await writeAudit({ actorUserId: req.admin!.userId, actorType: 'ADMIN', action: 'CAMPAIGN_CREATED', entityType: 'scratch_card_campaign', entityId: data.id, shopId: data.shop_id, requestId: req.requestId });
    return ok(res, data, undefined, 201);
  } catch (error) { next(error); }
});

scratchcardRoutes.patch('/scratchcards/campaigns/:id', authorize(PERMISSIONS.scratchcardsManage), validate({ params: idParam, body: campaignBody.partial() }), async (req, res, next) => {
  try {
    const { id } = req.input.params as { id: string };
    const supabase = requireSupabase();
    const { data: before } = await supabase.from('scratch_card_campaigns').select('*').eq('id', id).maybeSingle();
    if (!before) throw new ApiError(404, 'CAMPAIGN_NOT_FOUND', 'Campaign not found.');
    if (['ACTIVE', 'PAUSED'].includes(before.status)) throw new ApiError(409, 'CAMPAIGN_LOCKED', 'End the campaign before editing approved configuration.');
    const patch = req.input.body as Record<string, unknown>;
    const { data, error } = await supabase.from('scratch_card_campaigns').update(patch).eq('id', id).select('*').single();
    assertNoError({ error });
    await writeAudit({ actorUserId: req.admin!.userId, actorType: 'ADMIN', action: 'CAMPAIGN_UPDATED', entityType: 'scratch_card_campaign', entityId: id, shopId: data.shop_id, requestId: req.requestId, beforeData: before, afterData: data });
    return ok(res, data);
  } catch (error) { next(error); }
});

async function setCampaignStatus(id: string, status: 'ACTIVE' | 'PAUSED' | 'ENDED', req: { admin?: { userId: string; roles: string[] }; requestId: string }) {
  const supabase = requireSupabase();
  const { data: campaign, error: findError } = await supabase.from('scratch_card_campaigns').select('*, scratch_card_prizes(*)').eq('id', id).maybeSingle();
  assertNoError({ error: findError });
  if (!campaign) throw new ApiError(404, 'CAMPAIGN_NOT_FOUND', 'Campaign not found.');
  if (status === 'ACTIVE') {
    await requireSuperAdmin(req);
    if (!campaign.approved_by) throw new ApiError(409, 'CAMPAIGN_NOT_APPROVED', 'Approve the prize catalogue before activation.');
    const prizes = (campaign.scratch_card_prizes ?? []) as Array<{ probability_weight: number }>;
    if (!prizes.length || prizes.some((prize) => Number(prize.probability_weight) <= 0)) {
      throw new ApiError(409, 'PRIZE_CATALOGUE_INVALID', 'At least one prize with a positive probability weight is required.');
    }
  }
  const { data, error } = await supabase.from('scratch_card_campaigns').update({ status }).eq('id', id).select('*').single();
  assertNoError({ error });
  await writeAudit({ actorUserId: req.admin?.userId ?? null, actorType: 'ADMIN', action: `CAMPAIGN_${status}`, entityType: 'scratch_card_campaign', entityId: id, shopId: data.shop_id, requestId: req.requestId });
  return data;
}

scratchcardRoutes.post('/scratchcards/campaigns/:id/activate', authorize(PERMISSIONS.scratchcardsManage), validate({ params: idParam }), async (req, res, next) => {
  try { return ok(res, await setCampaignStatus((req.input.params as { id: string }).id, 'ACTIVE', req)); } catch (error) { next(error); }
});
scratchcardRoutes.post('/scratchcards/campaigns/:id/pause', authorize(PERMISSIONS.scratchcardsManage), validate({ params: idParam }), async (req, res, next) => {
  try { return ok(res, await setCampaignStatus((req.input.params as { id: string }).id, 'PAUSED', req)); } catch (error) { next(error); }
});
scratchcardRoutes.post('/scratchcards/campaigns/:id/end', authorize(PERMISSIONS.scratchcardsManage), validate({ params: idParam }), async (req, res, next) => {
  try { return ok(res, await setCampaignStatus((req.input.params as { id: string }).id, 'ENDED', req)); } catch (error) { next(error); }
});

scratchcardRoutes.post('/scratchcards/campaigns/:id/approve', authorize(PERMISSIONS.scratchcardsManage), validate({ params: idParam, body: reasonBody }), async (req, res, next) => {
  try {
    await requireSuperAdmin(req);
    const { id } = req.input.params as { id: string };
    const { reason } = req.input.body as { reason: string };
    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from('scratch_card_campaigns')
      .update({ approved_by: req.admin!.userId, approved_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    assertNoError({ error });
    await writeAudit({ actorUserId: req.admin!.userId, actorType: 'ADMIN', action: 'CAMPAIGN_APPROVED', entityType: 'scratch_card_campaign', entityId: id, reason, requestId: req.requestId });
    return ok(res, data);
  } catch (error) { next(error); }
});

scratchcardRoutes.get('/scratchcards/campaigns/:id/prizes', authorize(PERMISSIONS.scratchcardsRead), validate({ params: idParam }), async (req, res, next) => {
  try {
    const { id } = req.input.params as { id: string };
    const supabase = requireSupabase();
    const { data, error } = await supabase.from('scratch_card_prizes').select('*').eq('campaign_id', id).order('created_at', { ascending: true });
    assertNoError({ error });
    return ok(res, data ?? []);
  } catch (error) { next(error); }
});

scratchcardRoutes.post('/scratchcards/prizes', authorize(PERMISSIONS.scratchcardsManage), validate({ body: prizeBody }), async (req, res, next) => {
  try {
    const body = req.input.body as z.infer<typeof prizeBody>;
    const supabase = requireSupabase();
    const { data: campaign } = await supabase.from('scratch_card_campaigns').select('status').eq('id', body.campaignId).maybeSingle();
    if (!campaign || campaign.status !== 'DRAFT') throw new ApiError(409, 'CAMPAIGN_LOCKED', 'Prizes can only be changed on a draft campaign.');
    const { data, error } = await supabase.from('scratch_card_prizes').insert(body).select('*').single();
    assertNoError({ error });
    await writeAudit({ actorUserId: req.admin!.userId, actorType: 'ADMIN', action: 'PRIZE_ADDED', entityType: 'scratch_card_prize', entityId: data.id, requestId: req.requestId, afterData: { prize_type: data.prize_type, probability_weight: data.probability_weight } });
    return ok(res, data, undefined, 201);
  } catch (error) { next(error); }
});

scratchcardRoutes.get('/scratchcards/cards', authorize(PERMISSIONS.scratchcardsRead), validate({ query: paginationQuery }), async (req, res, next) => {
  try {
    const q = req.input.query as { page: number; pageSize: number; status?: string };
    const supabase = requireSupabase();
    let query = supabase.from('scratch_cards').select('*, scratch_card_campaigns(name), customer_shop_memberships(customer_id, shop_id)', { count: 'exact' }).order('issued_at', { ascending: false });
    if (q.status) query = query.eq('status', q.status);
    query = query.range((q.page - 1) * q.pageSize, q.page * q.pageSize - 1);
    const { data, error, count } = await query;
    assertNoError({ error });
    return ok(res, data ?? [], paginationMeta(q.page, q.pageSize, count ?? 0));
  } catch (error) { next(error); }
});

scratchcardRoutes.get('/scratchcards/statistics', authorize(PERMISSIONS.scratchcardsRead), async (_req, res, next) => {
  try {
    const supabase = requireSupabase();
    const { data, error } = await supabase.from('scratch_cards').select('status, campaign_id, issued_at');
    assertNoError({ error });
    const rows = data ?? [];
    return ok(res, {
      issued: rows.length,
      revealed: rows.filter((row) => ['REVEALED', 'REDEEMED'].includes(row.status)).length,
      expired: rows.filter((row) => row.status === 'EXPIRED').length,
      byCampaign: rows.reduce<Record<string, number>>((acc, row) => {
        acc[row.campaign_id] = (acc[row.campaign_id] ?? 0) + 1;
        return acc;
      }, {}),
    });
  } catch (error) { next(error); }
});

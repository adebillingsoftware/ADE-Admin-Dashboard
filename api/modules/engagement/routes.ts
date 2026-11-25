import { Router } from 'express';
import { z } from 'zod';
import { requireSupabase, assertNoError } from '../../config/supabase.js';
import { PERMISSIONS } from '../../config/permissions.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { idParam, paginationQuery, reasonBody, uuid } from '../../schemas/common.js';
import { ok } from '../../utils/ApiResponse.js';
import { ApiError, forbidden } from '../../utils/ApiError.js';
import { writeAudit } from '../../services/audit.service.js';

export const engagementRoutes = Router();
engagementRoutes.use(authenticate);

const programmeBody = z.object({
  shopId: uuid.optional().nullable(),
  name: z.string().trim().min(2).max(200),
  termsText: z.string().max(4000).optional().nullable(),
  startsAt: z.string().datetime({ offset: true }).optional().nullable(),
  endsAt: z.string().datetime({ offset: true }).optional().nullable(),
});

const ruleType = z.enum(['POINTS_EARN', 'POINTS_EXPIRY', 'WALLET_CREDIT', 'WALLET_DEBIT', 'REDEMPTION', 'DOB_REWARD', 'SCRATCHCARD_LIMITS']);

const ruleBody = z.object({
  programmeId: uuid,
  ruleType,
  configuration: z.record(z.unknown()).refine((value) => Object.keys(value).length > 0, 'Configuration cannot be empty.'),
  effectiveFrom: z.string().datetime({ offset: true }),
  effectiveUntil: z.string().datetime({ offset: true }).optional().nullable(),
});

async function requireSuperAdmin(req: { admin?: { roles: string[] } }) {
  if (!req.admin?.roles.includes('SUPER_ADMIN')) {
    throw forbidden('Only a SUPER_ADMIN can approve commercial business rules.');
  }
}

engagementRoutes.get('/engagement/programmes', authorize(PERMISSIONS.engagementRead), validate({ query: paginationQuery }), async (req, res, next) => {
  try {
    const q = req.input.query as { page: number; pageSize: number; shopId?: string };
    const supabase = requireSupabase();
    let query = supabase.from('reward_programmes').select('*, shops(shop_code, shop_name)', { count: 'exact' }).order('created_at', { ascending: false });
    if (q.shopId) query = query.eq('shop_id', q.shopId);
    query = query.range((q.page - 1) * q.pageSize, q.page * q.pageSize - 1);
    const { data, error, count } = await query;
    assertNoError({ error });
    return ok(res, data ?? [], {
      page: q.page, pageSize: q.pageSize, total: count ?? 0, totalPages: Math.max(1, Math.ceil((count ?? 0) / q.pageSize)),
    });
  } catch (error) { next(error); }
});

engagementRoutes.post('/engagement/programmes', authorize(PERMISSIONS.engagementManage), validate({ body: programmeBody }), async (req, res, next) => {
  try {
    const body = req.input.body as z.infer<typeof programmeBody>;
    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from('reward_programmes')
      .insert({ ...body, status: 'DRAFT', created_by: req.admin!.userId })
      .select('*')
      .single();
    assertNoError({ error });
    await writeAudit({ actorUserId: req.admin!.userId, actorType: 'ADMIN', action: 'PROGRAMME_CREATED', entityType: 'reward_programme', entityId: data.id, shopId: data.shop_id, requestId: req.requestId, afterData: data });
    return ok(res, data, undefined, 201);
  } catch (error) { next(error); }
});

engagementRoutes.patch('/engagement/programmes/:id', authorize(PERMISSIONS.engagementManage), validate({ params: idParam, body: programmeBody.partial() }), async (req, res, next) => {
  try {
    const { id } = req.input.params as { id: string };
    const supabase = requireSupabase();
    const { data: before } = await supabase.from('reward_programmes').select('*').eq('id', id).maybeSingle();
    if (!before) throw new ApiError(404, 'PROGRAMME_NOT_FOUND', 'Programme not found.');
    if (before.status === 'ACTIVE') throw new ApiError(409, 'ACTIVE_PROGRAMME_IMMUTABLE', 'Deactivate the programme before editing its configuration.');
    const patch = req.input.body as Record<string, unknown>;
    const { data, error } = await supabase.from('reward_programmes').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select('*').single();
    assertNoError({ error });
    await writeAudit({ actorUserId: req.admin!.userId, actorType: 'ADMIN', action: 'PROGRAMME_UPDATED', entityType: 'reward_programme', entityId: id, shopId: data.shop_id, requestId: req.requestId, beforeData: before, afterData: data });
    return ok(res, data);
  } catch (error) { next(error); }
});

async function setProgrammeStatus(id: string, status: 'ACTIVE' | 'PAUSED', req: { admin?: { userId: string }; requestId: string }) {
  const supabase = requireSupabase();
  const { data: programme, error: findError } = await supabase.from('reward_programmes').select('*').eq('id', id).maybeSingle();
  assertNoError({ error: findError });
  if (!programme) throw new ApiError(404, 'PROGRAMME_NOT_FOUND', 'Programme not found.');
  if (status === 'ACTIVE') {
    const { data: rules, error } = await supabase
      .from('reward_rule_versions')
      .select('id, rule_type, is_approved')
      .eq('programme_id', id)
      .eq('is_approved', true);
    assertNoError({ error });
    const required = ['POINTS_EARN', 'REDEMPTION'];
    const missing = required.filter((type) => !(rules ?? []).some((rule) => rule.rule_type === type));
    if (missing.length) {
      throw new ApiError(409, 'RULES_NOT_APPROVED', `Approved rules required before activation: ${missing.join(', ')}.`);
    }
  }
  const { data, error } = await supabase.from('reward_programmes').update({ status, updated_at: new Date().toISOString() }).eq('id', id).select('*').single();
  assertNoError({ error });
  await writeAudit({ actorUserId: req.admin?.userId ?? null, actorType: 'ADMIN', action: status === 'ACTIVE' ? 'PROGRAMME_ACTIVATED' : 'PROGRAMME_PAUSED', entityType: 'reward_programme', entityId: id, shopId: data.shop_id, requestId: req.requestId });
  return data;
}

engagementRoutes.post('/engagement/programmes/:id/activate', authorize(PERMISSIONS.engagementManage), validate({ params: idParam }), async (req, res, next) => {
  try {
    return ok(res, await setProgrammeStatus((req.input.params as { id: string }).id, 'ACTIVE', req));
  } catch (error) { next(error); }
});

engagementRoutes.post('/engagement/programmes/:id/deactivate', authorize(PERMISSIONS.engagementManage), validate({ params: idParam }), async (req, res, next) => {
  try {
    return ok(res, await setProgrammeStatus((req.input.params as { id: string }).id, 'PAUSED', req));
  } catch (error) { next(error); }
});

engagementRoutes.get('/engagement/rules', authorize(PERMISSIONS.engagementRead), async (req, res, next) => {
  try {
    const query = req.query as Record<string, unknown>;
    const supabase = requireSupabase();
    let dbQuery = supabase.from('reward_rule_versions').select('*, reward_programmes(name, shop_id, status)').order('version_number', { ascending: false });
    if (typeof query.programmeId === 'string') dbQuery = dbQuery.eq('programme_id', query.programmeId);
    if (typeof query.ruleType === 'string') dbQuery = dbQuery.eq('rule_type', query.ruleType);
    const { data, error } = await dbQuery.limit(500);
    assertNoError({ error });
    return ok(res, data ?? []);
  } catch (error) { next(error); }
});

engagementRoutes.post('/engagement/rules', authorize(PERMISSIONS.engagementManage), validate({ body: ruleBody }), async (req, res, next) => {
  try {
    const body = req.input.body as z.infer<typeof ruleBody>;
    const supabase = requireSupabase();
    const { data: versionRows, error: versionError } = await supabase
      .from('reward_rule_versions')
      .select('version_number')
      .eq('programme_id', body.programmeId)
      .eq('rule_type', body.ruleType)
      .order('version_number', { ascending: false })
      .limit(1);
    assertNoError({ error: versionError });
    const { data, error } = await supabase
      .from('reward_rule_versions')
      .insert({
        programme_id: body.programmeId,
        rule_type: body.ruleType,
        configuration: body.configuration,
        effective_from: body.effectiveFrom,
        effective_until: body.effectiveUntil ?? null,
        version_number: (versionRows?.[0]?.version_number ?? 0) + 1,
        created_by: req.admin!.userId,
        is_approved: false,
      })
      .select('*')
      .single();
    assertNoError({ error });
    await writeAudit({ actorUserId: req.admin!.userId, actorType: 'ADMIN', action: 'RULE_VERSION_CREATED', entityType: 'reward_rule_version', entityId: data.id, requestId: req.requestId, afterData: { rule_type: data.rule_type, version_number: data.version_number } });
    return ok(res, data, undefined, 201);
  } catch (error) { next(error); }
});

engagementRoutes.post('/engagement/rules/:id/approve', authorize(PERMISSIONS.engagementManage), validate({ params: idParam, body: reasonBody }), async (req, res, next) => {
  try {
    await requireSuperAdmin(req);
    const { id } = req.input.params as { id: string };
    const { reason } = req.input.body as { reason: string };
    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from('reward_rule_versions')
      .update({ is_approved: true, approved_by: req.admin!.userId, approved_at: new Date().toISOString() })
      .eq('id', id)
      .eq('is_approved', false)
      .select('*')
      .single();
    assertNoError({ error });
    await writeAudit({ actorUserId: req.admin!.userId, actorType: 'ADMIN', action: 'RULE_VERSION_APPROVED', entityType: 'reward_rule_version', entityId: id, reason, requestId: req.requestId, afterData: { is_approved: true } });
    return ok(res, data);
  } catch (error) { next(error); }
});

engagementRoutes.patch('/engagement/rules/:id', authorize(PERMISSIONS.engagementManage), validate({ params: idParam }), async (req, res, next) => {
  try {
    const { id } = req.input.params as { id: string };
    const body = req.body as Record<string, unknown>;
    const supabase = requireSupabase();
    const { data: rule } = await supabase.from('reward_rule_versions').select('is_approved, rule_type').eq('id', id).maybeSingle();
    if (!rule) throw new ApiError(404, 'RULE_NOT_FOUND', 'Rule version not found.');
    if (rule.is_approved) throw new ApiError(409, 'RULE_IMMUTABLE', 'Approved rule versions are immutable. Create a new version.');
    const { data, error } = await supabase
      .from('reward_rule_versions')
      .update({ configuration: body.configuration ?? undefined, effective_from: body.effectiveFrom ?? undefined, effective_until: body.effectiveUntil ?? null })
      .eq('id', id)
      .select('*')
      .single();
    assertNoError({ error });
    return ok(res, data);
  } catch (error) { next(error); }
});

engagementRoutes.get('/engagement/participation', authorize(PERMISSIONS.engagementRead), async (_req, res, next) => {
  try {
    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from('shops')
      .select('id, shop_code, shop_name, rewards_enabled')
      .order('shop_name', { ascending: true })
      .limit(500);
    assertNoError({ error });
    return ok(res, data ?? []);
  } catch (error) { next(error); }
});

engagementRoutes.post('/engagement/participation/:shopId', authorize(PERMISSIONS.engagementManage), validate({ params: z.object({ shopId: uuid }) }), async (req, res, next) => {
  try {
    const { shopId } = req.input.params as { shopId: string };
    const rewardsEnabled = Boolean((req.body as Record<string, unknown>).rewardsEnabled);
    const supabase = requireSupabase();
    const { data, error } = await supabase.from('shops').update({ rewards_enabled: rewardsEnabled, updated_at: new Date().toISOString() }).eq('id', shopId).select('id, shop_code, rewards_enabled').single();
    assertNoError({ error });
    await writeAudit({ actorUserId: req.admin!.userId, actorType: 'ADMIN', action: rewardsEnabled ? 'REWARDS_ENABLED' : 'REWARDS_DISABLED', entityType: 'shop', entityId: shopId, shopId, requestId: req.requestId });
    return ok(res, data);
  } catch (error) { next(error); }
});

import { Router } from 'express';
import { z } from 'zod';
import { requireSupabase, assertNoError } from '../../config/supabase.js';
import { PERMISSIONS } from '../../config/permissions.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { idParam, reasonBody } from '../../schemas/common.js';
import { ok } from '../../utils/ApiResponse.js';
import { ApiError, forbidden } from '../../utils/ApiError.js';
import { writeAudit } from '../../services/audit.service.js';

export const settingsRoutes = Router();
settingsRoutes.use(authenticate);

const SETTING_KEYS = [
  'business.name', 'business.email', 'business.phone', 'business.address', 'business.terms_url',
  'billing.currency', 'billing.grace_days', 'billing.offline_lease_hours', 'billing.device_limit',
  'licence.offline_hours', 'licence.policy_version', 'licence.key_version',
  'engagement.defaults', 'security.retention_days', 'security.require_mfa_super_admin',
] as const;

const settingBody = z.object({
  key: z.enum(SETTING_KEYS),
  value: z.unknown(),
  reason: z.string().trim().min(3).max(1000),
});

const planBody = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().max(500).optional().nullable(),
  monthlyPriceMinor: z.number().int().nonnegative(),
  currencyCode: z.string().length(3).default('INR'),
  billingInterval: z.literal('MONTHLY').default('MONTHLY'),
  isActive: z.boolean().default(false),
});

function requireSuperAdmin(req: { admin?: { roles: string[] } }) {
  if (!req.admin?.roles.includes('SUPER_ADMIN')) throw forbidden('Only a SUPER_ADMIN can change settings.');
}

settingsRoutes.get('/settings', authorize(PERMISSIONS.settingsRead), async (_req, res, next) => {
  try {
    const supabase = requireSupabase();
    const { data, error } = await supabase.from('app_settings').select('key, value, updated_at').order('key');
    assertNoError({ error });
    const settings = Object.fromEntries((data ?? []).map((row) => [row.key, (row.value as { value?: unknown })?.value ?? row.value]));
    const { data: plans, error: planError } = await supabase.from('subscription_plans').select('*').order('created_at', { ascending: false });
    assertNoError({ error: planError });
    return ok(res, { settings, plans: plans ?? [] });
  } catch (error) { next(error); }
});

settingsRoutes.patch('/settings', authorize(PERMISSIONS.settingsWrite), validate({ body: settingBody }), async (req, res, next) => {
  try {
    requireSuperAdmin(req);
    const { key, value, reason } = req.input.body as z.infer<typeof settingBody>;
    if (key === 'licence.offline_hours') {
      const hours = Number(value);
      if (!Number.isInteger(hours) || hours < 1 || hours > 72) {
        throw new ApiError(400, 'INVALID_LEASE', 'Offline lease must be between 1 and 72 hours.');
      }
    }
    if (key === 'billing.grace_days') {
      const days = Number(value);
      if (!Number.isInteger(days) || days < 0 || days > 365) throw new ApiError(400, 'INVALID_GRACE', 'Grace days must be between 0 and 365.');
    }
    const supabase = requireSupabase();
    const { data: before } = await supabase.from('app_settings').select('value').eq('key', key).maybeSingle();
    const { data, error } = await supabase
      .from('app_settings')
      .upsert({ key, value: { value }, updated_by: req.admin!.userId, updated_at: new Date().toISOString() })
      .select('key, value, updated_at')
      .single();
    assertNoError({ error });
    await writeAudit({ actorUserId: req.admin!.userId, actorType: 'ADMIN', action: 'SETTING_UPDATED', entityType: 'setting', entityId: key, reason, requestId: req.requestId, beforeData: before?.value, afterData: data?.value });
    return ok(res, data);
  } catch (error) { next(error); }
});

settingsRoutes.get('/settings/plans', authorize(PERMISSIONS.settingsRead), async (_req, res, next) => {
  try {
    const supabase = requireSupabase();
    const { data, error } = await supabase.from('subscription_plans').select('*').order('created_at', { ascending: false });
    assertNoError({ error });
    return ok(res, data ?? []);
  } catch (error) { next(error); }
});

settingsRoutes.post('/settings/plans', authorize(PERMISSIONS.settingsWrite), validate({ body: planBody }), async (req, res, next) => {
  try {
    requireSuperAdmin(req);
    const body = req.input.body as z.infer<typeof planBody>;
    if (body.monthlyPriceMinor <= 0) throw new ApiError(400, 'PRICE_NOT_CONFIGURED', 'A positive price in minor units is required.');
    const supabase = requireSupabase();
    const { data, error } = await supabase.from('subscription_plans').insert(body).select('*').single();
    assertNoError({ error });
    await writeAudit({ actorUserId: req.admin!.userId, actorType: 'ADMIN', action: 'PLAN_CREATED', entityType: 'subscription_plan', entityId: data.id, requestId: req.requestId, afterData: data });
    return ok(res, data, undefined, 201);
  } catch (error) { next(error); }
});

settingsRoutes.patch('/settings/plans/:id', authorize(PERMISSIONS.settingsWrite), validate({ params: idParam, body: planBody.partial() }), async (req, res, next) => {
  try {
    requireSuperAdmin(req);
    const { id } = req.input.params as { id: string };
    const body = req.input.body as z.infer<typeof planBody>;
    if (body.monthlyPriceMinor !== undefined && body.monthlyPriceMinor <= 0) throw new ApiError(400, 'INVALID_PRICE', 'Price must be positive.');
    const supabase = requireSupabase();
    const { data: before } = await supabase.from('subscription_plans').select('*').eq('id', id).maybeSingle();
    if (!before) throw new ApiError(404, 'PLAN_NOT_FOUND', 'Plan not found.');
    const { data, error } = await supabase.from('subscription_plans').update(body).eq('id', id).select('*').single();
    assertNoError({ error });
    await writeAudit({ actorUserId: req.admin!.userId, actorType: 'ADMIN', action: 'PLAN_UPDATED', entityType: 'subscription_plan', entityId: id, requestId: req.requestId, beforeData: before, afterData: data });
    return ok(res, data);
  } catch (error) { next(error); }
});

settingsRoutes.get('/settings/licence-policy', authorize(PERMISSIONS.settingsRead), async (_req, res, next) => {
  try {
    const supabase = requireSupabase();
    const { data, error } = await supabase.from('app_settings').select('key, value, updated_at').in('key', ['licence.offline_hours', 'licence.policy_version', 'licence.key_version']);
    assertNoError({ error });
    return ok(res, data ?? []);
  } catch (error) { next(error); }
});

void reasonBody;

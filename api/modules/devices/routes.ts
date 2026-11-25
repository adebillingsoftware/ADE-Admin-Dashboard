import { Router } from 'express';
import { requireSupabase, assertNoError } from '../../config/supabase.js';
import { PERMISSIONS } from '../../config/permissions.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { idParam, paginationQuery, reasonBody } from '../../schemas/common.js';
import { ok } from '../../utils/ApiResponse.js';
import { paginationMeta } from '../../utils/pagination.js';
import { revokeDevice, requestDeviceReset } from '../../services/device.service.js';

export const deviceRoutes = Router();
deviceRoutes.use(authenticate);

deviceRoutes.get('/devices', authorize(PERMISSIONS.devicesRead), validate({ query: paginationQuery }), async (req, res, next) => {
  try {
    const q = req.input.query as { page: number; pageSize: number; status?: string };
    const supabase = requireSupabase();
    let query = supabase
      .from('shop_devices')
      .select('*, shops(shop_code, shop_name)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((q.page - 1) * q.pageSize, q.page * q.pageSize - 1);
    const status = (req.query as Record<string, unknown>).status;
    if (typeof status === 'string' && ['ACTIVE', 'REVOKED', 'PENDING'].includes(status)) query = query.eq('status', status);
    const { data, error, count } = await query;
    assertNoError({ error });
    return ok(res, data ?? [], paginationMeta(q.page, q.pageSize, count ?? 0));
  } catch (error) { next(error); }
});

deviceRoutes.get('/devices/reset-requests', authorize(PERMISSIONS.devicesRead), validate({ query: paginationQuery }), async (req, res, next) => {
  try {
    const q = req.input.query as { page: number; pageSize: number };
    const supabase = requireSupabase();
    const { data, error, count } = await supabase
      .from('device_reset_requests')
      .select('*, shops(shop_code, shop_name), shop_devices(device_name, key_fingerprint)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((q.page - 1) * q.pageSize, q.page * q.pageSize - 1);
    assertNoError({ error });
    return ok(res, data ?? [], paginationMeta(q.page, q.pageSize, count ?? 0));
  } catch (error) { next(error); }
});

deviceRoutes.get('/devices/:id', authorize(PERMISSIONS.devicesRead), validate({ params: idParam }), async (req, res, next) => {
  try {
    const { id } = req.input.params as { id: string };
    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from('shop_devices')
      .select('*, shops(shop_code, shop_name), licence_leases(id, issued_at, expires_at, revoked_at)')
      .eq('id', id)
      .maybeSingle();
    assertNoError({ error });
    return ok(res, data ?? null);
  } catch (error) { next(error); }
});

deviceRoutes.post('/devices/:id/revoke', authorize(PERMISSIONS.devicesManage), validate({ params: idParam, body: reasonBody }), async (req, res, next) => {
  try {
    const { id } = req.input.params as { id: string };
    const { reason } = req.input.body as { reason: string };
    return ok(res, await revokeDevice(id, reason, req.admin!.userId, req.requestId));
  } catch (error) { next(error); }
});

deviceRoutes.post('/devices/:id/reset', authorize(PERMISSIONS.devicesManage), validate({ params: idParam, body: reasonBody }), async (req, res, next) => {
  try {
    const { id } = req.input.params as { id: string };
    const { reason } = req.input.body as { reason: string };
    return ok(res, await requestDeviceReset(id, req.admin!.userId, reason, req.requestId));
  } catch (error) { next(error); }
});

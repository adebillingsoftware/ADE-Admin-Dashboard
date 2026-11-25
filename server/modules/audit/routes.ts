import { Router } from 'express';
import { requireSupabase, assertNoError } from '../../config/supabase.js';
import { PERMISSIONS } from '../../config/permissions.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { idParam, paginationQuery } from '../../schemas/common.js';
import { ok } from '../../utils/ApiResponse.js';
import { paginationMeta } from '../../utils/pagination.js';

export const auditRoutes = Router();
auditRoutes.use(authenticate, authorize(PERMISSIONS.auditRead));

auditRoutes.get('/audit', validate({ query: paginationQuery }), async (req, res, next) => {
  try {
    const q = req.input.query as { page: number; pageSize: number; search?: string; from?: string; to?: string };
    const supabase = requireSupabase();
    let query = supabase.from('audit_logs').select('*', { count: 'exact' }).order('created_at', { ascending: false });
    if (q.search) query = query.or(`action.ilike.%${q.search}%,entity_type.ilike.%${q.search}%`);
    if (q.from) query = query.gte('created_at', q.from);
    if (q.to) query = query.lte('created_at', q.to);
    query = query.range((q.page - 1) * q.pageSize, q.page * q.pageSize - 1);
    const { data, error, count } = await query;
    assertNoError({ error });
    return ok(res, data ?? [], paginationMeta(q.page, q.pageSize, count ?? 0));
  } catch (error) { next(error); }
});

auditRoutes.get('/audit/:id', validate({ params: idParam }), async (req, res, next) => {
  try {
    const { id } = req.input.params as { id: string };
    const supabase = requireSupabase();
    const { data, error } = await supabase.from('audit_logs').select('*').eq('id', id).maybeSingle();
    assertNoError({ error });
    return ok(res, data ?? null);
  } catch (error) { next(error); }
});

import { Router } from 'express';
import { z } from 'zod';
import { requireSupabase, assertNoError } from '../../config/supabase.js';
import { PERMISSIONS } from '../../config/permissions.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { idParam, paginationQuery, reasonBody } from '../../schemas/common.js';
import { ok } from '../../utils/ApiResponse.js';
import { ApiError, forbidden } from '../../utils/ApiError.js';
import { paginationMeta } from '../../utils/pagination.js';
import { writeAudit } from '../../services/audit.service.js';
import { PERMISSIONS as ALL_PERMISSIONS } from '../../config/permissions.js';

export const adminRoutes = Router();
adminRoutes.use(authenticate);

function requireAdminManagement(req: { admin?: { roles: string[]; permissions: Set<string> } }) {
  if (!req.admin?.permissions.has(PERMISSIONS.adminsManage) || !req.admin.roles.includes('SUPER_ADMIN')) {
    throw forbidden('Only a SUPER_ADMIN with admins.manage can manage administrators.');
  }
}

const inviteBody = z.object({
  email: z.string().email(),
  displayName: z.string().trim().min(2).max(200),
  roles: z.array(z.enum(['SUPER_ADMIN', 'BILLING_ADMIN', 'SUPPORT', 'ENGAGEMENT_ADMIN', 'READ_ONLY'])).min(1),
  temporaryPassword: z.string().min(12).max(200).optional(),
});

async function countActiveSuperAdmins(supabase: NonNullable<ReturnType<typeof requireSupabase>>) {
  const { data: role } = await supabase.from('admin_roles').select('id').eq('name', 'SUPER_ADMIN').maybeSingle();
  if (!role) return 0;
  const { data, error } = await supabase
    .from('admin_user_roles')
    .select('user_id, admin_profiles(status)')
    .eq('role_id', role.id);
  assertNoError({ error });
  return (data ?? []).filter((row) => (row.admin_profiles as { status?: string } | null)?.status === 'ACTIVE').length;
}

adminRoutes.get('/admins', authorize(PERMISSIONS.adminsManage), validate({ query: paginationQuery }), async (req, res, next) => {
  try {
    requireAdminManagement(req);
    const q = req.input.query as { page: number; pageSize: number };
    const supabase = requireSupabase();
    const { data, error, count } = await supabase
      .from('admin_profiles')
      .select('*, admin_user_roles(role_id, admin_roles(name))', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((q.page - 1) * q.pageSize, q.page * q.pageSize - 1);
    assertNoError({ error });
    return ok(res, data ?? [], paginationMeta(q.page, q.pageSize, count ?? 0));
  } catch (error) { next(error); }
});

adminRoutes.post('/admins', authorize(PERMISSIONS.adminsManage), validate({ body: inviteBody }), async (req, res, next) => {
  try {
    requireAdminManagement(req);
    const body = req.input.body as z.infer<typeof inviteBody>;
    const supabase = requireSupabase();
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email: body.email,
      password: body.temporaryPassword ?? randomPassword(),
      email_confirm: true,
      user_metadata: { display_name: body.displayName },
    });
    assertNoError({ error: createError });
    if (!created.user) throw new ApiError(500, 'ADMIN_CREATE_FAILED', 'Supabase did not return the created user.');
    const userId = created.user.id;
    const { error: profileError } = await supabase
      .from('admin_profiles')
      .upsert({ user_id: userId, display_name: body.displayName, status: 'ACTIVE', updated_at: new Date().toISOString() });
    assertNoError({ error: profileError });
    const { data: roles } = await supabase.from('admin_roles').select('id, name').in('name', body.roles);
    const { error: rolesError } = await supabase.from('admin_user_roles').insert(
      (roles ?? []).map((role) => ({ user_id: userId, role_id: role.id, assigned_by: req.admin!.userId })),
    );
    assertNoError({ error: rolesError });
    await writeAudit({ actorUserId: req.admin!.userId, actorType: 'ADMIN', action: 'ADMIN_CREATED', entityType: 'admin_profile', entityId: userId, requestId: req.requestId, afterData: { email: body.email, roles: body.roles } });
    return ok(res, { userId, email: body.email, roles: body.roles, temporaryPasswordGenerated: !body.temporaryPassword }, undefined, 201);
  } catch (error) { next(error); }
});

function randomPassword() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return `Ade!${Buffer.from(bytes).toString('base64url')}Aa1!`;
}

adminRoutes.patch('/admins/:id', authorize(PERMISSIONS.adminsManage), validate({ params: idParam }), async (req, res, next) => {
  try {
    requireAdminManagement(req);
    const { id } = req.input.params as { id: string };
    const body = req.body as Record<string, unknown>;
    const supabase = requireSupabase();
    const { data: before } = await supabase.from('admin_profiles').select('*').eq('user_id', id).maybeSingle();
    if (!before) throw new ApiError(404, 'ADMIN_NOT_FOUND', 'Administrator not found.');
    if (before.status === 'ACTIVE' && body.status === 'DISABLED') {
      const { data: roleRows } = await supabase.from('admin_user_roles').select('role_id, admin_roles(name)').eq('user_id', id);
      const isSuper = (roleRows ?? []).some((row) => (row.admin_roles as { name?: string } | null)?.name === 'SUPER_ADMIN');
      if (isSuper && (await countActiveSuperAdmins(supabase)) <= 1) {
        throw new ApiError(409, 'LAST_SUPER_ADMIN', 'The last active SUPER_ADMIN cannot be disabled.');
      }
    }
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.displayName === 'string') patch.display_name = body.displayName;
    if (body.status === 'ACTIVE' || body.status === 'DISABLED') patch.status = body.status;
    const { data, error } = await supabase.from('admin_profiles').update(patch).eq('user_id', id).select('*').single();
    assertNoError({ error });
    await writeAudit({ actorUserId: req.admin!.userId, actorType: 'ADMIN', action: body.status === 'DISABLED' ? 'ADMIN_DISABLED' : 'ADMIN_UPDATED', entityType: 'admin_profile', entityId: id, requestId: req.requestId, beforeData: before, afterData: data });
    return ok(res, data);
  } catch (error) { next(error); }
});

adminRoutes.get('/roles', authorize(PERMISSIONS.adminsManage), async (_req, res, next) => {
  try {
    const supabase = requireSupabase();
    const { data, error } = await supabase.from('admin_roles').select('*').order('name');
    assertNoError({ error });
    return ok(res, { roles: data ?? [], permissions: Object.values(ALL_PERMISSIONS) });
  } catch (error) { next(error); }
});

adminRoutes.patch('/admins/:id/roles', authorize(PERMISSIONS.adminsManage), validate({ params: idParam, body: reasonBody.extend({ roles: z.array(z.string()).min(1) }) }), async (req, res, next) => {
  try {
    requireAdminManagement(req);
    const { id } = req.input.params as { id: string };
    const { roles, reason } = req.input.body as { roles: string[]; reason: string };
    const supabase = requireSupabase();
    const { data: roleRows, error: roleError } = await supabase.from('admin_roles').select('id, name').in('name', roles);
    assertNoError({ error: roleError });
    if (!roleRows?.length) throw new ApiError(400, 'INVALID_ROLES', 'No valid roles were supplied.');
    const { data: before } = await supabase.from('admin_user_roles').select('role_id, admin_roles(name)').eq('user_id', id);
    const removingSuper = (before ?? []).some((row) => (row.admin_roles as { name?: string } | null)?.name === 'SUPER_ADMIN')
      && !roleRows.some((role) => role.name === 'SUPER_ADMIN');
    if (removingSuper && (await countActiveSuperAdmins(supabase)) <= 1) {
      throw new ApiError(409, 'LAST_SUPER_ADMIN', 'The last active SUPER_ADMIN role cannot be removed.');
    }
    const { error: deleteError } = await supabase.from('admin_user_roles').delete().eq('user_id', id);
    assertNoError({ error: deleteError });
    const { error: insertError } = await supabase.from('admin_user_roles').insert(
      roleRows.map((role) => ({ user_id: id, role_id: role.id, assigned_by: req.admin!.userId, assigned_at: new Date().toISOString() })),
    );
    assertNoError({ error: insertError });
    await writeAudit({ actorUserId: req.admin!.userId, actorType: 'ADMIN', action: 'ADMIN_ROLES_CHANGED', entityType: 'admin_profile', entityId: id, reason, requestId: req.requestId, beforeData: before, afterData: { roles } });
    return ok(res, { userId: id, roles });
  } catch (error) { next(error); }
});

adminRoutes.patch('/admins/:id/permissions', authorize(PERMISSIONS.adminsManage), validate({ params: idParam, body: reasonBody.extend({ permission: z.string(), effect: z.enum(['GRANT', 'DENY']) }) }), async (req, res, next) => {
  try {
    requireAdminManagement(req);
    const { id } = req.input.params as { id: string };
    const body = req.input.body as { permission: string; effect: 'GRANT' | 'DENY'; reason: string };
    if (!Object.values(ALL_PERMISSIONS).includes(body.permission as never)) throw new ApiError(400, 'INVALID_PERMISSION', 'Unknown permission.');
    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from('admin_permissions')
      .upsert({ user_id: id, permission: body.permission, effect: body.effect })
      .select('*')
      .single();
    assertNoError({ error });
    await writeAudit({ actorUserId: req.admin!.userId, actorType: 'ADMIN', action: 'ADMIN_PERMISSION_OVERRIDE', entityType: 'admin_profile', entityId: id, reason: body.reason, requestId: req.requestId, afterData: data });
    return ok(res, data);
  } catch (error) { next(error); }
});

adminRoutes.get('/admins/:id/activity', authorize(PERMISSIONS.adminsManage), validate({ params: idParam }), async (req, res, next) => {
  try {
    const { id } = req.input.params as { id: string };
    const supabase = requireSupabase();
    const { data, error } = await supabase.from('audit_logs').select('*').eq('actor_user_id', id).order('created_at', { ascending: false }).limit(200);
    assertNoError({ error });
    return ok(res, data ?? []);
  } catch (error) { next(error); }
});

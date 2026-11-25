import { Router } from 'express';
import { requireSupabase } from '../../config/supabase.js';
import { PERMISSIONS, ROLE_PERMISSIONS } from '../../config/permissions.js';
import { authenticate } from '../../middleware/authenticate.js';
import { ok } from '../../utils/ApiResponse.js';
import { ApiError } from '../../utils/ApiError.js';

export const authRoutes = Router();

authRoutes.get('/auth/me', authenticate, (req, res) => {
  const admin = req.admin!;
  const rolePermissions = new Set<string>();
  for (const role of admin.roles) {
    for (const permission of ROLE_PERMISSIONS[role] ?? []) rolePermissions.add(permission);
  }
  const effective = new Set(rolePermissions);
  for (const permission of admin.permissions) effective.add(permission);
  return ok(res, {
    userId: admin.userId,
    email: admin.email,
    displayName: admin.displayName,
    roles: admin.roles,
    permissions: [...effective],
    allPermissions: Object.values(PERMISSIONS),
  });
});

authRoutes.post('/auth/logout', authenticate, async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
    const supabase = requireSupabase();
    const { error } = await supabase.auth.admin.signOut(token);
    if (error) throw new ApiError(500, 'LOGOUT_FAILED', error.message);
    return ok(res, { signedOut: true });
  } catch (error) {
    next(error);
  }
});

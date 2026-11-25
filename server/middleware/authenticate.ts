import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { requireSupabase, getUserFromToken } from '../config/supabase.js';
import { env, isCronConfigured } from '../config/env.js';
import { resolvePermissions } from '../config/permissions.js';
import { ApiError } from '../utils/ApiError.js';
import { log } from '../utils/logger.js';
import type { AdminContext, CustomerContext, ShopContext } from '../types/express.js';

function bearerToken(req: Request): string {
  const header = req.header('Authorization') ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    throw new ApiError(401, 'MISSING_TOKEN', 'A Bearer access token is required.');
  }
  return token;
}

/** Loads a verified administrator profile, roles and effective permissions. */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = bearerToken(req);
    const user = await getUserFromToken(token);
    const supabase = requireSupabase();

    const { data: profile, error: profileError } = await supabase
      .from('admin_profiles')
      .select('user_id, display_name, status')
      .eq('user_id', user.id)
      .maybeSingle();
    if (profileError) throw new ApiError(500, 'DATABASE_ERROR', profileError.message);
    if (!profile) throw new ApiError(403, 'NOT_AN_ADMINISTRATOR', 'This account is not an administrator.');
    if (profile.status !== 'ACTIVE') throw new ApiError(403, 'ADMIN_DISABLED', 'This administrator account is disabled.');

    const [{ data: roleRows, error: roleError }, { data: permissionRows, error: permissionError }] =
      await Promise.all([
        supabase.from('admin_user_roles').select('role_id, admin_roles(name)').eq('user_id', user.id),
        supabase.from('admin_permissions').select('permission, effect').eq('user_id', user.id),
      ]);
    if (roleError) throw new ApiError(500, 'DATABASE_ERROR', roleError.message);
    if (permissionError) throw new ApiError(500, 'DATABASE_ERROR', permissionError.message);

    const roles = (roleRows ?? [])
      .map((row) => (row.admin_roles as { name?: string } | null)?.name)
      .filter((name): name is string => Boolean(name));

    const permissions = resolvePermissions(roles, permissionRows ?? []);

    req.admin = {
      userId: user.id,
      email: user.email ?? null,
      displayName: profile.display_name,
      roles,
      permissions,
    } satisfies AdminContext;
    next();
  } catch (error) {
    next(error);
  }
}

/** Customer identity is always derived from the verified Supabase Auth token. */
export async function authenticateCustomer(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = bearerToken(req);
    const user = await getUserFromToken(token);
    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from('customer_profiles')
      .select('id, status')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) throw new ApiError(500, 'DATABASE_ERROR', error.message);
    if (!data) throw new ApiError(403, 'NOT_A_CUSTOMER', 'This account has no ArthiRewards profile.');
    if (data.status !== 'ACTIVE') throw new ApiError(403, 'CUSTOMER_RESTRICTED', 'This customer account is restricted.');
    req.customer = { customerId: data.id, userId: user.id, status: data.status } satisfies CustomerContext;
    next();
  } catch (error) {
    next(error);
  }
}

/** Shop desktop clients authenticate with a provisioned, hashed API key. */
export async function authenticateShop(req: Request, _res: Response, next: NextFunction) {
  try {
    const rawKey = req.header('X-Shop-Api-Key');
    if (!rawKey) throw new ApiError(401, 'MISSING_SHOP_KEY', 'A shop API key is required.');
    const supabase = requireSupabase();
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const { data, error } = await supabase
      .from('shop_api_keys')
      .select('id, shop_id, status, shops(rewards_enabled, registration_status)')
      .eq('key_hash', keyHash)
      .eq('status', 'ACTIVE')
      .maybeSingle();
    if (error) throw new ApiError(500, 'DATABASE_ERROR', error.message);
    if (!data) throw new ApiError(401, 'INVALID_SHOP_KEY', 'The shop API key is invalid or revoked.');
    const shop = data.shops as { rewards_enabled?: boolean; registration_status?: string } | null;
    if (shop?.registration_status !== 'ACTIVE') {
      throw new ApiError(403, 'SHOP_NOT_ACTIVE', 'This shop registration is not active.');
    }
    await supabase.from('shop_api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', data.id);
    req.shop = {
      shopId: data.shop_id,
      keyId: data.id,
      rewardsEnabled: Boolean(shop?.rewards_enabled),
    } satisfies ShopContext;
    next();
  } catch (error) {
    next(error);
  }
}

/** Supabase Cron authenticates with a shared secret in a header. */
export function authenticateCron(req: Request, _res: Response, next: NextFunction) {
  const supplied = req.header('X-Cron-Secret') ?? '';
  if (!isCronConfigured || !env.CRON_SECRET) {
    return next(new ApiError(503, 'CRON_NOT_CONFIGURED', 'CRON_SECRET is not configured.'));
  }
  const a = Buffer.from(supplied);
  const b = Buffer.from(env.CRON_SECRET);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    log('warn', 'Rejected cron request with invalid secret', { requestId: req.requestId });
    return next(new ApiError(401, 'INVALID_CRON_SECRET', 'Invalid cron secret.'));
  }
  next();
}

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ApiError } from '../utils/ApiError.js';
import { env, isSupabaseConfigured } from './env.js';

const clientOptions = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
};

/**
 * Server-only Supabase client. Uses the service-role key and must never be
 * imported from any file under src/.
 */
export const supabaseAdmin: SupabaseClient | null = isSupabaseConfigured
  ? createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, clientOptions)
  : null;

/** Throw a predictable API error instead of failing with a transport error. */
export function requireSupabase(): SupabaseClient {
  if (!supabaseAdmin) {
    throw new ApiError(
      503,
      'SUPABASE_NOT_CONFIGURED',
      'Supabase server credentials are not configured on this deployment.',
    );
  }
  return supabaseAdmin;
}

/** Verify a Supabase Auth access token. The identity comes from the token, never the body. */
export async function getUserFromToken(token: string) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    throw new ApiError(401, 'INVALID_TOKEN', 'The access token is invalid or expired.');
  }
  return data.user;
}

/** Convert a Supabase error into an ApiError while preserving useful detail. */
export function assertNoError(
  result: { error: { message: string; code?: string; details?: unknown; hint?: string } | null },
  fallbackMessage = 'Database operation failed.',
): void {
  if (result.error) {
    throw new ApiError(
      500,
      result.error.code ?? 'DATABASE_ERROR',
      fallbackMessage,
      {
        details: result.error.details,
        hint: result.error.hint,
        raw: result.error.message,
      },
    );
  }
}

import type { NextFunction, Request, Response } from 'express';
import { requireSupabase } from '../config/supabase.js';
import { ApiError } from '../utils/ApiError.js';
import { log } from '../utils/logger.js';

interface Options {
  prefix: string;
  limit: number;
  windowSeconds: number;
  failOpen?: boolean;
}

/** Database-backed limiter so it works across serverless invocations. */
export function rateLimit({ prefix, limit, windowSeconds, failOpen = false }: Options) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const supabase = requireSupabase();
      const subject = req.admin?.userId ?? req.shop?.shopId ?? req.customer?.customerId ?? req.ip ?? 'anonymous';
      const key = `${prefix}:${subject}`;
      const { data, error } = await supabase.rpc('check_rate_limit', {
        p_key: key,
        p_limit: limit,
        p_window_seconds: windowSeconds,
      });
      if (error) throw error;
      if (!data) {
        return next(new ApiError(429, 'RATE_LIMITED', 'Too many requests. Please retry shortly.'));
      }
      next();
    } catch (error) {
      log('error', 'Rate limiter failed', { prefix, error: String(error) });
      if (failOpen) next();
      else next(new ApiError(503, 'RATE_LIMIT_UNAVAILABLE', 'Request rate cannot be verified right now.'));
    }
  };
}

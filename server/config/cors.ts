import cors from 'cors';
import { env, isProduction } from './env.js';

const allowedOrigins = env.CORS_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export const corsMiddleware = cors({
  origin(origin, callback) {
    // Same-origin requests have no Origin header. Server-to-server clients are allowed.
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      return callback(null, true);
    }
    if (!isProduction) return callback(null, true);
    return callback(new Error('Origin not allowed by CORS policy.'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-Cron-Secret', 'X-Shop-Api-Key', 'Idempotency-Key'],
  exposedHeaders: ['X-Request-Id'],
});

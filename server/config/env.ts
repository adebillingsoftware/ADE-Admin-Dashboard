import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  VITE_SUPABASE_URL: z.string().default(''),
  VITE_SUPABASE_ANON_KEY: z.string().default(''),
  SUPABASE_URL: z.string().default(''),
  SUPABASE_SERVICE_ROLE_KEY: z.string().default(''),
  SUPABASE_JWT_SECRET: z.string().default(''),
  APP_ENV: z.string().default('development'),
  API_BASE_URL: z.string().default('http://localhost:3001'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  CRON_SECRET: z.string().default(''),
  LICENCE_SIGNING_PRIVATE_KEY: z.string().default(''),
  ADMIN_EMAIL: z.string().default(''),
  ADMIN_PASSWORD: z.string().default(''),
  ADMIN_DISPLAY_NAME: z.string().default('Super Administrator'),
  PORT: z.string().default('3001'),
});

export const env = envSchema.parse(process.env);

const PLACEHOLDER = /(YOUR_|CHANGE_ME|BASE64_|replace-me|^$)/i;

export const isSupabaseConfigured =
  !PLACEHOLDER.test(env.SUPABASE_URL) && !PLACEHOLDER.test(env.SUPABASE_SERVICE_ROLE_KEY);

export const isPublicSupabaseConfigured =
  !PLACEHOLDER.test(env.VITE_SUPABASE_URL) && !PLACEHOLDER.test(env.VITE_SUPABASE_ANON_KEY);

export const isLicenceSigningConfigured =
  !PLACEHOLDER.test(env.LICENCE_SIGNING_PRIVATE_KEY);

export const isCronConfigured = !PLACEHOLDER.test(env.CRON_SECRET);

export const isProduction = env.APP_ENV === 'production';

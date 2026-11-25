import 'dotenv/config';
import { createHash, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { env, isSupabaseConfigured } from '../api/config/env.js';

const hours = Number(process.argv[2] ?? 24);

async function main() {
  if (!isSupabaseConfigured) throw new Error('Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.');
  if (!Number.isFinite(hours) || hours <= 0) throw new Error('Provide a positive expiry duration in hours.');

  const raw = randomBytes(24).toString('base64url');
  const hash = createHash('sha256').update(raw).digest('hex');
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { error } = await supabase.from('shop_registration_tokens').insert({
    token_hash: hash,
    expires_at: new Date(Date.now() + hours * 60 * 60 * 1000).toISOString(),
  });
  if (error) throw error;

  console.log('One-time shop registration token (shown once):');
  console.log(raw);
  console.log(`Expires in ${hours} hours. Store only the hash in the database.`);
  console.log('Send it from ArthiRetail as header: X-Registration-Token: <token>');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

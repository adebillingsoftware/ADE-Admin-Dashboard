import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { env, isSupabaseConfigured } from '../api/config/env.js';

async function main() {
  if (!isSupabaseConfigured) {
    throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env before provisioning.');
  }
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.startsWith('CHANGE_ME')) {
    throw new Error('Set ADMIN_EMAIL and a strong ADMIN_PASSWORD in .env before provisioning.');
  }

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: existing } = await supabase
    .from('admin_profiles')
    .select('user_id, display_name, status')
    .eq('user_id', (await supabase.auth.admin.listUsers()).data?.users.find((u) => u.email === env.ADMIN_EMAIL)?.id ?? '00000000-0000-0000-0000-000000000000')
    .maybeSingle();

  if (existing) {
    console.log(`Administrator ${env.ADMIN_EMAIL} already exists (${existing.status}). No changes made.`);
    return;
  }

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email: env.ADMIN_EMAIL,
    password: env.ADMIN_PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: env.ADMIN_DISPLAY_NAME },
  });
  if (createError) throw createError;
  if (!created.user) throw new Error('Supabase did not return a user.');

  const { error: profileError } = await supabase.from('admin_profiles').upsert({
    user_id: created.user.id,
    display_name: env.ADMIN_DISPLAY_NAME,
    status: 'ACTIVE',
  });
  if (profileError) throw profileError;

  const { data: role, error: roleError } = await supabase.from('admin_roles').select('id').eq('name', 'SUPER_ADMIN').single();
  if (roleError) throw roleError;
  const { error: roleInsertError } = await supabase
    .from('admin_user_roles')
    .upsert({ user_id: created.user.id, role_id: role.id }, { onConflict: 'user_id,role_id' });
  if (roleInsertError) throw roleInsertError;

  await supabase.from('audit_logs').insert({
    actor_user_id: created.user.id,
    actor_type: 'SYSTEM',
    action: 'FIRST_ADMIN_PROVISIONED',
    entity_type: 'admin_profile',
    entity_id: created.user.id,
    reason: 'Controlled first administrator provisioning script',
  });

  console.log(`Provisioned SUPER_ADMIN: ${env.ADMIN_EMAIL}`);
  console.log('Change ADMIN_PASSWORD in .env and in Supabase Auth after first login.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

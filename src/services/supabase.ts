import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL ?? '';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

const PLACEHOLDER = /(YOUR_|CHANGE_ME|BASE64_|replace-me|^$)/i;

export const isPublicSupabaseConfigured = !PLACEHOLDER.test(url) && !PLACEHOLDER.test(anonKey);

const remember = localStorage.getItem('ade-remember') !== 'false';
const storage = remember ? localStorage : sessionStorage;

/** Public client only. The service-role key never enters this bundle. */
export const supabase = createClient(url || 'https://placeholder.supabase.co', anonKey || 'placeholder-anon-key', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage,
  },
});

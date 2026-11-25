import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { isPublicSupabaseConfigured } from '@/services/supabase';

export function Login() {
  const { session, loading, signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (session) return <Navigate to="/" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password, remember);
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-brand-600 font-bold text-white">ADE</div>
          <h1 className="mt-4 text-xl font-semibold text-slate-900">Arthi Digital Enterprises</h1>
          <p className="mt-1 text-sm text-slate-500">Administrator sign in</p>
        </div>
        {!isPublicSupabaseConfigured && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            Supabase public credentials are placeholders. Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` before signing in.
          </div>
        )}
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Email</span>
            <div className="mt-1 flex items-center rounded-md border border-slate-300 px-3"><Mail className="h-4 w-4 text-slate-400" /><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-2 py-2 outline-none" placeholder="admin@example.com" /></div>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Password</span>
            <div className="mt-1 flex items-center rounded-md border border-slate-300 px-3"><LockKeyhole className="h-4 w-4 text-slate-400" /><input type={visible ? 'text' : 'password'} required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-2 py-2 outline-none" placeholder="••••••••" /><button type="button" onClick={() => setVisible((v) => !v)} aria-label={visible ? 'Hide password' : 'Show password'}>{visible ? <EyeOff className="h-4 w-4 text-slate-500" /> : <Eye className="h-4 w-4 text-slate-500" />}</button></div>
          </label>
          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 text-slate-600"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />Remember session</label>
            <Link to="/forgot-password" className="text-brand-600 hover:underline">Forgot password?</Link>
          </div>
          {error && <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
          <button disabled={busy || loading} className="w-full rounded-md bg-brand-600 py-2.5 font-medium text-white hover:bg-brand-700 disabled:opacity-60">{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
      </div>
    </div>
  );
}

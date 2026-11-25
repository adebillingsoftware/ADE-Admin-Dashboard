import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/context/ToastContext';
import { supabase } from '@/services/supabase';

export function ResetPassword() {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success('Password updated. Please sign in again.');
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Choose a new password</h1>
        <input type="password" required minLength={12} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 12 characters" className="mt-6 w-full rounded-md border border-slate-300 px-3 py-2" />
        <button disabled={busy} className="mt-4 w-full rounded-md bg-brand-600 py-2.5 text-white disabled:opacity-60">{busy ? 'Updating…' : 'Update password'}</button>
      </form>
    </div>
  );
}

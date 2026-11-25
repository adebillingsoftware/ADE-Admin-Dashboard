import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';

export function ForgotPassword() {
  const { resetPassword } = useAuth();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await resetPassword(email);
      toast.success('Password reset instructions sent if the account exists.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to send reset instructions.');
    } finally { setBusy(false); }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Reset your password</h1>
        <p className="mt-2 text-sm text-slate-500">Enter the email associated with your administrator account.</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@example.com" className="w-full rounded-md border border-slate-300 px-3 py-2" />
          <button disabled={busy} className="w-full rounded-md bg-brand-600 py-2.5 text-white disabled:opacity-60">{busy ? 'Sending…' : 'Send reset link'}</button>
        </form>
        <Link to="/login" className="mt-6 inline-flex items-center gap-1 text-sm text-brand-600"><ArrowLeft className="h-4 w-4" />Back to sign in</Link>
      </div>
    </div>
  );
}

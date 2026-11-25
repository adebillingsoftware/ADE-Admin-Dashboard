import { Navigate, Outlet } from 'react-router-dom';
import { Loader2, LockKeyhole } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

export function RequireAuth() {
  const { session, loading, authError, signOut } = useAuth();
  if (loading) return <div className="grid min-h-screen place-items-center"><Loader2 className="h-8 w-8 animate-spin text-brand-600" /></div>;
  if (!session) return <Navigate to="/login" replace />;
  if (authError) {
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <div className="max-w-md rounded-xl border border-rose-200 bg-white p-6 text-center">
          <LockKeyhole className="mx-auto h-8 w-8 text-rose-600" />
          <p className="mt-3 font-semibold text-slate-900">Administrator access unavailable</p>
          <p className="mt-2 text-sm text-slate-600">{authError}</p>
          <button onClick={() => void signOut()} className="mt-4 rounded-md bg-brand-600 px-4 py-2 text-sm text-white">Return to sign in</button>
        </div>
      </div>
    );
  }
  return <Outlet />;
}

export function RequirePermission({ permission }: { permission: string }) {
  const { can } = useAuth();
  if (!can(permission)) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-8 text-center">
        <LockKeyhole className="mx-auto h-8 w-8 text-rose-600" />
        <h2 className="mt-3 text-lg font-semibold text-rose-900">Permission required</h2>
        <p className="mt-1 text-sm text-rose-700">Your administrator role does not include `{permission}`.</p>
      </div>
    );
  }
  return <Outlet />;
}

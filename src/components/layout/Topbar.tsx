import { Bell, LogOut, RefreshCw, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useQueryClient } from '@tanstack/react-query';

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { profile, signOut } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4">
      <button onClick={onMenu} className="rounded-md p-2 text-slate-500 hover:bg-slate-100 md:hidden" aria-label="Open navigation">
        <span className="text-lg">☰</span>
      </button>
      <div className="ml-auto flex items-center gap-2">
        <button onClick={() => queryClient.invalidateQueries()} className="rounded-md p-2 text-slate-500 hover:bg-slate-100" title="Refresh all data"><RefreshCw className="h-5 w-5" /></button>
        <button onClick={() => navigate('/audit')} className="rounded-md p-2 text-slate-500 hover:bg-slate-100" title="Recent administrator actions"><Bell className="h-5 w-5" /></button>
        <div className="hidden items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 sm:flex">
          <User className="h-4 w-4 text-slate-500" />
          <div><p className="text-xs font-medium text-slate-800">{profile?.displayName ?? 'Administrator'}</p><p className="text-[10px] text-slate-500">{profile?.roles.join(', ') ?? ''}</p></div>
        </div>
        <button onClick={() => void signOut()} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"><LogOut className="h-4 w-4" /><span className="hidden sm:inline">Logout</span></button>
      </div>
    </header>
  );
}

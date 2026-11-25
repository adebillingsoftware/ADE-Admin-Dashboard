import { AlertCircle, Inbox, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
export { StatusBadge } from './StatusBadge';
export { Pagination } from './Pagination';

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-center">
      <AlertCircle className="mx-auto h-6 w-6 text-rose-600" />
      <p className="mt-2 text-sm font-medium text-rose-800">{message}</p>
      {onRetry && <button onClick={onRetry} className="mt-3 inline-flex items-center gap-2 rounded-md border border-rose-300 bg-white px-3 py-1.5 text-sm text-rose-700"><RefreshCw className="h-4 w-4" />Retry</button>}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500"><Inbox className="mx-auto mb-2 h-6 w-6" />{message}</div>;
}

export function LoadingSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="h-12 animate-pulse rounded-lg bg-slate-100" />
      ))}
    </div>
  );
}

export function ConfirmDialog({ open, title, description, reasonLabel = 'Reason', reasonValue, onReasonChange, confirmLabel = 'Confirm', onConfirm, onCancel, busy }: {
  open: boolean; title: string; description?: string; reasonLabel?: string; reasonValue?: string; onReasonChange?: (value: string) => void;
  confirmLabel?: string; onConfirm: () => void; onCancel: () => void; busy?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        {description && <p className="mt-2 text-sm text-slate-600">{description}</p>}
        {onReasonChange && (
          <label className="mt-4 block text-sm">
            <span className="font-medium text-slate-700">{reasonLabel}</span>
            <textarea value={reasonValue ?? ''} onChange={(event) => onReasonChange(event.target.value)} rows={3} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" placeholder="Enter an auditable reason" />
          </label>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-md border border-slate-200 px-4 py-2 text-sm">Cancel</button>
          <button onClick={onConfirm} disabled={busy || (Boolean(onReasonChange) && (reasonValue?.trim().length ?? 0) < 3)} className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? 'Working…' : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

export function Panel({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between"><h2 className="font-semibold text-slate-900">{title}</h2>{action}</div>
      {children}
    </section>
  );
}

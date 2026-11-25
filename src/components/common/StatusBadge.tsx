const STYLES: Record<string, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  VERIFIED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  PAID: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  COMPLETED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  PROCESSED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  GRACE: 'bg-amber-50 text-amber-700 ring-amber-200',
  PENDING: 'bg-amber-50 text-amber-700 ring-amber-200',
  RECEIVED: 'bg-amber-50 text-amber-700 ring-amber-200',
  PARTIAL: 'bg-amber-50 text-amber-700 ring-amber-200',
  DRAFT: 'bg-slate-100 text-slate-600 ring-slate-200',
  PAUSED: 'bg-slate-100 text-slate-600 ring-slate-200',
  SUSPENDED: 'bg-rose-50 text-rose-700 ring-rose-200',
  REJECTED: 'bg-rose-50 text-rose-700 ring-rose-200',
  REVOKED: 'bg-rose-50 text-rose-700 ring-rose-200',
  OVERDUE: 'bg-rose-50 text-rose-700 ring-rose-200',
  FAILED: 'bg-rose-50 text-rose-700 ring-rose-200',
  DISABLED: 'bg-rose-50 text-rose-700 ring-rose-200',
  CANCELLED: 'bg-slate-200 text-slate-700 ring-slate-300',
  CLOSED: 'bg-slate-200 text-slate-700 ring-slate-300',
};

export function StatusBadge({ value }: { value?: string | null }) {
  const label = value ?? '—';
  const style = STYLES[label] ?? 'bg-slate-100 text-slate-600 ring-slate-200';
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${style}`}>{label.replace(/_/g, ' ')}</span>;
}

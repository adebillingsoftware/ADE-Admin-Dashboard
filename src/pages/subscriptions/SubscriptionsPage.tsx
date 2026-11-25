import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/common/DataTable';
import { Pagination } from '@/components/common/Pagination';
import { StatusBadge, ConfirmDialog, ErrorState } from '@/components/common/Feedback';
import { apiPaginated, apiSend } from '@/services/api';
import { useToast } from '@/context/ToastContext';
import { dateOnly, money } from '@/utils/format';

export function SubscriptionsPage() {
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [action, setAction] = useState<{ kind: 'suspend' | 'reactivate' | 'renew'; id: string } | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const page = Number(params.get('page') ?? 1);
  const status = params.get('status') ?? 'ALL';
  const renewalsDue = params.get('renewalsDue');

  const query = useQuery({
    queryKey: ['subscriptions', status, renewalsDue, page],
    queryFn: () => apiPaginated<any>('/subscriptions', { status, page, pageSize: 25, ...(renewalsDue ? { renewalsDueDays: Number(renewalsDue) } : {}) }),
  });

  const submit = async () => {
    if (!action) return;
    setBusy(true);
    try {
      await apiSend('post', `/subscriptions/${action.id}/${action.kind}`, { reason: reason || 'Administrator action', ...(action.kind === 'suspend' ? { reasonCode: 'MANUAL' } : {}) });
      toast.success('Subscription updated.');
      setAction(null); setReason('');
      await queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Action failed.'); }
    finally { setBusy(false); }
  };

  const columns: Column<any>[] = [
    { key: 'shop', header: 'Shop', render: (row) => <div><p className="font-medium">{row.shops?.shop_code}</p><p className="text-xs text-slate-500">{row.shops?.shop_name}</p></div> },
    { key: 'plan', header: 'Plan', render: (row) => row.subscription_plans?.name ?? '—' },
    { key: 'price', header: 'Monthly', render: (row) => money(row.monthly_price_minor, row.currency_code) },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge value={row.status} /> },
    { key: 'period', header: 'Current period', render: (row) => `${dateOnly(row.current_period_start)} → ${dateOnly(row.current_period_end)}` },
    { key: 'grace', header: 'Grace deadline', render: (row) => dateOnly(row.grace_deadline) },
    { key: 'reason', header: 'Suspension reason', render: (row) => row.suspension_reason ?? '—' },
    { key: 'actions', header: 'Actions', render: (row) => <div className="flex gap-2"><button onClick={() => setAction({ kind: 'renew', id: row.id })} className="text-brand-600">Renew</button>{row.status === 'SUSPENDED' ? <button onClick={() => setAction({ kind: 'reactivate', id: row.id })} className="text-emerald-600">Reactivate</button> : <button onClick={() => setAction({ kind: 'suspend', id: row.id })} className="text-rose-600">Stop</button>}</div> },
  ];

  return (
    <>
      <PageHeader title="Subscriptions" description="Monthly billing, seven-day grace and controlled suspension/reactivation." />
      <div className="mb-4 flex flex-wrap gap-2">
        {['ALL', 'ACTIVE', 'GRACE', 'SUSPENDED', 'CANCELLED'].map((value) => <button key={value} onClick={() => { const next = new URLSearchParams(params); if (value === 'ALL') next.delete('status'); else next.set('status', value); next.delete('renewalsDue'); next.set('page', '1'); setParams(next); }} className={`rounded-md px-3 py-1.5 text-sm ${status === value && !renewalsDue ? 'bg-brand-600 text-white' : 'border border-slate-200 bg-white'}`}>{value}</button>)}
      </div>
      {query.error ? <ErrorState message={query.error instanceof Error ? query.error.message : 'Unable to load subscriptions.'} onRetry={() => query.refetch()} /> : <>
        <DataTable columns={columns} rows={query.data?.data ?? []} loading={query.isLoading} />
        <Pagination page={page} totalPages={query.data?.meta.totalPages ?? 1} onChange={(next) => { const p = new URLSearchParams(params); p.set('page', String(next)); setParams(p); }} />
      </>}
      <ConfirmDialog open={Boolean(action)} title={`Confirm ${action?.kind ?? ''}`} description="A MANUAL suspension requires explicit reactivation even after payment verification." reasonValue={reason} onReasonChange={setReason} confirmLabel="Confirm" onConfirm={() => void submit()} onCancel={() => { setAction(null); setReason(''); }} busy={busy} />
    </>
  );
}

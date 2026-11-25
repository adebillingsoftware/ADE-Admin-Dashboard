import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/common/DataTable';
import { Pagination } from '@/components/common/Pagination';
import { StatusBadge, ErrorState, ConfirmDialog } from '@/components/common/Feedback';
import { apiPaginated, apiSend } from '@/services/api';
import { useToast } from '@/context/ToastContext';
import { dateTime, money } from '@/utils/format';
import { PaymentFormDialog } from './PaymentFormDialog';

export function PaymentsPage() {
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [action, setAction] = useState<{ kind: 'verify' | 'reject'; id: string } | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const page = Number(params.get('page') ?? 1);
  const status = params.get('status') ?? 'ALL';

  const query = useQuery({ queryKey: ['payments', status, page], queryFn: () => apiPaginated<any>('/payments', { status, page, pageSize: 25 }) });

  const submit = async () => {
    if (!action) return;
    setBusy(true);
    try {
      if (action.kind === 'verify') await apiSend('post', `/payments/${action.id}/verify`, {});
      else await apiSend('post', `/payments/${action.id}/reject`, { reason });
      toast.success(`Payment ${action.kind === 'verify' ? 'verified' : 'rejected'}.`);
      setAction(null); setReason('');
      await queryClient.invalidateQueries({ queryKey: ['payments'] });
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Action failed.'); }
    finally { setBusy(false); }
  };

  const columns: Column<any>[] = [
    { key: 'shop', header: 'Shop', render: (row) => <div><p className="font-medium">{row.shops?.shop_code}</p><p className="text-xs text-slate-500">{row.shops?.shop_name}</p></div> },
    { key: 'amount', header: 'Amount', render: (row) => money(row.amount_minor, row.currency_code) },
    { key: 'method', header: 'Method', render: (row) => row.method.replace('_', ' ') },
    { key: 'reference', header: 'UTR / reference', render: (row) => row.transaction_reference ?? '—' },
    { key: 'paid', header: 'Payment date', render: (row) => dateTime(row.paid_at) },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge value={row.status} /> },
    { key: 'actions', header: 'Actions', render: (row) => row.status === 'PENDING' ? <div className="flex gap-2"><button onClick={() => setAction({ kind: 'verify', id: row.id })} className="text-emerald-600">Verify</button><button onClick={() => setAction({ kind: 'reject', id: row.id })} className="text-rose-600">Reject</button></div> : '—' },
  ];

  return (
    <>
      <PageHeader title="Payments" description="Manual verification queue. No automatic bank confirmation is performed." actions={<button onClick={() => setFormOpen(true)} className="rounded-md bg-brand-600 px-3 py-1.5 text-sm text-white">Record payment</button>} />
      <div className="mb-4 flex gap-2">
        {['ALL', 'PENDING', 'VERIFIED', 'REJECTED'].map((value) => <button key={value} onClick={() => { const next = new URLSearchParams(params); if (value === 'ALL') next.delete('status'); else next.set('status', value); next.set('page', '1'); setParams(next); }} className={`rounded-md px-3 py-1.5 text-sm ${status === value ? 'bg-brand-600 text-white' : 'border border-slate-200 bg-white'}`}>{value.replace('_', ' ')}</button>)}
      </div>
      {query.error ? <ErrorState message={query.error instanceof Error ? query.error.message : 'Unable to load payments.'} onRetry={() => query.refetch()} /> : <>
        <DataTable columns={columns} rows={query.data?.data ?? []} loading={query.isLoading} emptyMessage="No payments in this view." />
        <Pagination page={page} totalPages={query.data?.meta.totalPages ?? 1} onChange={(next) => { const p = new URLSearchParams(params); p.set('page', String(next)); setParams(p); }} />
      </>}
      <PaymentFormDialog shopId="" open={formOpen} onClose={() => setFormOpen(false)} />
      <ConfirmDialog open={Boolean(action)} title={action?.kind === 'verify' ? 'Verify payment' : 'Reject payment'} description="Verification allocates the payment to the earliest open billing period transactionally and writes an audit record." reasonLabel="Reason (required for rejection)" reasonValue={reason} onReasonChange={setReason} confirmLabel="Confirm" onConfirm={() => void submit()} onCancel={() => setAction(null)} busy={busy} />
    </>
  );
}

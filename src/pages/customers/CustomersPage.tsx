import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/common/DataTable';
import { Pagination, ConfirmDialog, ErrorState } from '@/components/common/Feedback';
import { StatusBadge } from '@/components/common/StatusBadge';
import { apiPaginated, apiSend } from '@/services/api';
import { useToast } from '@/context/ToastContext';
import { dateOnly } from '@/utils/format';

export function CustomersPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [restrict, setRestrict] = useState<{ id: string } | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const page = Number(params.get('page') ?? 1);
  const search = params.get('search') ?? '';
  const query = useQuery({ queryKey: ['customers', search, page], queryFn: () => apiPaginated<any>('/customers', { search, page, pageSize: 25 }) });

  const submit = async () => {
    if (!restrict) return;
    setBusy(true);
    try {
      await apiSend('post', `/customers/${restrict.id}/restrict`, { reason });
      toast.success('Customer account restricted.');
      setRestrict(null); setReason('');
      await queryClient.invalidateQueries({ queryKey: ['customers'] });
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Action failed.'); }
    finally { setBusy(false); }
  };

  const columns: Column<any>[] = [
    { key: 'name', header: 'Customer', render: (row) => <div><p className="font-medium">{row.display_name}</p><p className="text-xs text-slate-500">{row.id.slice(0, 8)}</p></div> },
    { key: 'email', header: 'Email', render: (row) => row.email ?? '—' },
    { key: 'phone', header: 'Phone', render: (row) => row.phone ?? '—' },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge value={row.status} /> },
    { key: 'registered', header: 'Registered', render: (row) => dateOnly(row.created_at) },
    { key: 'actions', header: 'Actions', render: (row) => <div className="flex gap-2"><button onClick={() => navigate(`/customers/${row.id}`)} className="text-brand-600">View</button><button onClick={() => setRestrict({ id: row.id })} className="text-rose-600">Restrict</button></div> },
  ];

  return (
    <>
      <PageHeader title="Customer directory" description="Authorized global ArthiRewards profiles only. No local shop customer databases are exposed." />
      <div className="mb-4"><input value={search} onChange={(e) => { const next = new URLSearchParams(params); if (e.target.value) next.set('search', e.target.value); else next.delete('search'); next.set('page', '1'); setParams(next); }} placeholder="Search name, email or phone" className="w-full max-w-md rounded-md border border-slate-300 px-3 py-2 text-sm" /></div>
      {query.error ? <ErrorState message="Unable to load customers." onRetry={() => query.refetch()} /> : <>
        <DataTable columns={columns} rows={query.data?.data ?? []} loading={query.isLoading} />
        <Pagination page={page} totalPages={query.data?.meta.totalPages ?? 1} onChange={(p) => { const next = new URLSearchParams(params); next.set('page', String(p)); setParams(next); }} />
      </>}
      <ConfirmDialog open={Boolean(restrict)} title="Restrict customer account" description="This blocks customer access and is written to the audit log." reasonValue={reason} onReasonChange={setReason} confirmLabel="Restrict" onConfirm={() => void submit()} onCancel={() => setRestrict(null)} busy={busy} />
    </>
  );
}

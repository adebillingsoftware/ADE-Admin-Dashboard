import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/common/DataTable';
import { Pagination, ConfirmDialog, ErrorState } from '@/components/common/Feedback';
import { StatusBadge } from '@/components/common/StatusBadge';
import { apiPaginated, apiSend } from '@/services/api';
import { useToast } from '@/context/ToastContext';
import { dateTime } from '@/utils/format';

export function DevicesPage() {
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [action, setAction] = useState<{ kind: 'revoke' | 'reset'; id: string } | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const page = Number(params.get('page') ?? 1);
  const status = params.get('status') ?? 'ALL';

  const query = useQuery({ queryKey: ['devices', status, page], queryFn: () => apiPaginated<any>('/devices', { status: status === 'ALL' ? undefined : status, page, pageSize: 25 }) });

  const submit = async () => {
    if (!action) return;
    setBusy(true);
    try {
      await apiSend('post', `/devices/${action.id}/${action.kind}`, { reason });
      toast.success('Device updated.');
      setAction(null); setReason('');
      await queryClient.invalidateQueries({ queryKey: ['devices'] });
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Action failed.'); }
    finally { setBusy(false); }
  };

  const columns: Column<any>[] = [
    { key: 'shop', header: 'Shop', render: (row) => `${row.shops?.shop_code ?? ''} — ${row.shops?.shop_name ?? ''}` },
    { key: 'name', header: 'Device', render: (row) => row.device_name ?? '—' },
    { key: 'fingerprint', header: 'Public-key fingerprint', render: (row) => <span className="font-mono text-xs">{row.key_fingerprint}</span> },
    { key: 'activated', header: 'Activated', render: (row) => dateTime(row.activated_at) },
    { key: 'heartbeat', header: 'Last heartbeat', render: (row) => dateTime(row.last_seen_at) },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge value={row.status} /> },
    { key: 'actions', header: 'Actions', render: (row) => row.status === 'ACTIVE' ? <div className="flex gap-2"><button onClick={() => setAction({ kind: 'revoke', id: row.id })} className="text-rose-600">Revoke</button><button onClick={() => setAction({ kind: 'reset', id: row.id })} className="text-amber-600">Reset</button></div> : '—' },
  ];

  return (
    <>
      <PageHeader title="Devices" description="One active device per shop. Reset revokes the previous device before replacement activation." />
      <div className="mb-4 flex gap-2">
        {['ALL', 'ACTIVE', 'REVOKED', 'PENDING'].map((value) => <button key={value} onClick={() => { const next = new URLSearchParams(params); if (value === 'ALL') next.delete('status'); else next.set('status', value); next.set('page', '1'); setParams(next); }} className={`rounded-md px-3 py-1.5 text-sm ${status === value ? 'bg-brand-600 text-white' : 'border border-slate-200 bg-white'}`}>{value}</button>)}
      </div>
      {query.error ? <ErrorState message="Unable to load devices." onRetry={() => query.refetch()} /> : <>
        <DataTable columns={columns} rows={query.data?.data ?? []} loading={query.isLoading} />
        <Pagination page={page} totalPages={query.data?.meta.totalPages ?? 1} onChange={(p) => { const next = new URLSearchParams(params); next.set('page', String(p)); setParams(next); }} />
      </>}
      <ConfirmDialog open={Boolean(action)} title={`Confirm device ${action?.kind ?? ''}`} description="All licence leases for this device will be invalidated." reasonValue={reason} onReasonChange={setReason} confirmLabel="Confirm" onConfirm={() => void submit()} onCancel={() => setAction(null)} busy={busy} />
    </>
  );
}

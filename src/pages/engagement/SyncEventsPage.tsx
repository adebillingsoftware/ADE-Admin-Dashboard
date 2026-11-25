import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable } from '@/components/common/DataTable';
import { Pagination, ErrorState } from '@/components/common/Feedback';
import { StatusBadge } from '@/components/common/StatusBadge';
import { apiPaginated, apiSend } from '@/services/api';
import { useToast } from '@/context/ToastContext';
import { dateTime } from '@/utils/format';

export function SyncEventsPage() {
  const [params, setParams] = useSearchParams();
  const client = useQueryClient();
  const toast = useToast();
  const page = Number(params.get('page') ?? 1);
  const query = useQuery({ queryKey: ['sync-events', page], queryFn: () => apiPaginated<any>('/rewards/sync-events', { page, pageSize: 25 }) });
  const retry = async (id: string) => {
    try {
      await apiSend('post', `/rewards/sync-events/${id}/retry`, {});
      toast.success('Retry queued.');
      await client.invalidateQueries({ queryKey: ['sync-events'] });
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Retry failed.'); }
  };
  const columns = [
    { key: 'event', header: 'Event', render: (r: any) => <span className="font-mono text-xs">{r.idempotency_key}</span> },
    { key: 'shop', header: 'Shop', render: (r: any) => r.shops?.shop_name ?? '—' },
    { key: 'status', header: 'Status', render: (r: any) => <StatusBadge value={r.status} /> },
    { key: 'received', header: 'Received', render: (r: any) => dateTime(r.received_at) },
    { key: 'error', header: 'Error', render: (r: any) => r.rejection_code ?? '—' },
    { key: 'retry', header: 'Retry', render: (r: any) => <button onClick={() => retry(r.id)} className="text-brand-600">Retry</button> },
  ];
  return (
    <>
      <PageHeader title="Synchronization events" description="Idempotent shop reward-event receipts. Retries are audited." />
      {query.error ? <ErrorState message="Unable to load sync events." onRetry={() => query.refetch()} /> : <>
        <DataTable columns={columns} rows={query.data?.data ?? []} loading={query.isLoading} />
        <Pagination page={page} totalPages={query.data?.meta.totalPages ?? 1} onChange={(p) => { const next = new URLSearchParams(params); next.set('page', String(p)); setParams(next); }} />
      </>}
    </>
  );
}

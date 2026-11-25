import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/common/DataTable';
import { Pagination, ErrorState } from '@/components/common/Feedback';
import { StatusBadge } from '@/components/common/StatusBadge';
import { apiPaginated } from '@/services/api';
import { dateTime } from '@/utils/format';

export function DeviceResets() {
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') ?? 1);
  const query = useQuery({ queryKey: ['device-resets', page], queryFn: () => apiPaginated<any>('/devices/reset-requests', { page, pageSize: 25 }) });
  const columns: Column<any>[] = [
    { key: 'shop', header: 'Shop', render: (row) => row.shops?.shop_name ?? '—' },
    { key: 'device', header: 'Device', render: (row) => row.shop_devices?.device_name ?? '—' },
    { key: 'reason', header: 'Reason', render: (row) => row.reason },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge value={row.status} /> },
    { key: 'created', header: 'Requested', render: (row) => dateTime(row.created_at) },
  ];
  return (
    <>
      <PageHeader title="Device reset requests" description="Auditable record of device replacement requests." />
      {query.error ? <ErrorState message="Unable to load reset requests." onRetry={() => query.refetch()} /> : <>
        <DataTable columns={columns} rows={query.data?.data ?? []} loading={query.isLoading} />
        <Pagination page={page} totalPages={query.data?.meta.totalPages ?? 1} onChange={(p) => { const next = new URLSearchParams(params); next.set('page', String(p)); setParams(next); }} />
      </>}
    </>
  );
}

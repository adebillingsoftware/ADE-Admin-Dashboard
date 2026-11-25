import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/common/DataTable';
import { Pagination, ErrorState } from '@/components/common/Feedback';
import { StatusBadge } from '@/components/common/StatusBadge';
import { apiPaginated } from '@/services/api';
import { dateOnly, money } from '@/utils/format';

export function BillingHistoryPage() {
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') ?? 1);
  const query = useQuery({ queryKey: ['billing-history', page], queryFn: () => apiPaginated<any>('/billing-periods', { page, pageSize: 25 }) });

  const columns: Column<any>[] = [
    { key: 'shop', header: 'Shop', render: (row) => row.subscriptions?.shops?.shop_name ?? '—' },
    { key: 'period', header: 'Period', render: (row) => `${dateOnly(row.period_start)} → ${dateOnly(row.period_end)}` },
    { key: 'due', header: 'Amount due', render: (row) => money(row.amount_due_minor) },
    { key: 'paid', header: 'Amount paid', render: (row) => money(row.amount_paid_minor) },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge value={row.status} /> },
    { key: 'settled', header: 'Settled', render: (row) => dateOnly(row.settled_at) },
  ];

  return (
    <>
      <PageHeader title="Billing history" description="Immutable billing periods and verified payment allocations." />
      {query.error ? <ErrorState message="Unable to load billing history." onRetry={() => query.refetch()} /> : <>
        <DataTable columns={columns} rows={query.data?.data ?? []} loading={query.isLoading} />
        <Pagination page={page} totalPages={query.data?.meta.totalPages ?? 1} onChange={(p) => { const next = new URLSearchParams(params); next.set('page', String(p)); setParams(next); }} />
      </>}
    </>
  );
}

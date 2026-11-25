import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable } from '@/components/common/DataTable';
import { Pagination, ErrorState } from '@/components/common/Feedback';
import { apiPaginated } from '@/services/api';
import { dateTime, number } from '@/utils/format';

export function RewardLedgerPage() {
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') ?? 1);
  const query = useQuery({ queryKey: ['reward-ledger', page], queryFn: () => apiPaginated<any>('/rewards/ledger', { page, pageSize: 25 }) });
  const columns = [
    { key: 'when', header: 'When', render: (r: any) => dateTime(r.created_at) },
    { key: 'shop', header: 'Shop', render: (r: any) => r.shops?.shop_name ?? '—' },
    { key: 'type', header: 'Type', render: (r: any) => r.entry_type },
    { key: 'points', header: 'Points', render: (r: any) => number(r.points_delta) },
    { key: 'description', header: 'Description', render: (r: any) => r.description ?? '—' },
  ];
  return (
    <>
      <PageHeader title="Reward ledger" description="Authoritative append-only points ledger. Corrections are new entries." />
      {query.error ? <ErrorState message="Unable to load ledger." onRetry={() => query.refetch()} /> : <>
        <DataTable columns={columns} rows={query.data?.data ?? []} loading={query.isLoading} />
        <Pagination page={page} totalPages={query.data?.meta.totalPages ?? 1} onChange={(p) => { const next = new URLSearchParams(params); next.set('page', String(p)); setParams(next); }} />
      </>}
    </>
  );
}

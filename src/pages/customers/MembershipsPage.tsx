import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { Panel, ErrorState } from '@/components/common/Feedback';
import { DataTable, type Column } from '@/components/common/DataTable';
import { StatusBadge } from '@/components/common/StatusBadge';
import { apiGet } from '@/services/api';
import { dateTime } from '@/utils/format';

export function MembershipsPage() {
  const query = useQuery({ queryKey: ['shop-participation'], queryFn: () => apiGet<any[]>('/engagement/participation') });
  const columns: Column<any>[] = [
    { key: 'shop', header: 'Shop', render: (row) => `${row.shop_code} — ${row.shop_name}` },
    { key: 'status', header: 'Engagement', render: (row) => <StatusBadge value={row.rewards_enabled ? 'ACTIVE' : 'PAUSED'} /> },
  ];
  return (
    <>
      <PageHeader title="Shop memberships" description="Customer-to-shop relationships are visible on each customer profile. This view shows participating shops." />
      {query.error ? <ErrorState message="Unable to load participation." onRetry={() => query.refetch()} /> : <Panel title="Participating shops"><DataTable columns={columns} rows={query.data ?? []} loading={query.isLoading} emptyMessage="No participating shops." /></Panel>}
      <p className="mt-3 text-xs text-slate-400">Individual membership records contain customer identifiers and are available only through an authorized customer profile.</p>
    </>
  );
}

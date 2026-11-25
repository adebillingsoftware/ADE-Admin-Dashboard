import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { Panel, ErrorState, LoadingSkeleton } from '@/components/common/Feedback';
import { DataTable, type Column } from '@/components/common/DataTable';
import { StatusBadge } from '@/components/common/StatusBadge';
import { apiGet } from '@/services/api';
import { dateTime, number, money } from '@/utils/format';

export function CustomerProfile() {
  const { id = '' } = useParams();
  const profile = useQuery({ queryKey: ['customer', id], queryFn: () => apiGet<{ customer: any; memberships: any[] }>(`/customers/${id}`) });
  const rewards = useQuery({ queryKey: ['customer-rewards', id], queryFn: () => apiGet<any>(`/customers/${id}/rewards`) });
  const activity = useQuery({ queryKey: ['customer-activity', id], queryFn: () => apiGet<any[]>(`/customers/${id}/activity`) });

  if (profile.isLoading) return <><PageHeader title="Customer profile" /><LoadingSkeleton rows={6} /></>;
  if (profile.error) return <><PageHeader title="Customer profile" /><ErrorState message="Unable to load customer." onRetry={() => profile.refetch()} /></>;
  if (!profile.data) return null;

  const memberColumns: Column<any>[] = [
    { key: 'shop', header: 'Shop', render: (row) => `${row.shops?.shop_code ?? ''} — ${row.shops?.shop_name ?? ''}` },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge value={row.status} /> },
    { key: 'joined', header: 'Joined', render: (row) => dateTime(row.joined_at) },
  ];
  const ledgerColumns: Column<any>[] = [
    { key: 'when', header: 'When', render: (row) => dateTime(row.created_at) },
    { key: 'type', header: 'Type', render: (row) => row.entry_type },
    { key: 'points', header: 'Points', render: (row) => number(row.points_delta) },
    { key: 'description', header: 'Description', render: (row) => row.description ?? '—' },
  ];

  return (
    <>
      <PageHeader title={profile.data.customer.display_name} description={`Status: ${profile.data.customer.status}`} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Basic profile"><dl className="grid grid-cols-2 gap-3 text-sm"><dt className="text-slate-500">Email</dt><dd>{profile.data.customer.email ?? '—'}</dd><dt className="text-slate-500">Phone</dt><dd>{profile.data.customer.phone ?? '—'}</dd><dt className="text-slate-500">DOB opt-in</dt><dd>{profile.data.customer.dob_reward_opt_in ? 'Yes' : 'No'}</dd><dt className="text-slate-500">Registered</dt><dd>{dateTime(profile.data.customer.created_at)}</dd></dl></Panel>
        <Panel title="Reward summary"><p className="text-sm">Points balance: <strong>{number(rewards.data?.pointsBalance)}</strong></p><p className="mt-1 text-sm">Wallet balance: <strong>{money(rewards.data?.walletBalanceMinor)}</strong> (meaning determined by approved wallet policy)</p></Panel>
        <Panel title="Shop memberships"><DataTable columns={memberColumns} rows={profile.data.memberships} /></Panel>
        <Panel title="Points history"><DataTable columns={ledgerColumns} rows={rewards.data?.pointsEntries ?? []} /></Panel>
        <Panel title="Redemption history"><DataTable columns={[{ key: 'when', header: 'When', render: (r: any) => dateTime(r.created_at) }, { key: 'status', header: 'Status', render: (r: any) => <StatusBadge value={r.status} /> }, { key: 'points', header: 'Points', render: (r: any) => number(r.points_spent) }]} rows={rewards.data?.redemptions ?? []} /></Panel>
        <Panel title="Scratch-card history"><DataTable columns={[{ key: 'when', header: 'Issued', render: (r: any) => dateTime(r.issued_at) }, { key: 'status', header: 'Status', render: (r: any) => <StatusBadge value={r.status} /> }]} rows={rewards.data?.scratchCards ?? []} /></Panel>
        <Panel title="Support / audit activity"><DataTable columns={[{ key: 'when', header: 'When', render: (r: any) => dateTime(r.created_at) }, { key: 'action', header: 'Action', render: (r: any) => r.action }, { key: 'reason', header: 'Reason', render: (r: any) => r.reason ?? '—' }]} rows={activity.data ?? []} /></Panel>
      </div>
    </>
  );
}

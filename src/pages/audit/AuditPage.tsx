import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/common/DataTable';
import { Pagination } from '@/components/common/Pagination';
import { apiPaginated } from '@/services/api';
import { dateTime } from '@/utils/format';

export function AuditPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const query = useQuery({ queryKey: ['audit', page, search, from, to], queryFn: () => apiPaginated<any>('/audit', {
    page, pageSize: 25, search: search || undefined,
    from: from ? new Date(`${from}T00:00:00Z`).toISOString() : undefined,
    to: to ? new Date(`${to}T23:59:59Z`).toISOString() : undefined,
  }) });
  const columns: Column<any>[] = [
    { key: 'created', header: 'Timestamp', render: (row) => dateTime(row.created_at) },
    { key: 'actor', header: 'Actor', render: (row) => row.actor_user_id ?? row.actor_type },
    { key: 'action', header: 'Action', render: (row) => <span className="font-medium">{row.action}</span> },
    { key: 'entity', header: 'Entity', render: (row) => `${row.entity_type}${row.entity_id ? ` · ${row.entity_id}` : ''}` },
    { key: 'reason', header: 'Reason', render: (row) => row.reason ?? '—' },
  ];
  return (
    <>
      <PageHeader title="Audit logs" description="Immutable administrator and system activity records." />
      <div className="mb-4 grid gap-2 md:grid-cols-4"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search action or entity" className="rounded-md border border-slate-300 px-3 py-2 text-sm" /><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" /><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm" /><button onClick={() => setPage(1)} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">Apply filters</button></div>
      <DataTable columns={columns} rows={query.data?.data ?? []} loading={query.isLoading} emptyMessage="No audit records found." />
      <Pagination page={page} totalPages={query.data?.meta.totalPages ?? 1} onChange={setPage} />
    </>
  );
}

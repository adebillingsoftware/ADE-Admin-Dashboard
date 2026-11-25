import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { Panel, ErrorState } from '@/components/common/Feedback';
import { DataTable, type Column } from '@/components/common/DataTable';
import { api } from '@/services/api';

const TITLES: Record<string, string> = {
  collections: 'Monthly collections',
  outstanding: 'Outstanding payments',
  subscriptions: 'Subscription reports',
  shops: 'Shop registrations',
  customers: 'Customer reports',
  rewards: 'Reward activity',
  redemptions: 'Redemption activity',
  scratchcards: 'Scratch-card activity',
};

export function ReportsPage() {
  const { type = 'collections' } = useParams();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const params = useMemo(() => ({
    from: from ? new Date(`${from}T00:00:00Z`).toISOString() : undefined,
    to: to ? new Date(`${to}T23:59:59Z`).toISOString() : undefined,
  }), [from, to]);
  const query = useQuery({ queryKey: ['report', type, params], queryFn: async () => {
    const response = await api.get(`/reports/${type}`, { params });
    return response.data.data as { rows: Record<string, unknown>[]; totals?: Record<string, unknown>; filters?: unknown };
  } });

  const downloadCsv = async () => {
    const response = await api.get(`/reports/${type}`, { params: { ...params, format: 'csv' }, responseType: 'blob' });
    const url = URL.createObjectURL(response.data);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${type}-report.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const rows = query.data?.rows ?? [];
  const columns: Column<Record<string, unknown>>[] = Object.keys(rows[0] ?? {}).slice(0, 8).map((key) => ({
    key,
    header: key.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1'),
    render: (row) => typeof row[key] === 'object' ? JSON.stringify(row[key]) : String(row[key] ?? '—'),
  }));

  return (
    <>
      <PageHeader title={TITLES[type] ?? 'Reports'} description="Date-range report with JSON or CSV export." actions={<>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" aria-label="From date" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" aria-label="To date" />
        <button onClick={() => void downloadCsv()} className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-3 py-1.5 text-sm text-white"><Download className="h-4 w-4" />CSV</button>
      </>} />
      {query.error ? <ErrorState message={query.error instanceof Error ? query.error.message : 'Unable to load report.'} onRetry={() => void query.refetch()} /> : <>
        {query.data?.totals && <Panel title="Totals"><dl className="grid grid-cols-2 gap-3 md:grid-cols-4">{Object.entries(query.data.totals).map(([key, value]) => <div key={key}><dt className="text-xs text-slate-500">{key.replace(/([A-Z])/g, ' $1')}</dt><dd className="mt-1 font-semibold">{typeof value === 'number' ? value.toLocaleString() : String(value)}</dd></div>)}</dl></Panel>}
        <div className="mt-4"><DataTable columns={columns} rows={rows} loading={query.isLoading} emptyMessage="No report records for this period." /></div>
      </>}
    </>
  );
}

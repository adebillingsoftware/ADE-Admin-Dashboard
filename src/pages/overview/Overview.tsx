import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell,
} from 'recharts';
import { Activity, AlertTriangle, BadgeIndianRupee, CircleDollarSign, Clock3, Gift, Store, Users } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { StatCard } from '@/components/common/StatCard';
import { Panel, ErrorState, LoadingSkeleton } from '@/components/common/Feedback';
import { apiGet } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { money, number, dateTime } from '@/utils/format';

type Data = Record<string, any>;

function rangeParams(from: string, to: string) {
  return { from: from ? new Date(`${from}T00:00:00Z`).toISOString() : undefined, to: to ? new Date(`${to}T23:59:59Z`).toISOString() : undefined };
}

export function Overview() {
  const { can } = useAuth();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const params = useMemo(() => rangeParams(from, to), [from, to]);
  const query = useQuery({ queryKey: ['overview', params], queryFn: () => apiGet<Data>('/dashboard/overview', params) });
  const charts = useQuery({ queryKey: ['overview-charts', params], queryFn: () => apiGet<Data>('/dashboard/charts', params) });
  const alerts = useQuery({ queryKey: ['overview-alerts', params], queryFn: () => apiGet<Data>('/dashboard/alerts', params) });
  const loading = query.isLoading || charts.isLoading || alerts.isLoading;
  const error = query.error || charts.error || alerts.error;

  const refresh = () => { void query.refetch(); void charts.refetch(); void alerts.refetch(); };

  if (error) return <><PageHeader title="Overview" /><ErrorState message={error instanceof Error ? error.message : 'Unable to load dashboard data.'} onRetry={refresh} /></>;
  if (loading) return <><PageHeader title="Overview" /><LoadingSkeleton rows={8} /></>;

  const summary = query.data ?? {};
  const chartData = charts.data ?? {};
  const alertData = alerts.data ?? {};
  const statusData = [
    { name: 'Active', value: Number(chartData.shopStatus?.active ?? 0) },
    { name: 'Grace', value: Number(chartData.shopStatus?.grace ?? 0) },
    { name: 'Suspended', value: Number(chartData.shopStatus?.suspended ?? 0) },
  ];
  const pieColors = ['#10b981', '#f59e0b', '#f43f5e'];

  return (
    <>
      <PageHeader
        title="Overview"
        description="Live operational metrics from Supabase."
        actions={<>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" aria-label="From date" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm" aria-label="To date" />
          <button onClick={refresh} className="rounded-md border border-slate-200 px-3 py-1.5 text-sm">Refresh</button>
        </>}
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Total shops" value={number(summary.totalShops)} icon={Store} />
        <StatCard label="Active subscriptions" value={number(summary.activeSubscriptions)} icon={BadgeIndianRupee} tone="emerald" />
        <StatCard label="Grace period" value={number(summary.graceShops)} icon={Clock3} tone="amber" />
        <StatCard label="Suspended shops" value={number(summary.suspendedShops)} icon={AlertTriangle} tone="rose" />
        <StatCard label="Pending verification" value={number(summary.pendingPayments)} icon={Activity} tone="amber" />
        <StatCard label="Expected monthly revenue" value={money(summary.expectedMrrMinor)} icon={CircleDollarSign} />
        <StatCard label="Active reward customers" value={number(summary.activeRewardCustomers)} icon={Users} tone="emerald" />
        <StatCard label="Active memberships" value={number(summary.activeMemberships)} icon={Users} />
        <StatCard label="Pending sync events" value={number(summary.pendingSyncEvents)} icon={Activity} tone="amber" />
        <StatCard label="Redemptions in period" value={number(summary.redemptionsInPeriod)} icon={Gift} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Panel title="Monthly verified collections">
          <Chart height={240} data={chartData.verifiedCollections ?? []} type="area" x="month" series={[{ key: 'amountMinor', name: 'Amount (paise)', color: '#256feb' }]} />
        </Panel>
        <Panel title="Active vs grace vs suspended">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart><Pie data={statusData} dataKey="value" nameKey="name" outerRadius={80} label>{statusData.map((entry, index) => <Cell key={entry.name} fill={pieColors[index]} />)}</Pie><Tooltip /><Legend /></PieChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="New shop registrations">
          <Chart height={240} data={chartData.newShops ?? []} type="bar" x="month" series={[{ key: 'count', name: 'Shops', color: '#256feb' }]} />
        </Panel>
        <Panel title="Renewals and overdue subscriptions">
          <Chart height={240} data={[chartData.renewalsAndOverdue ?? {}].map((row) => ({ name: 'Subscriptions', ...row }))} type="bar" x="name" series={[{ key: 'dueSoon', name: 'Due soon', color: '#f59e0b' }, { key: 'overdue', name: 'Overdue', color: '#f43f5e' }]} />
        </Panel>
        <Panel title="Customer registrations">
          <Chart height={240} data={chartData.customerRegistrations ?? []} type="area" x="month" series={[{ key: 'count', name: 'Customers', color: '#10b981' }]} />
        </Panel>
        <Panel title="Reward points issued and redeemed">
          <Chart height={240} data={chartData.rewardActivity ?? []} type="bar" x="month" series={[{ key: 'issued', name: 'Issued', color: '#256feb' }, { key: 'redeemed', name: 'Redeemed', color: '#8b5cf6' }]} />
        </Panel>
        <Panel title="Scratch cards issued and revealed">
          <Chart height={240} data={chartData.scratchCards ?? []} type="bar" x="month" series={[{ key: 'issued', name: 'Issued', color: '#f59e0b' }, { key: 'revealed', name: 'Revealed', color: '#10b981' }]} />
        </Panel>
        <Panel title="Recent administrator actions">
          <AlertList rows={alertData.recentAdminActions ?? []} label={(row) => `${row.action} · ${row.entityType}`} time={(row) => row.createdAt} />
        </Panel>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Panel title="Payments awaiting verification"><AlertList rows={alertData.pendingPayments ?? []} label={(row) => `${row.shop} · ${money(row.amountMinor)}`} time={(row) => row.paidAt} /></Panel>
        <Panel title="Grace periods ending soon"><AlertList rows={alertData.graceEndingSoon ?? []} label={(row) => row.shop} time={(row) => row.graceDeadline} /></Panel>
        <Panel title="Shops suspended today"><AlertList rows={alertData.suspendedToday ?? []} label={(row) => `${row.shop} · ${row.reason ?? ''}`} /></Panel>
        <Panel title="Renewals due within 7 days"><AlertList rows={alertData.renewalsDue ?? []} label={(row) => row.shop} time={(row) => row.periodEnd} /></Panel>
        <Panel title="Failed reward synchronization"><AlertList rows={alertData.failedSync ?? []} label={(row) => `${row.shop} · ${row.code ?? ''}`} time={(row) => row.receivedAt} /></Panel>
        <Panel title="Campaigns approaching end date"><AlertList rows={alertData.campaignsEndingSoon ?? []} label={(row) => row.name} time={(row) => row.endsAt} /></Panel>
      </div>
      {!can('payments.verify') && <p className="mt-4 text-xs text-slate-400">Payment verification actions are hidden because your role does not include payments.verify.</p>}
    </>
  );
}

function AlertList({ rows, label, time }: { rows: any[]; label: (row: any) => string; time?: (row: any) => string }) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-slate-400">No alerts.</p>;
  return <ul className="divide-y divide-slate-100">{rows.slice(0, 8).map((row, index) => <li key={row.id ?? index} className="flex items-center justify-between py-2 text-sm"><span className="text-slate-700">{label(row)}</span>{time && <span className="text-xs text-slate-400">{dateTime(time(row))}</span>}</li>)}</ul>;
}

function Chart({ data, type, x, series, height }: { data: any[]; type: 'area' | 'bar'; x: string; series: { key: string; name: string; color: string }[]; height: number }) {
  if (!data.length) return <div className="grid h-60 place-items-center text-sm text-slate-400">No data for this period.</div>;
  const common = <><CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" /><XAxis dataKey={x} tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Legend /></>;
  return (
    <ResponsiveContainer width="100%" height={height}>
      {type === 'area' ? (
        <AreaChart data={data}>{common}{series.map((s) => <Area key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} fill={s.color} fillOpacity={0.12} />)}</AreaChart>
      ) : (
        <BarChart data={data}>{common}{series.map((s) => <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[3, 3, 0, 0]} />)}</BarChart>
      )}
    </ResponsiveContainer>
  );
}

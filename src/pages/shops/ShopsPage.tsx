import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, Plus } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { DataTable, type Column } from '@/components/common/DataTable';
import { Pagination } from '@/components/common/Pagination';
import { StatusBadge } from '@/components/common/StatusBadge';
import { ErrorState } from '@/components/common/Feedback';
import { apiGet, apiSend, apiPaginated } from '@/services/api';
import { useToast } from '@/context/ToastContext';
import { money, dateOnly } from '@/utils/format';
import { PaymentFormDialog } from '@/pages/payments/PaymentFormDialog';

interface ShopRow {
  id: string; shop_code: string; shop_name: string; owner_name: string; phone: string; email?: string;
  registered_at: string; plan_name?: string; monthly_price_minor?: number; current_period_end?: string;
  grace_deadline?: string; payment_status: string; service_status: string; device_status: string; rewards_enabled: boolean;
}

export function ShopsPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [paymentOpen, setPaymentOpen] = useState(false);
  const page = Number(params.get('page') ?? 1);
  const q = params.get('q') ?? '';
  const serviceStatus = params.get('serviceStatus') ?? 'ALL';
  const paymentStatus = params.get('paymentStatus') ?? 'ALL';
  const deviceStatus = params.get('deviceStatus') ?? 'ALL';

  const query = useQuery({
    queryKey: ['shops', q, serviceStatus, paymentStatus, deviceStatus, page],
    queryFn: () => apiPaginated<ShopRow>('/shops', { q, serviceStatus, paymentStatus, deviceStatus, page, pageSize: 25 }),
  });

  const plans = useQuery({ queryKey: ['active-plans'], queryFn: () => apiGet<Array<{ id: string; name: string }>>('/settings/plans') });

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value && value !== 'ALL') next.set(key, value); else next.delete(key);
    next.set('page', '1');
    setParams(next);
  };

  const columns: Column<ShopRow>[] = [
    { key: 'code', header: 'Shop', render: (row) => <div><p className="font-medium text-slate-900">{row.shop_code}</p><p className="text-xs text-slate-500">{row.shop_name}</p></div> },
    { key: 'owner', header: 'Owner', render: (row) => <div><p>{row.owner_name}</p><p className="text-xs text-slate-500">{row.phone}</p></div> },
    { key: 'registered', header: 'Registered', render: (row) => dateOnly(row.registered_at) },
    { key: 'plan', header: 'Plan / rent', render: (row) => <div><p>{row.plan_name ?? '—'}</p><p className="text-xs text-slate-500">{money(row.monthly_price_minor)}</p></div> },
    { key: 'period', header: 'Period end', render: (row) => dateOnly(row.current_period_end) },
    { key: 'grace', header: 'Grace deadline', render: (row) => dateOnly(row.grace_deadline) },
    { key: 'payment', header: 'Payment', render: (row) => <StatusBadge value={row.payment_status} /> },
    { key: 'service', header: 'Service', render: (row) => <StatusBadge value={row.service_status} /> },
    { key: 'device', header: 'Device', render: (row) => <StatusBadge value={row.device_status} /> },
    { key: 'rewards', header: 'Engagement', render: (row) => <StatusBadge value={row.rewards_enabled ? 'ACTIVE' : 'PAUSED'} /> },
    { key: 'actions', header: 'Actions', render: (row) => <button onClick={(event) => { event.stopPropagation(); navigate(`/shops/${row.id}`); }} className="text-brand-600 hover:underline"><Eye className="mr-1 inline h-4 w-4" />View</button> },
  ];

  return (
    <>
      <PageHeader title="Shops" description="Registered shops, billing state and service status from Supabase." actions={<><button onClick={() => setPaymentOpen(true)} className="rounded-md border border-slate-200 px-3 py-1.5 text-sm">Record payment</button><button onClick={() => toast.error('Create shops from Settings → Client Integration using a registration token.')} className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-3 py-1.5 text-sm text-white"><Plus className="h-4 w-4" />Onboard shop</button></>} />
      <div className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5">
        <input value={q} onChange={(e) => setFilter('q', e.target.value)} placeholder="Search code, name, owner or phone" className="rounded-md border border-slate-300 px-3 py-2 text-sm" />
        <select value={serviceStatus} onChange={(e) => setFilter('serviceStatus', e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm"><option value="ALL">All service statuses</option><option>ACTIVE</option><option>GRACE</option><option>SUSPENDED</option><option>CANCELLED</option></select>
        <select value={paymentStatus} onChange={(e) => setFilter('paymentStatus', e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm"><option value="ALL">All payment statuses</option><option>PENDING</option><option>PAID</option><option>OVERDUE</option></select>
        <select value={deviceStatus} onChange={(e) => setFilter('deviceStatus', e.target.value)} className="rounded-md border border-slate-300 px-3 py-2 text-sm"><option value="ALL">All device statuses</option><option value="ACTIVE">Activated</option><option value="NONE">Not activated</option></select>
        <button onClick={() => { void queryClient.invalidateQueries({ queryKey: ['shops'] }); }} className="rounded-md border border-slate-200 px-3 py-2 text-sm">Refresh</button>
      </div>
      {query.error ? <ErrorState message={query.error instanceof Error ? query.error.message : 'Unable to load shops.'} onRetry={() => query.refetch()} /> : (
        <>
          <DataTable columns={columns} rows={query.data?.data ?? []} loading={query.isLoading} onRowClick={(row) => navigate(`/shops/${row.id}`)} />
          <Pagination page={page} totalPages={query.data?.meta.totalPages ?? 1} onChange={(next) => { const p = new URLSearchParams(params); p.set('page', String(next)); setParams(p); }} />
        </>
      )}
      <PaymentFormDialog shopId="" open={paymentOpen} onClose={() => setPaymentOpen(false)} />
      <p className="mt-2 text-xs text-slate-400">Active pricing plans: {plans.data?.length ?? 0}. No price is seeded automatically.</p>
    </>
  );
}

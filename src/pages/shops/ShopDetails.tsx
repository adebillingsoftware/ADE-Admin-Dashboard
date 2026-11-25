import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, CreditCard, PlayCircle, RefreshCcw, RotateCcw } from 'lucide-react';
import { PageHeader } from '@/components/common/PageHeader';
import { Panel, ConfirmDialog, ErrorState, LoadingSkeleton, StatusBadge } from '@/components/common/Feedback';
import { DataTable, type Column } from '@/components/common/DataTable';
import { apiGet, apiSend } from '@/services/api';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';
import { dateTime, dateOnly, money } from '@/utils/format';
import { PaymentFormDialog } from '@/pages/payments/PaymentFormDialog';

interface Detail {
  shop: Record<string, any>; subscription: Record<string, any> | null; devices: any[];
  recentPayments: any[]; recentAudit: any[]; engagement: Record<string, any>;
}

export function ShopDetails() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const [tab, setTab] = useState('overview');
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [action, setAction] = useState<{ kind: 'suspend' | 'reactivate' | 'renew' | 'reset' | 'verify' | 'reject'; id?: string } | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const query = useQuery({ queryKey: ['shop', id], queryFn: () => apiGet<Detail>(`/shops/${id}`) });
  const history = useQuery({ queryKey: ['shop-history', id], queryFn: () => apiGet<any[]>(`/subscriptions/${query.data?.subscription?.id ?? ''}/history`), enabled: Boolean(query.data?.subscription?.id) });

  if (query.isLoading) return <><PageHeader title="Shop details" /><LoadingSkeleton rows={8} /></>;
  if (query.error) return <><PageHeader title="Shop details" /><ErrorState message={query.error instanceof Error ? query.error.message : 'Unable to load shop.'} onRetry={() => query.refetch()} /></>;
  if (!query.data) return null;

  const { shop, subscription, devices, recentPayments, recentAudit, engagement } = query.data;

  const runAction = async () => {
    if (!action) return;
    setBusy(true);
    try {
      if (action.kind === 'verify') await apiSend('post', `/payments/${action.id}/verify`, {});
      else if (action.kind === 'reject') await apiSend('post', `/payments/${action.id}/reject`, { reason });
      else if (action.kind === 'reset') await apiSend('post', `/devices/${action.id}/reset`, { reason });
      else await apiSend('post', `/subscriptions/${subscription?.id}/${action.kind}`, action.kind === 'suspend' ? { reasonCode: 'MANUAL', reason } : { reason: reason || 'Administrator action' });
      toast.success('Action completed successfully.');
      setAction(null); setReason('');
      await queryClient.invalidateQueries({ queryKey: ['shop', id] });
      await queryClient.invalidateQueries({ queryKey: ['shop-history', id] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Action failed.');
    } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title={`${shop.shop_code} — ${shop.shop_name}`} description={`Owner: ${shop.owner_name} · ${shop.phone}`} actions={<>
        {can('payments.record') && <button onClick={() => setPaymentOpen(true)} className="rounded-md border border-slate-200 px-3 py-1.5 text-sm"><CreditCard className="mr-1 inline h-4 w-4" />Record payment</button>}
        {can('subscriptions.manage') && <button onClick={() => setAction({ kind: 'suspend' })} className="rounded-md border border-rose-200 px-3 py-1.5 text-sm text-rose-700"><Ban className="mr-1 inline h-4 w-4" />Stop service</button>}
        {can('subscriptions.manage') && subscription?.status === 'SUSPENDED' && <button onClick={() => setAction({ kind: 'reactivate' })} className="rounded-md bg-brand-600 px-3 py-1.5 text-sm text-white"><PlayCircle className="mr-1 inline h-4 w-4" />Reactivate</button>}
        {can('subscriptions.manage') && <button onClick={() => setAction({ kind: 'renew' })} className="rounded-md border border-slate-200 px-3 py-1.5 text-sm"><RefreshCcw className="mr-1 inline h-4 w-4" />Renew</button>}
      </>} />

      <div className="mb-4 flex flex-wrap gap-2">
        {['overview', 'payments', 'subscription', 'devices', 'engagement', 'audit'].map((item) => (
          <button key={item} onClick={() => setTab(item)} className={`rounded-md px-3 py-1.5 text-sm capitalize ${tab === item ? 'bg-brand-600 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>{item}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Shop information">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Field label="Shop UUID" value={shop.id} /><Field label="Shop code" value={shop.shop_code} /><Field label="Owner" value={shop.owner_name} />
              <Field label="Phone" value={shop.phone} /><Field label="Email" value={shop.email} /><Field label="Address" value={[shop.address_line1, shop.city, shop.state, shop.postal_code].filter(Boolean).join(', ')} />
              <Field label="Registered" value={dateTime(shop.registered_at)} /><Field label="App version" value={shop.app_version} /><Field label="Last licence check" value={dateTime(shop.last_seen_at)} />
            </dl>
          </Panel>
          <Panel title="Subscription">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Field label="Status" value={<StatusBadge value={subscription?.status} />} /><Field label="Plan" value={subscription?.subscription_plans?.name} />
              <Field label="Monthly amount" value={money(subscription?.monthly_price_minor)} /><Field label="Period" value={`${dateOnly(subscription?.current_period_start)} → ${dateOnly(subscription?.current_period_end)}`} />
              <Field label="Grace deadline" value={dateTime(subscription?.grace_deadline)} /><Field label="Suspension reason" value={subscription?.suspension_reason} />
              <Field label="Suspension note" value={subscription?.suspension_note} /><Field label="Suspended at" value={dateTime(subscription?.suspended_at)} />
            </dl>
          </Panel>
          <Panel title="Device">
            {devices.filter((device) => device.status === 'ACTIVE').map((device) => <dl key={device.id} className="grid grid-cols-2 gap-3 text-sm"><Field label="Name" value={device.device_name} /><Field label="Fingerprint" value={device.key_fingerprint} /><Field label="Activated" value={dateTime(device.activated_at)} /><Field label="Last heartbeat" value={dateTime(device.last_seen_at)} /><Field label="Status" value={<StatusBadge value={device.status} />} /></dl>)}
            {!devices.some((device) => device.status === 'ACTIVE') && <p className="text-sm text-slate-500">No active device.</p>}
          </Panel>
          <Panel title="Customer engagement">
            <dl className="grid grid-cols-2 gap-3 text-sm"><Field label="Participation" value={engagement.rewardsEnabled ? 'Enabled' : 'Disabled'} /><Field label="Active programme" value={engagement.activeProgramme?.name} /><Field label="Pending sync events" value={engagement.pendingSync} /><Field label="Failed sync events" value={engagement.failedSync} /></dl>
          </Panel>
        </div>
      )}

      {tab === 'payments' && <Panel title="Recent payments" action={<button onClick={() => setPaymentOpen(true)} className="text-sm text-brand-600">Record payment</button>}>
        <PaymentTable rows={recentPayments} onVerify={(row) => setAction({ kind: 'verify', id: row.id })} onReject={(row) => setAction({ kind: 'reject', id: row.id })} />
      </Panel>}
      {tab === 'subscription' && <Panel title="Billing period history"><PeriodTable rows={history.data ?? []} /></Panel>}
      {tab === 'devices' && <Panel title="Devices"><DeviceTable rows={devices} onReset={(row) => setAction({ kind: 'reset', id: row.id })} /></Panel>}
      {tab === 'engagement' && <Panel title="Reward activity summary"><p className="text-sm text-slate-600">{engagement.pendingSync} pending and {engagement.failedSync} failed synchronization events. Open Customer Engagement pages for ledger and programme configuration.</p></Panel>}
      {tab === 'audit' && <Panel title="Audit history"><AuditTable rows={recentAudit} /></Panel>}

      <PaymentFormDialog shopId={id} shopName={shop.shop_name} open={paymentOpen} onClose={() => setPaymentOpen(false)} />
      <ConfirmDialog
        open={Boolean(action)}
        title={action ? `Confirm ${action.kind}` : ''}
        description={action?.kind === 'verify' ? 'Select the billing period to allocate this payment to. Verification cannot be undone.' : 'This action is recorded in the audit log.'}
        reasonLabel={action?.kind === 'verify' ? 'Verification note' : 'Reason'}
        reasonValue={reason} onReasonChange={setReason}
        confirmLabel="Confirm"
        onConfirm={() => void runAction()}
        onCancel={() => { setAction(null); setReason(''); }}
        busy={busy}
      />
    </>
  );
}

function Field({ label, value }: { label: string; value: unknown }) {
  const display = value === null || value === undefined || value === '' ? '—' : value;
  return <div><dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt><dd className="mt-0.5 text-slate-800">{typeof display === 'string' || typeof display === 'number' ? display : display as React.ReactNode}</dd></div>;
}

function PaymentTable({ rows, onVerify, onReject }: { rows: any[]; onVerify: (row: any) => void; onReject: (row: any) => void }) {
  const columns: Column<any>[] = [
    { key: 'date', header: 'Date', render: (row) => dateTime(row.paid_at) },
    { key: 'amount', header: 'Amount', render: (row) => money(row.amount_minor, row.currency_code) },
    { key: 'method', header: 'Method', render: (row) => row.method.replace('_', ' ') },
    { key: 'ref', header: 'Reference', render: (row) => row.transaction_reference ?? '—' },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge value={row.status} /> },
    { key: 'actions', header: 'Actions', render: (row) => row.status === 'PENDING' ? <div className="flex gap-2"><button onClick={() => onVerify(row)} className="text-emerald-600">Verify</button><button onClick={() => onReject(row)} className="text-rose-600">Reject</button></div> : '—' },
  ];
  return <DataTable columns={columns} rows={rows} emptyMessage="No payments recorded." />;
}

function PeriodTable({ rows }: { rows: any[] }) {
  const columns: Column<any>[] = [
    { key: 'period', header: 'Period', render: (row) => `${dateOnly(row.period_start)} → ${dateOnly(row.period_end)}` },
    { key: 'due', header: 'Due', render: (row) => money(row.amount_due_minor) },
    { key: 'paid', header: 'Paid', render: (row) => money(row.amount_paid_minor) },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge value={row.status} /> },
    { key: 'settled', header: 'Settled', render: (row) => dateTime(row.settled_at) },
  ];
  return <DataTable columns={columns} rows={rows} emptyMessage="No billing periods." />;
}

function DeviceTable({ rows, onReset }: { rows: any[]; onReset: (row: any) => void }) {
  const columns: Column<any>[] = [
    { key: 'name', header: 'Device', render: (row) => row.device_name ?? '—' },
    { key: 'fingerprint', header: 'Fingerprint', render: (row) => row.key_fingerprint },
    { key: 'activated', header: 'Activated', render: (row) => dateTime(row.activated_at) },
    { key: 'heartbeat', header: 'Last heartbeat', render: (row) => dateTime(row.last_seen_at) },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge value={row.status} /> },
    { key: 'action', header: 'Action', render: (row) => row.status === 'ACTIVE' ? <button onClick={() => onReset(row)} className="text-rose-600">Reset</button> : '—' },
  ];
  return <DataTable columns={columns} rows={rows} emptyMessage="No devices activated." />;
}

function AuditTable({ rows }: { rows: any[] }) {
  const columns: Column<any>[] = [
    { key: 'when', header: 'When', render: (row) => dateTime(row.created_at) },
    { key: 'action', header: 'Action', render: (row) => row.action.replace(/_/g, ' ') },
    { key: 'reason', header: 'Reason', render: (row) => row.reason ?? '—' },
  ];
  return <DataTable columns={columns} rows={rows} emptyMessage="No audit records." />;
}

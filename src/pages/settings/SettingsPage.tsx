import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { Panel, ErrorState } from '@/components/common/Feedback';
import { DataTable, type Column } from '@/components/common/DataTable';
import { StatusBadge } from '@/components/common/StatusBadge';
import { apiGet, apiPaginated, apiSend } from '@/services/api';
import { useToast } from '@/context/ToastContext';

const TITLES: Record<string, string> = {
  pricing: 'Monthly pricing',
  business: 'Business details',
  licence: 'Licence policy',
  engagement: 'Customer engagement defaults',
  security: 'Security and retention',
  admins: 'Administrator accounts',
  roles: 'Roles and permissions',
};

export function SettingsPage({ section }: { section: string }) {
  const toast = useToast();
  const client = useQueryClient();
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => apiGet<{ settings: Record<string, unknown>; plans: any[] }>('/settings') });

  if (settings.error) return <><PageHeader title={TITLES[section]} /><ErrorState message={settings.error instanceof Error ? settings.error.message : 'Unable to load settings.'} onRetry={() => void settings.refetch()} /></>;

  const updateSetting = async (key: string, value: unknown, reason: string) => {
    try {
      await apiSend('patch', '/settings', { key, value, reason });
      toast.success('Setting updated.');
      await client.invalidateQueries({ queryKey: ['settings'] });
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to update setting.'); }
  };

  if (section === 'pricing') return <PricingSettings plans={settings.data?.plans ?? []} />;
  if (section === 'admins') return <AdminSettings />;
  if (section === 'roles') return <RolesSettings />;

  const keyMap: Record<string, Array<[string, string]>> = {
    business: [['business.name', 'Business name'], ['business.email', 'Email'], ['business.phone', 'Phone'], ['business.address', 'Address'], ['business.terms_url', 'Terms URL']],
    licence: [['licence.offline_hours', 'Offline lease (hours)'], ['licence.policy_version', 'Policy version'], ['licence.key_version', 'Licence key version']],
    engagement: [['engagement.defaults', 'Engagement defaults (JSON)']],
    security: [['security.retention_days', 'Retention days'], ['security.require_mfa_super_admin', 'Require MFA for SUPER_ADMIN']],
  };
  const keys = keyMap[section] ?? [];
  return (
    <>
      <PageHeader title={TITLES[section]} description="Restricted settings require SUPER_ADMIN and an auditable reason." />
      <div className="grid gap-4 md:grid-cols-2">
        {keys.map(([key, label]) => <SettingCard key={key} settingKey={key} label={label} value={settings.data?.settings?.[key]} onSave={updateSetting} />)}
      </div>
    </>
  );
}

function SettingCard({ settingKey, label, value, onSave }: { settingKey: string; label: string; value: unknown; onSave: (key: string, value: unknown, reason: string) => Promise<void> }) {
  const initial = typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : JSON.stringify(value ?? {});
  const [field, setField] = useState(initial);
  const [reason, setReason] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    let parsed: unknown = field;
    if (typeof value === 'number' || settingKey === 'licence.offline_hours' || settingKey === 'security.retention_days') parsed = Number(field);
    if (typeof value === 'boolean' || settingKey === 'security.require_mfa_super_admin') parsed = field === 'true';
    if (settingKey === 'engagement.defaults') { try { parsed = JSON.parse(field); } catch { return; } }
    void onSave(settingKey, parsed, reason);
  };
  return <Panel title={label}><form onSubmit={submit} className="space-y-3">{settingKey === 'security.require_mfa_super_admin' ? <select value={field} onChange={(e) => setField(e.target.value)} className="w-full rounded-md border border-slate-300 px-3 py-2"><option value="true">true</option><option value="false">false</option></select> : <textarea value={field} onChange={(e) => setField(e.target.value)} rows={3} className="w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-xs" />}<input required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for change" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm" /><button className="rounded-md bg-brand-600 px-4 py-2 text-sm text-white">Save</button></form></Panel>;
}

function PricingSettings({ plans }: { plans: any[] }) {
  const toast = useToast();
  const client = useQueryClient();
  const [name, setName] = useState('');
  const [price, setPrice] = useState(0);
  const create = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await apiSend('post', '/settings/plans', { name, monthlyPriceMinor: price, currencyCode: 'INR', billingInterval: 'MONTHLY', isActive: false });
      toast.success('Plan created.');
      setName(''); setPrice(0);
      await client.invalidateQueries({ queryKey: ['settings'] });
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to create plan.'); }
  };
  const columns: Column<any>[] = [
    { key: 'name', header: 'Plan', render: (row) => row.name },
    { key: 'price', header: 'Monthly price (minor units)', render: (row) => row.monthly_price_minor },
    { key: 'currency', header: 'Currency', render: (row) => row.currency_code },
    { key: 'active', header: 'Status', render: (row) => <StatusBadge value={row.is_active ? 'ACTIVE' : 'INACTIVE'} /> },
  ];
  return <><PageHeader title="Monthly pricing" description="No monthly price is accepted unless it is positive and supplied by a SUPER_ADMIN." /><Panel title="Create plan"><form onSubmit={create} className="grid gap-3 md:grid-cols-3"><input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Plan name" className="rounded border border-slate-300 px-3 py-2" /><input required type="number" min="1" value={price} onChange={(e) => setPrice(Number(e.target.value))} placeholder="Minor units" className="rounded border border-slate-300 px-3 py-2" /><button className="rounded bg-brand-600 px-4 py-2 text-sm text-white">Create inactive plan</button></form></Panel><div className="mt-4"><DataTable columns={columns} rows={plans} emptyMessage="No subscription plans configured." /></div></>;
}

function AdminSettings() {
  const toast = useToast();
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const query = useQuery({ queryKey: ['admins', page], queryFn: () => apiPaginated<any>('/admins', { page, pageSize: 25 }) });
  const columns: Column<any>[] = [
    { key: 'name', header: 'Administrator', render: (row) => <div><p className="font-medium">{row.display_name}</p><p className="text-xs text-slate-500">{row.user_id}</p></div> },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge value={row.status} /> },
  ];
  return <><PageHeader title="Administrator accounts" /><Panel title="Invite administrator"><form onSubmit={async (event) => { event.preventDefault(); try { await apiSend('post', '/admins', { email, displayName, roles: ['READ_ONLY'] }); toast.success('Administrator created.'); setEmail(''); setDisplayName(''); await client.invalidateQueries({ queryKey: ['admins'] }); } catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to create administrator.'); } }} className="grid gap-3 md:grid-cols-3"><input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="rounded border border-slate-300 px-3 py-2" /><input required value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Display name" className="rounded border border-slate-300 px-3 py-2" /><button className="rounded bg-brand-600 px-4 py-2 text-sm text-white">Create READ_ONLY account</button></form></Panel><div className="mt-4"><DataTable columns={columns} rows={query.data?.data ?? []} loading={query.isLoading} emptyMessage="No administrators." /></div></>;
}

function RolesSettings() {
  const query = useQuery({ queryKey: ['roles'], queryFn: () => apiGet<{ roles: any[]; permissions: string[] }>('/roles') });
  const roleColumns: Column<any>[] = [
    { key: 'name', header: 'Role', render: (row) => row.name },
    { key: 'description', header: 'Description', render: (row) => row.description ?? '—' },
  ];
  return <><PageHeader title="Roles and permissions" /><Panel title="Role catalogue"><DataTable columns={roleColumns} rows={query.data?.roles ?? []} loading={query.isLoading} /></Panel><Panel title="Permission catalogue" ><div className="mt-4 grid gap-2 md:grid-cols-2">{(query.data?.permissions ?? []).map((permission) => <code key={permission} className="rounded bg-slate-100 px-2 py-1 text-xs">{permission}</code>)}</div></Panel></>;
}

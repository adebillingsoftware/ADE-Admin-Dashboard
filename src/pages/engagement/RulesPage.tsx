import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { Panel } from '@/components/common/Feedback';
import { DataTable } from '@/components/common/DataTable';
import { StatusBadge } from '@/components/common/StatusBadge';
import { apiGet, apiSend } from '@/services/api';
import { useToast } from '@/context/ToastContext';

export function RulesPage() {
  const [params] = useSearchParams();
  const type = params.get('type') ?? 'POINTS_EARN';
  const toast = useToast();
  const client = useQueryClient();
  const rules = useQuery({ queryKey: ['rules', type], queryFn: () => apiGet<any[]>('/engagement/rules', { ruleType: type }) });
  const programmes = useQuery({ queryKey: ['programmes'], queryFn: () => apiGet<any[]>('/engagement/programmes', { pageSize: 200 }) });
  const [pid, setPid] = useState('');
  const [config, setConfig] = useState('{}');

  const create = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await apiSend('post', '/engagement/rules', { programmeId: pid, ruleType: type, configuration: JSON.parse(config), effectiveFrom: new Date().toISOString() });
      toast.success('Rule version created. Approve before use.');
      await client.invalidateQueries({ queryKey: ['rules'] });
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Invalid JSON.'); }
  };
  const approve = async (id: string) => {
    try {
      await apiSend('post', `/engagement/rules/${id}/approve`, { reason: 'Reviewed and approved' });
      await client.invalidateQueries({ queryKey: ['rules'] });
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Approval failed.'); }
  };

  const columns = [
    { key: 'version', header: 'Version', render: (r: any) => `v${r.version_number}` },
    { key: 'programme', header: 'Programme', render: (r: any) => r.reward_programmes?.name ?? r.programme_id },
    { key: 'status', header: 'Approved', render: (r: any) => <StatusBadge value={r.is_approved ? 'ACTIVE' : 'DRAFT'} /> },
    { key: 'config', header: 'Configuration', render: (r: any) => <code className="text-xs">{JSON.stringify(r.configuration)}</code> },
    { key: 'action', header: 'Action', render: (r: any) => r.is_approved ? 'Immutable' : <button onClick={() => approve(r.id)} className="text-emerald-600">Approve</button> },
  ];

  return (
    <>
      <PageHeader title={`${type.replace(/_/g, ' ')} rules`} description="Values are supplied by an administrator. Nothing is hardcoded or pre-approved." />
      <Panel title="Create rule version">
        <form onSubmit={create} className="grid gap-2 sm:grid-cols-2">
          <select required value={pid} onChange={(e) => setPid(e.target.value)} className="rounded border border-slate-300 px-2 py-2"><option value="">Select programme</option>{(programmes.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <input required value={config} onChange={(e) => setConfig(e.target.value)} className="rounded border border-slate-300 px-2 py-2 font-mono text-xs" />
          <button className="rounded bg-brand-600 px-4 py-2 text-sm text-white sm:col-span-2">Create version</button>
        </form>
      </Panel>
      <div className="mt-4"><DataTable columns={columns} rows={rules.data ?? []} loading={rules.isLoading} emptyMessage="No rule versions for this type." /></div>
    </>
  );
}

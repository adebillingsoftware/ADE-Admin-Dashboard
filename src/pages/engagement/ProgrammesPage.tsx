import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { Panel } from '@/components/common/Feedback';
import { DataTable, type Column } from '@/components/common/DataTable';
import { StatusBadge } from '@/components/common/StatusBadge';
import { apiGet, apiSend } from '@/services/api';
import { useToast } from '@/context/ToastContext';

export function ProgrammesPage() {
  const toast = useToast();
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['programmes'], queryFn: () => apiGet<any[]>('/engagement/programmes', { pageSize: 200 }) });
  const [name, setName] = useState('');

  const create = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await apiSend('post', '/engagement/programmes', { name, termsText: null });
      toast.success('Programme created as DRAFT.');
      setName('');
      await client.invalidateQueries({ queryKey: ['programmes'] });
    } catch (error) { toast.error(String(error)); }
  };

  const setStatus = async (id: string, action: string) => {
    try {
      await apiSend('post', `/engagement/programmes/${id}/${action}`, {});
      await client.invalidateQueries({ queryKey: ['programmes'] });
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Action failed.'); }
  };

  const columns: Column<any>[] = [
    { key: 'name', header: 'Programme', render: (row) => row.name },
    { key: 'scope', header: 'Scope', render: (row) => row.shop_id ? row.shops?.shop_name ?? row.shop_id : 'Global' },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge value={row.status} /> },
    { key: 'actions', header: 'Actions', render: (row) => <div className="flex gap-2"><button onClick={() => setStatus(row.id, 'activate')} className="text-emerald-600">Activate</button><button onClick={() => setStatus(row.id, 'deactivate')} className="text-amber-600">Pause</button></div> },
  ];

  return (
    <>
      <PageHeader title="Reward programmes" description="Programmes stay DRAFT until approved rules exist." />
      <Panel title="Create programme">
        <form onSubmit={create} className="flex gap-2"><input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Programme name" className="rounded-md border border-slate-300 px-3 py-2" /><button className="rounded-md bg-brand-600 px-4 py-2 text-sm text-white">Create</button></form>
      </Panel>
      <div className="mt-4"><DataTable columns={columns} rows={query.data ?? []} loading={query.isLoading} emptyMessage="No programmes configured." /></div>
    </>
  );
}

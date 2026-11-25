import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { Panel, ErrorState } from '@/components/common/Feedback';
import { DataTable, type Column } from '@/components/common/DataTable';
import { StatusBadge } from '@/components/common/StatusBadge';
import { apiGet, apiSend } from '@/services/api';
import { useToast } from '@/context/ToastContext';
import { dateTime } from '@/utils/format';

export function SupportTickets() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['tickets'], queryFn: () => apiGet<any[]>('/customers/tickets') });
  const customers = useQuery({ queryKey: ['customers-for-ticket'], queryFn: () => apiGet<any[]>('/customers', { pageSize: 200 }) });
  const [form, setForm] = useState({ customerId: '', category: 'ACCOUNT', subject: '', description: '' });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await apiSend('post', '/customers/tickets', form);
      toast.success('Support ticket created.');
      setForm({ customerId: '', category: 'ACCOUNT', subject: '', description: '' });
      await queryClient.invalidateQueries({ queryKey: ['tickets'] });
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to create ticket.'); }
  };

  const columns: Column<any>[] = [
    { key: 'subject', header: 'Subject', render: (row) => <div><p className="font-medium">{row.subject}</p><p className="text-xs text-slate-500">{row.customer_profiles?.display_name ?? ''}</p></div> },
    { key: 'category', header: 'Category', render: (row) => row.category },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge value={row.status} /> },
    { key: 'created', header: 'Created', render: (row) => dateTime(row.created_at) },
    { key: 'action', header: 'Action', render: (row) => <button onClick={async () => { await apiSend('patch', `/customers/tickets/${row.id}`, { status: 'RESOLVED' }); await queryClient.invalidateQueries({ queryKey: ['tickets'] }); }} className="text-emerald-600">Resolve</button> },
  ];

  return (
    <>
      <PageHeader title="Customer support" description="Support-only tickets with explicit permission checks." />
      <Panel title="Open a ticket">
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <select required value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2"><option value="">Select customer</option>{(customers.data ?? []).map((customer) => <option key={customer.id} value={customer.id}>{customer.display_name}</option>)}</select>
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="rounded-md border border-slate-300 px-3 py-2"><option>ACCOUNT</option><option>POINTS</option><option>REDEMPTION</option><option>OTHER</option></select>
          <input required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Subject" className="rounded-md border border-slate-300 px-3 py-2" />
          <textarea required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description" className="rounded-md border border-slate-300 px-3 py-2" />
          <button className="rounded-md bg-brand-600 px-4 py-2 text-sm text-white sm:col-span-2">Create ticket</button>
        </form>
      </Panel>
      <div className="mt-4">{query.error ? <ErrorState message="Unable to load tickets." /> : <Panel title="Tickets"><DataTable columns={columns} rows={query.data ?? []} loading={query.isLoading} /></Panel>}</div>
    </>
  );
}

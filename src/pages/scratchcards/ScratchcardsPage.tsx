import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { Panel } from '@/components/common/Feedback';
import { DataTable, type Column } from '@/components/common/DataTable';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Pagination } from '@/components/common/Pagination';
import { apiGet, apiPaginated, apiSend } from '@/services/api';
import { useToast } from '@/context/ToastContext';

export function ScratchcardsPage() {
  const toast = useToast();
  const client = useQueryClient();
  const [tab, setTab] = useState<'campaigns' | 'prizes' | 'cards'>('campaigns');
  const [page, setPage] = useState(1);
  const campaigns = useQuery({ queryKey: ['scratch-campaigns', page], queryFn: () => apiPaginated<any>('/scratchcards/campaigns', { page, pageSize: 25 }) });
  const cards = useQuery({ queryKey: ['scratch-cards', page], queryFn: () => apiPaginated<any>('/scratchcards/cards', { page, pageSize: 25 }), enabled: tab === 'cards' });
  const stats = useQuery({ queryKey: ['scratch-stats'], queryFn: () => apiGet<any>('/scratchcards/statistics') });
  const [name, setName] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');

  const createCampaign = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await apiSend('post', '/scratchcards/campaigns', { name, startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString(), configuration: { issuance: 'CONFIGURED_BY_ADMIN' } });
      toast.success('Campaign created as DRAFT.');
      setName(''); setStartsAt(''); setEndsAt('');
      await client.invalidateQueries({ queryKey: ['scratch-campaigns'] });
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to create campaign.'); }
  };

  const action = async (id: string, actionName: 'approve' | 'activate' | 'pause' | 'end') => {
    try {
      await apiSend('post', `/scratchcards/campaigns/${id}/${actionName}`, actionName === 'approve' ? { reason: 'Prize catalogue reviewed and approved.' } : {});
      toast.success(`Campaign ${actionName} completed.`);
      await client.invalidateQueries({ queryKey: ['scratch-campaigns'] });
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Action failed.'); }
  };

  const campaignColumns: Column<any>[] = [
    { key: 'name', header: 'Campaign', render: (row) => <div><p className="font-medium">{row.name}</p><p className="text-xs text-slate-500">{row.shops?.shop_name ?? 'Global'}</p></div> },
    { key: 'dates', header: 'Dates', render: (row) => `${new Date(row.starts_at).toLocaleDateString()} - ${new Date(row.ends_at).toLocaleDateString()}` },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge value={row.status} /> },
    { key: 'approved', header: 'Approved', render: (row) => row.approved_by ? 'Yes' : 'No' },
    { key: 'actions', header: 'Actions', render: (row) => <div className="flex gap-2 text-xs">
      {row.status === 'DRAFT' && <button className="text-indigo-600" onClick={() => action(row.id, 'approve')}>Approve</button>}
      {row.status !== 'ACTIVE' && row.status !== 'ENDED' && <button className="text-emerald-600" onClick={() => action(row.id, 'activate')}>Activate</button>}
      {row.status === 'ACTIVE' && <button className="text-amber-600" onClick={() => action(row.id, 'pause')}>Pause</button>}
      {row.status !== 'ENDED' && <button className="text-rose-600" onClick={() => action(row.id, 'end')}>End</button>}
    </div> },
  ];
  const cardColumns: Column<any>[] = [
    { key: 'code', header: 'Card', render: (row) => row.card_code_hash ? `${String(row.card_code_hash).slice(0, 12)}…` : row.id },
    { key: 'campaign', header: 'Campaign', render: (row) => row.scratch_card_campaigns?.name ?? row.campaign_id },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge value={row.status} /> },
    { key: 'issued', header: 'Issued', render: (row) => row.issued_at ? new Date(row.issued_at).toLocaleString() : '—' },
  ];

  return (
    <>
      <PageHeader title="Scratch cards" description="Server-assigned outcomes; prize activation requires SUPER_ADMIN approval." />
      <div className="mb-4 grid grid-cols-3 gap-3">
        {[['Issued', stats.data?.issued], ['Revealed', stats.data?.revealed], ['Expired', stats.data?.expired]].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-xl font-semibold">{String(value ?? 0)}</p></div>
        ))}
      </div>
      <div className="mb-4 flex gap-2">{(['campaigns', 'prizes', 'cards'] as const).map((value) => <button key={value} onClick={() => setTab(value)} className={`rounded-md px-3 py-1.5 text-sm ${tab === value ? 'bg-brand-600 text-white' : 'border border-slate-200 bg-white'}`}>{value[0].toUpperCase() + value.slice(1)}</button>)}</div>
      {tab === 'campaigns' && <>
        <Panel title="Create campaign"><form onSubmit={createCampaign} className="grid gap-3 md:grid-cols-3"><input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Campaign name" className="rounded-md border border-slate-300 px-3 py-2" /><input required type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2" /><input required type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2" /><button className="rounded-md bg-brand-600 px-4 py-2 text-sm text-white md:col-span-3">Create DRAFT campaign</button></form></Panel>
        <div className="mt-4"><DataTable columns={campaignColumns} rows={campaigns.data?.data ?? []} loading={campaigns.isLoading} emptyMessage="No scratch-card campaigns." /><Pagination page={page} totalPages={campaigns.data?.meta.totalPages ?? 1} onChange={setPage} /></div>
      </>}
      {tab === 'cards' && <><DataTable columns={cardColumns} rows={cards.data?.data ?? []} loading={cards.isLoading} emptyMessage="No issued cards." /><Pagination page={page} totalPages={cards.data?.meta.totalPages ?? 1} onChange={setPage} /></>}
      {tab === 'prizes' && <PrizeCatalogue campaigns={campaigns.data?.data ?? []} />}
    </>
  );
}

function PrizeCatalogue({ campaigns }: { campaigns: any[] }) {
  const toast = useToast();
  const client = useQueryClient();
  const [campaignId, setCampaignId] = useState('');
  const prizes = useQuery({ queryKey: ['scratch-prizes', campaignId], queryFn: () => apiGet<any[]>(`/scratchcards/campaigns/${campaignId}/prizes`), enabled: Boolean(campaignId) });
  const [name, setName] = useState('');
  const [type, setType] = useState('POINTS');
  const [weight, setWeight] = useState(1);
  const [value, setValue] = useState('{}');
  return (
    <Panel title="Prize catalogue">
      <div className="grid gap-3 md:grid-cols-2"><select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className="rounded-md border border-slate-300 px-3 py-2"><option value="">Select DRAFT campaign</option>{campaigns.filter((c) => c.status === 'DRAFT').map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      {campaignId && <form onSubmit={async (e) => { e.preventDefault(); try { await apiSend('post', '/scratchcards/prizes', { campaignId, name, prizeType: type, prizeValue: JSON.parse(value), probabilityWeight: weight }); toast.success('Prize added.'); setName(''); await client.invalidateQueries({ queryKey: ['scratch-prizes', campaignId] }); } catch (error) { toast.error(error instanceof Error ? error.message : 'Unable to add prize.'); } }} className="mt-4 grid gap-3 md:grid-cols-4"><input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Prize name" className="rounded border border-slate-300 px-3 py-2" /><select value={type} onChange={(e) => setType(e.target.value)} className="rounded border border-slate-300 px-3 py-2"><option>POINTS</option><option>WALLET_CREDIT</option><option>COUPON</option><option>OTHER</option></select><input type="number" min="1" value={weight} onChange={(e) => setWeight(Number(e.target.value))} className="rounded border border-slate-300 px-3 py-2" /><input value={value} onChange={(e) => setValue(e.target.value)} className="rounded border border-slate-300 px-3 py-2 font-mono text-xs" /><button className="rounded bg-brand-600 px-4 py-2 text-sm text-white md:col-span-4">Add prize</button></form>}
      {campaignId && <div className="mt-4"><DataTable columns={[{ key: 'name', header: 'Prize', render: (row) => row.name }, { key: 'type', header: 'Type', render: (row) => row.prize_type }, { key: 'weight', header: 'Weight', render: (row) => row.probability_weight }, { key: 'value', header: 'Value', render: (row) => <code className="text-xs">{JSON.stringify(row.prize_value)}</code> }]} rows={prizes.data ?? []} loading={prizes.isLoading} emptyMessage="No prizes configured." /></div>}
    </Panel>
  );
}

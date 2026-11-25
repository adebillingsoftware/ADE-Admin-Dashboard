import { ChevronLeft, ChevronRight } from 'lucide-react';

export function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) {
  return (
    <div className="flex items-center justify-between py-4 text-sm text-slate-500">
      <span>Page {page} of {totalPages}</span>
      <div className="flex gap-2">
        <button disabled={page <= 1} onClick={() => onChange(page - 1)} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-3 py-1.5 disabled:opacity-40"><ChevronLeft className="h-4 w-4" />Previous</button>
        <button disabled={page >= totalPages} onClick={() => onChange(page + 1)} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-3 py-1.5 disabled:opacity-40">Next<ChevronRight className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

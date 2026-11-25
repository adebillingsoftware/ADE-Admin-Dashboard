import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
}

export function DataTable<T>({ columns, rows, loading, emptyMessage = 'No records found.', onRowClick }: Props<T>) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={`px-4 py-3 ${column.className ?? ''}`}>{column.header}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {loading ? (
            <tr><td colSpan={columns.length} className="px-4 py-16 text-center text-slate-500"><Loader2 className="mx-auto h-6 w-6 animate-spin text-brand-600" /><span className="mt-2 block">Loading records…</span></td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={columns.length} className="px-4 py-16 text-center text-slate-500">{emptyMessage}</td></tr>
          ) : rows.map((row, index) => (
            <tr key={(row as { id?: string }).id ?? index} onClick={() => onRowClick?.(row)} className={onRowClick ? 'cursor-pointer hover:bg-slate-50' : 'hover:bg-slate-50/60'}>
              {columns.map((column) => <td key={column.key} className={`px-4 py-3 align-middle ${column.className ?? ''}`}>{column.render(row)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

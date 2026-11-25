import type { LucideIcon } from 'lucide-react';

export function StatCard({ label, value, hint, icon: Icon, tone = 'brand' }: {
  label: string; value: string | number; hint?: string; icon?: LucideIcon; tone?: 'brand' | 'amber' | 'rose' | 'emerald';
}) {
  const tones = {
    brand: 'bg-brand-50 text-brand-700',
    amber: 'bg-amber-50 text-amber-700',
    rose: 'bg-rose-50 text-rose-700',
    emerald: 'bg-emerald-50 text-emerald-700',
  } as const;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
          {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
        </div>
        {Icon && <span className={`rounded-lg p-2 ${tones[tone]}`}><Icon className="h-5 w-5" /></span>}
      </div>
    </div>
  );
}

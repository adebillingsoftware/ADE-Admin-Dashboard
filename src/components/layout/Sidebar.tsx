import { NavLink } from 'react-router-dom';
import { ChevronDown, Menu, X } from 'lucide-react';
import { NAVIGATION } from '@/config/navigation';
import { useAuth } from '@/context/AuthContext';

export function Sidebar({ open, collapsed, onToggle, onClose }: {
  open: boolean; collapsed: boolean; onToggle: () => void; onClose: () => void;
}) {
  const { can } = useAuth();
  return (
    <aside className={`fixed inset-y-0 left-0 z-30 flex flex-col border-r border-slate-200 bg-white transition-all duration-200 md:static ${open ? 'w-64' : 'w-0 md:w-16'} ${collapsed ? 'md:w-16' : 'md:w-64'}`}>
      <div className="flex h-16 items-center gap-2 border-b border-slate-200 px-4">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-600 text-sm font-bold text-white">ADE</div>
        {(!collapsed || open) && <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">Arthi Digital</p><p className="truncate text-xs text-slate-500">Enterprises Admin</p></div>}
        <button onClick={onClose} className="ml-auto md:hidden" aria-label="Close navigation"><X className="h-5 w-5" /></button>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
        {NAVIGATION.map((group) => {
          const visible = group.items.filter((item) => !item.permission || can(item.permission));
          if (!visible.length) return null;
          return (
            <div key={group.label} className="pb-2">
              {(!collapsed || open) && <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{group.label}</p>}
              {visible.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={onClose}
                  className={({ isActive }) => `flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors ${isActive ? 'bg-brand-50 font-medium text-brand-700' : 'text-slate-600 hover:bg-slate-50'}`}
                  title={item.label}
                >
                  {item.icon && <item.icon className="h-4 w-4 shrink-0" />}
                  {(!collapsed || open) && <span className="truncate">{item.label}</span>}
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>
      <button onClick={onToggle} className="hidden items-center gap-2 border-t border-slate-200 px-4 py-3 text-sm text-slate-500 md:flex">
        <Menu className="h-4 w-4" />{!collapsed && <span>Collapse menu</span>}<ChevronDown className={`ml-auto h-4 w-4 transition-transform ${collapsed ? 'rotate-90' : ''}`} />
      </button>
    </aside>
  );
}

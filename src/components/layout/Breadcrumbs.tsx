import { Link, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

export function Breadcrumbs() {
  const { pathname } = useLocation();
  const parts = pathname.split('/').filter(Boolean);
  return (
    <nav className="mb-4 flex items-center gap-1 text-xs text-slate-500">
      <Link to="/" className="hover:text-brand-600">Admin</Link>
      {parts.map((part, index) => (
        <span key={`${part}-${index}`} className="flex items-center gap-1">
          <ChevronRight className="h-3 w-3" />
          <span className="capitalize">{part.replace(/-/g, ' ')}</span>
        </span>
      ))}
    </nav>
  );
}

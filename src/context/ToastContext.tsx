import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';

type ToastKind = 'success' | 'error';
interface Toast { id: number; kind: ToastKind; message: string }
interface ToastContextValue { success: (message: string) => void; error: (message: string) => void }

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: ToastKind, message: string) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, kind, message }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 5000);
  }, []);
  const value = useMemo(() => ({ success: (m: string) => push('success', m), error: (m: string) => push('error', m) }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-5 right-5 z-50 flex w-80 flex-col gap-2">
        {toasts.map((toast) => (
          <div key={toast.id} className={`flex items-start gap-3 rounded-lg border bg-white p-3 shadow-lg ${toast.kind === 'success' ? 'border-emerald-200' : 'border-rose-200'}`}>
            {toast.kind === 'success' ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" /> : <AlertCircle className="mt-0.5 h-5 w-5 text-rose-600" />}
            <p className="flex-1 text-sm text-slate-700">{toast.message}</p>
            <button onClick={() => setToasts((current) => current.filter((t) => t.id !== toast.id))} aria-label="Dismiss">
              <X className="h-4 w-4 text-slate-400" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider.');
  return context;
}

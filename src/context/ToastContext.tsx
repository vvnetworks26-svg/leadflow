import React, { createContext, useContext, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle, Info, AlertTriangle, XCircle, X } from 'lucide-react';
import { ToastNotification, NotificationType } from '../types';
import { notificationService } from '../services/notifications/notificationService';

// ─── Context ──────────────────────────────────────────────────────────────────

const ToastContext = createContext<null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastNotification[]>([]);

  useEffect(() => {
    const unsub = notificationService.subscribe((n) => {
      setToasts(prev => [n, ...prev].slice(0, 5)); // max 5 visible

      // Auto-dismiss after 5 seconds
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== n.id));
      }, 5000);
    });
    return unsub;
  }, []);

  const dismiss = (id: string) => setToasts(prev => prev.filter(t => t.id !== id));

  return (
    <ToastContext.Provider value={null}>
      {children}
      {/* Toast stack — fixed bottom-left, above most content but below chat widget */}
      <div className="fixed bottom-6 left-6 z-40 space-y-2 pointer-events-none max-w-sm w-full">
        <AnimatePresence>
          {toasts.map(toast => (
            <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

// ─── Single Toast ─────────────────────────────────────────────────────────────

const icons: Record<NotificationType, React.ReactNode> = {
  success: <CheckCircle className="h-4 w-4 text-emerald-600" />,
  info: <Info className="h-4 w-4 text-indigo-600" />,
  warning: <AlertTriangle className="h-4 w-4 text-amber-600" />,
  error: <XCircle className="h-4 w-4 text-red-600" />
};

const styles: Record<NotificationType, string> = {
  success: 'bg-white border-emerald-200 shadow-emerald-50',
  info: 'bg-white border-indigo-200 shadow-indigo-50',
  warning: 'bg-white border-amber-200 shadow-amber-50',
  error: 'bg-white border-red-200 shadow-red-50'
};

function ToastItem({
  toast,
  onDismiss
}: {
  toast: ToastNotification;
  onDismiss: (id: string) => void;
  key?: React.Key;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: -20, scale: 0.96 }}
      transition={{ duration: 0.2 }}
      className={`pointer-events-auto flex items-start space-x-3 border rounded-xl px-4 py-3 shadow-lg ${styles[toast.type]}`}
      role="alert"
      aria-live="polite"
    >
      <div className="flex-shrink-0 mt-0.5">{icons[toast.type]}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-slate-900">{toast.title}</p>
        <p className="text-[11px] text-slate-500 mt-0.5 leading-normal">{toast.message}</p>
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        className="flex-shrink-0 text-slate-400 hover:text-slate-700 transition p-0.5 rounded"
        aria-label="Dismiss notification"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </motion.div>
  );
}

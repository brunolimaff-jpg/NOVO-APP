/**
 * ToastContainer — exibe a fila de toasts no canto inferior direito.
 */
import React from 'react';
import { Toast } from '../hooks/useToast';

const ICONS: Record<Toast['type'], string> = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
  warning: '⚠',
};

const STYLES: Record<Toast['type'], string> = {
  success: 'bg-emerald-600 text-white',
  error: 'bg-red-600 text-white',
  info: 'bg-slate-700 text-white',
  warning: 'bg-amber-500 text-white',
};

interface ToastContainerProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  if (!toasts.length) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-center gap-2.5 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium animate-fade-in max-w-xs ${STYLES[t.type]}`}
        >
          <span className="text-base leading-none font-bold flex-shrink-0">{ICONS[t.type]}</span>
          <span className="flex-1 leading-snug">{t.message}</span>
          <button
            onClick={() => onDismiss(t.id)}
            className="ml-1 opacity-70 hover:opacity-100 transition-opacity text-lg leading-none flex-shrink-0"
            aria-label="Fechar notificação"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
};

export default ToastContainer;

/**
 * useToast — sistema de notificações global leve (sem dependência externa).
 *
 * Uso:
 *   const { toasts, toast } = useToast();
 *   toast.error('Algo falhou');
 *   toast.success('Salvo com sucesso!');
 *   toast.info('Processando...');
 *
 * Renderização: montar <ToastContainer toasts={toasts} /> em App ou ChatInterface.
 */
import { useState, useCallback } from 'react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

export function useToast(duration = 4000) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const add = useCallback(
    (type: ToastType, message: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts(prev => [...prev.slice(-4), { id, type, message }]); // max 5 simultâneos
      setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss, duration],
  );

  const toast = {
    success: (msg: string) => add('success', msg),
    error: (msg: string) => add('error', msg),
    info: (msg: string) => add('info', msg),
    warning: (msg: string) => add('warning', msg),
  };

  return { toasts, toast, dismiss };
}

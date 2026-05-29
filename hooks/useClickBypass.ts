import { useCallback, useRef } from 'react';

/**
 * Detecta N cliques em uma janela de tempo e chama onActivate.
 * Use para mecanismos secretos de bypass (ex.: 5 cliques no logo).
 */
export function useClickBypass(onActivate: () => void, clicks = 5, windowMs = 2000): () => void {
  const timestamps = useRef<number[]>([]);

  return useCallback(() => {
    const now = Date.now();
    timestamps.current = [...timestamps.current, now].filter(t => now - t < windowMs);
    if (timestamps.current.length >= clicks) {
      timestamps.current = [];
      onActivate();
    }
  }, [onActivate, clicks, windowMs]);
}

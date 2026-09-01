/**
 * BRU-162 — observador de long tasks (>100ms) na main thread.
 * Desenho do Planejador: somente timestamp + duration + fase; sem texto,
 * prompt, body, PII ou attribution. Usa o transporte scoutDiag existente
 * (cópia imediata em localStorage + flush batch remoto) — sem beacon, worker
 * ou segundo transporte.
 */
import { scoutDiag } from './diagnosticLog';

const LONG_TASK_THRESHOLD_MS = 100;
const MAX_LONG_TASK_EVENTS = 50;

export interface LongTaskObserverHandle {
  /** Atualiza a fase corrente anexada aos próximos eventos. */
  setPhase: (phase: string) => void;
  /** Desconecta o observer e retorna quantos eventos foram emitidos. */
  stop: () => number;
}

export function isLongTaskObserverSupported(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return (
      typeof window.PerformanceObserver === 'function' &&
      Array.isArray(PerformanceObserver.supportedEntryTypes) &&
      PerformanceObserver.supportedEntryTypes.includes('longtask')
    );
  } catch {
    return false;
  }
}

/** Retorna null quando não suportado — chamador deve seguir sem observer. */
export function startLongTaskObserver(initialPhase = 'waterfall'): LongTaskObserverHandle | null {
  if (!isLongTaskObserverSupported()) return null;
  try {
    let phase = initialPhase;
    let emitted = 0;
    const observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        if (entry.duration < LONG_TASK_THRESHOLD_MS) continue;
        if (emitted >= MAX_LONG_TASK_EVENTS) return;
        emitted += 1;
        scoutDiag.warn('LongTask', 'long_task', {
          phase,
          durationMs: Math.round(entry.duration),
          startedAt: new Date(Date.now() - entry.duration).toISOString(),
        });
      }
    });
    observer.observe({ entryTypes: ['longtask'] });
    return {
      setPhase: next => {
        phase = next;
      },
      stop: () => {
        try {
          observer.disconnect();
        } catch {
          // disconnect de observer já morto — segue
        }
        return emitted;
      },
    };
  } catch {
    return null;
  }
}

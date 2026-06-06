// [FreezeDiag] — telemetria temporária para localizar bloqueio de main thread.
// Esta instrumentação é DIAGNÓSTICA e será removida após identificar a causa.
// Não altera lógica de renderização, não serializa conteúdo bruto, não faz I/O.

const TAGS_ENABLED = true;

export function m(tag: string, detail?: Record<string, unknown>): void {
  if (!TAGS_ENABLED) return;
  try {
    performance.mark(`[FreezeDiag] ${tag}`, { detail: detail ?? {} });
  } catch {
    // mark buffer cheio — ignorar silenciosamente
  }
}

export function installLongTaskObserver(sessionId: string): () => void {
  if (typeof PerformanceObserver === 'undefined') return () => {};
  try {
    const observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        m(`longtask:${Math.round(entry.duration)}ms`, { sessionId });
      }
    });
    observer.observe({ type: 'longtask', buffered: true });
    return () => observer.disconnect();
  } catch {
    return () => {};
  }
}

export function watchdogHeartbeat(sessionId: string): () => void {
  let lastBeat = performance.now();
  let cancelled = false;

  function beat() {
    if (cancelled) return;
    const now = performance.now();
    const gap = now - lastBeat;
    lastBeat = now;
    if (gap > 2000) {
      m(`watchdog:gap:${Math.round(gap)}ms`, { sessionId });
    }
    setTimeout(beat, 1000);
  }

  setTimeout(beat, 1000);
  return () => {
    cancelled = true;
  };
}

let _renderCounts = new Map<string, number>();
export function rc(component: string): number {
  const count = (_renderCounts.get(component) ?? 0) + 1;
  _renderCounts.set(component, count);
  if (count > 20) {
    m(`render-storm:${component}:${count}`);
  }
  return count;
}

export function resetCounters(): void {
  _renderCounts = new Map();
}

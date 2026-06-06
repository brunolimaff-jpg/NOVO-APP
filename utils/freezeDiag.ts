// [FreezeDiag] — console.info() + performance.mark() para diagnóstico de congelamento.
const PFX = '[FreezeDiag]';

export function m(tag: string, detail?: Record<string, unknown>): void {
  const t = Math.round(performance.now());
  const entry = { t, tag, ...(detail ?? {}) };
  try { performance.mark(`${PFX} ${tag}`, { detail: entry }); } catch { /* ok */ }
  console.info(`${PFX} ${tag}`, JSON.stringify(entry));
}

export function mQuiet(tag: string, detail?: Record<string, unknown>): void {
  const t = Math.round(performance.now());
  const entry = { t, tag, ...(detail ?? {}) };
  try { performance.mark(`${PFX} ${tag}`, { detail: entry }); } catch { /* ok */ }
}

export function installLongTaskObserver(): () => void {
  if (typeof PerformanceObserver === 'undefined') return () => {};
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        m(`longtask:${Math.round(entry.duration)}ms`, { d: Math.round(entry.duration) });
      }
    });
    observer.observe({ type: 'longtask', buffered: true });
    return () => observer.disconnect();
  } catch { return () => {}; }
}

export function watchdogHeartbeat(): () => void {
  let lastBeat = performance.now();
  let cancelled = false;
  function beat() {
    if (cancelled) return;
    const now = performance.now();
    const gap = now - lastBeat;
    lastBeat = now;
    if (gap > 2000) m(`watchdog:gap:${Math.round(gap)}ms`);
    setTimeout(beat, 1000);
  }
  setTimeout(beat, 1000);
  return () => { cancelled = true; };
}

let _renderCounts = new Map<string, number>();
export function rc(component: string): number {
  const count = (_renderCounts.get(component) ?? 0) + 1;
  _renderCounts.set(component, count);
  if (count > 20) m(`render-storm:${component}:${count}`);
  return count;
}
export function resetCounters(): void { _renderCounts = new Map(); }

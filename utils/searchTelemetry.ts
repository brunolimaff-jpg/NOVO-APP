import { AsyncLocalStorage } from 'node:async_hooks';
import { scoutDiag } from './diagnosticLog';

interface SearchCall {
  provider: 'gemini' | 'duckduckgo';
  query: string;
  success: boolean;
  durationMs: number;
  timestamp: string;
}

const telemetryStorage = new AsyncLocalStorage<SearchCall[]>();
const MAX = 200;

export function initSearchTelemetry(): void {
  telemetryStorage.enterWith([]);
}

export function trackSearchCall(c: SearchCall): void {
  try {
    const calls = telemetryStorage.getStore();
    if (!calls) return;
    calls.push(c);
    if (calls.length > MAX) calls.shift();
  } catch (e) {
    scoutDiag.warn('SearchTelemetry', 'trackSearchCall falhou', { error: String(e) });
  }
}

export function getSearchTelemetrySnapshot() {
  const calls = telemetryStorage.getStore() || [];
  const by = (p: string) => calls.filter(c => c.provider === p);
  const gemini = by('gemini');
  const ddg = by('duckduckgo');
  return {
    total: calls.length,
    gemini: { count: gemini.length, success: gemini.filter(c => c.success).length },
    duckduckgo: { count: ddg.length, success: ddg.filter(c => c.success).length },
    ddgCallShare: calls.length > 0 ? ddg.length / calls.length : 0,
  };
}

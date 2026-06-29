interface SearchCall {
  provider: 'gemini' | 'duckduckgo';
  query: string;
  success: boolean;
  durationMs: number;
  timestamp: string;
}
const calls: SearchCall[] = [];
const MAX = 200;
export function trackSearchCall(c: SearchCall): void {
  try {
    calls.push(c);
    if (calls.length > MAX) calls.shift();
  } catch {}
}
export function getSearchTelemetrySnapshot() {
  const by = (p: string) => calls.filter(c => c.provider === p);
  const gemini = by('gemini');
  const ddg = by('duckduckgo');
  return {
    total: calls.length,
    gemini: { count: gemini.length, success: gemini.filter(c => c.success).length },
    duckduckgo: { count: ddg.length, success: ddg.filter(c => c.success).length },
    fallbackRate: calls.length > 0 ? ddg.length / calls.length : 0,
  };
}
export function resetSearchTelemetry(): void {
  calls.length = 0;
}

/**
 * BRU-33 — Semântica abort vs timeout (último bloqueador, Planejador
 * 2026-08-09): no browser, o fetch rejeita com DOMException (que NÃO é
 * instanceof Error) — o teste antigo `instanceof Error` não reconhecia o
 * AbortError real e transformava user abort em fallback silencioso. TimeoutError
 * (deadline Gold 120s) NÃO é abort-like → continua caindo em fallback.
 */
export function isAbortLikeError(error: unknown): boolean {
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    return error.name === 'AbortError';
  }
  if (!(error instanceof Error)) return false;
  return error.name === 'AbortError' || error.message?.includes('aborted');
}

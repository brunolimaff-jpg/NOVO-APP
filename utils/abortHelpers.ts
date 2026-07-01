export function isAbortLikeError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === 'AbortError' || error.message?.includes('aborted');
}

/** Combina sinais de abort — usa AbortSignal.any quando disponível. */
export function combineAbortSignals(...signals: AbortSignal[]): AbortSignal {
  if (
    typeof AbortSignal !== 'undefined' &&
    'any' in AbortSignal &&
    typeof AbortSignal.any === 'function'
  ) {
    return AbortSignal.any(signals);
  }

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort();
      return controller.signal;
    }
    signal.addEventListener('abort', onAbort, { once: true });
  }
  return controller.signal;
}

/** Debug session c352f8 — remover após confirmação do fix */
export function agentDebugLog(
  location: string,
  message: string,
  data: Record<string, unknown>,
  hypothesisId: string,
): void {
  // #region agent log
  fetch('http://127.0.0.1:7731/ingest/bc319430-8591-4324-a17b-be99131153b3', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'c352f8' },
    body: JSON.stringify({
      sessionId: 'c352f8',
      location,
      message,
      data,
      hypothesisId,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
}

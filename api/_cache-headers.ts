/**
 * Helper de Cache-Control para API routes GET idempotentes.
 * NÃO usar em rotas POST (gemini, radar-scan, etc.).
 */
export function cacheHeaders(maxAgeSeconds: number): Record<string, string> {
  return {
    'Cache-Control': `public, max-age=${maxAgeSeconds}, s-maxage=${maxAgeSeconds}`,
  };
}

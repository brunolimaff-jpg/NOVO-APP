/**
 * Utilitários compartilhados entre os handlers RAG (api/docs-rag.ts e api/rag.ts).
 */

const PINECONE_INDEX_SECRET_PREFIX_RE = /^pcsk_/i;
const PINECONE_INDEX_NAME_RE = /^[a-z0-9][a-z0-9-]{0,62}$/i;

export function normalizeEnvValue(value?: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

export function resolvePineconeIndexName(
  candidate: string | null | undefined,
  fallbackIndex: string,
): string {
  const normalized = normalizeEnvValue(candidate);

  if (!normalized) return fallbackIndex;
  if (PINECONE_INDEX_SECRET_PREFIX_RE.test(normalized)) return fallbackIndex;
  if (!PINECONE_INDEX_NAME_RE.test(normalized)) return fallbackIndex;

  return normalized;
}

export function resolveOptionalNamespace(
  candidate?: string | null,
  fallback?: string,
): string | undefined {
  return normalizeEnvValue(candidate) ?? fallback;
}

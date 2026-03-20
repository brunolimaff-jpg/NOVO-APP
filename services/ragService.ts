const RAG_FETCH_TIMEOUT_MS = 15000;
const shouldLogRagDebug = import.meta.env?.VITE_VERBOSE_LOGS === 'true';

export interface RagResult {
  context: string;
  failed: boolean;
}

async function fetchRagContext(
  endpoint: string,
  label: string,
  query: string,
  namespace?: string,
): Promise<RagResult> {
  const attempt = async (): Promise<RagResult> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RAG_FETCH_TIMEOUT_MS);

    try {
      const payload = namespace ? { query, namespace } : { query };
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        if (shouldLogRagDebug) {
          console.warn(`[${label}] Server returned ${response.status}`);
        }
        // Retry once on server errors (5xx)
        if (response.status >= 500) throw new Error(`server_error_${response.status}`);
        return { context: '', failed: true };
      }

      const data = await response.json();
      return { context: data.context || '', failed: false };

    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        if (shouldLogRagDebug) {
          console.warn(`[${label}] Timeout de ${RAG_FETCH_TIMEOUT_MS / 1000}s — continuando sem RAG.`);
        }
        return { context: '', failed: true };
      }
      const msg = error instanceof Error ? error.message : 'Unknown error';
      if (shouldLogRagDebug) {
        console.error(`[${label}] Erro ao buscar contexto:`, msg);
      }
      // Re-throw server errors so the outer retry can catch them
      if (msg.startsWith('server_error_')) throw error;
      return { context: '', failed: true };
    } finally {
      clearTimeout(timer);
    }
  };

  // One retry on 5xx errors
  try {
    return await attempt();
  } catch {
    try {
      return await attempt();
    } catch {
      return { context: '', failed: true };
    }
  }
}

export function buscarContextoPinecone(query: string, empresaAlvo?: string): Promise<RagResult> {
  const q = empresaAlvo ? `${empresaAlvo} ${query}` : query;
  return fetchRagContext('/api/rag', 'RAG', q);
}

export function buscarContextoDocsPinecone(query: string, namespace?: string): Promise<RagResult> {
  const label = namespace ? `RAG DOCS:${namespace}` : 'RAG DOCS';
  return fetchRagContext('/api/docs-rag', label, query, namespace);
}

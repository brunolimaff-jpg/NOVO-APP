import { scoutDiag } from '../utils/diagnosticLog';

const RAG_FETCH_TIMEOUT_MS = 15000;
const RAG_QUERY_MAX_CHARS = 9500;


export interface RagResult {
  context: string;
  failed: boolean;
  /** true quando o RAG está desabilitado por reindexação pendente (503 esperado). */
  disabled?: boolean;
}

function normalizeRagQuery(query: string): string {
  const normalized = (query || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= RAG_QUERY_MAX_CHARS) return normalized;
  return normalized.slice(0, RAG_QUERY_MAX_CHARS);
}

async function fetchRagContext(endpoint: string, label: string, query: string, namespace?: string): Promise<RagResult> {
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
        // 503 RAG_DISABLED_PENDING_REINDEX é estado esperado (reindexação
        // pendente): degrada sem retry e sem log de falha inesperada.
        if (response.status === 503) {
          const body = await response.json().catch(() => null);
          if (body?.error === 'RAG_DISABLED_PENDING_REINDEX' || body?.code === 'RAG_DISABLED_PENDING_REINDEX') {
            scoutDiag.info(label, 'RAG desabilitado (reindexação pendente) — modo degradado', { endpoint });
            return { context: '', failed: true, disabled: true };
          }
        }
        scoutDiag.warn(label, 'servidor retornou status não OK', {
          status: response.status,
          endpoint,
        });
        // Retry once on server errors (5xx)
        if (response.status >= 500) throw new Error(`server_error_${response.status}`);
        return { context: '', failed: true };
      }

      const data = await response.json();
      const context = data.context || '';
      if (!context.trim()) {
        return { context: '', failed: true };
      }
      return { context, failed: false };
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        scoutDiag.warn(label, `timeout ${RAG_FETCH_TIMEOUT_MS / 1000}s — continuando sem RAG`, { endpoint });
        return { context: '', failed: true };
      }
      const msg = error instanceof Error ? error.message : 'Unknown error';
      scoutDiag.error(label, 'erro ao buscar contexto RAG', { endpoint, message: msg });
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
  } catch (first: unknown) {
    scoutDiag.warn(label, 'primeira tentativa RAG falhou (5xx), repetindo', {
      endpoint,
      error: first instanceof Error ? first.message : String(first),
    });
    try {
      return await attempt();
    } catch (second: unknown) {
      scoutDiag.error(label, 'RAG falhou após retry', {
        endpoint,
        error: second instanceof Error ? second.message : String(second),
      });
      return { context: '', failed: true };
    }
  }
}

export function buscarContextoPinecone(query: string, empresaAlvo?: string): Promise<RagResult> {
  const q = normalizeRagQuery(empresaAlvo ? `${empresaAlvo} ${query}` : query);
  return fetchRagContext('/api/rag', 'RAG', q);
}

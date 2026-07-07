import { GoogleGenAI } from '@google/genai';
import { Pinecone } from '@pinecone-database/pinecone';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';

const RagRequestSchema = z.object({
  query: z.string().min(1).max(10000),
  namespace: z.string().max(120).optional(),
});

export const config = {
  runtime: 'nodejs',
};
export const maxDuration = 60;

const DEFAULT_PINECONE_INDEX = 'scout-arsenal';
const DEFAULT_PINECONE_DOCS_NAMESPACE = 'senior-erp-docs';
const COMPETITOR_DOCS_NAMESPACE = 'competitor-pdfs';
const DOCS_RAG_SCORE_MIN = 0.6;
const NO_DOCS_SIGNAL =
  '[SEM DOCUMENTAÇÃO ENCONTRADA — NÃO complete com suposições. Informe que não há dados verificados disponíveis.]';
const PINECONE_INDEX_SECRET_PREFIX_RE = /^pcsk_/i;
const PINECONE_INDEX_NAME_RE = /^[a-z0-9][a-z0-9-]{0,62}$/i;
const ALLOWED_DOCS_NAMESPACES = new Set<string>([DEFAULT_PINECONE_DOCS_NAMESPACE, COMPETITOR_DOCS_NAMESPACE]);

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function normalizeEnvValue(value?: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function resolvePineconeIndexName(candidate?: string | null): string {
  const normalized = normalizeEnvValue(candidate);

  if (!normalized) return DEFAULT_PINECONE_INDEX;
  if (PINECONE_INDEX_SECRET_PREFIX_RE.test(normalized)) return DEFAULT_PINECONE_INDEX;
  if (!PINECONE_INDEX_NAME_RE.test(normalized)) return DEFAULT_PINECONE_INDEX;

  return normalized;
}

function resolveOptionalNamespace(candidate?: string | null): string | undefined {
  return normalizeEnvValue(candidate);
}

function formatTextBackedMatch(metadata: Record<string, unknown>): string | null {
  const texto = String(metadata.text || metadata.content || '').trim();
  if (!texto) return null;

  const titulo = metadata.titulo || 'Documento';
  const categoria = metadata.categoria || 'Geral';
  const url = metadata.url || '';
  return `### ${categoria}: ${titulo}\n${texto}\n(Fonte: ${url})`;
}

function isDocsMode(body: unknown): boolean {
  return Boolean(body && typeof body === 'object' && 'namespace' in body);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const parsed = RagRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    }

    const { query, namespace } = parsed.data;
    const docsMode = isDocsMode(req.body);

    if (docsMode) {
      const docsNamespace = resolveOptionalNamespace(namespace);
      if (!docsNamespace || !ALLOWED_DOCS_NAMESPACES.has(docsNamespace)) {
        return res.status(400).json({
          error: 'Invalid namespace',
          allowed: Array.from(ALLOWED_DOCS_NAMESPACES),
        });
      }
    }

    const ai = new GoogleGenAI({ apiKey: getRequiredEnv('GEMINI_API_KEY') });

    const pineconeKey = docsMode
      ? process.env.PINECONE_DOCS_KEY || getRequiredEnv('PINECONE_API_KEY')
      : process.env.PINECONE_API_KEY || process.env.PINECONE_DOCS_KEY;
    if (!pineconeKey) throw new Error('Missing required env var: PINECONE_API_KEY or PINECONE_DOCS_KEY');

    const rawIndexName = docsMode
      ? process.env.PINECONE_DOCS_INDEX || process.env.PINECONE_INDEX
      : process.env.PINECONE_INDEX || process.env.PINECONE_DOCS_INDEX;
    const pineconeIndexName = resolvePineconeIndexName(rawIndexName);
    if (rawIndexName?.trim() && rawIndexName.trim() !== pineconeIndexName) {
      console.warn(
        `[RAG] Invalid Pinecone index env "${rawIndexName}" detected. Falling back to "${pineconeIndexName}".`,
      );
    }
    const pc = new Pinecone({ apiKey: pineconeKey });
    const index = pc.index(pineconeIndexName);
    const globalNamespace = resolveOptionalNamespace(process.env.PINECONE_NAMESPACE);
    const docsNamespace = resolveOptionalNamespace(namespace);
    const queryTarget = docsMode
      ? index.namespace(docsNamespace || DEFAULT_PINECONE_DOCS_NAMESPACE)
      : globalNamespace
        ? index.namespace(globalNamespace)
        : index;

    const embeddingResponse = await ai.models.embedContent({
      model: 'gemini-embedding-001',
      contents: query,
      config: { taskType: 'RETRIEVAL_QUERY' },
    });

    const queryVector = embeddingResponse.embeddings?.[0]?.values;

    if (!queryVector || queryVector.length === 0) {
      return res.status(200).json({ context: docsMode ? NO_DOCS_SIGNAL : '' });
    }

    const results = await queryTarget.query({
      vector: queryVector,
      topK: 8,
      includeMetadata: true,
    });

    if (docsMode) {
      const filtered = (results.matches || []).filter(m => (m.score ?? 0) >= DOCS_RAG_SCORE_MIN);
      const matches = filtered.map(m => m.metadata || {});
      if (filtered.length === 0) {
        return res.status(200).json({ context: NO_DOCS_SIGNAL, matches });
      }

      const context = filtered
        .map(m => formatTextBackedMatch((m.metadata || {}) as Record<string, unknown>))
        .filter((part): part is string => Boolean(part))
        .join('\n\n---\n\n');

      if (!context) {
        return res.status(200).json({ context: NO_DOCS_SIGNAL, matches });
      }

      return res.status(200).json({ context, matches });
    }

    const context = (results.matches || [])
      .filter(m => (m.score ?? 0) > 0.35)
      .map(m => `[Proposta: ${m.metadata?.source}]\n${m.metadata?.text}`)
      .join('\n\n---\n\n');

    return res.status(200).json({ context });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('RAG error:', message);
    return res.status(200).json({ context: '', degraded: true, detail: message });
  }
}

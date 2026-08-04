/**
 * RAG (Pinecone) — DESATIVADO até reindexação autorizada.
 *
 * O índice atual foi populado com `gemini-embedding-001` (3072 dimensões).
 * A migração para embeddings via LiteLLM usa `bedrock/amazon.titan-embed-text-v1`
 * (1536 dimensões) — vetores incompatíveis exigem reindexação completa antes
 * de reativar. Enquanto RAG_ENABLED !== 'true', responde 503 antes de qualquer
 * chamada externa (embeddings ou Pinecone).
 */
import { Pinecone } from '@pinecone-database/pinecone';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';

import { embedViaLiteLLM } from '../utils/llm/embeddings.js';

const RagRequestSchema = z.object({
  query: z.string().min(1).max(10000),
});

export const config = {
  runtime: 'nodejs',
};
export const maxDuration = 60;

const DEFAULT_PINECONE_INDEX = 'scout-arsenal';
const PINECONE_INDEX_SECRET_PREFIX_RE = /^pcsk_/i;
const PINECONE_INDEX_NAME_RE = /^[a-z0-9][a-z0-9-]{0,62}$/i;
const RAG_DISABLED_CODE = 'RAG_DISABLED_PENDING_REINDEX';

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const parsed = RagRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    }

    const { query } = parsed.data;

    // Gate de reindexação: sem RAG_ENABLED=true, nenhuma chamada externa.
    if (process.env.RAG_ENABLED !== 'true') {
      return res.status(503).json({
        context: '',
        error: RAG_DISABLED_CODE,
        code: RAG_DISABLED_CODE,
        retryable: false,
      });
    }

    const pineconeKey = process.env.PINECONE_API_KEY || process.env.PINECONE_DOCS_KEY;
    if (!pineconeKey) {
      throw new Error('Missing required env var: PINECONE_API_KEY or PINECONE_DOCS_KEY');
    }

    const rawIndexName = process.env.PINECONE_INDEX || process.env.PINECONE_DOCS_INDEX;
    const pineconeIndexName = resolvePineconeIndexName(rawIndexName);
    if (rawIndexName?.trim() && rawIndexName.trim() !== pineconeIndexName) {
      console.warn(
        `[RAG] Invalid Pinecone index env "${rawIndexName}" detected. Falling back to "${pineconeIndexName}".`,
      );
    }
    const namespace = resolveOptionalNamespace(process.env.PINECONE_NAMESPACE);
    const pc = new Pinecone({ apiKey: pineconeKey });
    const index = pc.index(pineconeIndexName);
    const queryTarget = namespace ? index.namespace(namespace) : index;

    const embedding = await embedViaLiteLLM([query]);

    const queryVector = embedding.vectors[0];
    if (!queryVector || queryVector.length === 0) {
      return res.status(200).json({ context: '' });
    }

    const results = await queryTarget.query({
      vector: queryVector,
      topK: 8,
      includeMetadata: true,
    });

    const context = results.matches
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

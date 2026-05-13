import { GoogleGenAI } from '@google/genai';
import { Pinecone } from '@pinecone-database/pinecone';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { universalExtract } from './_shared/document-extractor.js';
import type { UniversalExtractResult } from './_shared/document-extractor.js';
import { resolveOptionalNamespace, resolvePineconeIndexName } from './_shared/rag-helpers.js';

const DocsRagRequestSchema = z.object({
  query: z.string().min(1).max(10000),
  namespace: z.string().min(1).max(120).optional(),
});

export const config = {
    runtime: 'nodejs',
};
export const maxDuration = 60;

const DOCS_RAG_SCORE_MIN = 0.60;
// Timeout de extração web (ms). Sobrescrevível via env para tuning em produção.
const EXTRACTION_TIMEOUT_MS = Number(process.env.RAG_EXTRACTION_TIMEOUT_MS) || 5_000;

const DEFAULT_PINECONE_INDEX = 'scout-arsenal';
const DEFAULT_PINECONE_DOCS_NAMESPACE = 'senior-erp-docs';
const COMPETITOR_DOCS_NAMESPACE = 'competitor-pdfs';
const ALLOWED_DOCS_NAMESPACES = new Set<string>([
    DEFAULT_PINECONE_DOCS_NAMESPACE,
    COMPETITOR_DOCS_NAMESPACE,
]);

const NO_DOCS_SIGNAL = '[SEM DOCUMENTAÇÃO ENCONTRADA — NÃO complete com suposições. Informe que não há dados verificados disponíveis.]';

function getRequiredEnv(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`Missing required env var: ${name}`);
    return value;
}

async function extractWithTimeout(url: string, timeoutMs: number): Promise<UniversalExtractResult> {
  try {
    const result = await Promise.race([
      universalExtract({ url }),
      new Promise<UniversalExtractResult>((_, reject) =>
        setTimeout(() => reject(new Error(`Extraction timed out after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
    return result;
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Extraction failed';
    return { text: '', length: 0, error: message };
  }
}

function enrichMatchWithExtraction(
  titulo: string,
  categoria: string,
  url: string,
  texto: string,
  extracted?: UniversalExtractResult,
): string {
  if (extracted?.text && extracted.text.trim().length > 0) {
    const truncated = extracted.text.slice(0, 8000);
    return `### ${categoria}: ${titulo}\n[FONTE VERIFICADA] ${truncated}\n(Fonte: ${url})`;
  }
  if (extracted?.error) {
    return `### ${categoria}: ${titulo}\n[EXTRAÇÃO FALHOU: ${extracted.error} — conteúdo não disponível para esta fonte]\n(Fonte: ${url})`;
  }
  if (!texto.trim() && url) {
    return `### ${categoria}: ${titulo}\n[CONTEÚDO NÃO EXTRAÍDO — apenas URL disponível]\n(Fonte: ${url})`;
  }
  return `### ${categoria}: ${titulo}\n${texto}\n(Fonte: ${url})`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const parsed = DocsRagRequestSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
        }

        const { query, namespace } = parsed.data;

        const ai = new GoogleGenAI({ apiKey: getRequiredEnv('GEMINI_API_KEY') });

        const pineconeKey = process.env.PINECONE_DOCS_KEY || getRequiredEnv('PINECONE_API_KEY');
        const rawIndexName = process.env.PINECONE_DOCS_INDEX || process.env.PINECONE_INDEX;
        const pineconeIndexName = resolvePineconeIndexName(rawIndexName, DEFAULT_PINECONE_INDEX);
        if (rawIndexName?.trim() && rawIndexName.trim() !== pineconeIndexName) {
            console.warn(
                `[Docs RAG] Invalid Pinecone index env "${rawIndexName}" detected. Falling back to "${pineconeIndexName}".`,
            );
        }

        const pc = new Pinecone({ apiKey: pineconeKey });
        const index = pc.index(pineconeIndexName);

        const embeddingResponse = await ai.models.embedContent({
            model: 'gemini-embedding-001',
            contents: query,
            config: { taskType: 'RETRIEVAL_QUERY' }
        });

        const queryVector = embeddingResponse.embeddings?.[0]?.values;

        if (!queryVector || queryVector.length === 0) {
            return res.status(200).json({ context: '' });
        }

        const configuredNamespace = resolveOptionalNamespace(
            process.env.PINECONE_DOCS_NAMESPACE,
            resolveOptionalNamespace(process.env.PINECONE_NAMESPACE, DEFAULT_PINECONE_DOCS_NAMESPACE),
        ) || DEFAULT_PINECONE_DOCS_NAMESPACE;
        const requestedNamespace = resolveOptionalNamespace(namespace);
        const docsNamespace = requestedNamespace || configuredNamespace;
        if (!ALLOWED_DOCS_NAMESPACES.has(docsNamespace)) {
            return res.status(400).json({
                error: 'Invalid namespace',
                allowed: Array.from(ALLOWED_DOCS_NAMESPACES),
            });
        }
        const results = await index.namespace(docsNamespace).query({
            vector: queryVector,
            topK: 5,
            includeMetadata: true
        });

        if (!results.matches || results.matches.length === 0) {
            return res.status(200).json({ context: NO_DOCS_SIGNAL });
        }

        const filtered = results.matches.filter(m => (m.score ?? 0) > DOCS_RAG_SCORE_MIN);

        if (filtered.length === 0) {
            return res.status(200).json({
                context: NO_DOCS_SIGNAL,
                matches: results.matches.map(m => m.metadata),
            });
        }

        let extractedCount = 0;
        let extractionFailures = 0;
        const contextParts: string[] = [];

        for (const m of filtered) {
            const titulo = String(m.metadata?.titulo ?? 'Documento');
            const categoria = String(m.metadata?.categoria ?? 'Geral');
            const url = String(m.metadata?.url ?? '');
            const texto = String(m.metadata?.text || m.metadata?.content || '');

            let extracted: UniversalExtractResult | undefined;
            if (!texto.trim() && url) {
                try {
                    extracted = await extractWithTimeout(url, EXTRACTION_TIMEOUT_MS);
                    if (extracted.text && extracted.text.trim().length > 0) {
                        extractedCount++;
                    } else {
                        extractionFailures++;
                        console.warn(`[Docs RAG] Extração falhou para "${titulo}" (${url}): ${extracted.error ?? 'sem conteúdo'}`);
                    }
                } catch {
                    extractionFailures++;
                }
            }

            contextParts.push(enrichMatchWithExtraction(titulo, categoria, url, texto, extracted));
        }

        const context = contextParts.join('\n\n---\n\n');

        const extractionStats = extractedCount + extractionFailures > 0
            ? { totalFiltered: filtered.length, extractionsAttempted: extractedCount + extractionFailures, extractionsSucceeded: extractedCount, extractionsFailed: extractionFailures }
            : undefined;

        return res.status(200).json({
            context,
            matches: results.matches.map(m => m.metadata),
            ...(extractionStats ? { extractionStats } : {}),
        });

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('Docs RAG error:', message);
        return res.status(200).json({ context: '', degraded: true, detail: message });
    }
}

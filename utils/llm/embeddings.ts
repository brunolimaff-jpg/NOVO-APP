/**
 * Adaptador server-side de embeddings via LiteLLM.
 *
 * Único caminho de embeddings do projeto (produção e scripts). O endpoint é
 * derivado com segurança de LITELLM_BASE_URL — aceita com ou sem sufixo /v1
 * e produz exatamente {base}/v1/embeddings, nunca /v1/v1/embeddings.
 *
 * Nunca loga chave, conteúdo integral ou vetor completo — apenas modelo,
 * quantidade de vetores e dimensão retornada.
 */

type Environment = Record<string, string | undefined>;

export const EMBEDDINGS_MODEL_ID = 'bedrock/amazon.titan-embed-text-v1';

export function resolveLiteLLMEmbeddingsUrl(baseUrl: string): string {
  const trimmed = (baseUrl || '').trim().replace(/\/+$/, '');
  if (!trimmed) throw new Error('LITELLM_BASE_URL é obrigatório para embeddings');
  const root = /\/v1$/i.test(trimmed) ? trimmed : `${trimmed}/v1`;
  return `${root}/embeddings`;
}

export interface LiteLLMEmbeddingResult {
  model: string;
  dimension: number;
  vectors: number[][];
  usage?: {
    prompt_tokens?: number;
    total_tokens?: number;
  };
}

export interface EmbedViaLiteLLMOptions {
  model?: string;
  timeoutMs?: number;
  env?: Environment;
}

export async function embedViaLiteLLM(
  texts: string[],
  options: EmbedViaLiteLLMOptions = {},
): Promise<LiteLLMEmbeddingResult> {
  const env = options.env ?? process.env;
  const baseUrl = env.LITELLM_BASE_URL?.replace(/\/+$/, '');
  const apiKey = env.LITELLM_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error('LITELLM_BASE_URL e LITELLM_API_KEY são obrigatórios para embeddings');
  }

  const model = options.model ?? EMBEDDINGS_MODEL_ID;
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 30_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(resolveLiteLLMEmbeddingsUrl(baseUrl), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, input: texts }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`LiteLLM embeddings HTTP ${response.status}: ${body.slice(0, 200) || response.statusText}`);
    }

    const data = (await response.json()) as {
      data?: Array<{ embedding?: number[] }>;
      usage?: { prompt_tokens?: number; total_tokens?: number };
    };
    const vectors = (data.data ?? [])
      .map(item => item.embedding ?? [])
      .filter(embedding => embedding.length > 0);

    if (vectors.length === 0) {
      throw new Error('LiteLLM embeddings retornou zero vetores');
    }

    const dimension = vectors[0].length;

    // Log sanitizado: modelo e dimensão, sem vetor integral nem conteúdo.
    console.log('[LiteLLM:embeddings] ok', {
      model,
      vectorCount: vectors.length,
      dimension,
      usage: data.usage,
    });

    return { model, dimension, vectors, usage: data.usage };
  } finally {
    clearTimeout(timer);
  }
}

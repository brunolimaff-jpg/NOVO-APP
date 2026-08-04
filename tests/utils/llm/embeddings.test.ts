/**
 * Adaptador de embeddings via LiteLLM — normalização de endpoint e contrato.
 */
import { describe, expect, it } from 'vitest';
import { resolveLiteLLMEmbeddingsUrl, EMBEDDINGS_MODEL_ID } from '../../../utils/llm/embeddings';

describe('resolveLiteLLMEmbeddingsUrl', () => {
  it('aceita base sem sufixo /v1 e produz {base}/v1/embeddings', () => {
    expect(resolveLiteLLMEmbeddingsUrl('https://gateway.example')).toBe(
      'https://gateway.example/v1/embeddings',
    );
    expect(resolveLiteLLMEmbeddingsUrl('https://gateway.example/')).toBe(
      'https://gateway.example/v1/embeddings',
    );
  });

  it('aceita base com sufixo /v1 sem duplicar (/v1/v1 nunca acontece)', () => {
    expect(resolveLiteLLMEmbeddingsUrl('https://gateway.example/v1')).toBe(
      'https://gateway.example/v1/embeddings',
    );
    expect(resolveLiteLLMEmbeddingsUrl('https://gateway.example/v1/')).toBe(
      'https://gateway.example/v1/embeddings',
    );
  });

  it('normaliza barras finais e preserva o resto do path', () => {
    expect(resolveLiteLLMEmbeddingsUrl('https://gateway.example/llm/v1//')).toBe(
      'https://gateway.example/llm/v1/embeddings',
    );
  });

  it('lança quando a base está vazia', () => {
    expect(() => resolveLiteLLMEmbeddingsUrl('')).toThrow(/LITELLM_BASE_URL/);
    expect(() => resolveLiteLLMEmbeddingsUrl('   ')).toThrow(/LITELLM_BASE_URL/);
  });
});

describe('EMBEDDINGS_MODEL_ID', () => {
  it('usa o modelo de embeddings disponível no gateway', () => {
    expect(EMBEDDINGS_MODEL_ID).toBe('bedrock/amazon.titan-embed-text-v1');
  });
});

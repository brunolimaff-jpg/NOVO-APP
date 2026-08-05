/**
 * OCR de PDF — fail-closed (LiteLLM-only, sem modelo de visão no gateway).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('ingestPdfDocs OCR fail-closed', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('PINECONE_DOCS_KEY', 'pcsk-teste');
    vi.stubEnv('PINECONE_API_KEY', 'pcsk-teste');
  });

  it('extractPdfOcrFailClosed falha explicitamente com OCR_PROVIDER_UNAVAILABLE', async () => {
    const { extractPdfOcrFailClosed } = await import('../../scripts/ingestPdfDocs');
    const buffer = Buffer.from('%PDF-1.4 teste');

    await expect(extractPdfOcrFailClosed(buffer, 'doc-teste.pdf')).rejects.toThrow(
      /OCR_PROVIDER_UNAVAILABLE/,
    );
  });

  it('extractPdfOcrFailClosed nunca faz chamada de rede', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { extractPdfOcrFailClosed } = await import('../../scripts/ingestPdfDocs');

    await expect(extractPdfOcrFailClosed(Buffer.from('x'), 'doc.pdf')).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

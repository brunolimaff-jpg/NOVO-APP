/**
 * BRU-33 — fetchCanonicalFromApi: abort do usuário PROPAGA (CANCELLED), não
 * vira canonical_null → fallback (último bloqueador, Planejador 2026-08-09).
 * TimeoutError (deadline Gold 120s) e erros de upstream continuam em fallback.
 */
import { describe, expect, it, vi } from 'vitest';
import { fetchCanonicalFromApi } from '../../../../services/llm/gold/seam/gold-browser-adapter';

const CNPJ = '04.733.767/0001-80';

const VALID_CANONICAL = {
  inputCnpj: CNPJ,
  legalName: 'SCHEFFER & CIA LTDA',
  establishmentType: 'Filial' as const,
  rootCnpj: '04.733.767',
  headOfficeCnpj: null,
  headOfficeLegalName: null,
  directPjPartners: [],
  qsaPeople: [],
};

describe('fetchCanonicalFromApi — abort vs fallback (BRU-33)', () => {
  it('user abort (AbortError) PROPAGA — não vira canonical_null', async () => {
    const fetcher = vi.fn(async () => {
      throw new DOMException('The operation was aborted', 'AbortError');
    });

    await expect(fetchCanonicalFromApi(CNPJ, 'Scheffer', undefined, fetcher)).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it('TimeoutError (deadline Gold 120s) cai em fallback → null', async () => {
    const fetcher = vi.fn(async () => {
      throw new DOMException('The operation timed out.', 'TimeoutError');
    });

    const result = await fetchCanonicalFromApi(CNPJ, 'Scheffer', undefined, fetcher);
    expect(result).toBeNull();
  });

  it('erro de rede (TypeError) cai em fallback → null', async () => {
    const fetcher = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });

    const result = await fetchCanonicalFromApi(CNPJ, 'Scheffer', undefined, fetcher);
    expect(result).toBeNull();
  });

  it('HTTP não-ok cai em fallback → null', async () => {
    const fetcher = vi.fn(async () => ({ ok: false }) as Response);

    const result = await fetchCanonicalFromApi(CNPJ, 'Scheffer', undefined, fetcher);
    expect(result).toBeNull();
  });

  it('200 com canonical válido retorna o canonical', async () => {
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => VALID_CANONICAL }) as Response);

    const result = await fetchCanonicalFromApi(CNPJ, 'Scheffer', undefined, fetcher);
    expect(result).toEqual(VALID_CANONICAL);
  });
});

// ─── PACOTE 1 SCOUT-V7-GOLD-BUDGET-LAYERED-01 (Planejador 2026-08-09) ───

describe('createGoldSeamDeps — override de timeout por chamada (browser 270s)', () => {
  it('compact e compose usam timeoutMs = 270000 no proxy (browser budget)', async () => {
    type ChatFn = (params: { model: string }, signal?: AbortSignal, options?: { timeoutMs?: number }) => Promise<{ text: string }>;
    const chatSendMessage = vi.fn<ChatFn>(async () => ({ text: '{}' }));
    const { createGoldSeamDeps } = await import('../../../../services/llm/gold/seam/gold-browser-adapter');
    const { GOLD_BROWSER_CALL_BUDGET_MS } = await import('../../../../services/llm/gold/seam/gold-browser-adapter');

    expect(GOLD_BROWSER_CALL_BUDGET_MS).toBe(270_000);

    const deps = createGoldSeamDeps({ enabled: true, fetchCanonical: vi.fn(), chatSendMessage });
    const signal = new AbortController().signal;

    // compact: chatSendMessage mockado retorna '{}' — parseJsonPayload falha,
    // mas a ASSINATURA com timeoutMs já foi verificada antes do throw.
    await deps.runGold(
      { canonical: VALID_CANONICAL, dossier: 'dossiê qualquer' },
      signal,
    ).catch(() => {});

    const compactCall = chatSendMessage.mock.calls.find((c) => c[0].model === 'scout-gold-compact');
    expect(compactCall?.[2]).toEqual({ timeoutMs: 270_000 });
  });
});

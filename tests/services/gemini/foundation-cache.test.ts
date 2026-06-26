import { beforeEach, describe, expect, it, vi } from 'vitest';

const proxyCreateCachedContentMock = vi.hoisted(() => vi.fn());
const proxyDeleteCachedContentMock = vi.hoisted(() => vi.fn());
const scoutDiagMock = vi.hoisted(() => ({
  warn: vi.fn(),
  info: vi.fn(),
}));

vi.mock('../../../services/llmProxy', () => ({
  proxyCreateCachedContent: proxyCreateCachedContentMock,
  proxyDeleteCachedContent: proxyDeleteCachedContentMock,
}));

vi.mock('../../../utils/diagnosticLog', () => ({
  scoutDiag: scoutDiagMock,
}));

import {
  buildCachedSystemInstruction,
  buildDynamicDossierContext,
  buildStaticDossierContext,
  createWaterfallFoundationCache,
  deleteWaterfallFoundationCache,
  joinDossierExtraContext,
  WATERFALL_FOUNDATION_CACHE_TTL,
  WATERFALL_FOUNDATION_CACHE_TOOLS,
} from '../../../services/llm/foundation-cache';

describe('foundation-cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    proxyCreateCachedContentMock.mockResolvedValue({
      name: 'cachedContents/test-cache',
      expireTime: '2026-05-26T12:10:00Z',
    });
    proxyDeleteCachedContentMock.mockResolvedValue({ ok: true });
  });

  it('monta contexto estático do dossiê na ordem esperada', () => {
    const result = buildStaticDossierContext({
      dossierSeedContext: 'seed',
      waterfallLookupContext: 'lookup',
      seniorEvidenceContext: 'senior',
      teiaResearchText: 'teia',
    });

    expect(result).toBe('seed\n\nlookup\n\nsenior\n\nteia');
  });

  it('combina foundation com contexto estático para systemInstruction cacheável', () => {
    expect(buildCachedSystemInstruction('foundation', 'static')).toBe('foundation\n\nstatic');
    expect(buildCachedSystemInstruction('foundation', '   ')).toBe('foundation');
  });

  it('separa contexto dinâmico com hint e janela de acumulado', () => {
    const accumulated = `${'x'.repeat(13000)}ultimo-bloco`;
    const dynamic = buildDynamicDossierContext('refinar PORTA', accumulated, 12000);

    expect(dynamic).toContain('Objetivo desta passada:\nrefinar PORTA');
    expect(dynamic).toContain('ultimo-bloco');
    expect(dynamic).not.toContain('x'.repeat(13000));
  });

  it('junta contexto estático e dinâmico quando cache está desligado', () => {
    expect(joinDossierExtraContext('static', 'dynamic')).toBe('static\n\ndynamic');
  });

  it('cria cache explicito com TTL de 600s', async () => {
    const cacheName = await createWaterfallFoundationCache({
      foundationBlock: 'foundation',
      staticContext: 'static',
    });

    expect(cacheName).toBe('cachedContents/test-cache');
    expect(proxyCreateCachedContentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        systemInstruction: 'foundation\n\nstatic',
        ttl: WATERFALL_FOUNDATION_CACHE_TTL,
        displayName: 'scout360-waterfall-foundation',
        tools: [...WATERFALL_FOUNDATION_CACHE_TOOLS],
      }),
      undefined,
    );
  });

  it('remove cache best-effort sem propagar erro', async () => {
    proxyDeleteCachedContentMock.mockRejectedValueOnce(new Error('delete failed'));

    await expect(deleteWaterfallFoundationCache('cachedContents/test-cache')).resolves.toBeUndefined();
    expect(scoutDiagMock.warn).toHaveBeenCalled();
  });
});

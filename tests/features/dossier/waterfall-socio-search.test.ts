import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SocietaryCompanyInput } from '../../../features/dossier/societaryGraph.types';
import {
  buildSocioSearchPromptBlock,
  buildWaterfallSocioSearchContext,
  formatSocioSearchPartnerBlock,
  WATERFALL_SOCIO_SEARCH_AGGREGATE_CAP_MS,
} from '../../../features/dossier/waterfall-socio-search';

const scoutDiagMock = vi.hoisted(() => ({
  warn: vi.fn(),
  info: vi.fn(),
}));

vi.mock('../../../utils/diagnosticLog', () => ({
  scoutDiag: scoutDiagMock,
}));

const sampleCompany = (overrides: Partial<SocietaryCompanyInput> = {}): SocietaryCompanyInput => ({
  name: 'Scheffer & Cia Ltda',
  cnpj: '04733767000180',
  partnerName: 'Guilherme Scheffer',
  sourceUrl: 'https://example.com',
  sourceTitle: 'Fonte',
  snippet: 'Resumo',
  confidence: 'strong',
  evidenceType: 'registry',
  relationshipScope: 'group_link',
  ...overrides,
});

describe('waterfall-socio-search', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('formatSocioSearchPartnerBlock', () => {
    it('formata inventário lateral com CNPJ e escopo', () => {
      const block = formatSocioSearchPartnerBlock('Guilherme Scheffer', [sampleCompany()]);

      expect(block).toContain('Sócio: Guilherme Scheffer');
      expect(block).toContain('Scheffer & Cia Ltda');
      expect(block).toContain('CNPJ: 04.733.767/0001-80');
      expect(block).toContain('Escopo: Empresa do grupo');
      expect(block).toContain('Confiança: strong');
    });

    it('marca bloco degradado quando não há empresas', () => {
      const block = formatSocioSearchPartnerBlock('Maria Acme', [], { degraded: true });
      expect(block).toContain('busca degradada');
    });
  });

  describe('buildSocioSearchPromptBlock', () => {
    it('monta bloco TEIA SOCIO-SEARCH com instrução de evidência', () => {
      const block = buildSocioSearchPromptBlock([{ partnerName: 'Guilherme Scheffer', companies: [sampleCompany()] }]);

      expect(block).toContain('[TEIA SOCIO-SEARCH]');
      expect(block).toContain('evidência estruturada');
      expect(block).toContain('Guilherme Scheffer');
    });
  });

  describe('buildWaterfallSocioSearchContext', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('agrega resultados por sócio e descobre CNPJs válidos', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          companies: [sampleCompany()],
          degraded: false,
        }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const result = await buildWaterfallSocioSearchContext({
        partners: [{ name: 'Guilherme Scheffer' }, { name: 'Maria Acme' }],
        rootCompanyName: 'Scheffer & Cia Ltda',
        rootCnpj: '04733767000180',
        operatorId: 'operator-test',
        signal: new AbortController().signal,
      });

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(result.partnersSearched).toBe(2);
      expect(result.companiesFound).toBe(2);
      expect(result.discoveredCnpjs).toEqual(['04733767000180']);
      expect(result.text).toContain('[TEIA SOCIO-SEARCH]');
      expect(result.text).toContain('Maria Acme');
    });

    it('retorna vazio quando não há sócios', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      const result = await buildWaterfallSocioSearchContext({
        partners: [],
        rootCompanyName: 'Acme Agro',
        signal: new AbortController().signal,
      });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.text).toBe('');
      expect(result.partnersSearched).toBe(0);
    });

    it('propaga abort sem degradar silenciosamente', async () => {
      const controller = new AbortController();
      controller.abort();
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('The operation was aborted', 'AbortError')));

      await expect(
        buildWaterfallSocioSearchContext({
          partners: [{ name: 'Guilherme Scheffer' }],
          rootCompanyName: 'Scheffer & Cia Ltda',
          signal: controller.signal,
        }),
      ).rejects.toMatchObject({ name: 'AbortError' });
    });

    it('registra scoutDiag.warn em HTTP não-OK', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({}),
      });
      vi.stubGlobal('fetch', fetchMock);

      const result = await buildWaterfallSocioSearchContext({
        partners: [{ name: 'Guilherme Scheffer' }],
        rootCompanyName: 'Scheffer & Cia Ltda',
        signal: new AbortController().signal,
      });

      expect(result.degraded).toBe(true);
      expect(scoutDiagMock.warn).toHaveBeenCalledWith(
        'TeiaSocietaria',
        'socio-search waterfall HTTP não-OK',
        expect.objectContaining({
          partnerName: 'Guilherme Scheffer',
          status: 503,
          rootCompanyName: 'Scheffer & Cia Ltda',
        }),
      );
    });

    it('interrompe lotes restantes ao atingir cap agregado', async () => {
      let nowCalls = 0;
      vi.spyOn(Date, 'now').mockImplementation(() => {
        nowCalls += 1;
        // 1: startedAt, 2: cap check lote 0, 3: cap check lote 1 → excede
        if (nowCalls <= 2) return 0;
        return WATERFALL_SOCIO_SEARCH_AGGREGATE_CAP_MS + 1;
      });

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ companies: [], degraded: false }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const result = await buildWaterfallSocioSearchContext({
        partners: [{ name: 'Sócio A' }, { name: 'Sócio B' }, { name: 'Sócio C' }, { name: 'Sócio D' }],
        rootCompanyName: 'Acme Agro Ltda',
        signal: new AbortController().signal,
      });

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(result.degraded).toBe(true);
      expect(result.partnersSearched).toBe(4);
      expect(result.text).toContain('Sócio C');
      expect(result.text).toContain('busca degradada');
      expect(scoutDiagMock.warn).toHaveBeenCalledWith(
        'TeiaSocietaria',
        'socio-search waterfall interrompido por cap agregado',
        expect.objectContaining({
          capMs: WATERFALL_SOCIO_SEARCH_AGGREGATE_CAP_MS,
          partnersSkipped: 2,
          partnersCompleted: 2,
        }),
      );
    });
  });
});

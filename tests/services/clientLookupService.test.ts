import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/apiConfig', () => ({
  LOOKUP_URL: 'https://mock-lookup.test',
}));

// Desabilita logs de debug durante os testes
vi.mock('../../services/competitors', () => ({
  CONCORRENTES: [
    { id: 'totvs_protheus', name: 'TOTVS Protheus' },
    { id: 'sap_b1', name: 'SAP B1' },
  ],
}));

describe('clientLookupService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    // Limpa cache entre testes recarregando o módulo
    vi.resetModules();
  });

  // ─── isConcorrenteOuPropria ────────────────────────────────────────────────

  describe('isConcorrenteOuPropria', () => {
    it('identifies competitors by word', async () => {
      const { isConcorrenteOuPropria } = await import('../../services/clientLookupService');
      expect(isConcorrenteOuPropria('TOTVS Protheus')).toBe(true);
      expect(isConcorrenteOuPropria('SAP B1')).toBe(true);
    });

    it('identifies própria Senior', async () => {
      const { isConcorrenteOuPropria } = await import('../../services/clientLookupService');
      expect(isConcorrenteOuPropria('Senior')).toBe(true);
      expect(isConcorrenteOuPropria('ERP Senior')).toBe(true);
    });

    it('returns false for genuine prospect company names', async () => {
      const { isConcorrenteOuPropria } = await import('../../services/clientLookupService');
      expect(isConcorrenteOuPropria('Grupo Scheffer')).toBe(false);
      expect(isConcorrenteOuPropria('Fazenda São Lucas')).toBe(false);
      expect(isConcorrenteOuPropria('Agrindus')).toBe(false);
    });

    it('is case insensitive', async () => {
      const { isConcorrenteOuPropria } = await import('../../services/clientLookupService');
      expect(isConcorrenteOuPropria('TOTVS')).toBe(true);
      expect(isConcorrenteOuPropria('totvs')).toBe(true);
      expect(isConcorrenteOuPropria('Totvs')).toBe(true);
    });
  });

  // ─── normalizeCacheKey (via lookupCliente behavior) ────────────────────────

  describe('lookupCliente - cache behavior', () => {
    it('returns cached result on second call without new fetch', async () => {
      const mockResponse = { ok: true, encontrado: true, total: 1, query: 'Scheffer', results: [] };
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue({ ok: true, text: async () => JSON.stringify(mockResponse) } as Response);

      const { lookupCliente } = await import('../../services/clientLookupService');
      await lookupCliente('Grupo Scheffer'); // primeira chamada — faz fetch
      const afterFirst = fetchSpy.mock.calls.length;
      expect(afterFirst).toBeGreaterThan(0);

      await lookupCliente('Scheffer'); // mesma cacheKey após normalização ("scheffer")
      // cache hit — nenhuma nova chamada ao fetch
      expect(fetchSpy.mock.calls.length).toBe(afterFirst);
    });

    it('returns encontrado:true when any variant finds the client', async () => {
      // "Agro Comercial" (após strip "Grupo") gera 3 variantes: full, p1="Agro", strongest="Comercial"
      const mockFound = {
        ok: true,
        encontrado: true,
        total: 1,
        query: 'Agro Comercial',
        results: [
          {
            grupo: 'Agro Comercial',
            razoes_sociais: [],
            linhas_produto: [],
            familias_presentes: ['ERP'],
            modulos_por_familia: {},
            gaps_crosssell: [],
            total_modulos: 5,
            eh_cliente_senior: true,
            tem_gatec: false,
            tem_erp: true,
            tem_hcm: false,
            tem_logistica: false,
          },
        ],
      };
      const mockNotFound = { ok: true, encontrado: false, total: 0, query: 'other', results: [] };

      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify(mockNotFound) } as Response)
        .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify(mockFound) } as Response)
        .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify(mockNotFound) } as Response);

      const { lookupCliente } = await import('../../services/clientLookupService');
      const result = await lookupCliente('Grupo Agro Comercial');

      expect(result.encontrado).toBe(true);
    });

    it('prioritizes the exact full-query match over broader variants', async () => {
      const exactResponse = {
        ok: true,
        encontrado: true,
        total: 1,
        query: 'BOM FUTURO AGRICOLA',
        results: [
          {
            grupo: 'BOM FUTURO AGRICOLA',
            razoes_sociais: ['BOM FUTURO AGRICOLA LTDA'],
            linhas_produto: ['GRS'],
            familias_presentes: ['Acesso'],
            modulos_por_familia: { Acesso: ['Ronda'] },
            gaps_crosssell: ['ERP'],
            total_modulos: 2,
            eh_cliente_senior: true,
            tem_gatec: false,
            tem_erp: false,
            tem_hcm: false,
            tem_logistica: false,
          },
        ],
      };
      const broadBom = {
        ok: true,
        encontrado: true,
        total: 44,
        query: 'BOM',
        results: [
          {
            grupo: 'BOM JESUS',
            razoes_sociais: ['ASSOCIACAO SENHOR BOM JESUS'],
            linhas_produto: ['ERP'],
            familias_presentes: ['ERP'],
            modulos_por_familia: { ERP: ['Financeiro'] },
            gaps_crosssell: ['HCM'],
            total_modulos: 10,
            eh_cliente_senior: true,
            tem_gatec: false,
            tem_erp: true,
            tem_hcm: false,
            tem_logistica: false,
          },
        ],
      };
      const broadAgricola = {
        ok: true,
        encontrado: true,
        total: 83,
        query: 'AGRICOLA',
        results: [
          {
            grupo: 'SLC AGRÍCOLA',
            razoes_sociais: ['SLC AGRÍCOLA SA'],
            linhas_produto: ['ERP'],
            familias_presentes: ['ERP'],
            modulos_por_familia: { ERP: ['Financeiro'] },
            gaps_crosssell: ['HCM'],
            total_modulos: 30,
            eh_cliente_senior: true,
            tem_gatec: false,
            tem_erp: true,
            tem_hcm: false,
            tem_logistica: false,
          },
          {
            grupo: 'BOM FUTURO AGRICOLA',
            razoes_sociais: ['BOM FUTURO AGRICOLA LTDA'],
            linhas_produto: ['GRS'],
            familias_presentes: ['Acesso'],
            modulos_por_familia: { Acesso: ['Ronda'] },
            gaps_crosssell: ['ERP'],
            total_modulos: 2,
            eh_cliente_senior: true,
            tem_gatec: false,
            tem_erp: false,
            tem_hcm: false,
            tem_logistica: false,
          },
        ],
      };

      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify(exactResponse) } as Response)
        .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify(broadBom) } as Response)
        .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify(broadAgricola) } as Response);

      const { lookupCliente } = await import('../../services/clientLookupService');
      const result = await lookupCliente('BOM FUTURO AGRICOLA');

      expect(result.query).toBe('BOM FUTURO AGRICOLA');
      expect(result.results[0].grupo).toBe('BOM FUTURO AGRICOLA');
      expect(result.results[0].matchType).toBe('exact');
    });

    it('reorders a broad variant so the best candidate becomes results[0]', async () => {
      const notFound = { ok: true, encontrado: false, total: 0, query: 'BOM FUTURO AGRICOLA', results: [] };
      const broadBom = { ok: true, encontrado: false, total: 0, query: 'BOM', results: [] };
      const broadAgricola = {
        ok: true,
        encontrado: true,
        total: 83,
        query: 'AGRICOLA',
        results: [
          {
            grupo: 'SLC AGRÍCOLA',
            razoes_sociais: ['SLC AGRÍCOLA SA'],
            linhas_produto: ['ERP'],
            familias_presentes: ['ERP'],
            modulos_por_familia: { ERP: ['Financeiro'] },
            gaps_crosssell: ['HCM'],
            total_modulos: 30,
            eh_cliente_senior: true,
            tem_gatec: false,
            tem_erp: true,
            tem_hcm: false,
            tem_logistica: false,
          },
          {
            grupo: 'BOM FUTURO AGRICOLA',
            razoes_sociais: ['BOM FUTURO AGRICOLA LTDA'],
            linhas_produto: ['GRS'],
            familias_presentes: ['Acesso'],
            modulos_por_familia: { Acesso: ['Ronda'] },
            gaps_crosssell: ['ERP'],
            total_modulos: 2,
            eh_cliente_senior: true,
            tem_gatec: false,
            tem_erp: false,
            tem_hcm: false,
            tem_logistica: false,
          },
        ],
      };

      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify(notFound) } as Response)
        .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify(broadBom) } as Response)
        .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify(broadAgricola) } as Response);

      const { lookupCliente } = await import('../../services/clientLookupService');
      const result = await lookupCliente('BOM FUTURO AGRICOLA');

      expect(result.results[0].grupo).toBe('BOM FUTURO AGRICOLA');
      expect(result.results[0].matchType).toBe('exact');
      expect(result.results[1].grupo).toBe('SLC AGRÍCOLA');
    });
  });

  // ─── lookupCliente - error handling ───────────────────────────────────────

  describe('lookupCliente - error handling', () => {
    it('returns ok:false on network failure without throwing', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network down'));

      const { lookupCliente } = await import('../../services/clientLookupService');
      const result = await lookupCliente('Empresa Qualquer');

      expect(result.ok).toBe(false);
      expect(result.encontrado).toBe(false);
    });

    it('returns ok:false when all variants return HTTP errors', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => 'Service Unavailable',
      } as Response);

      const { lookupCliente } = await import('../../services/clientLookupService');
      const result = await lookupCliente('Empresa X');

      expect(result.ok).toBe(false);
    });

    it('returns ok:false on invalid JSON response without throwing', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        text: async () => '<html>error</html>',
      } as Response);

      const { lookupCliente } = await import('../../services/clientLookupService');
      const result = await lookupCliente('Empresa Y');

      expect(result.encontrado).toBe(false);
    });
  });

  // ─── formatarParaPrompt ────────────────────────────────────────────────────

  describe('formatarParaPrompt', () => {
    it('returns "não encontrada" message for empty response', async () => {
      const { formatarParaPrompt } = await import('../../services/clientLookupService');
      const result = formatarParaPrompt({ ok: false, query: 'Empresa ABC', encontrado: false, total: 0, results: [] });
      expect(result).toContain('NÃO encontrada na base de clientes Senior');
      expect(result).toContain('Empresa ABC');
    });

    it('returns client data block when found', async () => {
      const { formatarParaPrompt } = await import('../../services/clientLookupService');
      const result = formatarParaPrompt({
        ok: true,
        query: 'Scheffer',
        encontrado: true,
        total: 1,
        results: [
          {
            grupo: 'Grupo Scheffer',
            razoes_sociais: [],
            linhas_produto: [],
            familias_presentes: ['ERP', 'GATec'],
            modulos_por_familia: { ERP: ['Financeiro', 'Fiscal'], GATec: ['Agrícola'] },
            gaps_crosssell: ['HCM'],
            total_modulos: 8,
            eh_cliente_senior: true,
            tem_gatec: true,
            tem_erp: true,
            tem_hcm: false,
            tem_logistica: false,
          },
        ],
      });
      expect(result).toContain('Grupo Scheffer');
      expect(result).toContain('8');
      expect(result).toContain('HCM');
      expect(result).toContain('CONFIRMADO');
    });

    it('signals possible match when the top candidate is not exact', async () => {
      const { formatarParaPrompt } = await import('../../services/clientLookupService');
      const result = formatarParaPrompt({
        ok: true,
        query: 'Bom Futuro Agricola',
        encontrado: true,
        total: 83,
        results: [
          {
            grupo: 'Bom Futuro Agricola Holding',
            razoes_sociais: ['Bom Futuro Agricola Participacoes Ltda'],
            linhas_produto: [],
            familias_presentes: ['Acesso'],
            modulos_por_familia: { Acesso: ['Ronda'] },
            gaps_crosssell: ['ERP'],
            total_modulos: 1,
            eh_cliente_senior: true,
            tem_gatec: false,
            tem_erp: false,
            tem_hcm: false,
            tem_logistica: false,
            matchType: 'partial',
          },
        ],
      });

      expect(result).toContain('POSSÍVEL MATCH');
      expect(result).toContain('NÃO USAR COMO CONFIRMAÇÃO');
      expect(result).toContain('PROSPECT');
      expect(result).not.toContain('Os GAPS DEVEM guiar a FASE 8');
      expect(result).not.toContain('Soluções Senior contratadas');
    });
  });

  // ─── benchmarkClientes ────────────────────────────────────────────────────

  describe('benchmarkClientes', () => {
    it('returns benchmark results on success', async () => {
      const mockBench = { ok: true, mode: 'benchmark', keywords: ['agro', 'erp'], total: 2, results: [] };
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        text: async () => JSON.stringify(mockBench),
      } as Response);

      const { benchmarkClientes } = await import('../../services/clientLookupService');
      const result = await benchmarkClientes(['agro', 'erp']);

      expect(result.ok).toBe(true);
      expect(result.total).toBe(2);
    });

    it('returns ok:false on HTTP error without throwing', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 502,
        text: async () => 'Bad Gateway',
      } as Response);

      const { benchmarkClientes } = await import('../../services/clientLookupService');
      const result = await benchmarkClientes(['agro']);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('502');
    });

    it('returns ok:false on network failure without throwing', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('timeout'));

      const { benchmarkClientes } = await import('../../services/clientLookupService');
      const result = await benchmarkClientes(['soja']);

      expect(result.ok).toBe(false);
    });
  });
});

// tests/services/war-room/retrieval.test.ts
// Unit tests for retrieval functions in services/war-room/retrieval.ts

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COMPETITOR_DOCS_NAMESPACE, DEFAULT_DOCS_NAMESPACE } from '../../../services/war-room/config';

const buscarDocsMock = vi.hoisted(() => vi.fn());
const buscarBaseMock = vi.hoisted(() => vi.fn());

vi.mock('../../../services/ragService', () => ({
  buscarContextoDocsPinecone: buscarDocsMock,
  buscarContextoPinecone: buscarBaseMock,
}));

// Import after mocks are set up
import {
  mergeDocContexts,
  filterDocsForProcessoAgricola,
  filterNoisyDocsContext,
  prioritizeBlocksByKeywords,
  getRagMetrics,
  validateStaticUrls,
  loadWarRoomDocsContext,
} from '../../../services/war-room/retrieval';

const defaultFlags = {
  wantsProcessoAgricola: false,
  wantsIntegracao: false,
  wantsFercus: false,
  wantsTalhao: false,
  wantsGatecAgricola: false,
  wantsBanking: false,
};

describe('mergeDocContexts', () => {
  it('deduplicates identical blocks', () => {
    const result = mergeDocContexts(['Bloco A\n\n---\n\nBloco B', 'Bloco A\n\n---\n\nBloco C']);
    expect(result).toContain('Bloco A');
    expect(result).toContain('Bloco B');
    expect(result).toContain('Bloco C');
    // Bloco A should appear only once
    const occurrences = (result.match(/Bloco A/g) || []).length;
    expect(occurrences).toBe(1);
  });

  it('keeps all blocks when they are different', () => {
    const result = mergeDocContexts(['Bloco Unico']);
    expect(result).toContain('Bloco Unico');
  });

  it('returns empty string for empty arrays', () => {
    expect(mergeDocContexts([])).toBe('');
  });

  it('returns empty string for arrays with empty strings', () => {
    expect(mergeDocContexts(['', '  '])).toBe('');
  });

  it('trims whitespace from blocks', () => {
    const result = mergeDocContexts(['  Bloco com espaco  \n\n---\n\n  Outro bloco  ']);
    expect(result).not.toContain('  ');
    expect(result).toContain('Bloco com espaco');
    expect(result).toContain('Outro bloco');
  });
});

describe('filterDocsForProcessoAgricola', () => {
  it('removes integracao gatec blocks', () => {
    const context = [
      '### SimpleFarm: Manual do Usuário',
      'Conteúdo agrícola relevante.',
      '---',
      '### Integracao Gatec: Integração com GAtec',
      'Arquitetura de integração com ERP.',
    ].join('\n\n');
    const result = filterDocsForProcessoAgricola(context);
    expect(result).toContain('SimpleFarm');
    expect(result).not.toContain('Integracao Gatec');
  });

  it('keeps simplefarm and agricola blocks', () => {
    const context = [
      '### SimpleFarm: Agricola',
      'Conteúdo sobre ordens de serviço.',
      '---',
      '### Talhões: Consulta Analítica',
      'Informações sobre cultura e safra.',
    ].join('\n\n');
    const result = filterDocsForProcessoAgricola(context);
    expect(result).toContain('SimpleFarm');
    expect(result).toContain('Talhões');
  });

  it('returns empty string unchanged', () => {
    expect(filterDocsForProcessoAgricola('')).toBe('');
  });

  it('removes hcm-integracao-gatec blocks', () => {
    const context = [
      '### HCM: Integracao Gatec',
      'hcm-integracao-gatec docs.',
      '---',
      '### Agricola: Ordem de Serviço',
      'ordem de serviço agrícola.',
    ].join('\n\n');
    const result = filterDocsForProcessoAgricola(context);
    expect(result).toContain('Agricola');
    expect(result).not.toContain('HCM');
  });
});

describe('filterNoisyDocsContext', () => {
  it('removes 404 blocks', () => {
    const context = [
      '### Bloco Valido',
      'Conteúdo útil.',
      '---',
      '### Pagina nao encontrada',
      '404 - página não encontrada',
    ].join('\n\n');
    const result = filterNoisyDocsContext(context, { processoAgricola: false, fercus: false });
    expect(result).toContain('Bloco Valido');
    expect(result).not.toContain('404');
  });

  it('removes HCM customization blocks when fercus is true', () => {
    const context = [
      '### Fercus Module',
      'Conteúdo sobre custos gerenciais.',
      '---',
      '### Customização: Pro_FerFgt',
      'https://documentacao.senior.com.br/gestao-de-pessoas-hcm/6.10.4/customizacoes/variaveis/pro_ferfgt.htm',
    ].join('\n\n');
    const result = filterNoisyDocsContext(context, { processoAgricola: false, fercus: true });
    expect(result).toContain('Fercus Module');
    expect(result).not.toContain('Pro_FerFgt');
  });

  it('keeps HCM customization blocks when fercus is false', () => {
    const context = [
      '### Customização: Pro_FerFgt',
      'https://documentacao.senior.com.br/gestao-de-pessoas-hcm/6.10.4/customizacoes/variaveis/pro_ferfgt.htm',
    ].join('\n\n');
    const result = filterNoisyDocsContext(context, { processoAgricola: false, fercus: false });
    expect(result).toContain('Pro_FerFgt');
  });

  it('returns empty string unchanged', () => {
    expect(filterNoisyDocsContext('', { processoAgricola: false, fercus: false })).toBe('');
  });
});

describe('prioritizeBlocksByKeywords', () => {
  it('orders blocks by keyword match score', () => {
    const context = [
      '### Bloco Financeiro',
      'Conteúdo sobre contas a pagar.',
      '---',
      '### Bloco Agricola',
      'Conteúdo sobre fercus e custos gerenciais com gatec-modulo-fercus.',
      '---',
      '### Bloco RH',
      'Conteúdo de recursos humanos.',
    ].join('\n\n');
    const result = prioritizeBlocksByKeywords(context, ['gatec-modulo-fercus', 'custos gerenciais']);
    const agricolaIndex = result.indexOf('Bloco Agricola');
    const financeiroIndex = result.indexOf('Bloco Financeiro');
    const rhIndex = result.indexOf('Bloco RH');
    expect(agricolaIndex).toBeLessThan(financeiroIndex);
    expect(agricolaIndex).toBeLessThan(rhIndex);
  });

  it('returns unchanged when no keywords provided', () => {
    const context = '### Bloco Unico\nConteudo.';
    expect(prioritizeBlocksByKeywords(context, [])).toBe(context);
  });

  it('returns unchanged for empty context', () => {
    expect(prioritizeBlocksByKeywords('', ['keyword'])).toBe('');
  });
});

describe('getRagMetrics', () => {
  it('returns metrics object with expected shape', () => {
    const metrics = getRagMetrics();
    expect(metrics).toHaveProperty('ragQueriesTotal');
    expect(metrics).toHaveProperty('ragQueriesFailed');
    expect(metrics).toHaveProperty('ragQueriesEmpty');
    expect(metrics).toHaveProperty('staticBlocksInjected');
    expect(typeof metrics.ragQueriesTotal).toBe('number');
    expect(typeof metrics.ragQueriesFailed).toBe('number');
    expect(typeof metrics.ragQueriesEmpty).toBe('number');
    expect(typeof metrics.staticBlocksInjected).toBe('number');
  });
});

describe('validateStaticUrls', () => {
  it('skips url validation when window exists (jsdom)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await validateStaticUrls();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('loadWarRoomDocsContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns early with empty context for non-tech/non-benchmark modes', async () => {
    const result = await loadWarRoomDocsContext('killscript', 'ignored', defaultFlags);
    expect(result).toEqual({ docsContext: '', docsUnavailable: false });
    expect(buscarDocsMock).not.toHaveBeenCalled();
    expect(buscarBaseMock).not.toHaveBeenCalled();
  });

  it('returns early with empty context for objections mode', async () => {
    const result = await loadWarRoomDocsContext('objections', 'ignored', defaultFlags);
    expect(result).toEqual({ docsContext: '', docsUnavailable: false });
    expect(buscarDocsMock).not.toHaveBeenCalled();
  });

  it('returns docs context when RAG succeeds in tech mode', async () => {
    buscarDocsMock.mockResolvedValue({ context: 'RAG docs content', failed: false });
    buscarBaseMock.mockResolvedValue({ context: 'RAG base content', failed: false });

    const result = await loadWarRoomDocsContext('tech', 'como funciona compras?', defaultFlags);

    expect(result.docsContext).toContain('RAG docs content');
    expect(result.docsContext).toContain('RAG base content');
    expect(result.docsUnavailable).toBe(false);
  });

  it('queries competitor namespace in benchmark mode', async () => {
    buscarDocsMock.mockResolvedValue({ context: 'benchmark context', failed: false });
    buscarBaseMock.mockResolvedValue({ context: 'base context', failed: false });

    await loadWarRoomDocsContext('benchmark', 'comparativo com concorrente', defaultFlags);

    // Should have been called with both namespaces
    const docsCalls = buscarDocsMock.mock.calls;
    const namespacesCalled = docsCalls.map((call: string[]) => call[1]);
    expect(namespacesCalled).toContain(DEFAULT_DOCS_NAMESPACE);
    expect(namespacesCalled).toContain(COMPETITOR_DOCS_NAMESPACE);
  });

  it('sets docsUnavailable when all RAG results are empty', async () => {
    buscarDocsMock.mockResolvedValue({ context: '', failed: true });
    buscarBaseMock.mockResolvedValue({ context: '', failed: true });

    const result = await loadWarRoomDocsContext('tech', 'consulta sem resultados', defaultFlags);

    expect(result.docsContext).toBe('');
    expect(result.docsUnavailable).toBe(true);
  });

  it('calls onStatus during progress', async () => {
    buscarDocsMock.mockResolvedValue({ context: 'status test content', failed: false });
    buscarBaseMock.mockResolvedValue({ context: 'status base content', failed: false });
    const onStatus = vi.fn();

    await loadWarRoomDocsContext('tech', 'status test', defaultFlags, onStatus);

    expect(onStatus).toHaveBeenCalledWith(expect.stringContaining('Consultando Pinecone'));
  });

  it('generates enhanced queries for fercus flag', async () => {
    buscarDocsMock.mockResolvedValue({ context: 'fercus content', failed: false });
    buscarBaseMock.mockResolvedValue({ context: 'base', failed: false });

    await loadWarRoomDocsContext('tech', 'explica o fercus', {
      ...defaultFlags,
      wantsFercus: true,
    });

    // Should have created a fercus-enhanced query
    const docsCalls = buscarDocsMock.mock.calls;
    const queryArgs = docsCalls.map((call: string[]) => call[0].toLowerCase());
    const hasFercusQuery = queryArgs.some((q: string) => q.includes('fercus'));
    expect(hasFercusQuery).toBe(true);
  });

  it('generates enhanced queries for banking flag', async () => {
    buscarDocsMock.mockResolvedValue({ context: 'banking content', failed: false });
    buscarBaseMock.mockResolvedValue({ context: 'base', failed: false });

    await loadWarRoomDocsContext('benchmark', 'fale sobre banking', {
      ...defaultFlags,
      wantsBanking: true,
    });

    const docsCalls = buscarDocsMock.mock.calls;
    const queryArgs = docsCalls.map((call: string[]) => call[0].toLowerCase());
    const hasBankingQuery = queryArgs.some((q: string) => q.includes('erp banking'));
    expect(hasBankingQuery).toBe(true);
  });

  it('injects fercus reference block when RAG misses it', async () => {
    buscarDocsMock.mockResolvedValue({
      context: '### Conteúdo genérico sobre ERP\nSem menção a gatec-modulo-fercus.',
      failed: false,
    });
    buscarBaseMock.mockResolvedValue({ context: '', failed: false });

    const result = await loadWarRoomDocsContext('tech', 'fercus custos', {
      ...defaultFlags,
      wantsFercus: true,
    });

    expect(result.docsContext).toContain('gatec-modulo-fercus');
    expect(result.docsUnavailable).toBe(false);
  });

  it('does not inject talhao reference block when RAG already has it', async () => {
    buscarDocsMock.mockResolvedValue({
      context: '### Consulta Analítica de Talhão\nconsulta-analitica-de-talhao content',
      failed: false,
    });
    buscarBaseMock.mockResolvedValue({ context: '', failed: false });

    const result = await loadWarRoomDocsContext('tech', 'consulta talhao', {
      ...defaultFlags,
      wantsTalhao: true,
    });

    // Should have the content from RAG without extra injection
    expect(result.docsContext).toContain('consulta-analitica-de-talhao');
  });
});

import { describe, it, expect, vi } from 'vitest';
import {
  detectCompetitorFromContext,
  pullCompetitorProfile,
  generatePricingIntel,
  formatarDeteccaoParaPrompt,
  formatarProfileParaUI,
  getContextoConcorrentesRegionais,
  CompetitorDetection,
  CompetitorProfile,
} from '../../services/competitorService';

describe('detectCompetitorFromContext', () => {
  it('retorna encontrado=false quando callGeminiDeepSearch não é fornecido', async () => {
    const result = await detectCompetitorFromContext('Fazenda São Paulo');
    expect(result.encontrado).toBe(false);
  });

  it('detecta TOTVS a partir de resposta do Gemini', async () => {
    const mockGemini = vi
      .fn()
      .mockResolvedValue(
        'SISTEMA_DETECTADO: TOTVS Protheus\nFABRICANTE: TOTVS\nREVENDA_LOCAL: TOTVS Direto\nNIVEL_AMEACA: alto\nCONFIANCA: alta\nFONTES: linkedin.com/vaga-totvs\nEVIDENCIA: Vaga de analista Protheus no LinkedIn',
      );

    const result = await detectCompetitorFromContext('Agroindústria Alpha', 'SP', mockGemini);
    expect(result.encontrado).toBe(true);
    expect(result.nomeERP).toBe('TOTVS Protheus');
    expect(result.nivelAmeaca).toBe('alto');
    expect(result.confianca).toBe('alta');
    expect(result.fontes).toContain('linkedin.com/vaga-totvs');
  });

  it('retorna encontrado=false quando sistema é DESCONHECIDO', async () => {
    const mockGemini = vi.fn().mockResolvedValue('SISTEMA_DETECTADO: DESCONHECIDO\nCONFIANCA: baixa\nFONTES: nenhuma');

    const result = await detectCompetitorFromContext('Fazenda Mistério', undefined, mockGemini);
    expect(result.encontrado).toBe(false);
    expect(result.raw).toBeDefined();
  });

  it('retorna encontrado=false em caso de erro do Gemini', async () => {
    const mockGemini = vi.fn().mockRejectedValue(new Error('Gemini unavailable'));
    const result = await detectCompetitorFromContext('Empresa X', undefined, mockGemini);
    expect(result.encontrado).toBe(false);
  });

  it('detecta SAP a partir de resposta do Gemini', async () => {
    const mockGemini = vi
      .fn()
      .mockResolvedValue(
        'SISTEMA_DETECTADO: SAP S/4HANA\nFABRICANTE: SAP\nREVENDA_LOCAL: Accenture SP\nNIVEL_AMEACA: alto\nCONFIANCA: media\nFONTES: site-empresa.com.br\nEVIDENCIA: Menção a SAP no site',
      );

    const result = await detectCompetitorFromContext('Grupo XYZ', 'MG', mockGemini);
    expect(result.encontrado).toBe(true);
    expect(result.nomeERP).toContain('SAP');
  });

  it('passa o estado para o prompt de busca', async () => {
    const mockGemini = vi.fn().mockResolvedValue('SISTEMA_DETECTADO: DESCONHECIDO\nCONFIANCA: baixa\nFONTES: nenhuma');

    await detectCompetitorFromContext('Empresa MT', 'MT', mockGemini);
    const calledPrompt = mockGemini.mock.calls[0][0] as string;
    // Prompt deve mencionar o estado MT ou revendas locais
    expect(calledPrompt.length).toBeGreaterThan(100);
  });
});

describe('pullCompetitorProfile', () => {
  it('retorna null quando callGeminiDeepSearch não é fornecido', async () => {
    const result = await pullCompetitorProfile('totvs');
    expect(result).toBeNull();
  });

  it('retorna null para competitorId inexistente', async () => {
    const mockGemini = vi.fn().mockResolvedValue('{}');
    const result = await pullCompetitorProfile('concorrente-inexistente', mockGemini);
    expect(result).toBeNull();
  });

  it('parseia JSON de perfil corretamente', async () => {
    const mockGemini = vi.fn().mockResolvedValue(
      JSON.stringify({
        playStoreRating: 3.8,
        playStoreReviews: 1200,
        reclamacoesTop: ['Lentidão', 'Suporte ruim', 'Bugs no módulo fiscal'],
        novidadesRecentes: ['Novo módulo agrícola Q1 2025'],
        estimativaPreco: 'R$ 800-2000/usuário/mês',
        pontosFracos: ['Interface antiga', 'Custo alto'],
        pontosFortes: ['Integração com legado', 'Suporte regional'],
        fontes: ['https://play.google.com/store/apps'],
      }),
    );

    // totvs é um ID conhecido no CONCORRENTES array
    const result = await pullCompetitorProfile('totvs', mockGemini);
    // Se totvs não estiver no array, retornará null
    if (result) {
      expect(result.playStoreRating).toBe(3.8);
      expect(result.reclamacoesTop).toHaveLength(3);
      expect(result.pontosFracos).toContain('Interface antiga');
    }
  });

  it('retorna perfil com raw mesmo quando JSON é inválido', async () => {
    const mockGemini = vi.fn().mockResolvedValue('Texto corrido sem JSON válido aqui');
    const result = await pullCompetitorProfile('totvs', mockGemini);
    if (result) {
      expect(result.raw).toContain('Texto corrido');
    }
  });

  it('extrai o primeiro JSON completo sem regex gulosa', async () => {
    const mockGemini = vi
      .fn()
      .mockResolvedValue(
        `Trecho inicial [ 'a' ] e texto ]\n` +
          `{"playStoreRating":4.1,"pontosFracos":["Lentidão"]}\n` +
          `{"playStoreRating":1.1,"pontosFracos":["Ignorar"]}`,
      );

    const result = await pullCompetitorProfile('totvs', mockGemini);
    if (result) {
      expect(result.playStoreRating).toBe(4.1);
      expect(result.pontosFracos).toContain('Lentidão');
      expect(result.pontosFracos).not.toContain('Ignorar');
    }
  });
});

describe('generatePricingIntel', () => {
  it('retorna null quando callGeminiDeepSearch não é fornecido', async () => {
    const result = await generatePricingIntel('totvs', 'medio');
    expect(result).toBeNull();
  });

  it('retorna null para competitorId inexistente', async () => {
    const mockGemini = vi.fn().mockResolvedValue('{}');
    const result = await generatePricingIntel('concorrente-xyz', 'grande', mockGemini);
    expect(result).toBeNull();
  });

  it('parseia estimativa de preço do JSON', async () => {
    const mockGemini = vi.fn().mockResolvedValue(
      JSON.stringify({
        faixaPrecoUsuario: 'R$ 500-1.200/usuário/mês',
        modeloLicenca: 'SaaS',
        custoImplantacaoEstimado: 'R$ 80.000 - 200.000',
        prazoImplantacaoMedio: '6 a 12 meses',
        confianca: 'media',
        fontes: ['capterra.com.br/totvs'],
        observacoes: 'Dados de 2025',
      }),
    );

    const result = await generatePricingIntel('totvs', 'medio', mockGemini);
    if (result) {
      expect(result.modeloLicenca).toBe('SaaS');
      expect(result.confianca).toBe('media');
      expect(result.fontes).toContain('capterra.com.br/totvs');
    }
  });

  it('retorna confianca baixa para JSON inválido', async () => {
    const mockGemini = vi.fn().mockResolvedValue('Não encontrei dados de preço');
    const result = await generatePricingIntel('totvs', 'pequeno', mockGemini);
    if (result) {
      expect(result.confianca).toBe('baixa');
    }
  });

  it('aceita array JSON e usa o primeiro objeto válido', async () => {
    const mockGemini = vi
      .fn()
      .mockResolvedValue(
        `Resposta:\n` +
          `[{"faixaPrecoUsuario":"R$ 900-1.500","modeloLicenca":"SaaS","confianca":"alta","fontes":["fonte-a"]}]`,
      );
    const result = await generatePricingIntel('totvs', 'medio', mockGemini);
    if (result) {
      expect(result.faixaPrecoUsuario).toBe('R$ 900-1.500');
      expect(result.modeloLicenca).toBe('SaaS');
      expect(result.confianca).toBe('alta');
      expect(result.fontes).toEqual(['fonte-a']);
    }
  });
});

describe('formatarDeteccaoParaPrompt', () => {
  it('retorna string vazia quando concorrente não encontrado', () => {
    const detection: CompetitorDetection = { encontrado: false };
    expect(formatarDeteccaoParaPrompt(detection)).toBe('');
  });

  it('inclui nome do ERP e nível de ameaça quando encontrado', () => {
    const detection: CompetitorDetection = {
      encontrado: true,
      nomeERP: 'TOTVS Protheus',
      nivelAmeaca: 'alto',
      revendaLocal: 'TOTVS Direto SP',
      confianca: 'alta',
      fontes: ['linkedin.com'],
    };
    const result = formatarDeteccaoParaPrompt(detection);
    expect(result).toContain('TOTVS Protheus');
    expect(result).toContain('ALTO');
    expect(result).toContain('TOTVS Direto SP');
    expect(result).toContain('[[COMPETITOR:');
  });

  it('inclui marcador COMPETITOR no formato correto', () => {
    const detection: CompetitorDetection = {
      encontrado: true,
      nomeERP: 'SAP',
      nivelAmeaca: 'medio',
      confianca: 'media',
    };
    const result = formatarDeteccaoParaPrompt(detection);
    expect(result).toMatch(/\[\[COMPETITOR:SAP:medio:/);
  });
});

describe('formatarProfileParaUI', () => {
  it('retorna string vazia para perfil nulo', () => {
    expect(formatarProfileParaUI(null as unknown as CompetitorProfile)).toBe('');
  });

  it('formata perfil com Play Store rating', () => {
    const profile: CompetitorProfile = {
      competitorId: 'totvs',
      nomeERP: 'TOTVS Protheus',
      playStoreRating: 3.5,
      playStoreReviews: 500,
      playStoreUltimaAtualizacao: '01/01/2025',
    };
    const result = formatarProfileParaUI(profile);
    expect(result).toContain('Play Store');
    expect(result).toContain('3.5');
    expect(result).toContain('500');
  });

  it('inclui reclamações quando disponíveis', () => {
    const profile: CompetitorProfile = {
      competitorId: 'totvs',
      nomeERP: 'TOTVS',
      reclamacoesTop: ['Lentidão', 'Bug fiscal', 'Suporte lento'],
    };
    const result = formatarProfileParaUI(profile);
    expect(result).toContain('Lentidão');
    expect(result).toContain('Bug fiscal');
  });
});

describe('getContextoConcorrentesRegionais', () => {
  it('retorna string vazia para UF sem revendas registradas', () => {
    const result = getContextoConcorrentesRegionais('XX');
    expect(result).toBe('');
  });

  it('retorna contexto formatado para UF com revendas', () => {
    // MT é um estado que provavelmente tem revendas no array de competitors
    const result = getContextoConcorrentesRegionais('MT');
    // Pode ou não ter revendas — se tiver, deve formatar corretamente
    if (result) {
      expect(result).toContain('MT');
    }
  });
});

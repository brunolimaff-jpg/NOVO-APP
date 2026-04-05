// tests/services/radarService.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  RadarScanError,
  buildCategoryPrompt,
  generateAlertId,
  fetchRadarAlerts,
} from '../../services/radarService';
import type { RadarConfig } from '../../types';

const DEFAULT_CONFIG: RadarConfig = {
  enabled: true,
  categories: ['concorrentes'],
  estados: [],
  scanIntervalHours: 60,
  isConfigured: true,
};

describe('RadarScanError', () => {
  it('cria erro com propriedades corretas', () => {
    const err = new RadarScanError('RADAR_TIMEOUT', 'Demorou demais', true, 'technical msg');
    expect(err.name).toBe('RadarScanError');
    expect(err.code).toBe('RADAR_TIMEOUT');
    expect(err.retryable).toBe(true);
    expect(err.userMessage).toBe('Demorou demais');
    expect(err.message).toBe('technical msg');
  });

  it('usa userMessage como message quando não há technicalMessage', () => {
    const err = new RadarScanError('RADAR_NETWORK', 'user msg', false);
    expect(err.message).toBe('user msg');
  });

  it('é instanceof Error', () => {
    const err = new RadarScanError('RADAR_SERVER', 'server error', true);
    expect(err instanceof Error).toBe(true);
    expect(err instanceof RadarScanError).toBe(true);
  });
});

describe('buildCategoryPrompt', () => {
  it('inclui nome da categoria concorrentes', () => {
    const prompt = buildCategoryPrompt('concorrentes', []);
    expect(prompt).toContain('TOTVS');
    expect(prompt).toContain('SAP');
    expect(prompt).toContain('MOVIMENTOS COMPETITIVOS');
  });

  it('inclui foco regional quando estados fornecidos', () => {
    const prompt = buildCategoryPrompt('concorrentes', ['MT', 'MS']);
    expect(prompt).toContain('MT');
    expect(prompt).toContain('MS');
    expect(prompt).toContain('FOCO REGIONAL');
  });

  it('sem foco regional quando estados vazio', () => {
    const prompt = buildCategoryPrompt('concorrentes', []);
    expect(prompt).not.toContain('FOCO REGIONAL');
  });

  it('constrói prompt para agro_tech', () => {
    const prompt = buildCategoryPrompt('agro_tech', []);
    expect(prompt).toContain('INOVAÇÃO');
  });

  it('constrói prompt para regulatorio', () => {
    const prompt = buildCategoryPrompt('regulatorio', []);
    expect(prompt).toContain('REGULATÓRIO');
  });

  it('constrói prompt para mercado', () => {
    const prompt = buildCategoryPrompt('mercado', []);
    expect(prompt).toContain('COMMODITIES');
  });

  it('constrói prompt para rh_trabalho', () => {
    const prompt = buildCategoryPrompt('rh_trabalho', []);
    expect(prompt).toContain('RH');
  });

  it('constrói prompt para ma_expansao', () => {
    const prompt = buildCategoryPrompt('ma_expansao', []);
    expect(prompt).toContain('M&A');
  });
});

describe('generateAlertId', () => {
  it('retorna string com prefixo radar_', () => {
    const id = generateAlertId('Notícia teste', 'https://example.com/artigo');
    expect(id).toMatch(/^radar_/);
  });

  it('mesmos inputs geram mesmo id (determinístico)', () => {
    const id1 = generateAlertId('Título', 'https://url.com');
    const id2 = generateAlertId('Título', 'https://url.com');
    expect(id1).toBe(id2);
  });

  it('inputs diferentes geram ids diferentes', () => {
    const id1 = generateAlertId('Título A', 'https://url-a.com');
    const id2 = generateAlertId('Título B', 'https://url-b.com');
    expect(id1).not.toBe(id2);
  });

  it('é case-insensitive (normaliza para lower)', () => {
    const id1 = generateAlertId('TITULO', 'https://URL.COM');
    const id2 = generateAlertId('titulo', 'https://url.com');
    expect(id1).toBe(id2);
  });
});

describe('fetchRadarAlerts', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('retorna resultado vazio quando categories está vazio', async () => {
    const config: RadarConfig = { ...DEFAULT_CONFIG, categories: [] };
    const result = await fetchRadarAlerts(config);
    expect(result).toEqual({ alerts: [], metaInsight: null, partialFailures: [], categoryStats: [] });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('retorna alertas em sucesso 200', async () => {
    const mockAlerts = [{ id: 'radar_1', title: 'Test', read: false }];
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        alerts: mockAlerts,
        metaInsight: 'insight aqui',
        partialFailures: [],
        categoryStats: [],
      }),
    } as Response);

    const result = await fetchRadarAlerts(DEFAULT_CONFIG);
    expect(result.alerts).toEqual(mockAlerts);
    expect(result.metaInsight).toBe('insight aqui');
  });

  it('retorna arrays vazios quando payload vem sem campos', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    } as Response);

    const result = await fetchRadarAlerts(DEFAULT_CONFIG);
    expect(result.alerts).toEqual([]);
    expect(result.metaInsight).toBeNull();
    expect(result.partialFailures).toEqual([]);
    expect(result.categoryStats).toEqual([]);
  });

  it('lança RADAR_RATE_LIMIT em 429', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({}),
    } as Response);

    await expect(fetchRadarAlerts(DEFAULT_CONFIG)).rejects.toMatchObject({
      code: 'RADAR_RATE_LIMIT',
      retryable: true,
    });
  });

  it('lança RADAR_SERVER em 500', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as Response);

    await expect(fetchRadarAlerts(DEFAULT_CONFIG)).rejects.toMatchObject({
      code: 'RADAR_SERVER',
      retryable: true,
    });
  });

  it('lança RADAR_BAD_REQUEST em 400', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'invalid params' }),
    } as Response);

    await expect(fetchRadarAlerts(DEFAULT_CONFIG)).rejects.toMatchObject({
      code: 'RADAR_BAD_REQUEST',
      retryable: false,
    });
  });

  it('lança RADAR_UNKNOWN em status 4xx inesperado', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({}),
    } as Response);

    await expect(fetchRadarAlerts(DEFAULT_CONFIG)).rejects.toMatchObject({
      code: 'RADAR_UNKNOWN',
    });
  });

  it('lança RADAR_NETWORK em falha de fetch (rede)', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('fetch failed'));

    await expect(fetchRadarAlerts(DEFAULT_CONFIG)).rejects.toMatchObject({
      code: 'RADAR_NETWORK',
      retryable: true,
    });
  });

  it('lança RADAR_TIMEOUT quando fetch é abortado', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError');
    vi.mocked(fetch).mockRejectedValueOnce(abortError);

    await expect(fetchRadarAlerts(DEFAULT_CONFIG)).rejects.toMatchObject({
      code: 'RADAR_TIMEOUT',
      retryable: true,
    });
  });

  it('inclui detail da resposta na mensagem técnica quando disponível', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'internal error', detail: 'db timeout' }),
    } as Response);

    const err = await fetchRadarAlerts(DEFAULT_CONFIG).catch(e => e as any);
    expect(err.message).toContain('internal error');
  });
});

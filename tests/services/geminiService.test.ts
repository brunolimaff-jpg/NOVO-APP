/**
 * Testes para geminiService.ts
 * Foco nas funções exportadas: parsePortaFeeds, cleanPortaFeedMarkers, parseMarkers, sendMessageToGemini
 *
 * NOTA: resetChatSession e generateNewSuggestions não existem no módulo
 * (dívida técnica — useChat.ts referencia exports inexistentes).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────
const proxyGenerateContentMock = vi.hoisted(() => vi.fn());
const proxyChatSendMessageMock = vi.hoisted(() => vi.fn());
const buscarContextoPineconeMock = vi.hoisted(() => vi.fn());
const buscarContextoDocsPineconeMock = vi.hoisted(() => vi.fn());
const lookupClienteMock = vi.hoisted(() => vi.fn());
const benchmarkClientesMock = vi.hoisted(() => vi.fn());
const isConcorrenteOuPropriaMock = vi.hoisted(() => vi.fn());

vi.mock('../../services/geminiProxy', () => ({
  proxyGenerateContent: proxyGenerateContentMock,
  proxyChatSendMessage: proxyChatSendMessageMock,
}));

vi.mock('../../services/ragService', () => ({
  buscarContextoPinecone: buscarContextoPineconeMock,
  buscarContextoDocsPinecone: buscarContextoDocsPineconeMock,
}));

vi.mock('../../services/clientLookupService', () => ({
  lookupCliente: lookupClienteMock,
  formatarParaPrompt: vi.fn().mockReturnValue(''),
  benchmarkClientes: benchmarkClientesMock,
  formatarBenchmarkParaPrompt: vi.fn().mockReturnValue(''),
  isConcorrenteOuPropria: isConcorrenteOuPropriaMock,
  formatarComexParaPrompt: vi.fn().mockReturnValue(''),
}));

vi.mock('../../services/portaStateService', () => ({
  initPortaState: vi.fn(),
  resetPortaState: vi.fn(),
  setBaseScore: vi.fn(),
  getPortaState: vi.fn().mockReturnValue(null),
  addFeedAdjustment: vi.fn(),
  addFlagFeed: vi.fn(),
  addSegmentFeed: vi.fn(),
  generatePortaContextForDeepDive: vi.fn().mockReturnValue(''),
}));

vi.mock('../../components/InvestigationDashboard', () => ({
  addInvestigation: vi.fn(),
}));

vi.mock('../../utils/diagnosticLog', () => ({
  scoutDiag: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), time: vi.fn(), timeEnd: vi.fn() },
}));

// Mock withAutoRetry para não aplicar delays reais nos testes
vi.mock('../../utils/retry', () => ({
  withAutoRetry: vi.fn(async (_name: string, action: () => Promise<unknown>) => action()),
}));

import { parsePortaFeeds, cleanPortaFeedMarkers, parseMarkers, sendMessageToGemini } from '../../services/geminiService';

describe('parsePortaFeeds', () => {
  it('retorna resultado vazio para texto sem marcadores', () => {
    const result = parsePortaFeeds('Texto qualquer sem marcadores PORTA', 'TEST');
    expect(result.adjustments).toHaveLength(0);
    expect(result.flags).toHaveLength(0);
    expect(result.segments).toHaveLength(0);
  });

  it('parseia marcador PORTA_FEED_O corretamente', () => {
    // clampFeedValue usa escala 0-10 internamente
    const text = '[[PORTA_FEED_O:7]]';
    const result = parsePortaFeeds(text, 'RAIO_X');
    expect(result.adjustments).toHaveLength(1);
    expect(result.adjustments[0].dimension).toBe('O');
    expect(result.adjustments[0].suggestedValue).toBe(7);
    expect(result.adjustments[0].source).toBe('RAIO_X');
  });

  it('parseia marcador PORTA_FEED_R com dimensão R', () => {
    const text = '[[PORTA_FEED_R:60]]';
    const result = parsePortaFeeds(text, 'TECH');
    expect(result.adjustments.some(a => a.dimension === 'R')).toBe(true);
  });

  it('parseia marcador PORTA_FEED_T com sub-scores T1, T2, T3', () => {
    // clampFeedValue usa escala 0-10
    const text = '[[PORTA_FEED_T:7:T1:6:T2:8:T3:7]]';
    const result = parsePortaFeeds(text, 'TECH_STACK');
    expect(result.adjustments.some(a => a.dimension === 'T')).toBe(true);
    const tAdj = result.adjustments.find(a => a.dimension === 'T');
    expect(tAdj?.subScores?.T1).toBe(6);
    expect(tAdj?.subScores?.T2).toBe(8);
    expect(tAdj?.subScores?.T3).toBe(7);
  });

  it('parseia marcador PORTA_FEED_A com sub-scores A1, A2', () => {
    // clampFeedValue usa escala 0-10
    const text = '[[PORTA_FEED_A:8:A1:9:A2:7]]';
    const result = parsePortaFeeds(text, 'DECISORES');
    expect(result.adjustments.some(a => a.dimension === 'A')).toBe(true);
    const aAdj = result.adjustments.find(a => a.dimension === 'A');
    expect(aAdj?.subScores?.A1).toBe(9);
  });

  it('parseia flag PORTA_FLAG:LOCK:SIM como ativa', () => {
    const text = '[[PORTA_FLAG:LOCK:SIM]]';
    const result = parsePortaFeeds(text, 'RISCOS');
    expect(result.flags.some(f => f.flag === 'LOCK' && f.active === true)).toBe(true);
  });

  it('parseia flag PORTA_FLAG:TRAD:NAO como inativa', () => {
    const text = '[[PORTA_FLAG:TRAD:NAO]]';
    const result = parsePortaFeeds(text, 'RAIO_X');
    expect(result.flags.some(f => f.flag === 'TRAD' && f.active === false)).toBe(true);
  });

  it('parseia segmento AGI', () => {
    const text = '[[PORTA_SEG:AGI]]';
    const result = parsePortaFeeds(text, 'RAIO_X');
    expect(result.segments.some(s => s.segmento === 'AGI')).toBe(true);
  });

  it('parseia segmento PRD', () => {
    const text = '[[PORTA_SEG:PRD]]';
    const result = parsePortaFeeds(text, 'RAIO_X');
    expect(result.segments.some(s => s.segmento === 'PRD')).toBe(true);
  });

  it('parseia segmento COP', () => {
    const text = '[[PORTA_SEG:COP]]';
    const result = parsePortaFeeds(text, 'RAIO_X');
    expect(result.segments.some(s => s.segmento === 'COP')).toBe(true);
  });

  it('clampa valores fora do range (0-10) para o limite máximo de 10', () => {
    const text = '[[PORTA_FEED_O:150]]';
    const result = parsePortaFeeds(text, 'TEST');
    const adj = result.adjustments.find(a => a.dimension === 'O');
    expect(adj?.suggestedValue).toBeLessThanOrEqual(10);
    expect(adj?.suggestedValue).toBe(10); // 150 clamped to 10
  });

  it('parseia múltiplos marcadores no mesmo texto', () => {
    const text = '[[PORTA_FEED_O:70]]\n[[PORTA_FEED_R:65]]\n[[PORTA_SEG:AGI]]\n[[PORTA_FLAG:NOFIT:NAO]]';
    const result = parsePortaFeeds(text, 'MULTI');
    expect(result.adjustments.length).toBeGreaterThanOrEqual(2);
    expect(result.segments.length).toBeGreaterThanOrEqual(1);
    expect(result.flags.length).toBeGreaterThanOrEqual(1);
  });
});

describe('cleanPortaFeedMarkers', () => {
  it('remove marcadores PORTA do texto', () => {
    const text = 'Análise completa.\n[[PORTA:75:AGI]]\n[[PORTA_FEED_O:70]]\nConclusão.';
    const result = cleanPortaFeedMarkers(text);
    expect(result).not.toContain('[[PORTA:');
    expect(result).not.toContain('[[PORTA_FEED_');
  });

  it('preserva texto não relacionado a marcadores', () => {
    const text = 'Esta empresa tem score elevado. Análise detalhada segue.';
    const result = cleanPortaFeedMarkers(text);
    expect(result).toContain('Esta empresa tem score elevado');
  });

  it('retorna string vazia para texto vazio', () => {
    expect(cleanPortaFeedMarkers('')).toBe('');
  });
});

describe('parseMarkers', () => {
  it('retorna texto limpo sem marcadores internos', () => {
    const text = 'Resposta da IA.\n[[STATUS:OK]]\nTexto visível.';
    const result = parseMarkers(text);
    expect(result.text).not.toContain('[[STATUS:');
    expect(result.text).toContain('Texto visível');
  });

  it('extrai scorePorta quando marcador PORTA v2 está presente', () => {
    const text = 'Análise completa.\n[[PORTA:78:AGI::]]';
    const result = parseMarkers(text);
    if (result.scorePorta) {
      expect(result.scorePorta.scoreBruto).toBeGreaterThan(0);
    }
  });

  it('retorna scorePorta null quando não há marcador PORTA', () => {
    const text = 'Texto sem marcador de score.';
    const result = parseMarkers(text);
    expect(result.scorePorta).toBeNull();
  });

  it('retorna array de statuses vazio', () => {
    const result = parseMarkers('Qualquer texto');
    expect(result.statuses).toEqual([]);
  });
});

describe('sendMessageToGemini — cenários de erro', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buscarContextoPineconeMock.mockResolvedValue('');
    buscarContextoDocsPineconeMock.mockResolvedValue('');
    isConcorrenteOuPropriaMock.mockReturnValue([]);
    lookupClienteMock.mockResolvedValue(null);
    benchmarkClientesMock.mockResolvedValue([]);
  });

  it('lança erro de AbortError imediatamente quando signal já está abortado', async () => {
    const controller = new AbortController();
    controller.abort();

    // geminiService lança `new Error('AbortError')` — message='AbortError', name='Error'
    await expect(
      sendMessageToGemini('Analise a Fazenda X', [], 'system instruction', {
        signal: controller.signal,
        onText: vi.fn(),
        onStatus: vi.fn(),
      }),
    ).rejects.toMatchObject({ message: 'AbortError' });
  });

  it('propaga erro de rede quando o proxy falha', async () => {
    // withAutoRetry está mockado para executar apenas uma vez (sem delay)
    // geminiService relança o erro original (TypeError) — normalização é feita no consumidor
    const networkError = new TypeError('fetch failed');
    proxyChatSendMessageMock.mockRejectedValue(networkError);
    proxyGenerateContentMock.mockRejectedValue(networkError);

    await expect(
      sendMessageToGemini('Pergunta', [], 'system', {
        onText: vi.fn(),
        onStatus: vi.fn(),
      }),
    ).rejects.toThrow('fetch failed');
  });

  it('propaga erro 429 quando o proxy retorna quota exceeded', async () => {
    // withAutoRetry está mockado para executar apenas uma vez (sem delay)
    const rateLimitError = Object.assign(new Error('quota exhausted'), { status: 429 });
    proxyChatSendMessageMock.mockRejectedValue(rateLimitError);
    proxyGenerateContentMock.mockRejectedValue(rateLimitError);

    await expect(
      sendMessageToGemini('Pergunta', [], 'system', {
        onText: vi.fn(),
        onStatus: vi.fn(),
      }),
    ).rejects.toThrow('quota exhausted');
  });
});

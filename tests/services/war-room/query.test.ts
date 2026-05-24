// tests/services/war-room/query.test.ts
// Unit tests for the main queryWarRoom pipeline

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---- Hoisted mocks ----
const proxyGerarDossieMock = vi.hoisted(() => vi.fn());
const withAutoRetryMock = vi.hoisted(() => vi.fn());
const normalizeAppErrorMock = vi.hoisted(() => vi.fn());

const loadWarRoomDocsContextMock = vi.hoisted(() => vi.fn());
const isOutOfScopeMock = vi.hoisted(() => vi.fn());
const collectWarRoomIntentFlagsMock = vi.hoisted(() => vi.fn());
const normalizeTargetMock = vi.hoisted(() => vi.fn());
const buildWarRoomPromptMock = vi.hoisted(() => vi.fn());
const getWarRoomSystemPromptMock = vi.hoisted(() => vi.fn());
const extractGroundingSourcesMock = vi.hoisted(() => vi.fn());
const enforceBankingAnchorsMock = vi.hoisted(() => vi.fn());
const detectHallucinatedUrlsMock = vi.hoisted(() => vi.fn());

// ---- Module mocks ----
vi.mock('../../../utils/retry', () => ({
  withAutoRetry: withAutoRetryMock,
}));

vi.mock('../../../utils/errorHelpers', () => ({
  normalizeAppError: normalizeAppErrorMock,
}));

vi.mock('../../../services/geminiProxy', () => ({
  proxyGerarDossie: proxyGerarDossieMock,
}));

vi.mock('../../../services/war-room/intent', () => ({
  collectWarRoomIntentFlags: collectWarRoomIntentFlagsMock,
  isOutOfScope: isOutOfScopeMock,
  normalizeTarget: normalizeTargetMock,
}));

vi.mock('../../../services/war-room/prompting', () => ({
  buildWarRoomPrompt: buildWarRoomPromptMock,
  getWarRoomSystemPrompt: getWarRoomSystemPromptMock,
}));

vi.mock('../../../services/war-room/retrieval', () => ({
  loadWarRoomDocsContext: loadWarRoomDocsContextMock,
}));

vi.mock('../../../services/war-room/sources', () => ({
  extractGroundingSources: extractGroundingSourcesMock,
  enforceBankingAnchors: enforceBankingAnchorsMock,
  detectHallucinatedUrls: detectHallucinatedUrlsMock,
}));

// ---- Default mock values ----
const defaultGeminiResponse = {
  text: 'Resposta tecnica sobre o ERP Senior.',
  candidates: [{ groundingMetadata: { groundingChunks: [] } }],
};

const defaultFlags = {
  wantsProcessoAgricola: false,
  wantsIntegracao: false,
  wantsFercus: false,
  wantsTalhao: false,
  wantsGatecAgricola: false,
  wantsBanking: false,
};

describe('queryWarRoom', () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    // Default mock implementations
    withAutoRetryMock.mockImplementation((_name: string, task: () => Promise<unknown>) => task());
    proxyGerarDossieMock.mockResolvedValue(defaultGeminiResponse);
    loadWarRoomDocsContextMock.mockResolvedValue({
      docsContext: 'Contexto dos documentos do ERP Senior.',
      docsUnavailable: false,
    });
    isOutOfScopeMock.mockReturnValue(false);
    collectWarRoomIntentFlagsMock.mockReturnValue(defaultFlags);
    normalizeTargetMock.mockImplementation((target: string) => target || 'concorrente');
    buildWarRoomPromptMock.mockReturnValue('Prompt completo do War Room.');
    getWarRoomSystemPromptMock.mockReturnValue('System prompt do War Room.');
    extractGroundingSourcesMock.mockReturnValue([
      { title: 'Documentacao Senior', url: 'https://documentacao.senior.com.br/erp' },
    ]);
    enforceBankingAnchorsMock.mockImplementation((text: string) => text);
    detectHallucinatedUrlsMock.mockReturnValue([]);
    normalizeAppErrorMock.mockReturnValue({
      friendlyMessage: 'Erro simulado.',
      retryable: true,
      source: 'GEMINI',
      code: 'MOCK_ERROR',
      httpStatus: 500,
      message: 'Erro simulado do Gemini',
    });
  });

  it('returns out of scope result when isOutOfScope returns true in tech mode', async () => {
    isOutOfScopeMock.mockReturnValue(true);

    const { queryWarRoom } = await import('../../../services/war-room/query');
    const result = await queryWarRoom('tech', 'CNPJ 04.733.767/0001-80', [], '');

    expect(result.outOfScope).toBe(true);
    expect(result.text).toContain('War Room');
    expect(proxyGerarDossieMock).not.toHaveBeenCalled();
  });

  it('calls Gemini API in tech mode with RAG context', async () => {
    const { queryWarRoom } = await import('../../../services/war-room/query');
    const result = await queryWarRoom(
      'tech',
      'Como funciona o modulo de compras?',
      [],
      '',
    );

    expect(proxyGerarDossieMock).toHaveBeenCalledTimes(1);
    expect(result.text).toContain('Resposta tecnica');
    expect(result.sources).toHaveLength(1);
  });

  it('passes config with low temperature for tech mode', async () => {
    const { queryWarRoom } = await import('../../../services/war-room/query');
    await queryWarRoom('tech', 'Como funciona compras?', [], '');

    const callArgs = proxyGerarDossieMock.mock.calls[0][0];
    expect(callArgs.config.temperature).toBe(0.15);
  });

  it('passes config with higher temperature for benchmark mode', async () => {
    collectWarRoomIntentFlagsMock.mockReturnValue({
      ...defaultFlags,
      wantsBanking: true,
    });
    normalizeTargetMock.mockReturnValue('TOTVS');
    loadWarRoomDocsContextMock.mockResolvedValue({
      docsContext: 'Contexto sobre concorrentes.',
      docsUnavailable: false,
    });

    const { queryWarRoom } = await import('../../../services/war-room/query');
    await queryWarRoom('benchmark', 'Compare Senior com TOTVS', [], 'TOTVS');

    const callArgs = proxyGerarDossieMock.mock.calls[0][0];
    expect(callArgs.config.temperature).toBe(0.3);
  });

  it('includes googleSearch tool for benchmark mode', async () => {
    normalizeTargetMock.mockReturnValue('TOTVS');
    loadWarRoomDocsContextMock.mockResolvedValue({
      docsContext: 'Contexto sobre concorrentes.',
      docsUnavailable: false,
    });

    const { queryWarRoom } = await import('../../../services/war-room/query');
    await queryWarRoom('benchmark', 'Compare Senior com TOTVS', [], 'TOTVS');

    const callArgs = proxyGerarDossieMock.mock.calls[0][0];
    expect(callArgs.config.tools).toBeDefined();
    expect(callArgs.config.tools).toContainEqual(
      expect.objectContaining({ googleSearch: {} }),
    );
  });

  it('does NOT include googleSearch tool for tech mode', async () => {
    const { queryWarRoom } = await import('../../../services/war-room/query');
    await queryWarRoom('tech', 'Como funciona compras?', [], '');

    const callArgs = proxyGerarDossieMock.mock.calls[0][0];
    expect(callArgs.config.tools).toBeUndefined();
  });

  it('appends disclaimer when RAG is unavailable in tech mode', async () => {
    loadWarRoomDocsContextMock.mockResolvedValue({
      docsContext: '',
      docsUnavailable: true,
    });

    const { queryWarRoom } = await import('../../../services/war-room/query');
    const result = await queryWarRoom('tech', 'Como funciona?', [], '');

    expect(result.text).toContain('Pinecone');
    expect(result.text).toContain('conhecimento complementar');
  });

  it('does not append disclaimer for objections mode even when docs unavailable', async () => {
    loadWarRoomDocsContextMock.mockResolvedValue({
      docsContext: '',
      docsUnavailable: true,
    });

    const { queryWarRoom } = await import('../../../services/war-room/query');
    const result = await queryWarRoom('objections', 'Objeção sobre preço', [], 'concorrente');

    expect(result.text).not.toContain('Pinecone');
    expect(result.text).not.toContain('conhecimento complementar');
  });

  it('calls onStatus during progress', async () => {
    const { queryWarRoom } = await import('../../../services/war-room/query');
    const onStatus = vi.fn();
    await queryWarRoom('tech', 'Como funciona?', [], '', onStatus);

    expect(onStatus).toHaveBeenCalledWith(
      expect.stringContaining('Gerando resposta técnica'),
    );
  });

  it('calls enforceBankingAnchors when banking flag is active', async () => {
    collectWarRoomIntentFlagsMock.mockReturnValue({
      ...defaultFlags,
      wantsBanking: true,
    });
    loadWarRoomDocsContextMock.mockResolvedValue({
      docsContext: 'Contexto banking.',
      docsUnavailable: false,
    });

    const { queryWarRoom } = await import('../../../services/war-room/query');
    await queryWarRoom('benchmark', 'ERP Banking vs TOTVS', [], 'TOTVS');

    expect(enforceBankingAnchorsMock).toHaveBeenCalled();
  });

  it('calls detectHallucinatedUrls when docsContext exists', async () => {
    const { queryWarRoom } = await import('../../../services/war-room/query');
    await queryWarRoom('tech', 'Como funciona?', [], '');

    expect(detectHallucinatedUrlsMock).toHaveBeenCalled();
  });

  it('handles Gemini API error gracefully', async () => {
    proxyGerarDossieMock.mockRejectedValue(new Error('Gemini API timeout'));

    const { queryWarRoom } = await import('../../../services/war-room/query');
    const result = await queryWarRoom('tech', 'Como funciona?', [], '');

    expect(result.isError).toBe(true);
    expect(result.text).toContain('Erro');
  });

  it('returns aborted result when signal is already aborted', async () => {
    const abortController = new AbortController();
    abortController.abort();

    const { queryWarRoom } = await import('../../../services/war-room/query');
    const result = await queryWarRoom(
      'tech',
      'Como funciona?',
      [],
      '',
      undefined,
      { signal: abortController.signal },
    );

    expect(result.isError).toBe(true);
    expect(result.text).toContain('cancelada');
    expect(proxyGerarDossieMock).not.toHaveBeenCalled();
  });

  it('normalizes target from message for benchmark mode', async () => {
    normalizeTargetMock.mockReturnValue('TOTVS');
    loadWarRoomDocsContextMock.mockResolvedValue({
      docsContext: 'Contexto concorrente.',
      docsUnavailable: false,
    });

    const { queryWarRoom } = await import('../../../services/war-room/query');
    await queryWarRoom('benchmark', 'Compare Senior com TOTVS', [], '');

    expect(normalizeTargetMock).toHaveBeenCalledWith('', 'Compare Senior com TOTVS');
    // Should pass resolved target to system prompt
    expect(getWarRoomSystemPromptMock).toHaveBeenCalledWith('benchmark', 'TOTVS');
  });

  it('does not normalize target in tech mode', async () => {
    const { queryWarRoom } = await import('../../../services/war-room/query');
    await queryWarRoom('tech', 'Como funciona?', [], 'whatever');

    expect(normalizeTargetMock).not.toHaveBeenCalled();
    expect(getWarRoomSystemPromptMock).toHaveBeenCalledWith('tech', '');
  });
});

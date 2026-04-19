import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MODULAR_DOSSIER_STAGES } from '../../../constants/loadingStages';
import type { RunMegaPromptWaterfallArgs } from '../../../features/chat/message-orchestrator';
import { useDossierWaterfallOrchestrator } from '../../../features/dossier/waterfall-orchestrator';
import type { LookupResponse } from '../../../services/clientLookupService';
import {
  Sender,
  type ChatSession,
  type Message,
  type PortaDimension,
  type ScorePortaData,
} from '../../../types';
import type { PortaScoreResolution } from '../../../utils/porta';

const uuidv4Mock = vi.hoisted(() => vi.fn());
const generateDossierModuleMock = vi.hoisted(() => vi.fn());
const generateContinuityQuestionMock = vi.hoisted(() => vi.fn());
const lookupClienteMock = vi.hoisted(() => vi.fn());
const formatarParaPromptMock = vi.hoisted(() => vi.fn());
const runDossierBenchmarkStageMock = vi.hoisted(() => vi.fn());
const reconcileWaterfallPortaMock = vi.hoisted(() => vi.fn());
const ensureWaterfallScorePortaMock = vi.hoisted(() => vi.fn());
const scoutDiagMock = vi.hoisted(() => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}));

vi.mock('uuid', () => ({
  v4: uuidv4Mock,
}));

vi.mock('../../../services/geminiService', () => ({
  generateDossierModule: generateDossierModuleMock,
  generateContinuityQuestion: generateContinuityQuestionMock,
}));

vi.mock('../../../services/clientLookupService', () => ({
  lookupCliente: lookupClienteMock,
  formatarParaPrompt: formatarParaPromptMock,
}));

vi.mock('../../../features/dossier/benchmark-stage', () => ({
  runDossierBenchmarkStage: runDossierBenchmarkStageMock,
}));

vi.mock('../../../features/dossier/porta-reconciliation', () => ({
  reconcileWaterfallPorta: reconcileWaterfallPortaMock,
  ensureWaterfallScorePorta: ensureWaterfallScorePortaMock,
}));

vi.mock('../../../stores/chatStore', () => ({
  useMaybeChatStore: () => undefined,
}));

vi.mock('../../../utils/diagnosticLog', () => ({
  scoutDiag: scoutDiagMock,
}));

type StateUpdater<T> = T | ((prev: T) => T);

const DEFAULT_SUGGESTIONS = [
  'Onde a margem começa a vazar primeiro?',
  'Qual frente já exige decisão executiva?',
  'Que camada operacional segue invisível?',
  'Qual risco amadurece nos próximos 90 dias?',
];

function applyStateUpdate<T>(current: T, next: StateUpdater<T>): T {
  return typeof next === 'function' ? (next as (prev: T) => T)(current) : next;
}

function createAbortError(message = 'request aborted'): Error {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'message-1',
    sender: Sender.Bot,
    text: 'Resumo consolidado',
    timestamp: new Date('2026-04-19T12:00:00.000Z'),
    ...overrides,
  };
}

function makeSession(overrides: Partial<ChatSession> = {}): ChatSession {
  return {
    id: 'session-1',
    title: 'Acme Agro',
    empresaAlvo: 'Acme Agro',
    cnpj: '12345678000190',
    modoPrincipal: 'investigacao',
    scoreOportunidade: null,
    resumoDossie: null,
    createdAt: '2026-04-19T12:00:00.000Z',
    updatedAt: '2026-04-19T12:00:00.000Z',
    messages: [],
    ...overrides,
  };
}

function makeScorePorta(score = 72): ScorePortaData {
  return {
    score,
    p: 7,
    o: 7,
    r: 6,
    t: 8,
    a: 6,
    segmento: 'PRD',
    flags: [],
    scoreBruto: score,
  };
}

function makeResolution(
  score: ScorePortaData | null,
  missingDimensions: PortaDimension[] = [],
): PortaScoreResolution {
  return {
    score,
    source: score ? 'marker' : 'none',
    missingDimensions,
  };
}

function makeLookupResponse(overrides: Partial<LookupResponse> = {}): LookupResponse {
  return {
    ok: true,
    query: 'Acme Agro',
    encontrado: true,
    total: 1,
    results: [
      {
        grupo: 'Grupo Acme',
        razoes_sociais: ['Acme Agro Ltda'],
        linhas_produto: ['ERP'],
        familias_presentes: ['ERP'],
        modulos_por_familia: { ERP: ['Sapiens'] },
        gaps_crosssell: ['HCM'],
        total_modulos: 3,
        eh_cliente_senior: true,
        tem_gatec: false,
        tem_erp: true,
        tem_hcm: false,
        tem_logistica: false,
        matchType: 'exact',
      },
    ],
    ...overrides,
  };
}

function makeRunArgs(overrides: Partial<RunMegaPromptWaterfallArgs> = {}): RunMegaPromptWaterfallArgs {
  return {
    sessionId: 'session-1',
    text: [
      'Dossiê completo de [Acme Agro].',
      'Contexto cadastral obrigatório: CNPJ 12.345.678/0001-90.',
      '<radar_context>RadarUnreadCount=0</radar_context>',
    ].join('\n\n'),
    safeVisibleText: '🔍 Investigando Acme Agro...',
    hintedCompany: 'Acme Agro',
    normalizedCompany: 'Acme Agro',
    historyToPass: [
      makeMessage({ id: 'history-user', sender: Sender.User, text: 'Mensagem anterior' }),
      makeMessage({ id: 'history-bot', sender: Sender.Bot, text: 'Resposta anterior' }),
    ],
    botMessageId: 'bot-1',
    signal: new AbortController().signal,
    isFirstInteraction: false,
    sessionCnpjDigits: '12345678000190',
    ...overrides,
  };
}

function makeHarness(overrides: {
  canUseLookup?: boolean;
  sessionScore?: number | null;
  messages?: Message[];
} = {}) {
  const state = {
    failureCount: 0,
    sessions: [
      makeSession({
        scoreOportunidade: overrides.sessionScore ?? null,
        messages:
          overrides.messages ??
          [
            makeMessage({ id: 'user-1', sender: Sender.User, text: 'Mensagem de abertura' }),
            makeMessage({ id: 'bot-1', sender: Sender.Bot, text: '', isThinking: true }),
          ],
      }),
    ],
  };

  const updateSessionById = vi.fn((sessionId: string, updater: (session: ChatSession) => ChatSession) => {
    state.sessions = state.sessions.map(session =>
      session.id === sessionId ? { ...updater(session), updatedAt: new Date().toISOString() } : session,
    );
  });

  const resetLoadingProgress = vi.fn();
  const advanceLoadingProgress = vi.fn();
  const replaceLoadingProgressStage = vi.fn();
  const completeLoadingProgress = vi.fn();
  const setFailureCount = vi.fn((next: StateUpdater<number>) => {
    state.failureCount = applyStateUpdate(state.failureCount, next);
  });

  const rendered = renderHook(() =>
    useDossierWaterfallOrchestrator({
      canUseLookup: overrides.canUseLookup ?? true,
      resolvedOperatorName: 'Bruno Lima',
      updateSessionById,
      resetLoadingProgress,
      advanceLoadingProgress,
      replaceLoadingProgressStage,
      completeLoadingProgress,
      setFailureCount,
    }),
  );

  return {
    ...rendered,
    state,
    updateSessionById,
    resetLoadingProgress,
    advanceLoadingProgress,
    replaceLoadingProgressStage,
    completeLoadingProgress,
    setFailureCount,
  };
}

function getSession(harness: ReturnType<typeof makeHarness>): ChatSession {
  return harness.state.sessions[0];
}

function getBotMessage(harness: ReturnType<typeof makeHarness>): Message {
  const botMessage = getSession(harness).messages.find(message => message.id === 'bot-1');
  if (!botMessage) {
    throw new Error('Bot placeholder not found');
  }
  return botMessage;
}

describe('useDossierWaterfallOrchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    let uuidCounter = 0;
    uuidv4Mock.mockImplementation(() => `uuid-${++uuidCounter}`);

    lookupClienteMock.mockResolvedValue(makeLookupResponse());
    formatarParaPromptMock.mockReturnValue('Lookup formatado');
    generateDossierModuleMock.mockImplementation(async (moduleName: string) => `${moduleName} consolidado`);
    generateContinuityQuestionMock.mockResolvedValue(DEFAULT_SUGGESTIONS);
    runDossierBenchmarkStageMock.mockImplementation(
      async ({ appendWaterfallChunk }: { appendWaterfallChunk: (chunk: string) => void }) => {
        appendWaterfallChunk('Benchmark consolidado');
        return true;
      },
    );

    const defaultScore = makeScorePorta(72);
    reconcileWaterfallPortaMock.mockResolvedValue({
      accumulatedText: 'Raio-X Operacional consolidado\n\n---\n\n[[PORTA:72:P7:O7:R6:T8:A6:PRD:NONE]]',
      resolution: makeResolution(defaultScore),
      portaFallbackApplied: false,
      portaFallbackDimensions: [],
      portaIntegrityHold: false,
    });
    ensureWaterfallScorePortaMock.mockReturnValue(defaultScore);
  });

  it('consolida o fluxo feliz, persiste o payload final e usa reset incremental em follow-up', async () => {
    const score = makeScorePorta(74);
    reconcileWaterfallPortaMock.mockResolvedValue({
      accumulatedText: [
        'Raio-X Operacional consolidado',
        '---',
        'Benchmark consolidado',
        '---',
        '[[PORTA:74:P7:O7:R6:T8:A6:PRD:NONE]]',
      ].join('\n\n'),
      resolution: makeResolution(score),
      portaFallbackApplied: true,
      portaFallbackDimensions: ['T'],
      portaIntegrityHold: false,
    });
    ensureWaterfallScorePortaMock.mockReturnValue(score);

    const harness = makeHarness();

    await act(async () => {
      await harness.result.current.runMegaPromptWaterfall(makeRunArgs());
    });

    const finalSession = getSession(harness);
    const finalBotMessage = getBotMessage(harness);

    expect(lookupClienteMock).toHaveBeenCalledWith('Acme Agro');
    expect(formatarParaPromptMock).toHaveBeenCalledTimes(1);
    expect(generateDossierModuleMock).toHaveBeenCalledTimes(5);
    expect(runDossierBenchmarkStageMock).toHaveBeenCalledTimes(1);
    expect(ensureWaterfallScorePortaMock).toHaveBeenCalledWith(
      expect.stringContaining('[[PORTA:74'),
      makeResolution(score),
    );
    expect(harness.resetLoadingProgress).toHaveBeenCalledWith(
      MODULAR_DOSSIER_STAGES[0],
      7,
      { incremental: true, keepHistory: 4 },
    );
    expect(harness.advanceLoadingProgress).toHaveBeenCalledWith(MODULAR_DOSSIER_STAGES[5], 7);
    expect(harness.advanceLoadingProgress).toHaveBeenCalledWith(MODULAR_DOSSIER_STAGES[6], 7);
    expect(harness.completeLoadingProgress).toHaveBeenCalledTimes(1);
    expect(finalSession.scoreOportunidade).toBe(74);
    expect(finalBotMessage.isThinking).toBe(false);
    expect(finalBotMessage.scorePorta).toEqual(score);
    expect(finalBotMessage.portaFallbackApplied).toBe(true);
    expect(finalBotMessage.portaFallbackDimensions).toEqual(['T']);
    expect(finalBotMessage.clienteSeniorData).toMatchObject({
      encontrado: true,
      grupo: 'Grupo Acme',
      totalModulos: 3,
    });
    expect(finalBotMessage.suggestions).toEqual(DEFAULT_SUGGESTIONS);
    expect(finalBotMessage.text).toContain('Raio-X Operacional consolidado');
    expect(finalBotMessage.text).toContain('Benchmark consolidado');
    expect(finalBotMessage.text).not.toContain('[[PORTA');
  });

  it('ignora falha em módulo opcional e anexa nota operacional no dossiê final', async () => {
    const score = makeScorePorta(68);
    generateDossierModuleMock.mockImplementation(async (moduleName: string) => {
      if (moduleName === 'Tech Stack') {
        throw new Error('timeout opcional');
      }
      return `${moduleName} consolidado`;
    });
    reconcileWaterfallPortaMock.mockResolvedValue({
      accumulatedText: [
        'Raio-X Operacional consolidado',
        '---',
        'Riscos & Compliance consolidado',
        '---',
        '[[PORTA:68:P6:O7:R6:T5:A6:PRD:NONE]]',
      ].join('\n\n'),
      resolution: makeResolution(score),
      portaFallbackApplied: false,
      portaFallbackDimensions: [],
      portaIntegrityHold: false,
    });
    ensureWaterfallScorePortaMock.mockReturnValue(score);

    const harness = makeHarness({ canUseLookup: false });

    await act(async () => {
      await harness.result.current.runMegaPromptWaterfall(
        makeRunArgs({ isFirstInteraction: true }),
      );
    });

    const finalBotMessage = getBotMessage(harness);

    expect(harness.resetLoadingProgress).toHaveBeenCalledWith(MODULAR_DOSSIER_STAGES[0], 7);
    expect(harness.replaceLoadingProgressStage).toHaveBeenCalledWith(MODULAR_DOSSIER_STAGES[2], 7);
    expect(harness.setFailureCount.mock.calls.some(([arg]) => typeof arg === 'function')).toBe(true);
    expect(finalBotMessage.text).toContain('Nota operacional');
    expect(finalBotMessage.text).toContain('Tech Stack');
    expect(finalBotMessage.scorePorta?.score).toBe(68);
    expect(harness.completeLoadingProgress).toHaveBeenCalledTimes(1);
  });

  it('preserva a continuidade quando o benchmark falha como etapa opcional', async () => {
    const score = makeScorePorta(65);
    runDossierBenchmarkStageMock.mockImplementation(
      async ({ optionalStepFailures }: { optionalStepFailures: Set<string> }) => {
        optionalStepFailures.add('Benchmark de mercado');
        return false;
      },
    );
    reconcileWaterfallPortaMock.mockResolvedValue({
      accumulatedText: [
        'Raio-X Operacional consolidado',
        '---',
        'Estratégia & Expansão consolidado',
        '---',
        '[[PORTA:65:P6:O7:R6:T6:A5:PRD:NONE]]',
      ].join('\n\n'),
      resolution: makeResolution(score),
      portaFallbackApplied: false,
      portaFallbackDimensions: [],
      portaIntegrityHold: false,
    });
    ensureWaterfallScorePortaMock.mockReturnValue(score);

    const harness = makeHarness({ canUseLookup: false });

    await act(async () => {
      await harness.result.current.runMegaPromptWaterfall(makeRunArgs());
    });

    const finalBotMessage = getBotMessage(harness);

    expect(harness.replaceLoadingProgressStage).toHaveBeenCalledWith(MODULAR_DOSSIER_STAGES[6], 7);
    expect(finalBotMessage.text).toContain('Nota operacional');
    expect(finalBotMessage.text).toContain('Benchmark de mercado');
    expect(getSession(harness).scoreOportunidade).toBe(65);
    expect(harness.completeLoadingProgress).toHaveBeenCalledTimes(1);
  });

  it('mantém scoreOportunidade intacto quando a integridade PORTA entra em hold', async () => {
    reconcileWaterfallPortaMock.mockResolvedValue({
      accumulatedText: 'Texto consolidado sem score validado',
      resolution: makeResolution(null, ['P', 'O', 'R', 'T', 'A']),
      portaFallbackApplied: true,
      portaFallbackDimensions: ['P', 'O', 'R', 'T', 'A'],
      portaIntegrityHold: true,
    });
    ensureWaterfallScorePortaMock.mockReturnValue(makeScorePorta(90));

    const harness = makeHarness({ canUseLookup: false, sessionScore: 41 });

    await act(async () => {
      await harness.result.current.runMegaPromptWaterfall(makeRunArgs());
    });

    const finalSession = getSession(harness);
    const finalBotMessage = getBotMessage(harness);

    expect(ensureWaterfallScorePortaMock).not.toHaveBeenCalled();
    expect(finalSession.scoreOportunidade).toBe(41);
    expect(finalBotMessage.scorePorta).toBeUndefined();
    expect(finalBotMessage.portaFallbackApplied).toBe(true);
    expect(finalBotMessage.portaFallbackDimensions).toEqual(['P', 'O', 'R', 'T', 'A']);
    expect(harness.completeLoadingProgress).toHaveBeenCalledTimes(1);
  });

  it('propaga abort como erro terminal sem concluir o loading', async () => {
    const abortError = createAbortError();
    generateDossierModuleMock.mockRejectedValueOnce(abortError);

    const harness = makeHarness({ canUseLookup: false });

    await expect(
      act(async () => {
        await harness.result.current.runMegaPromptWaterfall(makeRunArgs());
      }),
    ).rejects.toBe(abortError);

    expect(runDossierBenchmarkStageMock).not.toHaveBeenCalled();
    expect(reconcileWaterfallPortaMock).not.toHaveBeenCalled();
    expect(harness.updateSessionById).not.toHaveBeenCalled();
    expect(harness.completeLoadingProgress).not.toHaveBeenCalled();
  });

  it('faz fallback de sugestões e grava o payload final no updateSessionById', async () => {
    const score = makeScorePorta(70);
    generateContinuityQuestionMock.mockRejectedValue(new Error('invalid json'));
    reconcileWaterfallPortaMock.mockResolvedValue({
      accumulatedText: [
        'Texto consolidado para Acme Agro',
        '---',
        '[[PORTA:70:P7:O7:R5:T7:A6:PRD:NONE]]',
      ].join('\n\n'),
      resolution: makeResolution(score),
      portaFallbackApplied: false,
      portaFallbackDimensions: [],
      portaIntegrityHold: false,
    });
    ensureWaterfallScorePortaMock.mockReturnValue(score);

    const harness = makeHarness({ canUseLookup: false });

    await act(async () => {
      await harness.result.current.runMegaPromptWaterfall(makeRunArgs());
    });

    const finalBotMessage = getBotMessage(harness);

    expect(harness.updateSessionById).toHaveBeenCalledTimes(1);
    expect(finalBotMessage.isThinking).toBe(false);
    expect(finalBotMessage.scorePorta?.score).toBe(70);
    expect(finalBotMessage.suggestions).toHaveLength(4);
    expect(finalBotMessage.suggestions?.[0]).toContain('Acme Agro');
    expect(finalBotMessage.suggestions?.every(suggestion => suggestion.endsWith('?'))).toBe(true);
  });
});

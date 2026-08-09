import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MODULAR_DOSSIER_CONSOLIDATION_STAGE, MODULAR_DOSSIER_STAGES } from '../../../constants/loadingStages';
import { DossierRunCancelledError, DossierRunReadError } from '../../../features/dossier/dossier-run-control';
import { useDossierWaterfallOrchestrator } from '../../../features/dossier/waterfall-orchestrator';
import type { LookupResponse } from '../../../services/clientLookupService';
import {
  Sender,
  type ChatSession,
  type Message,
  type PortaDimension,
  type RunMegaPromptWaterfallArgs,
  type ScorePortaData,
} from '../../../types';
import type { PortaScoreResolution } from '../../../utils/porta';
import type { GoldSeamDeps } from '../../../services/llm/gold/seam/gold-dossier-seam';
import type { CanonicalAccount } from '../../../services/llm/gold/gold-contracts';

const uuidv4Mock = vi.hoisted(() => vi.fn());
const generateDossierModuleMock = vi.hoisted(() => vi.fn());
const generateContinuityQuestionMock = vi.hoisted(() => vi.fn());
const lookupClienteMock = vi.hoisted(() => vi.fn());
const formatarParaPromptMock = vi.hoisted(() => vi.fn());
const buscarContextoPineconeMock = vi.hoisted(() => vi.fn());
const buscarContextoDocsPineconeMock = vi.hoisted(() => vi.fn());
const getContextoConcorrentesRegionaisMock = vi.hoisted(() => vi.fn());
const generatePortaContextForDeepDiveMock = vi.hoisted(() => vi.fn());
const fetchCompanyByCnpjMock = vi.hoisted(() => vi.fn());
const runDossierBenchmarkStageMock = vi.hoisted(() => vi.fn());
const reconcileWaterfallPortaMock = vi.hoisted(() => vi.fn());
const ensureWaterfallScorePortaMock = vi.hoisted(() => vi.fn());
const scoutDiagMock = vi.hoisted(() => ({
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
}));
const saveDossierMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const runControlMocks = vi.hoisted(() => ({ assertCanContinue: vi.fn(), assertCanContinueWithRenewal: vi.fn() }));
const lifecycleRpcMocks = vi.hoisted(() => ({ complete: vi.fn(), failed: vi.fn(), release: vi.fn(), cancelled: vi.fn() }));
const evidencePipelineMock = vi.hoisted(() => vi.fn(() => false));
const queryPlannerMocks = vi.hoisted(() => ({ plan: vi.fn(), collect: vi.fn() }));
const tryEnhanceDossierWithGoldMock = vi.hoisted(() => vi.fn());
const createGoldSeamDepsMock = vi.hoisted(() =>
  vi.fn(() => ({ enabled: false, buildCanonical: vi.fn(), runGold: vi.fn() })),
);

vi.mock('uuid', () => ({
  v4: uuidv4Mock,
}));

vi.mock('../../../services/llmService', () => ({
  generateDossierModule: generateDossierModuleMock,
  generateContinuityQuestion: generateContinuityQuestionMock,
}));

vi.mock('../../../features/dossier/dossier-run-control', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../features/dossier/dossier-run-control')>();
  return {
    ...actual,
    assertDossierRunCanContinue: runControlMocks.assertCanContinue,
    // Liveness com renovação preventiva: delega ao mesmo contrato do assert no
    // orquestrador; o comportamento do control em si é coberto por
    // dossier-run-control.test.ts.
    assertDossierRunCanContinueWithRenewal: (...args: unknown[]) => runControlMocks.assertCanContinue(...args),
  };
});

vi.mock('../../../lib/supabase/dossierRuns', () => ({
  markDossierRunCancelled: lifecycleRpcMocks.cancelled,
  markDossierRunCompleted: lifecycleRpcMocks.complete,
  markDossierRunFailed: lifecycleRpcMocks.failed,
  releaseDossierRunLease: lifecycleRpcMocks.release,
}));

vi.mock('../../../utils/feature-flags', () => ({ isEvidencePipelineV2: evidencePipelineMock }));
vi.mock('../../../services/llm/query-planner', () => ({
  buildEntityResolutionFromContext: vi.fn(() => ({ razaoSocial: 'Acme Agro', cnpjRaiz: '12345678', segmentoInferido: 'PRD' })),
  planQueries: queryPlannerMocks.plan,
  executeQueryPlan: queryPlannerMocks.collect,
}));

vi.mock('../../../services/clientLookupService', () => ({
  lookupCliente: lookupClienteMock,
  formatarParaPrompt: formatarParaPromptMock,
}));

vi.mock('../../../services/ragService', () => ({
  buscarContextoPinecone: buscarContextoPineconeMock,
  buscarContextoDocsPinecone: buscarContextoDocsPineconeMock,
}));

vi.mock('../../../services/competitorService', () => ({
  getContextoConcorrentesRegionais: getContextoConcorrentesRegionaisMock,
}));

vi.mock('../../../services/portaStateService', () => ({
  generatePortaContextForDeepDive: generatePortaContextForDeepDiveMock,
}));

vi.mock('../../../services/brasilApiService', () => ({
  fetchCompanyByCnpj: fetchCompanyByCnpjMock,
}));

vi.mock('../../../features/dossier/benchmark-stage', () => ({
  runDossierBenchmarkStage: runDossierBenchmarkStageMock,
}));

// BRU-33 — seam Gold: mockado no nível do módulo; os testes injetam deps
// customizados via makeHarness (zero chamadas provider).
vi.mock('../../../services/llm/gold/seam/gold-dossier-seam', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../services/llm/gold/seam/gold-dossier-seam')>();
  return { ...actual, tryEnhanceDossierWithGold: tryEnhanceDossierWithGoldMock };
});
vi.mock('../../../services/llm/gold/seam/gold-browser-adapter', () => ({
  createGoldSeamDeps: createGoldSeamDepsMock,
}));

vi.mock('../../../features/dossier/porta-reconciliation', () => ({
  reconcileWaterfallPorta: reconcileWaterfallPortaMock,
  ensureWaterfallScorePorta: ensureWaterfallScorePortaMock,
}));

const maybeChatStoreRef = vi.hoisted(() => ({ current: undefined as Record<string, unknown> | undefined }));

vi.mock('../../../stores/chatStore', () => ({
  useMaybeChatStore: () => maybeChatStoreRef.current,
}));

vi.mock('../../../services/storage', () => ({
  storage: {
    saveDossier: saveDossierMock,
    saveDossierStrict: saveDossierMock,
  },
}));

vi.mock('../../../utils/diagnosticLog', () => ({
  scoutDiag: scoutDiagMock,
}));

vi.mock('../../../services/llm/foundation-cache', async () => {
  const actual = await vi.importActual<typeof import('../../../services/llm/foundation-cache')>(
    '../../../services/llm/foundation-cache',
  );
  return {
    ...actual,
  };
});

type StateUpdater<T> = T | ((prev: T) => T);

const DEFAULT_SUGGESTIONS = [
  'Onde a margem começa a vazar primeiro?',
  'Qual frente já exige decisão executiva?',
  'Que risco operacional segue invisível?',
  'Qual risco amadurece nos próximos 90 dias?',
];
const LEGACY_ACME_FALLBACK_SUGGESTIONS = [
  'Qual gargalo em Acme Agro já está consumindo margem e segue tratado como rotina?',
  'Que decisão crítica em Acme Agro continua travada por falta de dados confiáveis?',
  'Onde Acme Agro ainda depende de planilhas e amplia risco operacional sem reação executiva?',
  'Se nada mudar em Acme Agro nos próximos 90 dias, qual ruptura tende a aparecer primeiro?',
];
const FIXED_TEST_TIMESTAMP = '2026-04-19T12:00:00.000Z';

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
    timestamp: new Date(FIXED_TEST_TIMESTAMP),
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
    createdAt: FIXED_TEST_TIMESTAMP,
    updatedAt: FIXED_TEST_TIMESTAMP,
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

function makeResolution(score: ScorePortaData | null, missingDimensions: PortaDimension[] = []): PortaScoreResolution {
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

function makeHarness(
  overrides: {
    canUseLookup?: boolean;
    sessionScore?: number | null;
    messages?: Message[];
    shouldSimulateFallback?: boolean;
    activeGenerationRef?: { current: Record<string, string> };
    goldSeamDeps?: GoldSeamDeps;
  } = {},
) {
  const state = {
    failureCount: 0,
    sessions: [
      makeSession({
        scoreOportunidade: overrides.sessionScore ?? null,
        messages: overrides.messages ?? [
          makeMessage({ id: 'user-1', sender: Sender.User, text: 'Mensagem de abertura' }),
          makeMessage({ id: 'bot-1', sender: Sender.Bot, text: '', isThinking: true }),
        ],
      }),
    ],
  };

  const updateSessionById = vi.fn((sessionId: string, updater: (session: ChatSession) => ChatSession) => {
    if (overrides.shouldSimulateFallback) {
      return;
    }
    let updatedSession: ChatSession | null = null;
    state.sessions = state.sessions.map(session =>
      session.id === sessionId ? (updatedSession = { ...updater(session), updatedAt: FIXED_TEST_TIMESTAMP }) : session,
    );
    return updatedSession;
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
      activeGenerationRef: overrides.activeGenerationRef,
      goldSeamDeps: overrides.goldSeamDeps,
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

function failLifecycleAt(stage: string): void {
  runControlMocks.assertCanContinue.mockImplementation(async (input: { stage: string }) => {
    if (input.stage === stage) {
      throw new DossierRunReadError(`Falha ao consultar lifecycle do dossiê na etapa ${stage}`);
    }
  });
}

describe('useDossierWaterfallOrchestrator', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    runControlMocks.assertCanContinue.mockImplementation(async (input: { signal: AbortSignal }) => {
      if (input.signal.aborted) throw new DossierRunCancelledError('local_abort');
    });
    lifecycleRpcMocks.complete.mockResolvedValue({ run_id: 'run-1' });
    lifecycleRpcMocks.failed.mockResolvedValue({ run_id: 'run-1' });
    lifecycleRpcMocks.release.mockResolvedValue({ run_id: 'run-1' });
    lifecycleRpcMocks.cancelled.mockResolvedValue({ run_id: 'run-1' });
    evidencePipelineMock.mockReturnValue(false);
    queryPlannerMocks.plan.mockResolvedValue({ queries: [] });
    queryPlannerMocks.collect.mockResolvedValue({ items: [], confidenceProfile: { tierACount: 0, tierBCount: 0, modulesCovered: [] } });

    const { resetWaterfallGuard } = await import('../../../features/dossier/waterfall-guard');
    resetWaterfallGuard();

    let uuidCounter = 0;
    uuidv4Mock.mockImplementation(() => `uuid-${++uuidCounter}`);

    lookupClienteMock.mockResolvedValue(makeLookupResponse());
    formatarParaPromptMock.mockReturnValue('Lookup formatado');
    buscarContextoPineconeMock.mockResolvedValue({ context: '', failed: false });
    buscarContextoDocsPineconeMock.mockResolvedValue({ context: '', failed: false });
    getContextoConcorrentesRegionaisMock.mockReturnValue('');
    generatePortaContextForDeepDiveMock.mockReturnValue('');
    fetchCompanyByCnpjMock.mockRejectedValue(new Error('CNPJ lookup not mocked'));
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
      accumulatedText: 'Porte / Teia Societária consolidado\n\n---\n\n[[PORTA:72:P7:O7:R6:T8:A6:PRD:NONE]]',
      resolution: makeResolution(defaultScore),
      portaIntegrityHold: false,
    });
    ensureWaterfallScorePortaMock.mockReturnValue(defaultScore);
  });

  it('consolida o fluxo feliz, persiste o payload final e usa reset incremental em follow-up', async () => {
    const score = makeScorePorta(74);
    reconcileWaterfallPortaMock.mockResolvedValue({
      accumulatedText: [
        'Porte / Teia Societária consolidado',
        '---',
        'Benchmark consolidado',
        '---',
        '[[PORTA:74:P7:O7:R6:T8:A6:PRD:NONE]]',
      ].join('\n\n'),
      resolution: makeResolution(score),
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
    expect(generateDossierModuleMock.mock.calls.map(call => call[0])).toEqual([
      'Teia Societaria — Identidade',
      'Operação / Cadeia de Valor',
      'Bordas de Controle',
      'Riscos & Compliance',
      'Caminho de Venda',
    ]);
    expect(generateDossierModuleMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ companyName: 'Acme Agro' }),
    );
    expect(generateDossierModuleMock.mock.calls[0][2]).toContain('CONTRATO VISÍVEL V2');
    expect(generateDossierModuleMock.mock.calls[0][2]).toContain('Não gere seção "Brief de Reunião"');
    expect(generateDossierModuleMock.mock.calls[0][4]).not.toContain('CONTRATO VISÍVEL V2');
    expect(runDossierBenchmarkStageMock).toHaveBeenCalledTimes(1);
    expect(ensureWaterfallScorePortaMock).toHaveBeenCalledWith(
      expect.stringContaining('[[PORTA:74'),
      makeResolution(score),
    );
    expect(harness.resetLoadingProgress).toHaveBeenCalledWith(MODULAR_DOSSIER_STAGES[0], 7, {
      incremental: true,
      keepHistory: 4,
    });
    expect(harness.advanceLoadingProgress).toHaveBeenCalledWith(MODULAR_DOSSIER_STAGES[5], 7);
    expect(harness.advanceLoadingProgress).toHaveBeenCalledWith(MODULAR_DOSSIER_STAGES[6], 7);
    expect(harness.replaceLoadingProgressStage).toHaveBeenCalledWith(MODULAR_DOSSIER_CONSOLIDATION_STAGE, 7);
    expect(harness.completeLoadingProgress).toHaveBeenCalled();
    expect(finalSession.scoreOportunidade).toBe(74);
    expect(finalBotMessage.isThinking).toBe(false);
    expect(finalBotMessage.scorePorta).toEqual(score);
    expect(finalBotMessage.clienteSeniorData).toMatchObject({
      encontrado: true,
      grupo: 'Grupo Acme',
      totalModulos: 3,
    });
    expect(finalBotMessage.suggestions).toEqual(DEFAULT_SUGGESTIONS);
    expect(finalBotMessage.text).toContain('Porte / Teia Societária consolidado');
    expect(finalBotMessage.text).toContain('Benchmark consolidado');
    expect(finalBotMessage.text).not.toContain('## Brief de Reunião');
    expect(finalBotMessage.text).not.toContain('**Tese da conta:**');
    expect(finalBotMessage.text).not.toContain('[[PORTA');
  });

  it('falha fechada após lookup sem iniciar módulos, benchmark, save ou completed', async () => {
    failLifecycleAt('after_lookup_cliente');
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    const harness = makeHarness();
    const result = await harness.result.current.runMegaPromptWaterfall(makeRunArgs());
    expect(result).toMatchObject({ status: 'FAILED', errorStage: 'after_lookup_cliente' });
    expect(generateDossierModuleMock).not.toHaveBeenCalled();
    expect(runDossierBenchmarkStageMock).not.toHaveBeenCalled();
    expect(saveDossierMock).not.toHaveBeenCalled();
    expect(dispatchSpy).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'dossier:completed' }));
    dispatchSpy.mockRestore();
  });

  it('waterfall bloqueado persiste FAILED sem módulos, save, completed ou release duplicado', async () => {
    const guard = await import('../../../features/dossier/waterfall-guard');
    guard.registerWaterfallStart('other-session');
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    const harness = makeHarness();
    const result = await harness.result.current.runMegaPromptWaterfall(
      makeRunArgs({ dossierRunId: 'run-1', dossierLeaseOwner: 'lease-1' }),
    );
    expect(result).toMatchObject({ status: 'FAILED', errorCode: 'waterfall_blocked', errorStage: 'guard' });
    expect(lifecycleRpcMocks.failed).toHaveBeenCalledWith('run-1', 'lease-1', 'waterfall_blocked', 'guard');
    expect(lifecycleRpcMocks.release).not.toHaveBeenCalled();
    expect(generateDossierModuleMock).not.toHaveBeenCalled();
    expect(saveDossierMock).not.toHaveBeenCalled();
    expect(lifecycleRpcMocks.complete).not.toHaveBeenCalled();
    expect(dispatchSpy).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'dossier:completed' }));
    dispatchSpy.mockRestore();
    guard.resetWaterfallGuard();
  });

  it('guard bloqueado com terminal FAILED indisponível tenta release e diagnostica', async () => {
    const guard = await import('../../../features/dossier/waterfall-guard');
    guard.registerWaterfallStart('other-session');
    lifecycleRpcMocks.failed.mockRejectedValueOnce(new Error('terminal unavailable'));
    const harness = makeHarness();
    const result = await harness.result.current.runMegaPromptWaterfall(
      makeRunArgs({ dossierRunId: 'run-1', dossierLeaseOwner: 'lease-1' }),
    );
    expect(result).toMatchObject({ status: 'FAILED', errorCode: 'waterfall_blocked' });
    expect(lifecycleRpcMocks.release).toHaveBeenCalledTimes(1);
    expect(scoutDiagMock.warn).toHaveBeenCalledWith('WaterfallLifecycle', 'terminal-failure-persist-failed', expect.any(Object));
    guard.resetWaterfallGuard();
  });

  it('generation ref divergente persiste FAILED sem save, completed ou release', async () => {
    const activeGenerationRef = { current: { 'session-1': 'other-bot' } };
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    const harness = makeHarness({ activeGenerationRef });
    const result = await harness.result.current.runMegaPromptWaterfall(
      makeRunArgs({ dossierRunId: 'run-1', dossierLeaseOwner: 'lease-1' }),
    );
    expect(result).toMatchObject({ status: 'FAILED', errorCode: 'generation_ref_cleared', errorStage: 'before_final_session_update' });
    expect(lifecycleRpcMocks.failed).toHaveBeenCalledWith('run-1', 'lease-1', 'generation_ref_cleared', 'before_final_session_update');
    expect(saveDossierMock).not.toHaveBeenCalled();
    expect(lifecycleRpcMocks.complete).not.toHaveBeenCalled();
    expect(lifecycleRpcMocks.release).not.toHaveBeenCalled();
    expect(dispatchSpy).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'dossier:completed' }));
    dispatchSpy.mockRestore();
  });

  it('generation ref divergente tenta release quando terminal FAILED falha', async () => {
    lifecycleRpcMocks.failed.mockRejectedValueOnce(new Error('terminal unavailable'));
    const harness = makeHarness({ activeGenerationRef: { current: { 'session-1': 'other-bot' } } });
    const result = await harness.result.current.runMegaPromptWaterfall(
      makeRunArgs({ dossierRunId: 'run-1', dossierLeaseOwner: 'lease-1' }),
    );
    expect(result).toMatchObject({ status: 'FAILED', errorCode: 'generation_ref_cleared' });
    expect(lifecycleRpcMocks.release).toHaveBeenCalledTimes(1);
    expect(scoutDiagMock.warn).toHaveBeenCalledWith('WaterfallLifecycle', 'terminal-failure-persist-failed', expect.any(Object));
  });

  it('cancelamento após save impede completed e mantém texto final', async () => {
    runControlMocks.assertCanContinue.mockImplementation(async (input: { stage: string }) => {
      if (input.stage === 'after_save_dossier_before_complete') throw new DossierRunCancelledError('remote_cancel');
    });
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    const harness = makeHarness();
    const result = await harness.result.current.runMegaPromptWaterfall(
      makeRunArgs({ dossierRunId: 'run-1', dossierLeaseOwner: 'lease-1' }),
    );
    expect(result).toMatchObject({ status: 'CANCELLED' });
    expect(saveDossierMock).toHaveBeenCalledOnce();
    expect(lifecycleRpcMocks.complete).not.toHaveBeenCalled();
    expect(lifecycleRpcMocks.cancelled).toHaveBeenCalledOnce();
    expect(getBotMessage(harness).text).toContain('Porte / Teia Societária consolidado');
    expect(dispatchSpy).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'dossier:completed' }));
    dispatchSpy.mockRestore();
  });

  it('falha de leitura após save impede completed e persiste FAILED', async () => {
    runControlMocks.assertCanContinue.mockImplementation(async (input: { stage: string }) => {
      if (input.stage === 'after_save_dossier_before_complete') throw new DossierRunReadError('RPC indisponível após save');
    });
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    const harness = makeHarness();
    const result = await harness.result.current.runMegaPromptWaterfall(
      makeRunArgs({ dossierRunId: 'run-1', dossierLeaseOwner: 'lease-1' }),
    );
    expect(result).toMatchObject({ status: 'FAILED', errorStage: 'after_save_dossier_before_complete' });
    expect(saveDossierMock).toHaveBeenCalledOnce();
    expect(lifecycleRpcMocks.complete).not.toHaveBeenCalled();
    expect(lifecycleRpcMocks.failed).toHaveBeenCalledOnce();
    expect(getBotMessage(harness).text).toContain('Porte / Teia Societária consolidado');
    expect(dispatchSpy).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'dossier:completed' }));
    dispatchSpy.mockRestore();
  });

  it('fluxo feliz ordena save, checkpoint pós-save, completed e evento', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    const harness = makeHarness();
    const result = await harness.result.current.runMegaPromptWaterfall(
      makeRunArgs({ dossierRunId: 'run-1', dossierLeaseOwner: 'lease-1' }),
    );
    const postSaveCall = runControlMocks.assertCanContinue.mock.calls.findIndex(
      ([input]) => input.stage === 'after_save_dossier_before_complete',
    );
    expect(result).toMatchObject({ status: 'COMPLETED' });
    expect(postSaveCall).toBeGreaterThanOrEqual(0);
    expect(saveDossierMock.mock.invocationCallOrder[0]).toBeLessThan(runControlMocks.assertCanContinue.mock.invocationCallOrder[postSaveCall]);
    expect(runControlMocks.assertCanContinue.mock.invocationCallOrder[postSaveCall]).toBeLessThan(lifecycleRpcMocks.complete.mock.invocationCallOrder[0]);
    expect(lifecycleRpcMocks.complete.mock.invocationCallOrder[0]).toBeLessThan(dispatchSpy.mock.invocationCallOrder[0]);
    expect(lifecycleRpcMocks.complete).toHaveBeenCalledOnce();
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    dispatchSpy.mockRestore();
  });

  it('falha fechada no módulo opcional e não inicia próximos módulos ou benchmark', async () => {
    failLifecycleAt('after_module:Bordas de Controle');
    const harness = makeHarness();
    const result = await harness.result.current.runMegaPromptWaterfall(makeRunArgs());
    expect(result).toMatchObject({ status: 'FAILED', errorStage: 'after_module:Bordas de Controle' });
    expect(generateDossierModuleMock.mock.calls.map(call => call[0])).toContain('Bordas de Controle');
    expect(generateDossierModuleMock.mock.calls.map(call => call[0])).not.toContain('Riscos & Compliance');
    expect(generateDossierModuleMock.mock.calls.map(call => call[0])).not.toContain('Caminho de Venda');
    expect(runDossierBenchmarkStageMock).not.toHaveBeenCalled();
    expect(saveDossierMock).not.toHaveBeenCalled();
  });

  it('falha fechada após planner V2 sem collector, módulos ou fallback V1', async () => {
    evidencePipelineMock.mockReturnValue(true);
    failLifecycleAt('after_query_planner');
    const harness = makeHarness();
    const result = await harness.result.current.runMegaPromptWaterfall(makeRunArgs());
    expect(result).toMatchObject({ status: 'FAILED', errorStage: 'after_query_planner' });
    expect(queryPlannerMocks.plan).toHaveBeenCalledOnce();
    expect(queryPlannerMocks.collect).not.toHaveBeenCalled();
    expect(generateDossierModuleMock).not.toHaveBeenCalled();
    expect(runDossierBenchmarkStageMock).not.toHaveBeenCalled();
    expect(scoutDiagMock.warn).not.toHaveBeenCalledWith('PipelineV2', 'Fallback v1 (planner/collector falhou)', expect.anything());
  });

  it('falha fechada após collector V2 sem módulos ou fallback V1', async () => {
    evidencePipelineMock.mockReturnValue(true);
    failLifecycleAt('after_query_collector');
    const harness = makeHarness();
    const result = await harness.result.current.runMegaPromptWaterfall(makeRunArgs());
    expect(result).toMatchObject({ status: 'FAILED', errorStage: 'after_query_collector' });
    expect(queryPlannerMocks.plan).toHaveBeenCalledOnce();
    expect(queryPlannerMocks.collect).toHaveBeenCalledOnce();
    expect(generateDossierModuleMock).not.toHaveBeenCalled();
    expect(runDossierBenchmarkStageMock).not.toHaveBeenCalled();
    expect(scoutDiagMock.warn).not.toHaveBeenCalledWith('PipelineV2', 'Fallback v1 (planner/collector falhou)', expect.anything());
  });

  it('falha fechada antes do benchmark sem PORTA, save ou completed', async () => {
    failLifecycleAt('before_benchmark');
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    const harness = makeHarness();
    const result = await harness.result.current.runMegaPromptWaterfall(makeRunArgs());
    expect(result).toMatchObject({ status: 'FAILED', errorStage: 'before_benchmark' });
    expect(generateDossierModuleMock).toHaveBeenCalled();
    expect(runDossierBenchmarkStageMock).not.toHaveBeenCalled();
    expect(reconcileWaterfallPortaMock).not.toHaveBeenCalled();
    expect(saveDossierMock).not.toHaveBeenCalled();
    expect(dispatchSpy).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'dossier:completed' }));
    dispatchSpy.mockRestore();
  });

  it('preserva conteúdo quando markCompleted falha, marca FAILED e não libera lease duas vezes', async () => {
    lifecycleRpcMocks.complete.mockRejectedValueOnce(new Error('completion RPC unavailable'));
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    const harness = makeHarness();
    const result = await harness.result.current.runMegaPromptWaterfall(
      makeRunArgs({ dossierRunId: 'run-1', dossierLeaseOwner: 'lease-1' }),
    );
    const bot = getBotMessage(harness);
    expect(result).toMatchObject({ status: 'FAILED', errorCode: 'lifecycle_completion_failed', errorStage: 'mark_completed' });
    expect(bot.text).toContain('Porte / Teia Societária consolidado');
    expect(bot.isThinking).toBe(false);
    expect(bot.suggestions).toEqual(DEFAULT_SUGGESTIONS);
    expect(bot.scorePorta).toBeTruthy();
    expect(dispatchSpy).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'dossier:completed' }));
    expect(lifecycleRpcMocks.failed).toHaveBeenCalledTimes(1);
    expect(lifecycleRpcMocks.release).not.toHaveBeenCalled();
    dispatchSpy.mockRestore();
  });

  it('COMPLETED persistido não chama release novamente', async () => {
    const harness = makeHarness();
    const result = await harness.result.current.runMegaPromptWaterfall(
      makeRunArgs({ dossierRunId: 'run-1', dossierLeaseOwner: 'lease-1' }),
    );
    expect(result).toMatchObject({ status: 'COMPLETED' });
    expect(lifecycleRpcMocks.complete).toHaveBeenCalledOnce();
    expect(lifecycleRpcMocks.release).not.toHaveBeenCalled();
  });

  it('FAILED persistido não chama release novamente', async () => {
    failLifecycleAt('after_lookup_cliente');
    const harness = makeHarness();
    const result = await harness.result.current.runMegaPromptWaterfall(
      makeRunArgs({ dossierRunId: 'run-1', dossierLeaseOwner: 'lease-1' }),
    );
    expect(result).toMatchObject({ status: 'FAILED', errorStage: 'after_lookup_cliente' });
    expect(lifecycleRpcMocks.failed).toHaveBeenCalledOnce();
    expect(lifecycleRpcMocks.release).not.toHaveBeenCalled();
  });

  it('CANCELLED persistido não chama release novamente', async () => {
    const controller = new AbortController();
    controller.abort();
    const harness = makeHarness();
    const result = await harness.result.current.runMegaPromptWaterfall(
      makeRunArgs({ dossierRunId: 'run-1', dossierLeaseOwner: 'lease-1', signal: controller.signal }),
    );
    expect(result).toMatchObject({ status: 'CANCELLED', terminalPersisted: true });
    expect(lifecycleRpcMocks.cancelled).toHaveBeenCalledOnce();
    expect(lifecycleRpcMocks.release).not.toHaveBeenCalled();
  });

  it('falha de transição terminal tenta release uma vez', async () => {
    failLifecycleAt('after_lookup_cliente');
    lifecycleRpcMocks.failed.mockRejectedValueOnce(new Error('mark failed unavailable'));
    const harness = makeHarness();
    await harness.result.current.runMegaPromptWaterfall(
      makeRunArgs({ dossierRunId: 'run-1', dossierLeaseOwner: 'lease-1' }),
    );
    expect(lifecycleRpcMocks.release).toHaveBeenCalledTimes(1);
  });

  it('agrega fontes de grounding retornadas pelos módulos', async () => {
    const score = makeScorePorta(74);
    generateDossierModuleMock.mockImplementation(
      async (
        moduleName: string,
        _empresa: string,
        _foundation: string,
        _prompt: string,
        _extra: string,
        options?: {
          onGroundingSources?: (
            sources: Array<{ title: string; url: string; verification?: 'grounding' | 'fallback' }>,
            moduleName: string,
          ) => void;
          onVerificationStatus?: (
            status: 'verified' | 'fallback_verified' | 'unverified' | 'not_applicable',
            moduleName: string,
          ) => void;
        },
      ) => {
        options?.onGroundingSources?.(
          [
            { title: `${moduleName} fonte`, url: 'https://example.com/fonte/' },
            {
              title: 'BNDES',
              url: 'https://agenciadenoticias.bndes.gov.br/centro-oeste/BNDES-financia-usina-de-etanol-de-milho-em-Mato-Grosso-com-R%24-1-bi/',
            },
          ],
          moduleName,
        );
        options?.onVerificationStatus?.('verified', moduleName);
        return `${moduleName} consolidado`;
      },
    );
    reconcileWaterfallPortaMock.mockResolvedValue({
      accumulatedText: ['Porte / Teia Societária consolidado', '---', '[[PORTA:74:P7:O8:R7:T7:A6:AGI:NONE]]'].join(
        '\n\n',
      ),
      resolution: makeResolution(score),
      portaIntegrityHold: false,
    });
    ensureWaterfallScorePortaMock.mockReturnValue(score);

    const harness = makeHarness({ canUseLookup: false });

    await act(async () => {
      await harness.result.current.runMegaPromptWaterfall(makeRunArgs());
    });

    const finalBotMessage = getBotMessage(harness);

    expect(finalBotMessage.groundingUsed).toBe(true);
    expect(finalBotMessage.webVerificationStatus).toBe('verified');
    expect(finalBotMessage.groundingSources).toEqual([
      { title: 'Teia Societaria — Identidade fonte', url: 'https://example.com/fonte', verification: 'grounding' },
      {
        title: 'BNDES',
        url: 'https://agenciadenoticias.bndes.gov.br/centro-oeste/BNDES-financia-usina-de-etanol-de-milho-em-Mato-Grosso-com-R%24-1-bi',
        verification: 'grounding',
      },
    ]);
  });

  it('executa módulo 1b quando o gateway do 1a retorna MEDIA e monta contexto sem Pinecone', async () => {
    buscarContextoPineconeMock.mockResolvedValue({
      context: 'RAG holding socios QSA Grupo Acme',
      failed: false,
    });
    buscarContextoDocsPineconeMock.mockResolvedValue({
      context: 'Docs Senior para governanca multi-CNPJ',
      failed: false,
    });
    getContextoConcorrentesRegionaisMock.mockReturnValue('Concorrentes regionais em MT');
    generatePortaContextForDeepDiveMock.mockReturnValue('PORTA Score atual 74');
    fetchCompanyByCnpjMock.mockResolvedValue({
      cnpj: '12345678000190',
      companyName: 'Acme Agro Ltda',
      city: 'Sapezal',
      state: 'MT',
      qsa: [{ name: 'Maria Acme', role: 'Sócia-administradora', source: 'BrasilAPI', confidence: 'official' }],
    });
    generateDossierModuleMock.mockImplementation(async (moduleName: string) => {
      if (moduleName === 'Teia Societaria — Identidade') {
        return 'Visão geral do grupo\n[[TEIA_COMPLEXIDADE:MEDIA]]';
      }
      if (moduleName === 'Teia Societaria — Profundidade') {
        return 'Tabela Mestre de CNPJs aprofundada';
      }
      return `${moduleName} consolidado`;
    });

    const harness = makeHarness();

    await act(async () => {
      await harness.result.current.runMegaPromptWaterfall(makeRunArgs());
    });

    expect(generateDossierModuleMock.mock.calls.map(call => call[0])).toEqual([
      'Teia Societaria — Identidade',
      'Teia Societaria — Profundidade',
      'Operação / Cadeia de Valor',
      'Bordas de Controle',
      'Riscos & Compliance',
      'Caminho de Venda',
    ]);
    const identityExtraContext = generateDossierModuleMock.mock.calls[0][4] as string;
    const deepExtraContext = generateDossierModuleMock.mock.calls[1][4] as string;
    expect(buscarContextoPineconeMock).not.toHaveBeenCalled();
    expect(buscarContextoDocsPineconeMock).not.toHaveBeenCalled();
    expect(identityExtraContext).not.toContain('[CONTEXTO RAG]');
    expect(identityExtraContext).not.toContain('[DOCS RAG]');
    expect(identityExtraContext).toContain('[CONCORRENTES]');
    expect(identityExtraContext).toContain('[PORTA STATE]');
    expect(identityExtraContext).toContain('[QSA OFICIAL]');
    expect(identityExtraContext).toContain('Maria Acme');
    expect(deepExtraContext).toContain('Contexto anterior consolidado');
    expect(deepExtraContext).toContain('Visão geral do grupo');
  });

  it('executa módulo 1b quando o 1a não emite marcador mas a evidência objetiva indica complexidade média', async () => {
    fetchCompanyByCnpjMock.mockResolvedValue({
      cnpj: '12345678000190',
      companyName: 'Acme Agro Ltda',
      city: 'Sapezal',
      state: 'MT',
      qsa: [
        { name: 'Maria Acme', role: 'Sócia-administradora', source: 'BrasilAPI', confidence: 'official' },
        { name: 'João Acme', role: 'Sócio', source: 'BrasilAPI', confidence: 'official' },
        { name: 'Holding Acme Participações S/A', role: 'Sócia', source: 'BrasilAPI', confidence: 'official' },
      ],
    });
    generateDossierModuleMock.mockImplementation(async (moduleName: string) => {
      if (moduleName === 'Teia Societaria — Identidade') {
        return 'Visão geral sem marcador, mas com QSA robusto.';
      }
      if (moduleName === 'Teia Societaria — Profundidade') {
        return 'Profundidade forçada por evidência objetiva.';
      }
      return `${moduleName} consolidado`;
    });

    const harness = makeHarness();

    await act(async () => {
      await harness.result.current.runMegaPromptWaterfall(makeRunArgs());
    });

    expect(generateDossierModuleMock.mock.calls.map(call => call[0])).toContain('Teia Societaria — Profundidade');
    expect(scoutDiagMock.warn).toHaveBeenCalledWith(
      'TeiaSocietaria',
      expect.stringMatching(/marcador de complexidade ausente/i),
      expect.any(Object),
    );
  });

  it('registra alertas de validação societária sem anexar seção fake ao markdown final', async () => {
    generateDossierModuleMock.mockImplementation(async (moduleName: string) => {
      if (moduleName === 'Teia Societaria — Identidade') {
        return 'Entidade internacional citada: Scheffer Colombia S.A.S.\n[[TEIA_COMPLEXIDADE:BAIXA]]';
      }
      return `${moduleName} consolidado`;
    });
    reconcileWaterfallPortaMock.mockImplementation(async ({ accumulatedText }) => ({
      accumulatedText,
      resolution: makeResolution(makeScorePorta(72)),
      portaIntegrityHold: false,
    }));

    const harness = makeHarness({ canUseLookup: false });

    await act(async () => {
      await harness.result.current.runMegaPromptWaterfall(makeRunArgs());
    });

    const finalBotMessage = getBotMessage(harness);
    expect(finalBotMessage.text).not.toContain('### Alertas de validação societária');
    expect(finalBotMessage.text).not.toContain('Entidade(s) internacional(is) detectada(s) sem CNPJ');
    expect(scoutDiagMock.warn).toHaveBeenCalledWith(
      'TeiaSocietaria',
      'CNPJ validation warning',
      expect.objectContaining({
        warning: expect.stringContaining('Entidade(s) internacional(is) detectada(s) sem CNPJ'),
      }),
    );
  });

  it('marca dossiê como fallback_verified quando módulo usa fallback web', async () => {
    const score = makeScorePorta(74);
    generateDossierModuleMock.mockImplementation(
      async (
        moduleName: string,
        _empresa: string,
        _foundation: string,
        _prompt: string,
        _extra: string,
        options?: {
          onGroundingSources?: (
            sources: Array<{ title: string; url: string; verification?: 'grounding' | 'fallback' }>,
            moduleName: string,
          ) => void;
          onVerificationStatus?: (
            status: 'verified' | 'fallback_verified' | 'unverified' | 'not_applicable',
            moduleName: string,
          ) => void;
        },
      ) => {
        options?.onGroundingSources?.(
          [{ title: 'Fallback público', url: 'https://example.com/fallback', verification: 'fallback' }],
          moduleName,
        );
        options?.onVerificationStatus?.('fallback_verified', moduleName);
        return `${moduleName} consolidado`;
      },
    );
    reconcileWaterfallPortaMock.mockResolvedValue({
      accumulatedText: 'Porte / Teia Societária consolidado\n\n[[PORTA:74:P7:O8:R7:T7:A6:AGI:NONE]]',
      resolution: makeResolution(score),
      portaIntegrityHold: false,
    });
    ensureWaterfallScorePortaMock.mockReturnValue(score);

    const harness = makeHarness({ canUseLookup: false });

    await act(async () => {
      await harness.result.current.runMegaPromptWaterfall(makeRunArgs());
    });

    const finalBotMessage = getBotMessage(harness);
    expect(finalBotMessage.webVerificationStatus).toBe('fallback_verified');
    expect(finalBotMessage.groundingSources?.[0]).toMatchObject({ verification: 'fallback' });
  });

  it('promove link público validado do texto para fonte verificada fallback', async () => {
    const score = makeScorePorta(74);
    generateDossierModuleMock.mockImplementation(
      async (
        moduleName: string,
        _empresa: string,
        _foundation: string,
        _prompt: string,
        _extra: string,
        options?: {
          onVerificationStatus?: (
            status: 'verified' | 'fallback_verified' | 'unverified' | 'not_applicable',
            moduleName: string,
          ) => void;
        },
      ) => {
        options?.onVerificationStatus?.('unverified', moduleName);
        return `${moduleName} consolidado`;
      },
    );
    reconcileWaterfallPortaMock.mockResolvedValue({
      accumulatedText: [
        'Resumo com fonte [BNDES](https://www.bndes.gov.br/noticia?utm_source=google).',
        '[[PORTA:74:P7:O8:R7:T7:A6:AGI:NONE]]',
      ].join('\n\n'),
      resolution: makeResolution(score),
      portaIntegrityHold: false,
    });
    ensureWaterfallScorePortaMock.mockReturnValue(score);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        bodyUsed: false,
        json: async () => ({
          results: {
            'https://www.bndes.gov.br/noticia': { status: 'valid', httpStatus: 200 },
          },
        }),
        text: async () =>
          JSON.stringify({
            results: {
              'https://www.bndes.gov.br/noticia': { status: 'valid', httpStatus: 200 },
            },
          }),
      }),
    );

    const harness = makeHarness({ canUseLookup: false });

    await act(async () => {
      await harness.result.current.runMegaPromptWaterfall(makeRunArgs());
    });

    const finalBotMessage = getBotMessage(harness);
    expect(finalBotMessage.webVerificationStatus).toBe('fallback_verified');
    expect(finalBotMessage.groundingUsed).toBe(true);
    expect(finalBotMessage.groundingSources).toEqual([
      { title: 'BNDES', url: 'https://www.bndes.gov.br/noticia', verification: 'fallback' },
    ]);
  });

  it('ignora falha em módulo opcional e anexa nota operacional no dossiê final', async () => {
    const score = makeScorePorta(68);
    generateDossierModuleMock.mockImplementation(async (moduleName: string) => {
      if (moduleName === 'Bordas de Controle') {
        throw new Error('timeout opcional');
      }
      return `${moduleName} consolidado`;
    });
    reconcileWaterfallPortaMock.mockResolvedValue({
      accumulatedText: [
        'Porte / Teia Societária consolidado',
        '---',
        'Riscos & Compliance consolidado',
        '---',
        '[[PORTA:68:P6:O7:R6:T5:A6:PRD:NONE]]',
      ].join('\n\n'),
      resolution: makeResolution(score),
      portaIntegrityHold: false,
    });
    ensureWaterfallScorePortaMock.mockReturnValue(score);

    const harness = makeHarness({ canUseLookup: false });

    await act(async () => {
      await harness.result.current.runMegaPromptWaterfall(makeRunArgs({ isFirstInteraction: true }));
    });

    const finalBotMessage = getBotMessage(harness);

    expect(harness.resetLoadingProgress).toHaveBeenCalledWith(MODULAR_DOSSIER_STAGES[0], 7);
    expect(harness.replaceLoadingProgressStage).toHaveBeenCalledWith(MODULAR_DOSSIER_STAGES[3], 7);
    expect(harness.setFailureCount.mock.calls.some(([arg]) => typeof arg === 'function')).toBe(true);
    expect(finalBotMessage.text).not.toContain('Nota operacional');
    expect(finalBotMessage.text).not.toContain('Bordas de Controle');
    expect(finalBotMessage.scorePorta?.score).toBe(68);
    expect(harness.completeLoadingProgress).toHaveBeenCalled();
    expect(scoutDiagMock.warn).toHaveBeenCalledWith('WaterfallLifecycle', 'optional-steps-failed', {
      sessionId: expect.any(String),
      waterfallRunId: expect.any(String),
      failedSteps: expect.arrayContaining(['Bordas de Controle']),
    });
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
        'Porte / Teia Societária consolidado',
        '---',
        'Riscos & Compliance consolidado',
        '---',
        '[[PORTA:65:P6:O7:R6:T6:A5:PRD:NONE]]',
      ].join('\n\n'),
      resolution: makeResolution(score),
      portaIntegrityHold: false,
    });
    ensureWaterfallScorePortaMock.mockReturnValue(score);

    const harness = makeHarness({ canUseLookup: false });

    await act(async () => {
      await harness.result.current.runMegaPromptWaterfall(makeRunArgs());
    });

    const finalBotMessage = getBotMessage(harness);

    expect(harness.replaceLoadingProgressStage).toHaveBeenCalledWith(MODULAR_DOSSIER_STAGES[6], 7);
    expect(finalBotMessage.text).not.toContain('Nota operacional');
    expect(finalBotMessage.text).not.toContain('Benchmark de mercado');
    expect(getSession(harness).scoreOportunidade).toBe(65);
    expect(harness.completeLoadingProgress).toHaveBeenCalled();
    expect(scoutDiagMock.warn).toHaveBeenCalledWith('WaterfallLifecycle', 'optional-steps-failed', {
      sessionId: expect.any(String),
      waterfallRunId: expect.any(String),
      failedSteps: expect.arrayContaining(['Benchmark de mercado']),
    });
  });

  it('mantém scoreOportunidade intacto quando a integridade PORTA entra em hold', async () => {
    reconcileWaterfallPortaMock.mockResolvedValue({
      accumulatedText: 'Texto consolidado sem score validado',
      resolution: makeResolution(null, ['P', 'O', 'R', 'T', 'A']),
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
    expect(harness.completeLoadingProgress).toHaveBeenCalled();
  });

  it('propaga abort como erro terminal sem concluir o loading', async () => {
    const abortError = createAbortError();
    generateDossierModuleMock.mockRejectedValueOnce(abortError);

    const harness = makeHarness({ canUseLookup: false });

    const result = await harness.result.current.runMegaPromptWaterfall(makeRunArgs());
    expect(result).toMatchObject({ status: 'CANCELLED' });

    expect(runDossierBenchmarkStageMock).not.toHaveBeenCalled();
    expect(reconcileWaterfallPortaMock).not.toHaveBeenCalled();
    expect(harness.updateSessionById).not.toHaveBeenCalled();
    expect(harness.completeLoadingProgress).toHaveBeenCalled();
  });

  it('interrompe antes de consolidar quando o usuário aborta após os módulos', async () => {
    const controller = new AbortController();
    let moduleCalls = 0;
    generateDossierModuleMock.mockImplementation(async (moduleName: string) => {
      moduleCalls += 1;
      if (moduleCalls === 5) controller.abort();
      return `${moduleName} consolidado`;
    });

    const harness = makeHarness({ canUseLookup: false });

    const result = await harness.result.current.runMegaPromptWaterfall(makeRunArgs({ signal: controller.signal }));
    expect(result).toMatchObject({ status: 'CANCELLED' });

    expect(runDossierBenchmarkStageMock).not.toHaveBeenCalled();
    expect(reconcileWaterfallPortaMock).not.toHaveBeenCalled();
    expect(harness.updateSessionById).not.toHaveBeenCalled();
    expect(saveDossierMock).not.toHaveBeenCalled();
    expect(harness.completeLoadingProgress).toHaveBeenCalled();
  });

  it('faz fallback de sugestões e grava o payload final no updateSessionById', async () => {
    const score = makeScorePorta(70);
    generateContinuityQuestionMock.mockRejectedValue(new Error('invalid json'));
    reconcileWaterfallPortaMock.mockResolvedValue({
      accumulatedText: [
        'Texto consolidado para Acme Agro com fechamento financeiro manual, ERP sem integração confiável e vazamento de margem.',
        'A diretoria posterga decisão por falta de dado executivo e há pressão fiscal recorrente.',
        '---',
        '[[PORTA:70:P7:O7:R5:T7:A6:PRD:NONE]]',
      ].join('\n\n'),
      resolution: makeResolution(score),
      portaIntegrityHold: false,
    });
    ensureWaterfallScorePortaMock.mockReturnValue(score);

    const harness = makeHarness({ canUseLookup: false });

    await act(async () => {
      await harness.result.current.runMegaPromptWaterfall(makeRunArgs());
    });

    const finalBotMessage = getBotMessage(harness);

    expect(harness.updateSessionById.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(finalBotMessage.isThinking).toBe(false);
    expect(finalBotMessage.scorePorta?.score).toBe(70);
    expect(finalBotMessage.suggestions).toHaveLength(4);
    expect(finalBotMessage.suggestions?.[0]).toContain('Acme Agro');
    expect(finalBotMessage.suggestions?.every(suggestion => suggestion.endsWith('?'))).toBe(true);
    expect(finalBotMessage.suggestions).not.toEqual(LEGACY_ACME_FALLBACK_SUGGESTIONS);
    expect(
      finalBotMessage.suggestions?.some(suggestion =>
        /margem|diretoria|fiscal|risco|custo|investimento|or[cç]amento/i.test(suggestion),
      ),
    ).toBe(true);
  });

  it('finaliza o waterfall quando sugestões finais ficam pendentes após timeout local', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const score = makeScorePorta(70);
    let continuitySignal: AbortSignal | undefined;
    generateContinuityQuestionMock.mockImplementation(
      (_messages, _company, _seller, options?: { signal?: AbortSignal }) => {
        continuitySignal = options?.signal;
        return new Promise<string[]>(() => {});
      },
    );
    reconcileWaterfallPortaMock.mockResolvedValue({
      accumulatedText: [
        'Texto consolidado para Acme Agro com margem, risco fiscal, diretoria e fechamento manual.',
        '---',
        '[[PORTA:70:P7:O7:R5:T7:A6:PRD:NONE]]',
      ].join('\n\n'),
      resolution: makeResolution(score),
      portaIntegrityHold: false,
    });
    ensureWaterfallScorePortaMock.mockReturnValue(score);

    const harness = makeHarness({ canUseLookup: false });

    let runPromise!: Promise<import('../../../types').DossierWaterfallResult>;
    act(() => {
      runPromise = harness.result.current.runMegaPromptWaterfall(makeRunArgs());
    });

    await vi.waitFor(() => expect(generateContinuityQuestionMock).toHaveBeenCalled(), { timeout: 1000 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_100);
      await runPromise;
    });
    vi.useRealTimers();

    const finalBotMessage = getBotMessage(harness);

    expect(continuitySignal?.aborted).toBe(true);
    expect(harness.completeLoadingProgress).toHaveBeenCalled();
    expect(finalBotMessage.isThinking).toBe(false);
    expect(finalBotMessage.suggestions).toHaveLength(4);
    expect(scoutDiagMock.warn).toHaveBeenCalledWith(
      'ModularDossier',
      'timeout nas sugestões finais do waterfall',
      expect.objectContaining({ sessionId: 'session-1', timeoutMs: 20_000 }),
    );
  });

  // ── Testes do fallback de recuperação de sessão ──

  it('recupera sessão pelo sessionsRef quando updateSessionById perde a sessão (Cenário A)', async () => {
    const score = makeScorePorta(72);
    reconcileWaterfallPortaMock.mockResolvedValue({
      accumulatedText: ['Dossiê consolidado da Acme Agro. [[PORTA:72:P7:O7:R6:T8:A6:PRD:NONE]]'].join('\n\n'),
      resolution: makeResolution(score),
      portaIntegrityHold: false,
    });
    ensureWaterfallScorePortaMock.mockReturnValue(score);

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const setSessionsSpy = vi.fn();

    maybeChatStoreRef.current = {
      sessionsRef: {
        current: [
          makeSession({
            id: 'session-1',
            title: 'Acme Agro',
            empresaAlvo: 'Acme Agro',
            messages: [
              makeMessage({ id: 'user-1', sender: Sender.User, text: 'Mensagem de abertura' }),
              makeMessage({ id: 'bot-1', sender: Sender.Bot, text: '', isThinking: true }),
            ],
          }),
        ],
      },
      setSessions: setSessionsSpy,
    };

    const harness = makeHarness({ shouldSimulateFallback: true });

    await act(async () => {
      await harness.result.current.runMegaPromptWaterfall(makeRunArgs());
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('sessionToPersist VAZIO'), expect.any(String));

    expect(setSessionsSpy).toHaveBeenCalled();
    const updaterFn = setSessionsSpy.mock.calls[0][0];
    const result = updaterFn([]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('session-1');
    expect(result[0].updatedAt).toBeDefined();

    const recoveredMsg = result[0].messages.find((m: Message) => m.id === 'bot-1');
    expect(recoveredMsg).toBeDefined();
    expect(recoveredMsg!.isThinking).toBe(false);
    expect(recoveredMsg!.text).toBeTruthy();

    expect(scoutDiagMock.info).toHaveBeenCalledWith(
      'WaterfallLifecycle',
      'session-recovered-via-ref',
      expect.objectContaining({ sessionId: 'session-1' }),
    );

    consoleErrorSpy.mockRestore();
    maybeChatStoreRef.current = undefined;
  });

  it('recupera sessão quando botMessageId não é encontrado na sessão (Cenário B)', async () => {
    const score = makeScorePorta(70);
    reconcileWaterfallPortaMock.mockResolvedValue({
      accumulatedText: ['Dossiê consolidado. [[PORTA:70:P7:O7:R5:T7:A6:PRD:NONE]]'].join('\n\n'),
      resolution: makeResolution(score),
      portaIntegrityHold: false,
    });
    ensureWaterfallScorePortaMock.mockReturnValue(score);

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const setSessionsSpy = vi.fn();

    maybeChatStoreRef.current = {
      sessionsRef: {
        current: [
          makeSession({
            id: 'session-1',
            title: 'Acme Agro',
            messages: [
              makeMessage({ id: 'user-1', sender: Sender.User, text: 'Mensagem de abertura' }),
              makeMessage({ id: 'outro-bot-id', sender: Sender.Bot, text: '', isThinking: true }),
            ],
          }),
        ],
      },
      setSessions: setSessionsSpy,
    };

    const harness = makeHarness({
      messages: [
        makeMessage({ id: 'user-1', sender: Sender.User, text: 'Mensagem de abertura' }),
        makeMessage({ id: 'outro-bot-id', sender: Sender.Bot, text: '', isThinking: true }),
      ],
    });

    await act(async () => {
      await harness.result.current.runMegaPromptWaterfall(makeRunArgs());
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('botMessageId nao encontrado'),
      expect.any(String),
    );

    expect(setSessionsSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
    maybeChatStoreRef.current = undefined;
  });

  it('log de diagnóstico quando fallback sessionsRef também está vazio', async () => {
    const score = makeScorePorta(72);
    reconcileWaterfallPortaMock.mockResolvedValue({
      accumulatedText: ['Dossiê consolidado. [[PORTA:72:P7:O7:R6:T8:A6:PRD:NONE]]'].join('\n\n'),
      resolution: makeResolution(score),
      portaIntegrityHold: false,
    });
    ensureWaterfallScorePortaMock.mockReturnValue(score);

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    maybeChatStoreRef.current = {
      sessionsRef: { current: [] },
      setSessions: vi.fn(),
    };

    const harness = makeHarness({ shouldSimulateFallback: true });

    let result!: Awaited<ReturnType<typeof harness.result.current.runMegaPromptWaterfall>>;
    await act(async () => {
      result = await harness.result.current.runMegaPromptWaterfall(makeRunArgs());
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('FALLBACK TAMBEM VAZIO'), expect.any(String));
    expect(result).toMatchObject({ status: 'FAILED', errorCode: 'final_session_unavailable', errorStage: 'before_save' });
    expect(saveDossierMock).not.toHaveBeenCalled();
    expect(harness.completeLoadingProgress).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
    maybeChatStoreRef.current = undefined;
  });

  it('dispara evento dossier:completed ao persistir dossiê com sucesso', async () => {
    const score = makeScorePorta(72);
    reconcileWaterfallPortaMock.mockResolvedValue({
      accumulatedText: ['Dossiê consolidado da Acme Agro. [[PORTA:72:P7:O7:R6:T8:A6:PRD:NONE]]'].join('\n\n'),
      resolution: makeResolution(score),
      portaIntegrityHold: false,
    });
    ensureWaterfallScorePortaMock.mockReturnValue(score);

    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    const harness = makeHarness();

    await act(async () => {
      await harness.result.current.runMegaPromptWaterfall(makeRunArgs());
    });

    const customEvent = dispatchSpy.mock.calls.find(
      ([event]: [Event]) => event instanceof CustomEvent && event.type === 'dossier:completed',
    )?.[0] as CustomEvent | undefined;

    expect(customEvent).toBeDefined();
    expect(customEvent!.detail).toMatchObject({
      dossierId: 'session-1',
      companyName: 'Acme Agro',
    });

    dispatchSpy.mockRestore();
  });

  it('hard invariant: força setIsLoading(false) e setLoadingVariant(undefined) ao fim do waterfall com conteúdo', async () => {
    // Regressão PR #334: overlay hero preso após waterfall completar.
    // health-check-final deve garantir domHasLoadingOverlay=false quando
    // waterfallEndStatus=completed e botMsgTextLen > 0.
    const score = makeScorePorta(72);
    reconcileWaterfallPortaMock.mockResolvedValue({
      accumulatedText: ['Dossiê consolidado. [[PORTA:72:P7:O7:R6:T8:A6:PRD:NONE]]'].join('\n\n'),
      resolution: makeResolution(score),
      portaIntegrityHold: false,
    });
    ensureWaterfallScorePortaMock.mockReturnValue(score);

    const setIsLoadingSpy = vi.fn();
    const setLoadingVariantSpy = vi.fn();

    maybeChatStoreRef.current = {
      sessionsRef: {
        current: [
          makeSession({
            id: 'session-1',
            title: 'Acme Agro',
            empresaAlvo: 'Acme Agro',
            messages: [
              makeMessage({ id: 'user-1', sender: Sender.User, text: 'Investigue Acme Agro' }),
              makeMessage({ id: 'bot-1', sender: Sender.Bot, text: '', isThinking: true }),
            ],
          }),
        ],
      },
      setSessions: vi.fn(),
      setIsLoading: setIsLoadingSpy,
      setLoadingVariant: setLoadingVariantSpy,
    };

    const harness = makeHarness();

    await act(async () => {
      await harness.result.current.runMegaPromptWaterfall(makeRunArgs());
    });

    // Hard invariant: setIsLoading(false) e setLoadingVariant(undefined)
    // devem ser chamados ao fim do waterfall com conteúdo.
    expect(setIsLoadingSpy).toHaveBeenCalledWith(false);
    expect(setLoadingVariantSpy).toHaveBeenCalledWith(undefined);

    // health-check-final deve ter sido logado
    expect(scoutDiagMock.info).toHaveBeenCalledWith(
      'WaterfallLifecycle',
      'health-check-final',
      expect.objectContaining({
        waterfallEndStatus: 'completed',
        dossierWasPersisted: true,
      }),
    );

    maybeChatStoreRef.current = undefined;
  });

  // ─── BRU-33: seam Gold pós-processamento fail-closed ─────────────────────

  function makeGoldEnabledDeps(): GoldSeamDeps {
    return {
      enabled: true,
      buildCanonical: vi.fn(async (): Promise<CanonicalAccount> => ({
        inputCnpj: '12.345.678/0001-90',
        legalName: 'Acme Agro',
        establishmentType: 'Matriz',
        rootCnpj: '12345678',
        headOfficeCnpj: null,
        headOfficeLegalName: null,
        directPjPartners: [],
        qsaPeople: [],
      })),
      runGold: vi.fn(async () => ({
        goldBrief: '**GOLD BRIEF EXECUTIVO | SCOUT 360**\n\n### 1. SÍNTESE EXECUTIVA\n\nGold de teste elegível.',
        safePack: { findings: [] } as never,
        sanitizerEvents: [],
        verification: { passed: true, hardFails: [] },
      })),
    };
  }

  it('BRU-33: flag OFF (default) → fluxo atual intacto, seam NÃO é chamado', async () => {
    tryEnhanceDossierWithGoldMock.mockResolvedValue('NAO_DEVE_SER_USADO');
    const harness = makeHarness();

    const result = await act(async () => harness.result.current.runMegaPromptWaterfall(makeRunArgs()));

    expect(result?.status).toBe('COMPLETED');
    expect(tryEnhanceDossierWithGoldMock).not.toHaveBeenCalled();
    expect(getBotMessage(harness).text).toContain('consolidado');
  });

  it('BRU-33: Gold elegível → o usuário recebe o Gold (mesmo texto em UI/persistência)', async () => {
    const goldText = '**GOLD BRIEF EXECUTIVO | SCOUT 360**\n\nGold de teste elegível.';
    tryEnhanceDossierWithGoldMock.mockResolvedValue(goldText);
    const harness = makeHarness({ goldSeamDeps: makeGoldEnabledDeps() });

    const result = await act(async () => harness.result.current.runMegaPromptWaterfall(makeRunArgs()));

    expect(result?.status).toBe('COMPLETED');
    expect(getBotMessage(harness).text).toBe(goldText);
    expect(getBotMessage(harness).text).not.toContain('consolidado');
  });

  it('BRU-33: seam devolve o dossiê (Verifier/Contract FAIL) → dossiê original intacto', async () => {
    const harness = makeHarness({ goldSeamDeps: makeGoldEnabledDeps() });
    tryEnhanceDossierWithGoldMock.mockImplementation(
      async ({ dossierText }: { dossierText: string }) => dossierText,
    );

    const result = await act(async () => harness.result.current.runMegaPromptWaterfall(makeRunArgs()));

    expect(result?.status).toBe('COMPLETED');
    expect(getBotMessage(harness).text).toContain('consolidado');
    expect(getBotMessage(harness).text).not.toContain('GOLD BRIEF');
  });

  it('BRU-33: erro interno do Gold (LLM 502) → fallback silencioso no dossiê', async () => {
    tryEnhanceDossierWithGoldMock.mockRejectedValue(new Error('LiteLLM 502'));
    const harness = makeHarness({ goldSeamDeps: makeGoldEnabledDeps() });

    const result = await act(async () => harness.result.current.runMegaPromptWaterfall(makeRunArgs()));

    expect(result?.status).toBe('COMPLETED');
    expect(getBotMessage(harness).text).toContain('consolidado');
  });

  it('BRU-33: abort do usuário durante o Gold NÃO vira fallback — preserva CANCELLED', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    tryEnhanceDossierWithGoldMock.mockRejectedValue(abortError);
    const harness = makeHarness({ goldSeamDeps: makeGoldEnabledDeps() });

    const result = await act(async () => harness.result.current.runMegaPromptWaterfall(makeRunArgs()));

    expect(result?.status).toBe('CANCELLED');
    expect(getBotMessage(harness).text).not.toContain('GOLD BRIEF');
  });
});

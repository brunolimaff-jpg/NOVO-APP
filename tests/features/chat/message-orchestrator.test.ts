import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatMessageOrchestrator } from '../../../features/chat/message-orchestrator';
import { Sender, type ChatSession, type DossierWaterfallResult, type LastAction, type Message } from '../../../types';
import type { LoadingVariant, RequestKind } from '../../../utils/loadingVariant';

const uuidv4Mock = vi.hoisted(() => vi.fn());
const sendMessageToLlmMock = vi.hoisted(() => vi.fn());
const lifecycleMocks = vi.hoisted(() => ({ create: vi.fn(), acquire: vi.fn(), start: vi.fn(() => vi.fn()), set: vi.fn(), clear: vi.fn() }));
const trackOperatorEventMock = vi.hoisted(() => vi.fn());
const apiConfigMock = vi.hoisted(() => ({ backendUrl: 'https://mock-backend.test' as string | undefined }));

vi.mock('uuid', () => ({
  v4: uuidv4Mock,
}));

vi.mock('../../../services/llmService', () => ({
  sendMessageToLlm: sendMessageToLlmMock,
}));
vi.mock('../../../services/apiConfig', () => ({
  get BACKEND_URL() {
    return apiConfigMock.backendUrl;
  },
}));
vi.mock('../../../lib/supabase/dossierRuns', () => ({
  DOSSIER_RUN_RPC_TIMEOUT_MS: 15_000,
  createOrGetDossierRun: lifecycleMocks.create,
  acquireDossierRunLease: lifecycleMocks.acquire,
}));
vi.mock('../../../features/dossier/dossier-run-heartbeat', () => ({ startDossierRunHeartbeat: lifecycleMocks.start }));
vi.mock('../../../features/dossier/active-run-registry', () => ({ setActiveDossierRun: lifecycleMocks.set, clearActiveDossierRun: lifecycleMocks.clear }));
vi.mock('../../../services/operatorTracking', () => ({ trackOperatorEvent: trackOperatorEventMock }));

// Outros testes mockam useToast e chatStore globalmente com vi.mock().
// Como vitest nao restaura mocks de modulo entre arquivos, esses mocks
// vazam para este teste e quebram o renderHook se nao desfeitos.
vi.unmock('../../../hooks/useToast');
vi.unmock('../../../stores/chatStore');

function applyStateUpdate<T>(current: T, next: T | ((prev: T) => T)): T {
  return typeof next === 'function' ? (next as (prev: T) => T)(current) : next;
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'message-1',
    sender: Sender.Bot,
    text: 'Resposta consolidada',
    timestamp: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

function makeSession(overrides: Partial<ChatSession> = {}): ChatSession {
  return {
    id: 'session-1',
    title: 'Acme Agro',
    empresaAlvo: 'Acme Agro',
    cnpj: null,
    modoPrincipal: 'investigacao',
    scoreOportunidade: null,
    resumoDossie: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    messages: [],
    ...overrides,
  };
}

function makeLlmResult(overrides: Partial<Awaited<ReturnType<typeof sendMessageToLlmMock>>> = {}) {
  return {
    text: 'Resposta consolidada',
    sources: [],
    suggestions: ['Qual risco já está escalando?'],
    scorePorta: null,
    clienteSeniorData: undefined,
    ghostReason: null,
    ...overrides,
  };
}

function makeHarness(
  overrides: {
    sessions?: ChatSession[];
    currentSessionId?: string | null;
    requestKind?: RequestKind;
    investigationLogged?: boolean;
    lastAction?: LastAction | null;
  } = {},
) {
  const state = {
    sessions: overrides.sessions ?? [],
    currentSessionId: overrides.currentSessionId ?? null,
    requestKind: overrides.requestKind ?? ('default' as RequestKind),
    isLoading: false,
    loadingVariant: 'hero' as LoadingVariant,
    loadingPinnedLabel: null as string | null,
    visibleCount: 0,
    failureCount: 0,
    lastQuery: '',
    investigationLogged: overrides.investigationLogged ?? false,
  };

  const sessionsRef = { current: state.sessions };
  const lastActionRef = { current: overrides.lastAction ?? (null as LastAction | null) };
  const abortControllerRef = { current: null as AbortController | null };
  const activeGenerationRef = { current: {} as Record<string, string> };
  const setSessions = vi.fn((next: ChatSession[] | ((prev: ChatSession[]) => ChatSession[])) => {
    state.sessions = applyStateUpdate(state.sessions, next);
    sessionsRef.current = state.sessions;
  });
  const setCurrentSessionId = vi.fn((next: string | null | ((prev: string | null) => string | null)) => {
    state.currentSessionId = applyStateUpdate(state.currentSessionId, next);
  });
  const updateSessionById = vi.fn((sessionId: string, updater: (session: ChatSession) => ChatSession) => {
    state.sessions = state.sessions.map(session =>
      session.id === sessionId ? { ...updater(session), updatedAt: new Date().toISOString() } : session,
    );
    sessionsRef.current = state.sessions;
  });
  const setRequestKind = vi.fn((next: RequestKind | ((prev: RequestKind) => RequestKind)) => {
    state.requestKind = applyStateUpdate(state.requestKind, next);
  });
  const setIsLoading = vi.fn((next: boolean | ((prev: boolean) => boolean)) => {
    state.isLoading = applyStateUpdate(state.isLoading, next);
  });
  const resetLoadingProgress = vi.fn();
  const advanceLoadingProgress = vi.fn();
  const completeLoadingProgress = vi.fn();
  const setFailureCount = vi.fn((next: number | ((prev: number) => number)) => {
    state.failureCount = applyStateUpdate(state.failureCount, next);
  });
  const setLoadingVariant = vi.fn((next: LoadingVariant | ((prev: LoadingVariant) => LoadingVariant)) => {
    state.loadingVariant = applyStateUpdate(state.loadingVariant, next);
  });
  const setLoadingPinnedLabel = vi.fn((next: string | null | ((prev: string | null) => string | null)) => {
    state.loadingPinnedLabel = applyStateUpdate(state.loadingPinnedLabel, next);
  });
  const setVisibleCount = vi.fn((next: number | ((prev: number) => number)) => {
    state.visibleCount = applyStateUpdate(state.visibleCount, next);
  });
  const setLastQuery = vi.fn((next: string | ((prev: string) => string)) => {
    state.lastQuery = applyStateUpdate(state.lastQuery, next);
  });
  const toast = { warning: vi.fn() };
  const setInvestigationLogged = vi.fn((next: boolean | ((prev: boolean) => boolean)) => {
    state.investigationLogged = applyStateUpdate(state.investigationLogged, next);
  });
  const runMegaPromptWaterfall = vi.fn(async (): Promise<import('../../../types').DossierWaterfallResult> => ({ status: 'COMPLETED' }));

  const buildOptions = (): Parameters<typeof useChatMessageOrchestrator>[0] => ({
    currentSessionId: state.currentSessionId,
    setSessions,
    setCurrentSessionId,
    sessionsRef,
    lastActionRef,
    abortControllerRef,
    activeGenerationRef,
    updateSessionById,
    systemInstruction: 'SYSTEM',
    mode: 'investigacao',
    resolvedOperatorName: 'Bruno Lima',
    canUseLookup: true,
    requestKind: state.requestKind,
    setRequestKind,
    setIsLoading,
    resetLoadingProgress,
    advanceLoadingProgress,
    completeLoadingProgress,
    setFailureCount,
    setLoadingVariant,
    setLoadingPinnedLabel,
    setVisibleCount,
    setLastQuery,
    toast,
    investigationLogged: state.investigationLogged,
    setInvestigationLogged,
    runMegaPromptWaterfall,
  });

  const rendered = renderHook(() => useChatMessageOrchestrator(buildOptions()));

  return {
    ...rendered,
    state,
    sessionsRef,
    lastActionRef,
    abortControllerRef,
    activeGenerationRef,
    setSessions,
    setCurrentSessionId,
    updateSessionById,
    setRequestKind,
    setIsLoading,
    resetLoadingProgress,
    advanceLoadingProgress,
    completeLoadingProgress,
    setFailureCount,
    setLoadingVariant,
    setLoadingPinnedLabel,
    setVisibleCount,
    setLastQuery,
    toast,
    setInvestigationLogged,
    runMegaPromptWaterfall,
  };
}

describe('useChatMessageOrchestrator', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    apiConfigMock.backendUrl = 'https://mock-backend.test';
    uuidv4Mock.mockReset();
    sendMessageToLlmMock.mockReset();
    lifecycleMocks.create.mockResolvedValue({ run_id: 'run-1' });
    lifecycleMocks.acquire.mockResolvedValue({ status: 'RUNNING', lease_expires_at: 'future' });
    global.fetch = vi.fn(async () => ({ ok: true }) as Response) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('cria nova sessão no primeiro envio e usa histórico vazio', async () => {
    uuidv4Mock
      .mockReturnValueOnce('session-new')
      .mockReturnValueOnce('message-user')
      .mockReturnValueOnce('message-bot');
    sendMessageToLlmMock.mockResolvedValue(makeLlmResult());
    const harness = makeHarness();

    await act(async () => {
      await harness.result.current.handleSendMessage('Investigar Acme Agro');
    });

    expect(harness.state.currentSessionId).toBe('session-new');
    expect(harness.state.sessions).toHaveLength(1);
    expect(harness.state.sessions[0].messages).toHaveLength(2);
    expect(harness.state.sessions[0].messages[0].sender).toBe(Sender.User);
    expect(harness.state.sessions[0].messages[1]).toMatchObject({
      id: 'message-bot',
      sender: Sender.Bot,
      text: 'Resposta consolidada',
      isThinking: false,
    });
    expect(sendMessageToLlmMock).toHaveBeenCalledWith(
      'Investigar Acme Agro',
      [],
      'SYSTEM',
      expect.objectContaining({ sessionId: 'session-new' }),
      true,
    );
    expect(harness.activeGenerationRef.current['session-new']).toBeUndefined();
  });

  it('usa histórico existente em follow-up e muda loadingVariant para inline', async () => {
    uuidv4Mock.mockReturnValueOnce('message-user').mockReturnValueOnce('message-bot');
    sendMessageToLlmMock.mockResolvedValue(makeLlmResult());
    const harness = makeHarness({
      sessions: [
        makeSession({
          messages: [
            makeMessage({ id: 'user-1', sender: Sender.User, text: 'Mensagem inicial' }),
            makeMessage({ id: 'bot-1', sender: Sender.Bot, text: 'Resposta inicial' }),
          ],
        }),
      ],
      currentSessionId: 'session-1',
    });

    await act(async () => {
      await harness.result.current.handleSendMessage('Qual o risco agora?');
    });

    expect(sendMessageToLlmMock).toHaveBeenCalledWith(
      'Qual o risco agora?',
      expect.arrayContaining([expect.objectContaining({ id: 'user-1' }), expect.objectContaining({ id: 'bot-1' })]),
      'SYSTEM',
      expect.objectContaining({ sessionId: 'session-1', isFollowUp: true }),
      true,
    );
    expect(harness.state.loadingVariant).toBeUndefined();
  });

  it('insere placeholder thinking antes da resposta padrão', async () => {
    const deferred = createDeferred<Awaited<ReturnType<typeof sendMessageToLlmMock>>>();
    uuidv4Mock
      .mockReturnValueOnce('session-new')
      .mockReturnValueOnce('message-user')
      .mockReturnValueOnce('message-bot');
    sendMessageToLlmMock.mockReturnValue(deferred.promise);
    const harness = makeHarness();

    let pendingSend!: Promise<DossierWaterfallResult | null | undefined>;
    act(() => {
      pendingSend = harness.result.current.handleSendMessage('Investigar Acme Agro');
    });

    expect(harness.state.loadingVariant).toBe('inline');
    expect(harness.state.sessions[0].messages[harness.state.sessions[0].messages.length - 1]).toMatchObject({
      id: 'message-bot',
      isThinking: true,
      loadingVariant: 'inline',
    });

    await act(async () => {
      deferred.resolve(makeLlmResult());
      await pendingSend;
    });
  });

  it('descarta a sessão inicial quando o envio é abortado antes de gerar resposta', async () => {
    uuidv4Mock
      .mockReturnValueOnce('session-new')
      .mockReturnValueOnce('message-user')
      .mockReturnValueOnce('message-bot');
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    sendMessageToLlmMock.mockRejectedValue(abortError);
    const harness = makeHarness();

    await act(async () => {
      await harness.result.current.handleSendMessage('Investigar Acme Agro');
    });

    expect(harness.state.sessions).toHaveLength(0);
    expect(harness.state.currentSessionId).toBeNull();
    expect(harness.state.isLoading).toBe(false);
  });

  it('anexa mensagem de erro quando o envio falha com erro de rede', async () => {
    uuidv4Mock
      .mockReturnValueOnce('session-new')
      .mockReturnValueOnce('message-user')
      .mockReturnValueOnce('message-bot')
      .mockReturnValueOnce('message-error');
    sendMessageToLlmMock.mockRejectedValue(new Error('Failed to fetch'));
    const harness = makeHarness();

    await act(async () => {
      await harness.result.current.handleSendMessage('Investigar Acme Agro');
    });

    expect(harness.state.sessions).toHaveLength(1);
    expect(harness.state.isLoading).toBe(false);
    expect(harness.state.sessions[0].messages[harness.state.sessions[0].messages.length - 1]).toMatchObject({
      id: 'message-error',
      sender: Sender.Bot,
      isError: true,
      text: 'Erro no processamento',
    });
  });

  it('retryLastSendMessage remove ghost/error final e reenfileira o último texto', async () => {
    uuidv4Mock.mockReturnValueOnce('message-bot');
    sendMessageToLlmMock.mockResolvedValue(makeLlmResult({ text: 'Resposta reprocessada' }));
    const harness = makeHarness({
      sessions: [
        makeSession({
          messages: [
            makeMessage({ id: 'user-1', sender: Sender.User, text: 'Texto original' }),
            makeMessage({ id: 'bot-error', sender: Sender.Bot, text: '', ghostDetails: 'stream_timeout' }),
          ],
        }),
      ],
      currentSessionId: 'session-1',
      lastAction: {
        type: 'sendMessage',
        payload: { text: 'Texto original', displayText: 'Texto original' },
      },
    });

    await act(async () => {
      harness.result.current.retryLastSendMessage();
    });

    expect(sendMessageToLlmMock).toHaveBeenCalledWith(
      'Texto original',
      [],
      'SYSTEM',
      expect.objectContaining({ sessionId: 'session-1' }),
      true,
    );
    expect(harness.state.sessions[0].messages).toHaveLength(2);
    expect(harness.state.sessions[0].messages[1]).toMatchObject({
      id: 'message-bot',
      text: 'Resposta reprocessada',
      isThinking: false,
    });
  });

  it('delega megaprompt para o callback de waterfall em vez do sendMessageToLlm', async () => {
    uuidv4Mock
      .mockReturnValueOnce('session-new')
      .mockReturnValueOnce('message-user')
      .mockReturnValueOnce('message-bot');
    const harness = makeHarness();

    await act(async () => {
      await harness.result.current.handleSendMessage('DOSSIÊ COMPLETO de Acme Agro');
    });

    expect(harness.runMegaPromptWaterfall).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-new',
        text: 'DOSSIÊ COMPLETO de Acme Agro',
        botMessageId: 'message-bot',
      }),
    );
    expect(sendMessageToLlmMock).not.toHaveBeenCalled();
  });

  it('mantém placeholder como erro visível quando a lease não é adquirida', async () => {
    uuidv4Mock
      .mockReturnValueOnce('session-new')
      .mockReturnValueOnce('message-user')
      .mockReturnValueOnce('message-bot');
    lifecycleMocks.acquire.mockResolvedValueOnce(null);
    const harness = makeHarness();

    await act(async () => {
      await harness.result.current.handleSendMessage('DOSSIÊ COMPLETO de Acme Agro');
    });

    const placeholder = harness.state.sessions[0].messages.find(message => message.id === 'message-bot');
    expect(placeholder).toMatchObject({
      isThinking: false,
      loadingVariant: undefined,
      isError: true,
      text: expect.stringContaining('já existe uma execução em andamento'),
    });
    expect(placeholder?.errorDetails).toBeDefined();
    expect(lifecycleMocks.create).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ signal: expect.any(AbortSignal), timeoutMs: 15_000 }),
    );
    expect(lifecycleMocks.acquire).toHaveBeenCalledWith(
      'run-1',
      expect.any(String),
      expect.objectContaining({ signal: expect.any(AbortSignal), timeoutMs: 15_000 }),
    );
    expect(lifecycleMocks.start).not.toHaveBeenCalled();
    expect(lifecycleMocks.set).not.toHaveBeenCalled();
    expect(harness.runMegaPromptWaterfall).not.toHaveBeenCalled();
    expect(trackOperatorEventMock).not.toHaveBeenCalledWith('dossier_started', expect.anything());
    expect(trackOperatorEventMock).not.toHaveBeenCalledWith('dossier_failed', expect.anything());
    expect(trackOperatorEventMock).not.toHaveBeenCalledWith('dossier_cancelled', expect.anything());
  });

  it('falha de RPC inicial mantém lifecycle fail-closed e não inicia waterfall', async () => {
    uuidv4Mock
      .mockReturnValueOnce('session-new')
      .mockReturnValueOnce('message-user')
      .mockReturnValueOnce('message-bot')
      .mockReturnValueOnce('message-error');
    lifecycleMocks.create.mockRejectedValueOnce(new Error('RPC indisponível'));
    const harness = makeHarness();

    await act(async () => {
      await harness.result.current.handleSendMessage('DOSSIÊ COMPLETO de Acme Agro');
    });

    expect(harness.runMegaPromptWaterfall).not.toHaveBeenCalled();
    expect(lifecycleMocks.start).not.toHaveBeenCalled();
    expect(harness.state.sessions[0].messages.some(message => message.isError)).toBe(true);
  });

  it('CANCELLED rastreia dossier_cancelled uma vez sem terminal de falha ou sucesso', async () => {
    uuidv4Mock
      .mockReturnValueOnce('session-new')
      .mockReturnValueOnce('message-user')
      .mockReturnValueOnce('message-bot');
    const harness = makeHarness();
    harness.runMegaPromptWaterfall.mockResolvedValueOnce({
      status: 'CANCELLED',
      terminalPersisted: true,
      reason: 'remote_cancel',
    });

    await act(async () => {
      await harness.result.current.handleSendMessage('DOSSIÊ COMPLETO de Acme Agro');
    });

    expect(trackOperatorEventMock.mock.calls.filter(([event]) => event === 'dossier_cancelled')).toHaveLength(1);
    expect(trackOperatorEventMock.mock.calls.filter(([event]) => event === 'dossier_failed')).toHaveLength(0);
    expect(trackOperatorEventMock.mock.calls.filter(([event]) => event === 'dossier_completed')).toHaveLength(0);
  });

  it('anexa mensagem de erro quando waterfall falha apos limpar activeGeneration', async () => {
    uuidv4Mock
      .mockReturnValueOnce('session-new')
      .mockReturnValueOnce('message-user')
      .mockReturnValueOnce('message-bot')
      .mockReturnValueOnce('message-error');
    const harness = makeHarness();
    harness.runMegaPromptWaterfall.mockImplementationOnce(async () => {
      delete harness.activeGenerationRef.current['session-new'];
      return { status: 'FAILED', errorCode: 'api_unavailable', errorStage: 'waterfall', error: new Error('api llm indisponivel') };
    });

    await act(async () => {
      await harness.result.current.handleSendMessage('DOSSIÊ COMPLETO de Acme Agro');
    });

    expect(harness.state.sessions).toHaveLength(1);
    expect(harness.state.isLoading).toBe(false);
    expect(harness.state.sessions[0].messages[harness.state.sessions[0].messages.length - 1]).toMatchObject({
      id: 'message-error',
      sender: Sender.Bot,
      isError: true,
      text: 'Erro no processamento',
    });
  });

  it.each([
    ['persist_failed', 'save_dossier'],
    ['lifecycle_completion_failed', 'mark_completed'],
  ])('preserva texto e emite dossier_failed uma vez para %s', async (errorCode, errorStage) => {
    uuidv4Mock
      .mockReturnValueOnce('session-new')
      .mockReturnValueOnce('message-user')
      .mockReturnValueOnce('message-bot');
    const harness = makeHarness();
    harness.runMegaPromptWaterfall.mockImplementationOnce(async () => {
      harness.updateSessionById('session-new', session => ({
        ...session,
        messages: session.messages.map(message =>
          message.id === 'message-bot' ? { ...message, text: 'Dossiê consolidado' } : message,
        ),
      }));
      return { status: 'FAILED', errorCode, errorStage, error: new Error('persistência indisponível') };
    });

    await act(async () => {
      await harness.result.current.handleSendMessage('DOSSIÊ COMPLETO de Acme Agro');
    });

    const botMessage = harness.state.sessions[0].messages.find(message => message.id === 'message-bot');
    expect(botMessage).toMatchObject({ id: 'message-bot', text: 'Dossiê consolidado', isError: true });
    expect(harness.state.sessions[0].messages.some(message => message.text === 'Erro no processamento')).toBe(false);
    expect(trackOperatorEventMock).toHaveBeenCalledTimes(2);
    expect(trackOperatorEventMock).toHaveBeenLastCalledWith('dossier_failed', expect.any(Object));
  });

  it('nao cria sessao orfa quando a primeira investigacao dispara duas vezes antes do re-render', async () => {
    const deferred = createDeferred<import('../../../types').DossierWaterfallResult>();
    uuidv4Mock
      .mockReturnValueOnce('session-first')
      .mockReturnValueOnce('message-user-first')
      .mockReturnValueOnce('message-bot-first')
      .mockReturnValueOnce('session-second')
      .mockReturnValueOnce('message-user-second')
      .mockReturnValueOnce('message-bot-second');
    const harness = makeHarness();
    harness.runMegaPromptWaterfall.mockImplementationOnce(() => deferred.promise);

    let firstSend!: Promise<DossierWaterfallResult | null | undefined>;
    act(() => {
      firstSend = harness.result.current.handleSendMessage(
        'DOSSIÊ COMPLETO de Grupo Scheffer',
        '🔍 Investigando Grupo Scheffer...',
        'Grupo Scheffer',
      );
    });

    expect(harness.state.sessions).toHaveLength(1);
    expect(harness.state.sessions[0].id).toBe('session-first');
    expect(harness.state.sessions[0].messages).toHaveLength(2);

    await act(async () => {
      await harness.result.current.handleSendMessage(
        'DOSSIÊ COMPLETO de Grupo Scheffer',
        '🔍 Investigando Grupo Scheffer...',
        'Grupo Scheffer',
      );
    });

    expect(harness.state.currentSessionId).toBe('session-first');
    expect(harness.state.sessions).toHaveLength(1);
    expect(harness.state.sessions[0].messages).toHaveLength(2);
    expect(harness.runMegaPromptWaterfall).toHaveBeenCalledTimes(1);

    await act(async () => {
      deferred.resolve({ status: 'COMPLETED' });
      await firstSend;
    });
  });

  it('mantém deep_dive no caminho padrão e preserva o pinned label durante o envio', async () => {
    const deferred = createDeferred<Awaited<ReturnType<typeof sendMessageToLlmMock>>>();
    uuidv4Mock
      .mockReturnValueOnce('session-new')
      .mockReturnValueOnce('message-user')
      .mockReturnValueOnce('message-bot');
    sendMessageToLlmMock.mockReturnValue(deferred.promise);
    const harness = makeHarness();

    let pendingSend!: Promise<DossierWaterfallResult | null | undefined>;
    act(() => {
      pendingSend = harness.result.current.handleSendMessage(
        'Dossiê completo de [Acme Agro]. Protocolo oculto',
        'Dossiê completo: Tech Stack',
        'Acme Agro',
        {
          requestKind: 'deep_dive',
          fixedLoadingLine: 'Deep Dive em andamento: Tech Stack',
        },
      );
    });

    expect(harness.state.loadingVariant).toBe('inline');
    expect(harness.state.loadingPinnedLabel).toBe('Deep Dive em andamento: Tech Stack');
    expect(harness.runMegaPromptWaterfall).not.toHaveBeenCalled();
    expect(sendMessageToLlmMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      deferred.resolve(makeLlmResult());
      await pendingSend;
    });
  });

  it('loga investigação remota quando a resposta padrão ultrapassa 500 caracteres', async () => {
    uuidv4Mock
      .mockReturnValueOnce('session-new')
      .mockReturnValueOnce('message-user')
      .mockReturnValueOnce('message-bot');
    sendMessageToLlmMock.mockResolvedValue(makeLlmResult({ text: 'A'.repeat(600) }));
    const harness = makeHarness();

    await act(async () => {
      await harness.result.current.handleSendMessage('Investigar Acme Agro');
    });

    expect(harness.state.investigationLogged).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('não tenta logar investigação quando o backend de sessão não está configurado', async () => {
    apiConfigMock.backendUrl = undefined;
    uuidv4Mock
      .mockReturnValueOnce('session-new')
      .mockReturnValueOnce('message-user')
      .mockReturnValueOnce('message-bot');
    sendMessageToLlmMock.mockResolvedValue(makeLlmResult({ text: 'A'.repeat(600) }));
    const harness = makeHarness();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    try {
      await act(async () => {
        await harness.result.current.handleSendMessage('Investigar Acme Agro');
      });
    } finally {
      warnSpy.mockRestore();
    }

    expect(global.fetch).not.toHaveBeenCalled();
    expect(harness.state.investigationLogged).toBe(true);
  });
});

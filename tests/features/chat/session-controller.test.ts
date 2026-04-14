import { act, renderHook } from '@testing-library/react';
import type { MutableRefObject } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Sender, type ChatSession } from '../../../types';
import { useSessionManager } from '../../../features/chat/session-controller';

const getRemoteSessionMock = vi.hoisted(() => vi.fn());

vi.mock('../../../services/sessionRemoteStore', () => ({
  getRemoteSession: getRemoteSessionMock,
}));

function makeSession(id: string, title: string, hasMessages = false): ChatSession {
  return {
    id,
    title,
    empresaAlvo: null,
    cnpj: null,
    modoPrincipal: null,
    scoreOportunidade: null,
    resumoDossie: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: hasMessages
      ? [{ id: 'm1', sender: Sender.User, text: 'Msg', timestamp: new Date() }]
      : [],
  };
}

function makeRef<T>(value: T): MutableRefObject<T> {
  return { current: value };
}

function makeOptions(overrides: Partial<Parameters<typeof useSessionManager>[0]> = {}) {
  const sessions = [makeSession('s1', 'Sessão 1'), makeSession('s2', 'Sessão 2', true)];
  const setSessions = vi.fn();
  const setCurrentSessionId = vi.fn();
  const updateSessionById = vi.fn();
  const setVisibleCount = vi.fn();
  const setRemoteSaveStatus = vi.fn();
  const setExportStatus = vi.fn();
  const setPdfReportContent = vi.fn();
  const setInvestigationLogged = vi.fn();
  const setLastQuery = vi.fn();
  const resetLoadingProgress = vi.fn();
  const setIsLoading = vi.fn();

  return {
    sessions,
    setSessions,
    currentSessionId: 's1',
    setCurrentSessionId,
    isLoading: false,
    abortControllerRef: makeRef<AbortController | null>(null),
    activeGenerationRef: makeRef<Record<string, string>>({}),
    updateSessionById,
    setVisibleCount,
    setRemoteSaveStatus,
    setExportStatus,
    setPdfReportContent,
    setInvestigationLogged,
    lastActionRef: makeRef<unknown>(null),
    setLastQuery,
    resetLoadingProgress,
    setIsLoading,
    ...overrides,
  };
}

describe('useSessionManager session controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRemoteSessionMock.mockResolvedValue(null);
  });

  it('handleNewSession adiciona nova sessão ao início da lista', () => {
    const options = makeOptions();
    const { result } = renderHook(() => useSessionManager(options));

    act(() => {
      result.current.handleNewSession();
    });

    expect(options.setSessions).toHaveBeenCalled();
    expect(options.setCurrentSessionId).toHaveBeenCalled();
  });

  it('handleNewSession aborta geração em andamento', () => {
    const abort = vi.fn();
    const options = makeOptions({
      isLoading: true,
      abortControllerRef: makeRef<AbortController | null>({ abort } as unknown as AbortController),
    });
    const { result } = renderHook(() => useSessionManager(options));

    act(() => {
      result.current.handleNewSession();
    });

    expect(abort).toHaveBeenCalled();
  });

  it('handleNewSession reseta todos os estados de UI', () => {
    const options = makeOptions();
    const { result } = renderHook(() => useSessionManager(options));

    act(() => {
      result.current.handleNewSession();
    });

    expect(options.setRemoteSaveStatus).toHaveBeenCalledWith('idle');
    expect(options.setExportStatus).toHaveBeenCalledWith('idle');
    expect(options.setPdfReportContent).toHaveBeenCalledWith(null);
    expect(options.setInvestigationLogged).toHaveBeenCalledWith(false);
    expect(options.setLastQuery).toHaveBeenCalledWith('');
    expect(options.resetLoadingProgress).toHaveBeenCalledWith('Iniciando análise');
  });

  it('handleSelectSession define currentSessionId', async () => {
    const options = makeOptions();
    const { result } = renderHook(() => useSessionManager(options));

    await act(async () => {
      await result.current.handleSelectSession('s2');
    });

    expect(options.setCurrentSessionId).toHaveBeenCalledWith('s2');
  });

  it('handleSelectSession carrega sessão remota quando não há mensagens', async () => {
    const remoteSession = makeSession('s1', 'Sessão Remota', true);
    getRemoteSessionMock.mockResolvedValue(remoteSession);
    const options = makeOptions();
    const { result } = renderHook(() => useSessionManager(options));

    await act(async () => {
      await result.current.handleSelectSession('s1');
    });

    expect(getRemoteSessionMock).toHaveBeenCalledWith('s1');
    expect(options.updateSessionById).toHaveBeenCalledWith('s1', expect.any(Function));
  });

  it('handleSelectSession não carrega remoto quando já há mensagens', async () => {
    const options = makeOptions();
    const { result } = renderHook(() => useSessionManager(options));

    await act(async () => {
      await result.current.handleSelectSession('s2');
    });

    expect(getRemoteSessionMock).not.toHaveBeenCalled();
  });

  it('handleDeleteSession remove a sessão da lista', () => {
    const options = makeOptions();
    const { result } = renderHook(() => useSessionManager(options));

    act(() => {
      result.current.handleDeleteSession('s2');
    });

    expect(options.setSessions).toHaveBeenCalled();
    const setSessionsMock = options.setSessions as ReturnType<typeof vi.fn>;
    const filteredSessions = setSessionsMock.mock.calls[0][0];
    expect(Array.isArray(filteredSessions)).toBe(true);
  });

  it('handleDeleteSession cria nova sessão quando a lista fica vazia', () => {
    const options = makeOptions({
      sessions: [makeSession('s1', 'Única Sessão')],
      currentSessionId: 's1',
    });
    const { result } = renderHook(() => useSessionManager(options));

    act(() => {
      result.current.handleDeleteSession('s1');
    });

    expect(options.setSessions).toHaveBeenCalled();
    expect(options.setCurrentSessionId).toHaveBeenCalled();
  });

  it('handleDeleteSession reseta a UI ao promover a próxima sessão', () => {
    const options = makeOptions({
      sessions: [makeSession('s1', 'Sessão Atual'), makeSession('s2', 'Próxima Sessão', true)],
      currentSessionId: 's1',
    });
    const { result } = renderHook(() => useSessionManager(options));

    act(() => {
      result.current.handleDeleteSession('s1');
    });

    expect(options.setCurrentSessionId).toHaveBeenCalledWith('s2');
    expect(options.setRemoteSaveStatus).toHaveBeenCalledWith('idle');
    expect(options.setExportStatus).toHaveBeenCalledWith('idle');
    expect(options.setPdfReportContent).toHaveBeenCalledWith(null);
    expect(options.setInvestigationLogged).toHaveBeenCalledWith(false);
    expect(options.setLastQuery).toHaveBeenCalledWith('');
    expect(options.resetLoadingProgress).toHaveBeenCalledTimes(1);
  });

  it('handleDeleteSession registra erro quando o lazy load da próxima sessão falha', async () => {
    const error = new Error('remote failed');
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    getRemoteSessionMock.mockRejectedValue(error);

    const options = makeOptions({
      sessions: [makeSession('s1', 'Sessão Atual'), makeSession('s2', 'Próxima Sessão')],
      currentSessionId: 's1',
    });
    const { result } = renderHook(() => useSessionManager(options));

    act(() => {
      result.current.handleDeleteSession('s1');
    });

    try {
      await vi.waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith('Lazy load error during session deletion', error);
      });
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it('handleDeleteSession aborta geração ao remover a sessão atual em loading', () => {
    const abort = vi.fn();
    const options = makeOptions({
      isLoading: true,
      abortControllerRef: makeRef<AbortController | null>({ abort } as unknown as AbortController),
    });
    const { result } = renderHook(() => useSessionManager(options));

    act(() => {
      result.current.handleDeleteSession('s1');
    });

    expect(abort).toHaveBeenCalled();
    expect(options.setIsLoading).toHaveBeenCalledWith(false);
  });
});

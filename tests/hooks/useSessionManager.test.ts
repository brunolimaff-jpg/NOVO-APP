import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// Mock sessionRemoteStore
const getRemoteSessionMock = vi.hoisted(() => vi.fn());

vi.mock('../../services/sessionRemoteStore', () => ({
  getRemoteSession: getRemoteSessionMock,
}));

import { useSessionManager } from '../../hooks/useSessionManager';
import { ChatSession } from '../../types';
import { MutableRefObject } from 'react';

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
      ? [{ id: 'm1', sender: 'user' as const, text: 'Msg', timestamp: new Date() }]
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
  const setLoadingStatus = vi.fn();
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
    setLoadingStatus,
    setIsLoading,
    ...overrides,
  };
}

describe('useSessionManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRemoteSessionMock.mockResolvedValue(null);
  });

  it('handleNewSession adiciona nova sessão ao início da lista', () => {
    const opts = makeOptions();
    const { result } = renderHook(() => useSessionManager(opts));

    act(() => {
      result.current.handleNewSession();
    });

    // setSessions deve ser chamado com um updater que adiciona nova sessão
    expect(opts.setSessions).toHaveBeenCalled();
    expect(opts.setCurrentSessionId).toHaveBeenCalled();
  });

  it('handleNewSession aborta geração em andamento', () => {
    const abortFn = vi.fn();
    const abortController = { abort: abortFn } as unknown as AbortController;
    const opts = makeOptions({
      isLoading: true,
      abortControllerRef: makeRef<AbortController | null>(abortController),
    });

    const { result } = renderHook(() => useSessionManager(opts));

    act(() => {
      result.current.handleNewSession();
    });

    expect(abortFn).toHaveBeenCalled();
  });

  it('handleNewSession reseta todos os estados de UI', () => {
    const opts = makeOptions();
    const { result } = renderHook(() => useSessionManager(opts));

    act(() => {
      result.current.handleNewSession();
    });

    expect(opts.setRemoteSaveStatus).toHaveBeenCalledWith('idle');
    expect(opts.setExportStatus).toHaveBeenCalledWith('idle');
    expect(opts.setPdfReportContent).toHaveBeenCalledWith(null);
    expect(opts.setInvestigationLogged).toHaveBeenCalledWith(false);
    expect(opts.setLastQuery).toHaveBeenCalledWith('');
    expect(opts.setLoadingStatus).toHaveBeenCalledWith('Iniciando análise');
  });

  it('handleSelectSession define currentSessionId', async () => {
    const opts = makeOptions();
    const { result } = renderHook(() => useSessionManager(opts));

    await act(async () => {
      await result.current.handleSelectSession('s2');
    });

    expect(opts.setCurrentSessionId).toHaveBeenCalledWith('s2');
  });

  it('handleSelectSession carrega sessão remota quando não tem mensagens', async () => {
    const remoteSession = makeSession('s1', 'Sessão Remota', true);
    getRemoteSessionMock.mockResolvedValue(remoteSession);

    const opts = makeOptions();
    const { result } = renderHook(() => useSessionManager(opts));

    await act(async () => {
      // s1 não tem mensagens — deve tentar carregar do remote
      await result.current.handleSelectSession('s1');
    });

    expect(getRemoteSessionMock).toHaveBeenCalledWith('s1');
    expect(opts.updateSessionById).toHaveBeenCalledWith('s1', expect.any(Function));
  });

  it('handleSelectSession NÃO carrega remoto quando já tem mensagens', async () => {
    const opts = makeOptions();
    const { result } = renderHook(() => useSessionManager(opts));

    await act(async () => {
      // s2 tem mensagens — não deve chamar getRemoteSession
      await result.current.handleSelectSession('s2');
    });

    expect(getRemoteSessionMock).not.toHaveBeenCalled();
  });

  it('handleDeleteSession remove a sessão da lista', () => {
    const opts = makeOptions();
    const { result } = renderHook(() => useSessionManager(opts));

    act(() => {
      result.current.handleDeleteSession('s2');
    });

    expect(opts.setSessions).toHaveBeenCalled();
    const updaterFn = (opts.setSessions as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(typeof updaterFn).toBe('object'); // setSessions recebe o array filtrado
  });

  it('handleDeleteSession cria nova sessão quando lista fica vazia', () => {
    const opts = makeOptions({
      sessions: [makeSession('s1', 'Única Sessão')],
      currentSessionId: 's1',
    });
    const { result } = renderHook(() => useSessionManager(opts));

    act(() => {
      result.current.handleDeleteSession('s1');
    });

    // Quando a lista fica vazia, handleNewSession é chamado internamente
    expect(opts.setSessions).toHaveBeenCalled();
  });

  it('handleDeleteSession aborta geração se deleting a sessão atual com loading', () => {
    const abortFn = vi.fn();
    const abortController = { abort: abortFn } as unknown as AbortController;
    const opts = makeOptions({
      isLoading: true,
      abortControllerRef: makeRef<AbortController | null>(abortController),
    });

    const { result } = renderHook(() => useSessionManager(opts));

    act(() => {
      result.current.handleDeleteSession('s1');
    });

    expect(abortFn).toHaveBeenCalled();
    expect(opts.setIsLoading).toHaveBeenCalledWith(false);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const getDossiersMock = vi.hoisted(() => vi.fn());
const saveDossierMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const saveAllDossiersMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('../../services/storage', () => ({
  storage: {
    getDossiers: getDossiersMock,
    saveDossier: saveDossierMock,
    saveAllDossiers: saveAllDossiersMock,
  },
}));

import { SESSION_LOAD_TIMEOUT_MS, useSessionStorage } from '../../hooks/useSessionStorage';
import { ChatSession, Sender } from '../../types';

function makeSession(id: string, title: string, messages: ChatSession['messages'] = []): ChatSession {
  return {
    id,
    title,
    empresaAlvo: title,
    cnpj: null,
    modoPrincipal: null,
    scoreOportunidade: null,
    resumoDossie: null,
    createdAt: '2026-05-26T10:00:00.000Z',
    updatedAt: '2026-05-26T10:00:00.000Z',
    messages,
  };
}

describe('useSessionStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    window.localStorage.clear();
    getDossiersMock.mockResolvedValue([]);
    saveDossierMock.mockResolvedValue(undefined);
    saveAllDossiersMock.mockResolvedValue(undefined);
  });

  it('inicializa com sessions vazia e isInitialized false', () => {
    const { result } = renderHook(() => useSessionStorage());
    expect(result.current.sessions).toEqual([]);
    expect(result.current.isInitialized).toBe(false);
  });

  it('loadSessions retorna array vazio quando Supabase está vazio', async () => {
    const { result } = renderHook(() => useSessionStorage());
    const sessions = await result.current.loadSessions();
    expect(sessions).toEqual([]);
  });

  it('loadSessions carrega sessions do Supabase quando disponível', async () => {
    const storedSessions = [
      makeSession('s1', 'Fazenda Alpha', [
        { id: 'm1', sender: Sender.Bot, text: 'Dossiê completo', timestamp: new Date() },
      ]),
    ];
    getDossiersMock.mockResolvedValue(storedSessions);

    const { result } = renderHook(() => useSessionStorage());
    const sessions = await result.current.loadSessions();

    expect(sessions).toHaveLength(1);
    expect(sessions[0].title).toBe('Fazenda Alpha');
  });

  it('loadSessions retorna array vazio quando Supabase falha (sem fallback localStorage)', async () => {
    getDossiersMock.mockRejectedValue(new Error('Supabase unavailable'));

    const { result } = renderHook(() => useSessionStorage());
    const sessions = await result.current.loadSessions();

    // Sem Supabase e sem fallback = array vazio
    expect(sessions).toEqual([]);
    // localStorage NÃO foi usado
    expect(localStorage.getItem('scout360_sessions_v1')).toBeNull();
  });

  it('libera o bootstrap quando a hidratação Supabase nunca resolve', async () => {
    vi.useFakeTimers();
    getDossiersMock.mockImplementation(() => new Promise<ChatSession[]>(() => {}));

    const { result } = renderHook(() => useSessionStorage());
    expect(result.current.isInitialized).toBe(false);

    await act(async () => {
      vi.advanceTimersByTime(SESSION_LOAD_TIMEOUT_MS);
      await Promise.resolve();
    });

    expect(result.current.isInitialized).toBe(true);
    expect(result.current.sessions).toEqual([]);
    expect(saveAllDossiersMock).not.toHaveBeenCalled();
  });

  it('ignora resposta tardia após o fallback de timeout', async () => {
    vi.useFakeTimers();
    let resolveDossiers!: (sessions: ChatSession[]) => void;
    const pending = new Promise<ChatSession[]>(resolve => {
      resolveDossiers = resolve;
    });
    getDossiersMock.mockReturnValue(pending);

    const { result } = renderHook(() => useSessionStorage());

    await act(async () => {
      vi.advanceTimersByTime(SESSION_LOAD_TIMEOUT_MS);
      await Promise.resolve();
    });

    const lateSession = makeSession('late', 'Resposta tardia', [
      { id: 'm1', sender: Sender.Bot, text: 'Conteúdo', timestamp: new Date() },
    ]);
    await act(async () => {
      resolveDossiers([lateSession]);
      await Promise.resolve();
    });

    expect(result.current.isInitialized).toBe(true);
    expect(result.current.sessions).toEqual([]);
  });

  it('loadSessions stripa marcadores internos dos textos das mensagens', async () => {
    const sessionWithMarkers = {
      ...makeSession('s3', 'Agroindústria X'),
      messages: [
        {
          id: 'm1',
          sender: 'bot',
          text: 'Resposta legítima [[STATUS:OK]] mais texto',
          timestamp: new Date().toISOString(),
        },
      ],
    };
    getDossiersMock.mockResolvedValue([sessionWithMarkers]);

    const { result } = renderHook(() => useSessionStorage());
    const sessions = await result.current.loadSessions();

    expect(sessions[0].messages[0].text).not.toContain('[[STATUS:');
  });

  it('loadSessions converte timestamps de string para Date', async () => {
    const dateStr = '2025-01-15T10:00:00.000Z';
    const sessionWithStringTimestamp = {
      ...makeSession('s4', 'Empresa D'),
      messages: [
        { id: 'm1', sender: 'user', text: 'Olá', timestamp: dateStr },
        { id: 'm2', sender: Sender.Bot, text: 'Resposta', timestamp: new Date() },
      ],
    };
    getDossiersMock.mockResolvedValue([sessionWithStringTimestamp]);

    const { result } = renderHook(() => useSessionStorage());
    const sessions = await result.current.loadSessions();

    expect(sessions[0].messages[0].timestamp).toBeInstanceOf(Date);
  });

  it('loadSessions remove estado transiente de UI vindo da persistência', async () => {
    const sessionWithTransientState = {
      ...makeSession('s4b', 'Empresa Transiente'),
      messages: [
        {
          id: 'm1',
          sender: Sender.Bot,
          text: 'Conteúdo real',
          timestamp: new Date(),
        },
        {
          id: 'm2',
          sender: Sender.Bot,
          text: '',
          timestamp: '2025-01-15T10:00:00.000Z',
          isThinking: true,
          loadingVariant: 'hero' as const,
          isSourcesOpen: true,
        },
      ],
    };
    getDossiersMock.mockResolvedValue([sessionWithTransientState]);

    const { result } = renderHook(() => useSessionStorage());
    const sessions = await result.current.loadSessions();

    expect(sessions[0].messages[0].isThinking).toBe(false);
    expect(sessions[0].messages[0]).not.toHaveProperty('loadingVariant');
    expect(sessions[0].messages[0]).not.toHaveProperty('isSourcesOpen');
  });

  it('setSessions atualiza o estado e dispara persistência com debounce', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSessionStorage());

    // Inicializar primeiro
    act(() => {
      result.current.setIsInitialized(true);
    });

    const newSession = makeSession('s5', 'Fazenda Nova', [
      { id: 'm1', sender: Sender.User, text: 'Investigar', timestamp: new Date() },
      { id: 'm2', sender: Sender.Bot, text: 'Dossiê completo', timestamp: new Date() },
    ]);
    act(() => {
      result.current.setSessions([newSession]);
    });

    // Persistência não deve ter sido chamada ainda (debounce 1s)
    expect(saveAllDossiersMock).not.toHaveBeenCalled();

    // Avançar o timer
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(saveAllDossiersMock).toHaveBeenCalled();
  });

  it('NÃO persiste sessão com apenas mensagem user (sem bot)', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSessionStorage());
    act(() => result.current.setIsInitialized(true));

    const session = makeSession('s7', 'Sem Bot', [
      { id: 'm1', sender: Sender.User, text: 'Investigar', timestamp: new Date() },
    ]);
    act(() => result.current.setSessions([session]));

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(saveAllDossiersMock).not.toHaveBeenCalled();
  });

  it('NÃO persiste sessão com user + bot thinking (sem conteúdo real)', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSessionStorage());
    act(() => result.current.setIsInitialized(true));

    const session = makeSession('s8', 'Thinking Only', [
      { id: 'm1', sender: Sender.User, text: 'Investigar', timestamp: new Date() },
      { id: 'm2', sender: Sender.Bot, text: '', timestamp: new Date(), isThinking: true },
    ]);
    act(() => result.current.setSessions([session]));

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(saveAllDossiersMock).not.toHaveBeenCalled();
  });

  it('NÃO persiste sessão com user + bot isError (sem conteúdo real)', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSessionStorage());
    act(() => result.current.setIsInitialized(true));

    const session = makeSession('s9', 'Error Only', [
      { id: 'm1', sender: Sender.User, text: 'Investigar', timestamp: new Date() },
      { id: 'm2', sender: Sender.Bot, text: 'Erro', timestamp: new Date(), isError: true },
    ]);
    act(() => result.current.setSessions([session]));

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(saveAllDossiersMock).not.toHaveBeenCalled();
  });

  it('Persiste sessão com bot real (não-error, não-thinking, com texto)', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSessionStorage());
    act(() => result.current.setIsInitialized(true));

    const session = makeSession('s10', 'Dossiê Real', [
      { id: 'm1', sender: Sender.User, text: 'Investigar', timestamp: new Date() },
      { id: 'm2', sender: Sender.Bot, text: 'Dossiê completo', timestamp: new Date() },
    ]);
    act(() => result.current.setSessions([session]));

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(saveAllDossiersMock).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ title: 'Dossiê Real' })]),
    );
  });

  it('loadSessions filtra ghosts antigos do Supabase (sem bot real)', async () => {
    const ghostSession = makeSession('ghost-1', 'Ghost sem bot');
    const validSession = makeSession('valid-1', 'Dossiê válido', [
      { id: 'm1', sender: Sender.Bot, text: 'Conteúdo real', timestamp: new Date() },
    ]);
    getDossiersMock.mockResolvedValue([ghostSession, validSession]);

    const { result } = renderHook(() => useSessionStorage());
    const sessions = await result.current.loadSessions();

    // Ghost sem bot real é filtrado; só o válido permanece
    expect(sessions).toHaveLength(1);
    expect(sessions[0].title).toBe('Dossiê válido');
  });

  it('sessionsRef é mantido sincronizado com sessions', async () => {
    const { result } = renderHook(() => useSessionStorage());
    const session = makeSession('s6', 'Empresa Ref');

    act(() => {
      result.current.setSessions([session]);
    });

    await waitFor(() => {
      expect(result.current.sessionsRef.current).toHaveLength(1);
      expect(result.current.sessionsRef.current[0].title).toBe('Empresa Ref');
    });
  });
});

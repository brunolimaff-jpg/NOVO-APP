import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// Mock idb-keyval
const idbGetMock = vi.hoisted(() => vi.fn());
const idbSetMock = vi.hoisted(() => vi.fn());

vi.mock('idb-keyval', () => ({
  get: idbGetMock,
  set: idbSetMock,
}));

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

import { useSessionStorage } from '../../hooks/useSessionStorage';
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
    idbGetMock.mockResolvedValue(undefined);
    idbSetMock.mockResolvedValue(undefined);
    getDossiersMock.mockResolvedValue([]);
    saveDossierMock.mockResolvedValue(undefined);
    saveAllDossiersMock.mockResolvedValue(undefined);
  });

  it('inicializa com sessions vazia e isInitialized false', () => {
    const { result } = renderHook(() => useSessionStorage());
    expect(result.current.sessions).toEqual([]);
    expect(result.current.isInitialized).toBe(false);
  });

  it('loadSessions retorna array vazio quando IDB e localStorage estão vazios', async () => {
    const { result } = renderHook(() => useSessionStorage());
    const sessions = await result.current.loadSessions();
    expect(sessions).toEqual([]);
  });

  it('loadSessions carrega sessions do Supabase quando disponível', async () => {
    const storedSessions = [makeSession('s1', 'Fazenda Alpha')];
    getDossiersMock.mockResolvedValue(storedSessions);

    const { result } = renderHook(() => useSessionStorage());
    const sessions = await result.current.loadSessions();

    expect(sessions).toHaveLength(1);
    expect(sessions[0].title).toBe('Fazenda Alpha');
  });

  it('loadSessions usa localStorage como fallback quando Supabase falha', async () => {
    getDossiersMock.mockRejectedValue(new Error('Supabase unavailable'));
    const storedSessions = [makeSession('s2', 'Cooperativa Beta')];
    window.localStorage.setItem('scout360_sessions_v1', JSON.stringify(storedSessions));

    const { result } = renderHook(() => useSessionStorage());
    const sessions = await result.current.loadSessions();

    expect(sessions).toHaveLength(1);
    expect(sessions[0].title).toBe('Cooperativa Beta');
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
      messages: [{ id: 'm1', sender: 'user', text: 'Olá', timestamp: dateStr }],
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

    const newSession = makeSession('s5', 'Fazenda Nova');
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

  it('loadSessions retorna array vazio para localStorage com JSON inválido', async () => {
    getDossiersMock.mockRejectedValue(new Error('Supabase unavailable'));
    window.localStorage.setItem('scout360_sessions_v1', 'JSON_INVALIDO{{{');

    const { result } = renderHook(() => useSessionStorage());
    const sessions = await result.current.loadSessions();

    expect(sessions).toEqual([]);
  });
});

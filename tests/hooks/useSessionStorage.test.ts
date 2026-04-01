import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// Mock idb-keyval
const idbGetMock = vi.hoisted(() => vi.fn());
const idbSetMock = vi.hoisted(() => vi.fn());

vi.mock('idb-keyval', () => ({
  get: idbGetMock,
  set: idbSetMock,
}));

import { useSessionStorage } from '../../hooks/useSessionStorage';
import { ChatSession } from '../../types';

function makeSession(id: string, title: string): ChatSession {
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
    messages: [],
  };
}

describe('useSessionStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    idbGetMock.mockResolvedValue(undefined);
    idbSetMock.mockResolvedValue(undefined);
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

  it('loadSessions carrega sessions do IndexedDB quando disponível', async () => {
    const storedSessions = [makeSession('s1', 'Fazenda Alpha')];
    idbGetMock.mockResolvedValue(storedSessions);

    const { result } = renderHook(() => useSessionStorage());
    const sessions = await result.current.loadSessions();

    expect(sessions).toHaveLength(1);
    expect(sessions[0].title).toBe('Fazenda Alpha');
  });

  it('loadSessions usa localStorage como fallback quando IDB falha', async () => {
    idbGetMock.mockRejectedValue(new Error('IDB unavailable'));
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
    idbGetMock.mockResolvedValue([sessionWithMarkers]);

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
      ],
    };
    idbGetMock.mockResolvedValue([sessionWithStringTimestamp]);

    const { result } = renderHook(() => useSessionStorage());
    const sessions = await result.current.loadSessions();

    expect(sessions[0].messages[0].timestamp).toBeInstanceOf(Date);
  });

  it('setSessions atualiza o estado e dispara persistência', async () => {
    const { result } = renderHook(() => useSessionStorage());

    // Inicializar primeiro
    act(() => {
      result.current.setIsInitialized(true);
    });

    const newSession = makeSession('s5', 'Fazenda Nova');
    act(() => {
      result.current.setSessions([newSession]);
    });

    await waitFor(() => {
      expect(idbSetMock).toHaveBeenCalled();
    });
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
    idbGetMock.mockRejectedValue(new Error('IDB unavailable'));
    window.localStorage.setItem('scout360_sessions_v1', 'JSON_INVALIDO{{{');

    const { result } = renderHook(() => useSessionStorage());
    const sessions = await result.current.loadSessions();

    expect(sessions).toEqual([]);
  });
});

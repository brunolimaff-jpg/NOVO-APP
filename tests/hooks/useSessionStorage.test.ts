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
const saveAllDossiersMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('../../services/storage', () => ({
  storage: {
    getDossiers: getDossiersMock,
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
    window.localStorage.clear();
    idbGetMock.mockResolvedValue(undefined);
    idbSetMock.mockResolvedValue(undefined);
    getDossiersMock.mockResolvedValue([]);
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
    getDossiersMock.mockResolvedValue(storedSessions);

    const { result } = renderHook(() => useSessionStorage());
    const sessions = await result.current.loadSessions();

    expect(sessions).toHaveLength(1);
    expect(sessions[0].title).toBe('Fazenda Alpha');
  });

  it('loadSessions usa localStorage como fallback quando IDB falha', async () => {
    getDossiersMock.mockRejectedValue(new Error('IDB unavailable'));
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
      expect(saveAllDossiersMock).toHaveBeenCalled();
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
    getDossiersMock.mockRejectedValue(new Error('IDB unavailable'));
    window.localStorage.setItem('scout360_sessions_v1', 'JSON_INVALIDO{{{');

    const { result } = renderHook(() => useSessionStorage());
    const sessions = await result.current.loadSessions();

    expect(sessions).toEqual([]);
  });

  it('scout:sync-complete push-only não recarrega sessões nem regrava o estado', async () => {
    const localWithDossier = makeSession('scheffer-push', 'Scheffer & Cia', [
      {
        id: 'bot-push',
        sender: Sender.Bot,
        text: 'Dossiê completo já renderizado',
        timestamp: new Date('2026-05-26T11:00:00.000Z'),
      },
    ]);

    const { result } = renderHook(() => useSessionStorage());

    act(() => {
      result.current.setIsInitialized(true);
      result.current.setSessions([localWithDossier]);
    });

    await waitFor(() => {
      expect(saveAllDossiersMock).toHaveBeenCalled();
    });

    const loadsBeforePushOnlyEvent = getDossiersMock.mock.calls.length;
    saveAllDossiersMock.mockClear();

    act(() => {
      window.dispatchEvent(new CustomEvent('scout:sync-complete', { detail: { pushed: 1, pulled: 0, errors: [] } }));
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(getDossiersMock).toHaveBeenCalledTimes(loadsBeforePushOnlyEvent);
    expect(saveAllDossiersMock).not.toHaveBeenCalled();
    expect(result.current.sessions[0]?.messages[0]?.text).toContain('Dossiê completo');
  });

  it('scout:sync-complete preserva messages locais quando reload traz sessão stale sem texto', async () => {
    const localWithDossier = makeSession('scheffer-1', 'Scheffer & Cia', [
      {
        id: 'bot-1',
        sender: Sender.Bot,
        text: 'Dossiê completo da Scheffer com teia societária',
        timestamp: new Date('2026-05-26T11:00:00.000Z'),
      },
    ]);
    const staleRemote = makeSession('scheffer-1', 'Scheffer & Cia', []);
    staleRemote.updatedAt = '2026-05-26T12:00:00.000Z';

    getDossiersMock.mockResolvedValue([staleRemote]);

    const { result } = renderHook(() => useSessionStorage());

    act(() => {
      result.current.setIsInitialized(true);
      result.current.setSessions([localWithDossier]);
    });

    act(() => {
      window.dispatchEvent(new CustomEvent('scout:sync-complete', { detail: { pushed: 0, pulled: 1, errors: [] } }));
    });

    await waitFor(() => {
      expect(result.current.sessions[0]?.messages).toHaveLength(1);
      expect(result.current.sessions[0]?.messages[0]?.text).toContain('Dossiê completo');
    });
  });
});

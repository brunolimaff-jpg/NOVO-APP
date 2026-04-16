import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatStoreProvider, useChatStore } from '../../stores/chatStore';
import { Sender, type ChatSession } from '../../types';

const { loadSessionsMock, storageSeedRef } = vi.hoisted(() => ({
  loadSessionsMock: vi.fn(),
  storageSeedRef: { current: [] as ChatSession[] },
}));

vi.mock('../../hooks/useSessionStorage', async () => {
  const ReactModule = await import('react');

  return {
    useSessionStorage: () => {
      const [sessions, setSessions] = ReactModule.useState<ChatSession[]>(storageSeedRef.current);
      const [isInitialized, setIsInitialized] = ReactModule.useState(true);
      const sessionsRef = ReactModule.useRef<ChatSession[]>(sessions);

      ReactModule.useEffect(() => {
        sessionsRef.current = sessions;
      }, [sessions]);

      return {
        sessions,
        setSessions,
        sessionsRef,
        isInitialized,
        setIsInitialized,
        loadSessions: loadSessionsMock,
      };
    },
  };
});

vi.mock('../../features/chat/loading-progress', async () => {
  const ReactModule = await import('react');

  return {
    useChatLoadingProgress: () => {
      const [isLoading, setIsLoading] = ReactModule.useState(false);
      const [failureCount, setFailureCount] = ReactModule.useState(0);
      const [requestKind, setRequestKind] = ReactModule.useState<'default' | 'deep_dive'>('default');
      const [loadingVariant, setLoadingVariant] = ReactModule.useState<'hero' | 'inline'>('hero');
      const [loadingPinnedLabel, setLoadingPinnedLabel] = ReactModule.useState<string | null>(null);

      return {
        isLoading,
        setIsLoading,
        loadingStatus: 'Preparando',
        failureCount,
        setFailureCount,
        completedLoadingStatuses: ['Preparando'],
        loadingTotalStages: 3,
        loadingIsIncremental: false,
        requestKind,
        setRequestKind,
        loadingVariant,
        setLoadingVariant,
        loadingPinnedLabel,
        setLoadingPinnedLabel,
        resetLoadingProgress: vi.fn(),
        advanceLoadingProgress: vi.fn(),
        replaceLoadingProgressStage: vi.fn(),
        completeLoadingProgress: vi.fn(),
      };
    },
  };
});

function makeSession(id: string, title: string): ChatSession {
  return {
    id,
    title,
    empresaAlvo: title,
    cnpj: null,
    modoPrincipal: 'investigacao',
    scoreOportunidade: null,
    resumoDossie: null,
    createdAt: '2026-04-16T00:00:00.000Z',
    updatedAt: '2026-04-16T00:00:00.000Z',
    messages: [
      {
        id: `${id}-user`,
        sender: Sender.User,
        text: `Investigar ${title}`,
        timestamp: new Date('2026-04-16T00:00:00.000Z'),
      },
    ],
  };
}

const wrapper = ({ children }: { children: React.ReactNode }) => <ChatStoreProvider>{children}</ChatStoreProvider>;

describe('ChatStoreProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageSeedRef.current = [makeSession('session-1', 'Acme Agro')];
    loadSessionsMock.mockResolvedValue(storageSeedRef.current);
  });

  it('exposes storage state plus derived current session payload', async () => {
    const { result } = renderHook(() => useChatStore(), { wrapper });

    act(() => {
      result.current.setCurrentSessionId('session-1');
    });

    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.currentSession?.id).toBe('session-1');
    expect(result.current.allMessages).toHaveLength(1);
    expect(result.current.isInitialized).toBe(true);

    await act(async () => {
      await result.current.loadSessions();
    });

    expect(loadSessionsMock).toHaveBeenCalledTimes(1);
  });

  it('updates reducer state and current session helpers without App state bags', () => {
    const { result } = renderHook(() => useChatStore(), { wrapper });

    act(() => {
      result.current.setCurrentSessionId('session-1');
    });

    act(() => {
      result.current.setVisibleCount(prev => prev + 20);
      result.current.setLastQuery('Acme Agro');
      result.current.setInvestigationLogged(true);
      result.current.updateCurrentSession(session => ({
        ...session,
        title: 'Acme Agro Revisada',
      }));
    });

    expect(result.current.visibleCount).toBe(40);
    expect(result.current.lastQuery).toBe('Acme Agro');
    expect(result.current.investigationLogged).toBe(true);
    expect(result.current.currentSession?.title).toBe('Acme Agro Revisada');

    act(() => {
      result.current.updateSessionById('session-1', session => ({
        ...session,
        messages: [
          ...session.messages,
          {
            id: 'session-1-bot',
            sender: Sender.Bot,
            text: 'Resumo consolidado',
            timestamp: new Date('2026-04-16T00:10:00.000Z'),
          },
        ],
      }));
    });

    expect(result.current.currentSession?.messages).toHaveLength(2);
    expect(result.current.sessionsRef.current[0].messages).toHaveLength(2);
  });
});

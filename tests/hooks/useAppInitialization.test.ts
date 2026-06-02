import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAppInitialization } from '../../hooks/useAppInitialization';
import type { ChatSession } from '../../types';

function buildSession(id: string): ChatSession {
  return {
    id,
    title: `Sessao ${id}`,
    empresaAlvo: null,
    cnpj: null,
    modoPrincipal: null,
    scoreOportunidade: null,
    resumoDossie: null,
    createdAt: '2026-04-04T12:00:00.000Z',
    updatedAt: '2026-04-04T12:00:00.000Z',
    messages: [],
  };
}

function buildOptions(overrides: Partial<Parameters<typeof useAppInitialization>[0]> = {}) {
  const loadSessions = vi.fn().mockResolvedValue([]);
  const setSessions = vi.fn();
  const setCurrentSessionId = vi.fn();
  const setIsSidebarOpen = vi.fn();
  const setIsInitialized = vi.fn();

  return {
    loadSessions,
    setSessions,
    setCurrentSessionId,
    setIsSidebarOpen,
    setIsInitialized,
    ...overrides,
  };
}

describe('useAppInitialization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  });

  it('nao cria sessao vazia automaticamente quando nao ha historico local', async () => {
    const options = buildOptions({
      loadSessions: vi.fn().mockResolvedValue([]),
    });

    renderHook(() => useAppInitialization(options));

    await waitFor(() => {
      expect(options.setIsInitialized).toHaveBeenCalledWith(true);
    });

    expect(options.loadSessions).toHaveBeenCalledTimes(1);
    const setCurrentSessionIdMock = options.setCurrentSessionId as ReturnType<typeof vi.fn>;
    expect(setCurrentSessionIdMock.mock.calls.some(([arg]: [unknown]) => typeof arg === 'string')).toBe(false);
  });

  it('restaura a primeira sessao local quando ha historico salvo', async () => {
    const localSessions = [buildSession('s1'), buildSession('s2')];
    const options = buildOptions({
      loadSessions: vi.fn().mockResolvedValue(localSessions),
    });

    renderHook(() => useAppInitialization(options));

    await waitFor(() => {
      expect(options.setCurrentSessionId).toHaveBeenCalledWith(expect.any(Function));
    });

    // Aplica o updater funcional com prevId null → deve retornar 's1'
    const updaterFn = (options.setCurrentSessionId as ReturnType<typeof vi.fn>).mock.calls[0][0] as (
      prev: string | null,
    ) => string | null;
    expect(updaterFn(null)).toBe('s1');
    expect(updaterFn('existing-id')).toBe('existing-id');

    expect(options.setSessions).toHaveBeenCalledWith(expect.any(Function));
    expect(options.setIsInitialized).toHaveBeenCalledWith(true);
  });
});

import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ChatSession, Message } from '../../types';
import { setActiveDossierRun, clearAllActiveDossierRunsForTest } from '../../features/dossier/active-run-registry';
import { useInterruptedDossierRunRecovery } from '../../hooks/useInterruptedDossierRunRecovery';

function mockSessionStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() { return store.size; },
  } as unknown as Storage;
}

let sessionStorageMock: Storage;
beforeEach(() => {
  sessionStorageMock = mockSessionStorage();
  vi.stubGlobal('window', { sessionStorage: sessionStorageMock });
  clearAllActiveDossierRunsForTest();
});
afterEach(() => {
  vi.unstubAllGlobals();
  clearAllActiveDossierRunsForTest();
});

const makeSession = (id: string): ChatSession => ({
  id,
  title: 'Sessão',
  empresaAlvo: null,
  cnpj: null,
  modoPrincipal: null,
  scoreOportunidade: null,
  resumoDossie: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  messages: [] as Message[],
});

describe('useInterruptedDossierRunRecovery', () => {
  it('não faz nada quando não há run persistido', () => {
    const updateSessionById = vi.fn();
    const setIsLoading = vi.fn();
    const resetLoadingProgress = vi.fn();

    renderHook(() => useInterruptedDossierRunRecovery({ updateSessionById, setIsLoading, resetLoadingProgress }));

    expect(updateSessionById).not.toHaveBeenCalled();
    expect(setIsLoading).not.toHaveBeenCalled();
    expect(resetLoadingProgress).not.toHaveBeenCalled();
  });

  it('injeta estado explícito de interrupção e reseta loading quando há run persistido', () => {
    setActiveDossierRun({ sessionId: 's1', runId: 'run-1', leaseOwner: 'l', clientAttemptId: 'a' });

    const updateSessionById = vi.fn((_id: string, updater: (s: ChatSession) => ChatSession) => updater(makeSession('s1')));
    const setIsLoading = vi.fn();
    const resetLoadingProgress = vi.fn();

    renderHook(() => useInterruptedDossierRunRecovery({ updateSessionById, setIsLoading, resetLoadingProgress }));

    expect(updateSessionById).toHaveBeenCalledTimes(1);
    const [sessionId, updater] = updateSessionById.mock.calls[0];
    expect(sessionId).toBe('s1');
    const updated = updater(makeSession('s1'));
    const interruption = updated.messages.find(m => m.id === 'dossier-interrupted-run-1');
    expect(interruption).toBeDefined();
    expect(interruption?.isError).toBe(true);
    expect(String(interruption?.text)).toContain('interrompida');
    expect(String(interruption?.text)).toContain('Nenhum dossiê foi marcado como concluído');
    expect(setIsLoading).toHaveBeenCalledWith(false);
    expect(resetLoadingProgress).toHaveBeenCalled();
  });

  it('não marca COMPLETED e não retoma waterfall (nenhuma chamada de lifecycle)', () => {
    setActiveDossierRun({ sessionId: 's1', runId: 'run-1', leaseOwner: 'l', clientAttemptId: 'a' });

    const updateSessionById = vi.fn((_id: string, updater: (s: ChatSession) => ChatSession) => updater(makeSession('s1')));
    const setIsLoading = vi.fn();
    const resetLoadingProgress = vi.fn();

    renderHook(() => useInterruptedDossierRunRecovery({ updateSessionById, setIsLoading, resetLoadingProgress }));

    const [, updater] = updateSessionById.mock.calls[0];
    const updated = updater(makeSession('s1'));
    // Nenhuma mensagem de sucesso/COMPLETED é injetada.
    const successLike = updated.messages.filter(m => /complet|sucesso|gerado/i.test(String(m.text || '')));
    expect(successLike).toHaveLength(0);
  });
});

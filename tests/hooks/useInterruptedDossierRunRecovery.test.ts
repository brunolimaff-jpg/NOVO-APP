import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ChatSession, Message } from '../../types';
import {
  clearActiveDossierRunsMemoryForTest,
  setActiveDossierRun,
  clearAllActiveDossierRunsForTest,
  peekPersistedActiveDossierRuns,
} from '../../features/dossier/active-run-registry';
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

/** updateSessionById realista: retorna null se a sessão não existir no map. */
function makeSessionStore(initial: Record<string, ChatSession>) {
  const sessions = new Map(Object.entries(initial));
  const updateSessionById = vi.fn((id: string, updater: (s: ChatSession) => ChatSession) => {
    const current = sessions.get(id);
    if (!current) return null;
    const next = updater(current);
    sessions.set(id, next);
    return next;
  });
  return { sessions, updateSessionById };
}

describe('useInterruptedDossierRunRecovery', () => {
  it('não faz nada quando não há run persistido', () => {
    const { updateSessionById } = makeSessionStore({ s1: makeSession('s1') });
    const setIsLoading = vi.fn();
    const resetLoadingProgress = vi.fn();

    renderHook(() => useInterruptedDossierRunRecovery({
      isInitialized: true,
      updateSessionById,
      setIsLoading,
      resetLoadingProgress,
    }));

    expect(updateSessionById).not.toHaveBeenCalled();
    expect(setIsLoading).not.toHaveBeenCalled();
    expect(resetLoadingProgress).not.toHaveBeenCalled();
  });

  it('não roda antes de isInitialized (aguarda sessões carregadas)', () => {
    setActiveDossierRun({ sessionId: 's1', runId: 'run-1', leaseOwner: 'l', clientAttemptId: 'a' });
    // Simula reload real: contexto local perdido, sessionStorage preservado.
    clearActiveDossierRunsMemoryForTest();
    const { updateSessionById } = makeSessionStore({ s1: makeSession('s1') });
    const setIsLoading = vi.fn();
    const resetLoadingProgress = vi.fn();

    const { rerender } = renderHook(({ init }: { init: boolean }) => useInterruptedDossierRunRecovery({
      isInitialized: init,
      updateSessionById,
      setIsLoading,
      resetLoadingProgress,
    }), { initialProps: { init: false } });

    expect(updateSessionById).not.toHaveBeenCalled();
    expect(peekPersistedActiveDossierRuns().length).toBe(1);

    // após isInitialized=true, o effect roda e aplica
    rerender({ init: true });
    expect(updateSessionById).toHaveBeenCalledTimes(1);
    expect(peekPersistedActiveDossierRuns().length).toBe(0);
  });

  it('injeta estado explícito de interrupção e reseta loading quando há run persistido e sessão existe', () => {
    setActiveDossierRun({ sessionId: 's1', runId: 'run-1', leaseOwner: 'l', clientAttemptId: 'a' });
    // Simula reload real: contexto local perdido, sessionStorage preservado.
    clearActiveDossierRunsMemoryForTest();
    const { updateSessionById } = makeSessionStore({ s1: makeSession('s1') });
    const setIsLoading = vi.fn();
    const resetLoadingProgress = vi.fn();

    renderHook(() => useInterruptedDossierRunRecovery({
      isInitialized: true,
      updateSessionById,
      setIsLoading,
      resetLoadingProgress,
    }));

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
    // registro consumido apenas após aplicação
    expect(peekPersistedActiveDossierRuns().length).toBe(0);
  });

  it('preserva o registro persistido quando a sessão ainda não existe (corrida com loadSessions)', () => {
    setActiveDossierRun({ sessionId: 's1', runId: 'run-1', leaseOwner: 'l', clientAttemptId: 'a' });
    // Simula reload real: contexto local perdido, sessionStorage preservado.
    clearActiveDossierRunsMemoryForTest();
    // Nenhuma sessão carregada ainda
    const { updateSessionById } = makeSessionStore({});
    const setIsLoading = vi.fn();
    const resetLoadingProgress = vi.fn();

    renderHook(() => useInterruptedDossierRunRecovery({
      isInitialized: true,
      updateSessionById,
      setIsLoading,
      resetLoadingProgress,
    }));

    expect(updateSessionById).toHaveBeenCalledTimes(1);
    expect(updateSessionById).toHaveReturnedWith(null);
    // registro NÃO é removido — permanece para tentativa posterior
    expect(peekPersistedActiveDossierRuns().length).toBe(1);
    // loading não é resetado enquanto houver pendência
    expect(setIsLoading).not.toHaveBeenCalled();
    expect(resetLoadingProgress).not.toHaveBeenCalled();
  });

  it('não marca COMPLETED e não retoma waterfall (nenhuma chamada de lifecycle)', () => {
    setActiveDossierRun({ sessionId: 's1', runId: 'run-1', leaseOwner: 'l', clientAttemptId: 'a' });
    // Simula reload real: contexto local perdido, sessionStorage preservado.
    clearActiveDossierRunsMemoryForTest();
    const { updateSessionById } = makeSessionStore({ s1: makeSession('s1') });
    const setIsLoading = vi.fn();
    const resetLoadingProgress = vi.fn();

    renderHook(() => useInterruptedDossierRunRecovery({
      isInitialized: true,
      updateSessionById,
      setIsLoading,
      resetLoadingProgress,
    }));

    const [, updater] = updateSessionById.mock.calls[0];
    const updated = updater(makeSession('s1'));
    const successLike = updated.messages.filter(m => /complet|sucesso|gerado/i.test(String(m.text || '')));
    expect(successLike).toHaveLength(0);
  });

  it('Lifecycle D — run vivo no documento NÃO é tratado como interrompido (sem mensagem, sem consumo, sem reset)', () => {
    // Mesmo documento: run registrado e execução ativa (contexto local presente).
    setActiveDossierRun({ sessionId: 's1', runId: 'run-1', leaseOwner: 'l', clientAttemptId: 'a' });
    const { updateSessionById } = makeSessionStore({ s1: makeSession('s1') });
    const setIsLoading = vi.fn();
    const resetLoadingProgress = vi.fn();

    renderHook(() => useInterruptedDossierRunRecovery({
      isInitialized: true,
      updateSessionById,
      setIsLoading,
      resetLoadingProgress,
    }));

    // Nenhuma mensagem de interrupção, nenhum consumo do registro, nenhum reset.
    expect(updateSessionById).not.toHaveBeenCalled();
    expect(peekPersistedActiveDossierRuns().length).toBe(1);
    expect(setIsLoading).not.toHaveBeenCalled();
    expect(resetLoadingProgress).not.toHaveBeenCalled();
  });
});

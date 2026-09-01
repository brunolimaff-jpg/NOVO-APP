import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { ChatSession, Message } from '../../types';
import { setActiveDossierRun, clearAllActiveDossierRunsForTest, peekPersistedActiveDossierRuns } from '../../features/dossier/active-run-registry';
import { useInterruptedDossierRunRecovery } from '../../hooks/useInterruptedDossierRunRecovery';

// BRU-156: mock do estado remoto — cada teste configura o status via __setRemoteRuns
const remoteRuns = new Map<string, { status: string }>();
const getDossierRunMock = vi.fn(async (runId: string) => remoteRuns.get(runId) ?? null);
vi.mock('../../lib/supabase/dossierRuns', () => ({
  getDossierRun: (runId: string) => getDossierRunMock(runId),
}));


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
  remoteRuns.clear();
  getDossierRunMock.mockClear();
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


/** Configura o estado remoto (Supabase) para os runIds indicados. BRU-156. */
function setRemoteRun(runId: string, status: string): void {
  remoteRuns.set(runId, { status });
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

  // BRU-156: estado remoto terminal vence marcador local de reload.
  it('NÃO injeta mensagem de interrupção quando o run remoto está COMPLETED (reload pós-conclusão)', async () => {
    setRemoteRun('run-1', 'COMPLETED');
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

    await vi.waitFor(() => {
      expect(getDossierRunMock).toHaveBeenCalledWith('run-1');
    });
    await vi.waitFor(() => {
      expect(updateSessionById).not.toHaveBeenCalled();
    });
    // registro local é limpo mesmo assim (não sobra marcador órfão)
    expect(peekPersistedActiveDossierRuns()).toHaveLength(0);
  });

  // Microgate de evidência BRU-156 (despacho Planejador): a telemetria prova
  // o reconciliamento — reload_run_already_terminal emitido; reload_interrupted_run NÃO.
  it('telemetria: COMPLETED remoto emite reload_run_already_terminal e NÃO emite reload_interrupted_run', async () => {
    const diagModule = await import('../../utils/diagnosticLog');
    const infoSpy = vi.spyOn(diagModule.scoutDiag, 'info');
    const warnSpy = vi.spyOn(diagModule.scoutDiag, 'warn');

    setRemoteRun('run-1', 'COMPLETED');
    setActiveDossierRun({ sessionId: 's1', runId: 'run-1', leaseOwner: 'l', clientAttemptId: 'a' });
    const { updateSessionById } = makeSessionStore({ s1: makeSession('s1') });

    renderHook(() => useInterruptedDossierRunRecovery({
      isInitialized: true,
      updateSessionById,
      setIsLoading: vi.fn(),
      resetLoadingProgress: vi.fn(),
    }));

    await vi.waitFor(() => {
      expect(infoSpy).toHaveBeenCalledWith('DossierRunLifecycle', 'reload_run_already_terminal', expect.objectContaining({ runId: 'run-1' }));
    });
    expect(warnSpy).not.toHaveBeenCalledWith('DossierRunLifecycle', 'reload_interrupted_run', expect.anything());
    infoSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('injeta mensagem de interrupção quando o run remoto NÃO está terminal (interrupt legítimo)', async () => {
    setRemoteRun('run-2', 'RUNNING');
    setActiveDossierRun({ sessionId: 's1', runId: 'run-2', leaseOwner: 'l', clientAttemptId: 'a' });
    const { updateSessionById } = makeSessionStore({ s1: makeSession('s1') });
    const setIsLoading = vi.fn();
    const resetLoadingProgress = vi.fn();

    renderHook(() => useInterruptedDossierRunRecovery({
      isInitialized: true,
      updateSessionById,
      setIsLoading,
      resetLoadingProgress,
    }));

    await vi.waitFor(() => {
      expect(updateSessionById).toHaveBeenCalled();
    });
    const updatedSession = updateSessionById.mock.results[0]?.value as ChatSession;
    const interrupted = updatedSession?.messages?.find(m => m.id.startsWith('dossier-interrupted-'));
    expect(interrupted).toBeDefined();
  });

  it('não roda antes de isInitialized (aguarda sessões carregadas)', async () => {
    setActiveDossierRun({ sessionId: 's1', runId: 'run-1', leaseOwner: 'l', clientAttemptId: 'a' });
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
    await vi.waitFor(() => {
      expect(updateSessionById).toHaveBeenCalledTimes(1);
    });
    expect(peekPersistedActiveDossierRuns().length).toBe(0);
  });

  it('injeta estado explícito de interrupção e reseta loading quando há run persistido e sessão existe', async () => {
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

    await vi.waitFor(() => {
      expect(updateSessionById).toHaveBeenCalledTimes(1);
    });
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

  it('preserva o registro persistido quando a sessão ainda não existe (corrida com loadSessions)', async () => {
    setActiveDossierRun({ sessionId: 's1', runId: 'run-1', leaseOwner: 'l', clientAttemptId: 'a' });
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

    await vi.waitFor(() => {
      expect(updateSessionById).toHaveBeenCalledTimes(1);
    });
    expect(updateSessionById).toHaveReturnedWith(null);
    // registro NÃO é removido — permanece para tentativa posterior
    expect(peekPersistedActiveDossierRuns().length).toBe(1);
    // loading não é resetado enquanto houver pendência
    expect(setIsLoading).not.toHaveBeenCalled();
    expect(resetLoadingProgress).not.toHaveBeenCalled();
  });

  it('não marca COMPLETED e não retoma waterfall (nenhuma chamada de lifecycle)', async () => {
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

    await vi.waitFor(() => {
      expect(updateSessionById).toHaveBeenCalledTimes(1);
    });
    const [, updater] = updateSessionById.mock.calls[0];
    const updated = updater(makeSession('s1'));
    const successLike = updated.messages.filter(m => /complet|sucesso|gerado/i.test(String(m.text || '')));
    expect(successLike).toHaveLength(0);
  });
});

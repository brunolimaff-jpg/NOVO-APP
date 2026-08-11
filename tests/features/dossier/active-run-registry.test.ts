import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import {
  clearActiveDossierRun,
  clearActiveDossierRunsMemoryForTest,
  clearAllActiveDossierRunsForTest,
  consumePersistedActiveDossierRuns,
  getActiveDossierRun,
  setActiveDossierRun,
} from '../../../features/dossier/active-run-registry';

const STORAGE_KEY = 'scout360:active_dossier_run';

function mockSessionStorage(): Storage {
  const store = new Map<string, string>();
  const listeners = new Map<string, EventListener[]>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() { return store.size; },
    dispatchEvent: (event: Event) => {
      for (const listener of listeners.get(event.type) ?? []) listener(event);
      return true;
    },
    addEventListener: (type: string, listener: EventListener) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    removeEventListener: () => undefined,
  } as unknown as Storage;
  return storage;
}

let sessionStorageMock: Storage;
beforeEach(() => {
  sessionStorageMock = mockSessionStorage();
  vi.stubGlobal('window', {
    sessionStorage: sessionStorageMock,
    addEventListener: sessionStorageMock.addEventListener,
    dispatchEvent: sessionStorageMock.dispatchEvent,
  });
  clearAllActiveDossierRunsForTest();
});
afterEach(() => {
  vi.unstubAllGlobals();
  clearAllActiveDossierRunsForTest();
});

const run = (sessionId: string, runId: string) => ({ sessionId, runId, leaseOwner: 'l', clientAttemptId: 'a' });

describe('active run registry', () => {
  it('set/get, substitui e isola', () => {
    setActiveDossierRun(run('s', 'a'));
    setActiveDossierRun(run('x', 'z'));
    setActiveDossierRun(run('s', 'b'));
    expect(getActiveDossierRun('s')?.runId).toBe('b');
    expect(getActiveDossierRun('x')?.runId).toBe('z');
  });

  it('cleanup antigo não apaga substituto', () => {
    setActiveDossierRun(run('s', 'a'));
    setActiveDossierRun(run('s', 'b'));
    clearActiveDossierRun('s', 'a');
    expect(getActiveDossierRun('s')?.runId).toBe('b');
    clearActiveDossierRun('s', 'b');
    expect(getActiveDossierRun('s')).toBeNull();
  });

  it('persiste em sessionStorage e sobrevive a um novo módulo (reload)', () => {
    setActiveDossierRun(run('s', 'run-reload'));
    expect(sessionStorageMock.getItem(STORAGE_KEY)).toContain('run-reload');

    // Simula reload: limpa o Map em memória, preservando o sessionStorage.
    clearActiveDossierRunsMemoryForTest();
    expect(getActiveDossierRun('s')?.runId).toBe('run-reload');
  });

  it('remove do sessionStorage ao limpar o último run ativo', () => {
    setActiveDossierRun(run('s', 'a'));
    clearActiveDossierRun('s', 'a');
    expect(sessionStorageMock.getItem(STORAGE_KEY)).toBeNull();
  });

  it('emite marcador de set e clear com resultado observável', () => {
    const events: CustomEvent[] = [];
    window.addEventListener('scout:dossier-active-run', event => events.push(event as CustomEvent));

    setActiveDossierRun(run('s', 'a'));
    clearActiveDossierRun('s', 'a');

    expect(events.map(event => event.detail.event)).toEqual(['active-run:set', 'active-run:clear']);
    expect(events[1].detail).toMatchObject({
      sessionId: 's',
      runId: 'a',
      clearSucceeded: true,
      remainingRunId: null,
    });
  });

  it('consumePersistedActiveDossierRuns entrega runs e limpa o registro persistido', () => {
    setActiveDossierRun(run('s', 'a'));
    setActiveDossierRun(run('x', 'z'));

    const consumed = consumePersistedActiveDossierRuns();
    expect(consumed.map(r => r.runId).sort()).toEqual(['a', 'z']);
    expect(getActiveDossierRun('s')).toBeNull();
    expect(getActiveDossierRun('x')).toBeNull();
    expect(sessionStorageMock.getItem(STORAGE_KEY)).toBeNull();
  });

  it('ignora storage corrompido sem lançar', () => {
    sessionStorageMock.setItem(STORAGE_KEY, '{json inválido');
    expect(() => getActiveDossierRun('s')).not.toThrow();
    expect(getActiveDossierRun('s')).toBeNull();
  });
});

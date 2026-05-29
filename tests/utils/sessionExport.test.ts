import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exportSessionsAsJSON, importSessionsFromJSON } from '../../utils/sessionExport';
import type { ChatSession } from '../../types';

const STORAGE_PREFIX = 'scout360:';

function createTestStorage(
  setItemOverride?: (key: string, value: string, store: Map<string, string>) => void,
): Storage {
  const store = new Map<string, string>();

  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      if (setItemOverride) {
        setItemOverride(key, value, store);
        return;
      }
      store.set(key, String(value));
    },
  };
}

function replaceWindowLocalStorage(storage: Storage): () => void {
  const originalStorage = window.localStorage;
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: storage,
  });
  return () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: originalStorage,
    });
  };
}

function makeSession(overrides: Partial<ChatSession> = {}): ChatSession {
  return {
    id: 'session-1',
    title: 'Investigar Fazenda Teste',
    messages: [],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-02T00:00:00.000Z',
    empresaAlvo: 'Fazenda Teste',
    cnpj: '12.345.678/0001-99',
    modoPrincipal: 'investigacao',
    scoreOportunidade: null,
    resumoDossie: null,
    ...overrides,
  };
}

describe('sessionExport', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();

    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:scout360-backup');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  it('exporta sessões salvas no storage v2 prefixado', async () => {
    const session = makeSession();
    window.localStorage.setItem(`${STORAGE_PREFIX}scout360_sessions_v2`, JSON.stringify([session]));

    const anchor = document.createElement('a');
    const click = vi.fn();
    Object.defineProperty(anchor, 'click', { value: click });
    vi.spyOn(document, 'createElement').mockReturnValue(anchor);

    await exportSessionsAsJSON();

    expect(click).toHaveBeenCalledOnce();
    expect(anchor.download).toMatch(/^scout360_backup_\d{4}-\d{2}-\d{2}_\d{4}\.json$/);
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:scout360-backup');
  });

  it('importa sessões para o storage v2 como JSON', async () => {
    const session = makeSession({ id: 'imported-session' });
    const file = new File(
      [
        JSON.stringify({
          version: '1.0',
          exportDate: '2024-01-03T00:00:00.000Z',
          sessionCount: 1,
          sessions: [session],
        }),
      ],
      'backup.json',
      { type: 'application/json' },
    );

    await expect(importSessionsFromJSON(file)).resolves.toMatchObject({
      sessionCount: 1,
      sessions: [expect.objectContaining({ id: 'imported-session' })],
    });

    expect(window.localStorage.getItem(`${STORAGE_PREFIX}scout360_sessions_v2`)).toBe(JSON.stringify([session]));
  });

  it('usa storage v1 como fallback quando storage v2 não consegue salvar', async () => {
    const session = makeSession({ id: 'fallback-session' });
    const storage = createTestStorage((key, value, store) => {
      if (key === `${STORAGE_PREFIX}scout360_sessions_v2`) {
        throw new Error('QuotaExceededError');
      }
      store.set(key, String(value));
    });
    const restoreStorage = replaceWindowLocalStorage(storage);

    const file = new File(
      [
        JSON.stringify({
          version: '1.0',
          exportDate: '2024-01-03T00:00:00.000Z',
          sessionCount: 1,
          sessions: [session],
        }),
      ],
      'backup.json',
      { type: 'application/json' },
    );

    try {
      await expect(importSessionsFromJSON(file)).resolves.toMatchObject({
        sessionCount: 1,
      });

      expect(window.localStorage.getItem(`${STORAGE_PREFIX}scout360_sessions_v2`)).toBeNull();
      expect(window.localStorage.getItem('scout360_sessions_v1')).toBe(JSON.stringify([session]));
    } finally {
      restoreStorage();
    }
  });
});

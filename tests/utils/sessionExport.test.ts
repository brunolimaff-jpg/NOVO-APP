import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exportSessionsAsJSON, importSessionsFromJSON } from '../../utils/sessionExport';
import type { ChatSession } from '../../types';

// Mock the storage module
vi.mock('../../services/storage', () => ({
  storage: {
    getDossiers: vi.fn(),
    saveDossier: vi.fn(),
  },
}));

import { storage } from '../../services/storage';

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
    vi.clearAllMocks();

    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:scout360-backup');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  it('exporta sessões do Supabase via storage service', async () => {
    const session = makeSession();
    vi.mocked(storage.getDossiers).mockResolvedValue([session]);

    const anchor = document.createElement('a');
    const click = vi.fn();
    Object.defineProperty(anchor, 'click', { value: click });
    vi.spyOn(document, 'createElement').mockReturnValue(anchor);

    await exportSessionsAsJSON();

    expect(storage.getDossiers).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(anchor.download).toMatch(/^scout360_backup_\d{4}-\d{2}-\d{2}_\d{4}\.json$/);
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:scout360-backup');
  });

  it('importa sessões chamando storage.saveDossier para cada sessão', async () => {
    const session = makeSession({ id: 'imported-session' });
    vi.mocked(storage.saveDossier).mockResolvedValue(undefined);

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

    expect(storage.saveDossier).toHaveBeenCalledWith(session);
  });

  it('importa multiplas sessoes chamando storage.saveDossier para cada uma', async () => {
    const sessions = [makeSession({ id: 's1' }), makeSession({ id: 's2' })];
    vi.mocked(storage.saveDossier).mockResolvedValue(undefined);

    const file = new File(
      [
        JSON.stringify({
          version: '1.0',
          exportDate: '2024-01-03T00:00:00.000Z',
          sessionCount: 2,
          sessions,
        }),
      ],
      'backup.json',
      { type: 'application/json' },
    );

    await expect(importSessionsFromJSON(file)).resolves.toMatchObject({
      sessionCount: 2,
    });

    expect(storage.saveDossier).toHaveBeenCalledTimes(2);
    expect(storage.saveDossier).toHaveBeenCalledWith(sessions[0]);
    expect(storage.saveDossier).toHaveBeenCalledWith(sessions[1]);
  });
});

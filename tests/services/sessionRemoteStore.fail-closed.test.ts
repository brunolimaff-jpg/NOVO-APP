import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatSession } from '../../types';

const scoutDiagMock = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('../../services/apiConfig', () => ({ BACKEND_URL: undefined }));
vi.mock('../../utils/retry', () => ({
  withAutoRetry: vi.fn((_key: string, action: () => Promise<unknown>) => action()),
}));
vi.mock('../../utils/diagnosticLog', () => ({ scoutDiag: scoutDiagMock }));
vi.mock('../../utils/textCleaners', () => ({ stripInternalMarkers: (text: string) => text }));

import { getRemoteSession, listRemoteSessions, saveRemoteSession } from '../../services/sessionRemoteStore';

function makeSession(): ChatSession {
  return {
    id: 'session-fail-closed',
    title: 'Sessão de teste',
    empresaAlvo: 'Empresa de teste',
    cnpj: null,
    modoPrincipal: 'investigacao',
    scoreOportunidade: null,
    resumoDossie: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    messages: [],
  };
}

describe('sessionRemoteStore — backend ausente', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('não chama fetch em list/get/save quando a fronteira de sessão não está configurada', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('fetch não deveria ser chamado'));

    await expect(listRemoteSessions()).resolves.toEqual([]);
    await expect(getRemoteSession('session-fail-closed')).resolves.toBeNull();
    await expect(saveRemoteSession(makeSession())).rejects.toThrow();

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

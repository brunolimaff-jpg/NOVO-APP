import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatSession } from '../../../types';

const upsert = vi.hoisted(() => vi.fn());
const select = vi.hoisted(() => vi.fn());
const rpc = vi.hoisted(() => vi.fn());
const warn = vi.hoisted(() => vi.fn());

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({ upsert })),
    rpc,
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: 'u1' } } } }) },
  },
  isSupabaseAvailable: () => true,
}));
vi.mock('../../../services/storage/_shared', () => ({ getOperatorId: () => 'operator-1' }));
vi.mock('../../../utils/localStorage', () => ({ storageGet: () => null }));
vi.mock('../../../utils/diagnosticLog', () => ({ scoutDiag: { warn } }));

import { dossiers } from '../../../services/storage/dossiers';

const session: ChatSession = {
  id: 'session-1', title: 'Acme', empresaAlvo: 'Acme', cnpj: null, modoPrincipal: 'investigacao',
  scoreOportunidade: null, resumoDossie: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  messages: [{ id: 'message-1', sender: 'bot' as ChatSession['messages'][number]['sender'], text: 'conteúdo confidencial do dossiê', timestamp: new Date() }],
};

beforeEach(() => {
  vi.clearAllMocks();
  upsert.mockReturnValue({ select });
  select.mockResolvedValue({ data: [{ id: 'session-1' }], error: null });
  rpc.mockResolvedValue({ error: null });
});

describe('saveDossierStrict', () => {
  it('confirma persistência de sucesso', async () => {
    await expect(dossiers.saveDossierStrict(session)).resolves.toBeUndefined();
  });

  it('diagnostica erro sem conteúdo do dossiê e preserva causa', async () => {
    const error = { message: 'database unavailable' };
    select.mockResolvedValueOnce({ data: null, error });
    await expect(dossiers.saveDossierStrict(session)).rejects.toMatchObject({ message: 'database unavailable', cause: error });
    expect(warn).toHaveBeenCalledWith('Storage', 'save-dossier-strict-failed', { sessionId: 'session-1', error: 'database unavailable' });
    expect(JSON.stringify(warn.mock.calls)).not.toContain('conteúdo confidencial');
  });

  it.each([null, [{ id: 'different-id' }]])('rejeita confirmação ausente ou divergente', async data => {
    select.mockResolvedValueOnce({ data, error: null });
    await expect(dossiers.saveDossierStrict(session)).rejects.toThrow('Persistência estrita sem confirmação do dossiê');
    expect(warn).toHaveBeenCalledWith('Storage', 'save-dossier-strict-unconfirmed', expect.objectContaining({ sessionId: 'session-1' }));
  });
});

describe('saveAllDossiers — BRU-81 containment server-side', () => {
  it('delega à RPC save_dossiers_autosave (check anti-run vinculado à escrita, sem upsert direto)', async () => {
    await dossiers.saveAllDossiers([session]);

    expect(rpc).toHaveBeenCalledWith('save_dossiers_autosave', {
      p_dossiers: expect.arrayContaining([expect.objectContaining({ id: 'session-1' })]),
    });
    // ZERO upsert direto — o write passa pela RPC (containment server-side)
    expect(upsert).not.toHaveBeenCalled();
  });

  it('ignora lotes vazios sem chamar a RPC', async () => {
    await dossiers.saveAllDossiers([]);
    expect(rpc).not.toHaveBeenCalled();
  });
});

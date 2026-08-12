import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInvestigation } from '../../hooks/useInvestigation';
import { scoutDiag } from '../../utils/diagnosticLog';

const getDossierMock = vi.fn();
const saveDossierMock = vi.fn();
const deleteDossierMock = vi.fn();
const maybeSingleMock = vi.fn();

vi.mock('../../services/storage', () => ({
  storage: {
    getDossier: (...args: unknown[]) => getDossierMock(...args),
    saveDossier: (...args: unknown[]) => saveDossierMock(...args),
    deleteDossier: (...args: unknown[]) => deleteDossierMock(...args),
    touchUserContext: vi.fn(),
  },
}));

vi.mock('../../lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: (...args: unknown[]) => maybeSingleMock(...args),
        })),
      })),
    })),
  },
}));

vi.mock('../../services/operatorTracking', () => ({
  trackOperatorEvent: vi.fn(),
}));

vi.mock('../../services/dossierAccessService', () => ({
  logDossierAccess: vi.fn(),
}));

describe('useInvestigation — handleAccessExistingDossier', () => {
  const onSelectSession = vi.fn();
  const onDeepDive = vi.fn();
  const toast = { error: vi.fn() };

  const baseParams = {
    mode: 'default',
    onDeepDive,
    operatorId: 'op-1',
    onSelectSession,
    toast,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    getDossierMock.mockResolvedValue(null);
    saveDossierMock.mockResolvedValue(undefined);
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    vi.spyOn(scoutDiag, 'warn').mockImplementation(() => {});
  });

  it('não seleciona a sessão quando Supabase não retorna conteúdo (comportamento atual do hook)', async () => {
    const { result } = renderHook(() => useInvestigation(baseParams));

    act(() => {
      result.current.setDuplicateDossier({
        id: 'dossier-1',
        title: 'Empresa Teste',
        empresaAlvo: 'Empresa Teste',
        createdAt: '2026-01-01T00:00:00.000Z',
        scoreOportunidade: null,
        operatorId: 'op-1',
      });
      result.current.pendingPayloadRef.current = {
        companyName: 'Empresa Teste',
        cnpj: '12345678000199',
        city: 'SP',
        state: 'SP',
      };
    });

    await act(async () => {
      await result.current.handleAccessExistingDossier();
    });

    expect(onSelectSession).not.toHaveBeenCalled();
  });
});

describe('useInvestigation — handleNewResearchOverride preserva o dossiê anterior quando a nova investigação falha', () => {
  const onSelectSession = vi.fn();
  const onDeepDive = vi.fn();
  const toast = { error: vi.fn() };

  const baseParams = {
    mode: 'default',
    onDeepDive,
    operatorId: 'op-1',
    onSelectSession,
    toast,
  };

  const payload = { companyName: 'Empresa Teste', cnpj: null, city: 'SP', state: 'SP' };

  function setupOverride(oldDossierId: string) {
    const hook = renderHook(() => useInvestigation(baseParams as never));
    act(() => {
      // operatorId igual ao do operador logado ('op-1') → dossiê PRÓPRIO
      // (sem operatorId o fail-closed do BRU-11 trataria como estrangeiro)
      hook.result.current.setDuplicateDossier({ id: oldDossierId, empresaAlvo: 'Antiga', cnpj: null, title: 'Antiga', updatedAt: '', operatorId: 'op-1' } as never);
      hook.result.current.pendingPayloadRef.current = payload as never;
    });
    return hook;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    getDossierMock.mockResolvedValue(null);
    saveDossierMock.mockResolvedValue(undefined);
    deleteDossierMock.mockResolvedValue(undefined);
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    vi.spyOn(scoutDiag, 'warn').mockImplementation(() => {});
  });

  it('resultado FAILED preserva o dossiê anterior (não deleta, não registra override)', async () => {
    onDeepDive.mockResolvedValue({ status: 'FAILED', errorCode: 'waterfall_failed', errorStage: 'after_porta', error: new Error('Lease do dossiê perdida') });
    const hook = setupOverride('old-1');

    await act(async () => {
      await hook.result.current.handleNewResearchOverride();
    });

    expect(deleteDossierMock).not.toHaveBeenCalled();
    expect(scoutDiag.warn).toHaveBeenCalledWith('ChatInterface', 'dossier-override-preserved-previous', expect.objectContaining({ previousDossierId: 'old-1', resultStatus: 'FAILED' }));
  });

  it('resultado CANCELLED preserva o dossiê anterior', async () => {
    onDeepDive.mockResolvedValue({ status: 'CANCELLED', terminalPersisted: false, reason: 'local_abort' });
    const hook = setupOverride('old-2');

    await act(async () => {
      await hook.result.current.handleNewResearchOverride();
    });

    expect(deleteDossierMock).not.toHaveBeenCalled();
    expect(scoutDiag.warn).toHaveBeenCalledWith('ChatInterface', 'dossier-override-preserved-previous', expect.objectContaining({ resultStatus: 'CANCELLED' }));
  });

  it('rejeição (throw interno) preserva o dossiê anterior', async () => {
    onDeepDive.mockRejectedValue(new Error('Falha interna'));
    const hook = setupOverride('old-3');

    await act(async () => {
      await hook.result.current.handleNewResearchOverride();
    });

    expect(deleteDossierMock).not.toHaveBeenCalled();
    expect(scoutDiag.warn).toHaveBeenCalledWith('ChatInterface', 'Falha ao sobrescrever dossiê — dossiê anterior preservado', expect.objectContaining({ previousDossierId: 'old-3' }));
  });

  it('COMPLETED sem dossierId não deleta o anterior', async () => {
    onDeepDive.mockResolvedValue({ status: 'COMPLETED' });
    const hook = setupOverride('old-4');

    await act(async () => {
      await hook.result.current.handleNewResearchOverride();
    });

    expect(getDossierMock).not.toHaveBeenCalled();
    expect(deleteDossierMock).not.toHaveBeenCalled();
  });

  it('COMPLETED com dossierId persistido e confirmado deleta o anterior (override legítimo)', async () => {
    onDeepDive.mockResolvedValue({ status: 'COMPLETED', dossierId: 'new-1' });
    getDossierMock.mockResolvedValue({ id: 'new-1', messages: [] });
    const hook = setupOverride('old-5');

    await act(async () => {
      await hook.result.current.handleNewResearchOverride();
    });

    expect(getDossierMock).toHaveBeenCalledWith('new-1');
    expect(deleteDossierMock).toHaveBeenCalledWith('old-5');
  });

  it('COMPLETED mas novo dossiê não confirmado no storage não deleta o anterior', async () => {
    onDeepDive.mockResolvedValue({ status: 'COMPLETED', dossierId: 'new-2' });
    getDossierMock.mockResolvedValue(null); // dossiê novo não encontrado
    const hook = setupOverride('old-6');

    await act(async () => {
      await hook.result.current.handleNewResearchOverride();
    });

    expect(deleteDossierMock).not.toHaveBeenCalled();
  });
});

describe('useInvestigation — BRU-81: nova pesquisa do zero reutiliza a thread da conta', () => {
  const onSelectSession = vi.fn();
  const onDeepDive = vi.fn();

  const payload = { companyName: 'Empresa Teste', cnpj: null, city: 'SP', state: 'SP' };

  beforeEach(() => {
    vi.clearAllMocks();
    getDossierMock.mockResolvedValue(null);
    saveDossierMock.mockResolvedValue(undefined);
    deleteDossierMock.mockResolvedValue(undefined);
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    vi.spyOn(scoutDiag, 'warn').mockImplementation(() => {});
    onDeepDive.mockResolvedValue({ status: 'COMPLETED', dossierId: 'new-81', terminalPersisted: true });
  });

  function setupOverride(params: { oldDossierId: string; currentSessionId?: string | null }) {
    const { currentSessionId = null } = params;
    const hook = renderHook(() =>
      useInvestigation({
        mode: 'default',
        onDeepDive,
        operatorId: 'op-1',
        onSelectSession,
        currentSessionId,
      } as never),
    );
    act(() => {
      hook.result.current.setDuplicateDossier({
        id: params.oldDossierId,
        empresaAlvo: 'Antiga',
        cnpj: null,
        title: 'Antiga',
        updatedAt: '',
        operatorId: 'op-1',
      } as never);
      hook.result.current.pendingPayloadRef.current = payload as never;
    });
    return hook;
  }

  it('duplicata própria + currentSessionId nulo → seleciona a thread existente ANTES de executar', async () => {
    const hook = setupOverride({ oldDossierId: 'old-thread-81' });

    await act(async () => {
      await hook.result.current.handleNewResearchOverride();
    });

    // BRU-81: volta para a thread da conta para o handleSendMessage reutilizar a sessão
    expect(onSelectSession).toHaveBeenCalledWith('old-thread-81');
    // execução segue normalmente após selecionar a thread
    expect(onDeepDive).toHaveBeenCalled();
  });

  it('duplicata própria + currentSessionId já na mesma thread → não seleciona de novo', async () => {
    const hook = setupOverride({ oldDossierId: 'old-thread-81', currentSessionId: 'old-thread-81' });

    await act(async () => {
      await hook.result.current.handleNewResearchOverride();
    });

    // Já estamos na thread da conta — não há o que reutilizar (idempotente)
    expect(onSelectSession).not.toHaveBeenCalled();
    expect(onDeepDive).toHaveBeenCalled();
  });

  it('duplicata própria + currentSessionId de OUTRA conta → seleciona a thread do dossiê', async () => {
    const hook = setupOverride({ oldDossierId: 'old-thread-81', currentSessionId: 'outra-conta' });

    await act(async () => {
      await hook.result.current.handleNewResearchOverride();
    });

    expect(onSelectSession).toHaveBeenCalledWith('old-thread-81');
    expect(onDeepDive).toHaveBeenCalled();
  });

  it('fonte ESTRANGEIRA + currentSessionId nulo → NÃO seleciona a thread do dossiê estrangeiro (fail-closed)', async () => {
    const hook = renderHook(() =>
      useInvestigation({
        mode: 'default',
        onDeepDive,
        operatorId: 'op-1',
        onSelectSession,
        currentSessionId: null,
      } as never),
    );
    act(() => {
      hook.result.current.setDuplicateDossier({
        id: 'dossier-estrangeiro',
        empresaAlvo: 'Estrangeira',
        cnpj: null,
        title: 'Estrangeira',
        updatedAt: '',
        operatorId: 'op-outro', // != 'op-1' → fail-closed BRU-11
      } as never);
      hook.result.current.pendingPayloadRef.current = payload as never;
    });

    await act(async () => {
      await hook.result.current.handleNewResearchOverride();
    });

    expect(onSelectSession).not.toHaveBeenCalled();
    expect(onDeepDive).toHaveBeenCalled();
  });
});

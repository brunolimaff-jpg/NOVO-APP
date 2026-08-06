import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInvestigation } from '../../hooks/useInvestigation';
import { scoutDiag } from '../../utils/diagnosticLog';

const getDossierMock = vi.fn();
const saveDossierMock = vi.fn();
const deleteDossierMock = vi.fn();
const maybeSingleMock = vi.fn();
const logDossierAccessMock = vi.fn();
const trackOperatorEventMock = vi.fn();

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
  trackOperatorEvent: (...args: unknown[]) => trackOperatorEventMock(...args),
}));

vi.mock('../../services/dossierAccessService', () => ({
  logDossierAccess: (...args: unknown[]) => logDossierAccessMock(...args),
}));

// BRU-11 camada 1: prova fail-closed — dossiê estrangeiro não pode disparar
// leitura, cópia, persistência, seleção, log, reabertura ou geração paga.
describe('useInvestigation — BRU-11 camada 1 (dossiê estrangeiro fail-closed)', () => {
  const onSelectSession = vi.fn();
  const onDeepDive = vi.fn();

  const baseParams = {
    mode: 'default',
    onDeepDive,
    operatorId: 'op-atual',
    onSelectSession,
  };

  const foreignDossier = {
    id: 'dossier-estrangeiro',
    title: 'Empresa Estrangeira',
    empresaAlvo: 'Empresa Estrangeira',
    createdAt: '2026-01-01T00:00:00.000Z',
    scoreOportunidade: 88,
    operatorId: 'op-outro',
  };

  const ownDossier = {
    ...foreignDossier,
    id: 'dossier-proprio',
    operatorId: 'op-atual',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    getDossierMock.mockResolvedValue(null);
    saveDossierMock.mockResolvedValue(undefined);
    deleteDossierMock.mockResolvedValue(undefined);
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    vi.spyOn(scoutDiag, 'warn').mockImplementation(() => {});
  });

  it('classifica isForeignDossier=true quando o dono difere do operador logado', () => {
    const { result } = renderHook(() => useInvestigation(baseParams));
    act(() => {
      result.current.setDuplicateDossier(foreignDossier);
    });
    expect(result.current.isForeignDossier).toBe(true);
  });

  it('classifica isForeignDossier=false quando o dono é o operador logado', () => {
    const { result } = renderHook(() => useInvestigation(baseParams));
    act(() => {
      result.current.setDuplicateDossier(ownDossier);
    });
    expect(result.current.isForeignDossier).toBe(false);
  });

  it('bloqueia acesso estrangeiro com ZERO chamadas proibidas (prova por spies)', async () => {
    const { result } = renderHook(() => useInvestigation(baseParams));

    act(() => {
      result.current.setDuplicateDossier(foreignDossier);
      result.current.pendingPayloadRef.current = {
        companyName: 'Empresa Estrangeira',
        cnpj: '12345678000199',
        city: 'SP',
        state: 'SP',
      };
    });

    await act(async () => {
      await result.current.handleAccessExistingDossier();
    });

    expect(getDossierMock).not.toHaveBeenCalled();
    expect(maybeSingleMock).not.toHaveBeenCalled();
    expect(saveDossierMock).not.toHaveBeenCalled();
    expect(deleteDossierMock).not.toHaveBeenCalled();
    expect(logDossierAccessMock).not.toHaveBeenCalled();
    expect(trackOperatorEventMock).not.toHaveBeenCalled();
    expect(onSelectSession).not.toHaveBeenCalled();
    expect(onDeepDive).not.toHaveBeenCalled();
    expect(scoutDiag.warn).toHaveBeenCalledWith(
      'Investigation',
      'foreign-dossier-access-blocked',
      expect.objectContaining({ dossierId: 'dossier-estrangeiro', reason: 'owner_mismatch_fail_closed' }),
    );
  });

  it('mantém o modal aberto após bloqueio (duplicateDossier preservado)', async () => {
    const { result } = renderHook(() => useInvestigation(baseParams));

    act(() => {
      result.current.setDuplicateDossier(foreignDossier);
      result.current.pendingPayloadRef.current = {
        companyName: 'Empresa Estrangeira',
        cnpj: '12345678000199',
        city: 'SP',
        state: 'SP',
      };
    });

    await act(async () => {
      await result.current.handleAccessExistingDossier();
    });

    // O dossiê estrangeiro continua exibido no modal (mensagem explícita visível),
    // e o payload continua disponível para a ação explícita de nova pesquisa.
    expect(result.current.duplicateDossier).toEqual(foreignDossier);
    expect(result.current.pendingPayloadRef.current).not.toBeNull();
  });

  it('abre dossiê próprio normalmente (sem regressão)', async () => {
    const session = { id: 'dossier-proprio', messages: [] };
    getDossierMock.mockResolvedValue(session);
    const { result } = renderHook(() => useInvestigation(baseParams));

    act(() => {
      result.current.setDuplicateDossier(ownDossier);
      result.current.pendingPayloadRef.current = {
        companyName: 'Empresa Própria',
        cnpj: '12345678000199',
        city: 'SP',
        state: 'SP',
      };
    });

    await act(async () => {
      await result.current.handleAccessExistingDossier();
    });

    expect(getDossierMock).toHaveBeenCalledWith('dossier-proprio');
    expect(onSelectSession).toHaveBeenCalledWith('dossier-proprio');
    expect(maybeSingleMock).not.toHaveBeenCalled();
  });

  it('nova pesquisa do zero sobre fonte estrangeira NÃO deleta/loga/trackeia a fonte', async () => {
    const { result } = renderHook(() => useInvestigation(baseParams));

    act(() => {
      result.current.setDuplicateDossier(foreignDossier);
      result.current.pendingPayloadRef.current = {
        companyName: 'Empresa Estrangeira',
        cnpj: '12345678000199',
        city: 'SP',
        state: 'SP',
      };
    });

    // Nova investigação COMPLETED com dossiê novo persistido
    onDeepDive.mockResolvedValue({ status: 'COMPLETED', dossierId: 'dossier-novo' });
    getDossierMock.mockResolvedValue({ id: 'dossier-novo', messages: [] });

    await act(async () => {
      await result.current.handleNewResearchOverride();
    });

    // A fonte estrangeira permanece INTOCADA
    expect(deleteDossierMock).not.toHaveBeenCalled();
    expect(logDossierAccessMock).not.toHaveBeenCalled();
    expect(trackOperatorEventMock).not.toHaveBeenCalledWith(
      'dossier_override',
      expect.objectContaining({ previousDossierId: 'dossier-estrangeiro' }),
    );
    // A nova investigação foi executada (ação explícita do usuário)
    expect(onDeepDive).toHaveBeenCalledTimes(1);
    expect(scoutDiag.warn).toHaveBeenCalledWith(
      'Investigation',
      'foreign-source-preserved-on-new-research',
      expect.objectContaining({ previousDossierId: 'dossier-estrangeiro' }),
    );
  });

  it('override de dossiê próprio continua deletando o anterior (sem regressão)', async () => {
    const { result } = renderHook(() => useInvestigation(baseParams));

    act(() => {
      result.current.setDuplicateDossier(ownDossier);
      result.current.pendingPayloadRef.current = {
        companyName: 'Empresa Própria',
        cnpj: '12345678000199',
        city: 'SP',
        state: 'SP',
      };
    });

    onDeepDive.mockResolvedValue({ status: 'COMPLETED', dossierId: 'dossier-novo' });
    getDossierMock.mockResolvedValue({ id: 'dossier-novo', messages: [] });

    await act(async () => {
      await result.current.handleNewResearchOverride();
    });

    expect(deleteDossierMock).toHaveBeenCalledWith('dossier-proprio');
    expect(trackOperatorEventMock).toHaveBeenCalledWith(
      'dossier_override',
      expect.objectContaining({ previousDossierId: 'dossier-proprio' }),
    );
  });
});

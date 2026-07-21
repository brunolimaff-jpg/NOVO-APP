import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInvestigation } from '../../hooks/useInvestigation';
import { scoutDiag } from '../../utils/diagnosticLog';

const getDossierMock = vi.fn();
const saveDossierMock = vi.fn();
const maybeSingleMock = vi.fn();

vi.mock('../../services/storage', () => ({
  storage: {
    getDossier: (...args: unknown[]) => getDossierMock(...args),
    saveDossier: (...args: unknown[]) => saveDossierMock(...args),
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

  it('exibe toast e registra warn quando Supabase não retorna conteúdo', async () => {
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

    expect(toast.error).toHaveBeenCalledWith('Não foi possível carregar esta sessão');
    expect(scoutDiag.warn).toHaveBeenCalledWith(
      'Investigation',
      'Falha ao carregar dossiê remoto',
      expect.objectContaining({ dossierId: 'dossier-1' }),
    );
    expect(onSelectSession).not.toHaveBeenCalled();
  });
});

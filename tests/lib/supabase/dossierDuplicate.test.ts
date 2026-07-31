import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Sender } from '../../../types';

const { rpcMock, availabilityMock, diagnosticWarnMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  availabilityMock: vi.fn(() => true),
  diagnosticWarnMock: vi.fn(),
}));

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: { rpc: rpcMock },
  isSupabaseAvailable: availabilityMock,
}));

vi.mock('../../../utils/diagnosticLog', () => ({
  scoutDiag: { warn: diagnosticWarnMock },
}));

beforeEach(() => {
  vi.clearAllMocks();
  availabilityMock.mockReturnValue(true);
});

describe('secure dossier reuse client', () => {
  it('descobre somente metadados pela RPC autenticada', async () => {
    rpcMock.mockResolvedValue({
      data: [{
        dossier_id: 'dossier-1',
        title: 'Empresa Teste',
        empresa_alvo: 'Empresa Teste',
        created_at: '2026-05-29T10:00:00Z',
        score_oportunidade: 82,
        is_owner: false,
      }],
      error: null,
    });

    const { findExistingDossier } = await import('../../../lib/supabase/dossierDuplicate');
    const result = await findExistingDossier('45.543.915/0001-81', 'Empresa Teste', 'op-current');

    expect(rpcMock).toHaveBeenCalledWith('find_reusable_dossier', {
      p_cnpj: '45.543.915/0001-81',
      p_empresa_alvo: 'Empresa Teste',
    });
    expect(result).toEqual({
      status: 'FOUND',
      dossier: {
        id: 'dossier-1',
        title: 'Empresa Teste',
        empresaAlvo: 'Empresa Teste',
        createdAt: '2026-05-29T10:00:00Z',
        scoreOportunidade: 82,
        isOwner: false,
      },
    });
  });

  it('retorna UNAVAILABLE quando identidade local ainda não foi resolvida', async () => {
    const { findExistingDossier } = await import('../../../lib/supabase/dossierDuplicate');
    expect(await findExistingDossier('12345678000199', 'Empresa', '')).toEqual({ status: 'UNAVAILABLE' });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('retorna UNAVAILABLE quando Supabase está indisponível', async () => {
    availabilityMock.mockReturnValue(false);
    const { findExistingDossier } = await import('../../../lib/supabase/dossierDuplicate');
    await expect(findExistingDossier(null, 'Empresa', 'op-current')).resolves.toEqual({ status: 'UNAVAILABLE' });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('usa mensagem genérica quando Supabase está indisponível na reutilização', async () => {
    availabilityMock.mockReturnValue(false);
    const { reuseDossierForCurrentOperator } = await import('../../../lib/supabase/dossierDuplicate');

    await expect(reuseDossierForCurrentOperator('source-id')).rejects.toThrow(
      'Não foi possível abrir o dossiê. Tente novamente.',
    );
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('diferencia NOT_FOUND, ACCESS_DENIED e erro desconhecido', async () => {
    const { findExistingDossier } = await import('../../../lib/supabase/dossierDuplicate');

    rpcMock.mockResolvedValueOnce({ data: [], error: null });
    await expect(findExistingDossier(null, 'Ausente', 'op-current')).resolves.toEqual({ status: 'NOT_FOUND' });

    rpcMock.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'SQL privado' } });
    await expect(findExistingDossier(null, 'Negado', 'op-current')).resolves.toEqual({ status: 'ACCESS_DENIED' });

    rpcMock.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'function missing' } });
    await expect(findExistingDossier(null, 'Falha', 'op-current')).resolves.toEqual({ status: 'UNAVAILABLE' });

    expect(diagnosticWarnMock).toHaveBeenCalledWith(
      'dossierDuplicate',
      'Erro na descoberta segura de dossiê reutilizável',
      { code: '42501', error: 'SQL privado' },
    );
  });

  it('falha fechada quando o transporte da descoberta lança exceção', async () => {
    rpcMock.mockRejectedValue(new Error('network stack trace privado'));
    const { findExistingDossier } = await import('../../../lib/supabase/dossierDuplicate');

    await expect(findExistingDossier(null, 'Empresa', 'op-current')).resolves.toEqual({ status: 'UNAVAILABLE' });
    expect(diagnosticWarnMock).toHaveBeenCalledWith(
      'dossierDuplicate',
      'Falha de transporte na descoberta segura de dossiê',
      { code: undefined, error: 'network stack trace privado' },
    );
  });

  it('preserva a marcação de propriedade retornada pela descoberta', async () => {
    rpcMock.mockResolvedValue({
      data: [{
        dossier_id: 'owned-id',
        title: 'Empresa Própria',
        empresa_alvo: 'Empresa Própria',
        created_at: '2026-07-30T10:00:00Z',
        score_oportunidade: 90,
        is_owner: true,
      }],
      error: null,
    });

    const { findExistingDossier } = await import('../../../lib/supabase/dossierDuplicate');
    await expect(findExistingDossier(null, 'Empresa Própria', 'op-current')).resolves.toMatchObject({
      status: 'FOUND',
      dossier: { id: 'owned-id', isOwner: true },
    });
  });

  it('retorna a sessão completa com o novo ID pela RPC de reutilização', async () => {
    const content = {
      id: 'copy-id',
      title: 'Empresa',
      empresaAlvo: 'Empresa',
      cnpj: '12345678000199',
      modoPrincipal: 'default',
      scoreOportunidade: 70,
      resumoDossie: 'Resumo',
      createdAt: '2026-07-30T00:00:00Z',
      updatedAt: '2026-07-30T00:00:00Z',
      messages: [{ id: 'm1', sender: Sender.Bot, text: 'Dossiê', timestamp: new Date() }],
    };
    rpcMock.mockResolvedValue({ data: [{ dossier_id: 'copy-id', content, was_cloned: true }], error: null });

    const { reuseDossierForCurrentOperator } = await import('../../../lib/supabase/dossierDuplicate');
    await expect(reuseDossierForCurrentOperator('source-id')).resolves.toEqual({
      dossierId: 'copy-id',
      content,
      wasCloned: true,
    });
    expect(rpcMock).toHaveBeenCalledWith('reuse_dossier_for_current_operator', {
      p_source_dossier_id: 'source-id',
    });
  });

  it('rejeita payload cujo content.id não corresponde ao ID retornado', async () => {
    rpcMock.mockResolvedValue({
      data: [{ dossier_id: 'copy-id', content: { id: 'source-id' }, was_cloned: true }],
      error: null,
    });
    const { reuseDossierForCurrentOperator } = await import('../../../lib/supabase/dossierDuplicate');
    await expect(reuseDossierForCurrentOperator('source-id')).rejects.toThrow('inconsistente');
  });

  it.each([
    ['42501', 'access denied from database', 'Seu acesso corporativo não foi autorizado.'],
    ['P0002', 'dossier unavailable internally', 'O dossiê não está mais disponível.'],
    ['23505', 'idx_dossies_secret_constraint', 'Não foi possível abrir o dossiê. Tente novamente.'],
  ])('sanitiza erro RPC %s antes de expor à UI', async (code, rawMessage, expectedMessage) => {
    rpcMock.mockResolvedValue({ data: null, error: { code, message: rawMessage } });
    const { reuseDossierForCurrentOperator } = await import('../../../lib/supabase/dossierDuplicate');

    await expect(reuseDossierForCurrentOperator('source-id')).rejects.toThrow(expectedMessage);
    expect(diagnosticWarnMock).toHaveBeenCalledWith(
      'dossierDuplicate',
      'Erro ao reutilizar dossiê',
      { code, error: rawMessage },
    );
  });

  it('sanitiza exceção de transporte na reutilização', async () => {
    rpcMock.mockRejectedValue(new Error('fetch failed at private endpoint'));
    const { reuseDossierForCurrentOperator } = await import('../../../lib/supabase/dossierDuplicate');

    await expect(reuseDossierForCurrentOperator('source-id')).rejects.toThrow(
      'Não foi possível abrir o dossiê. Tente novamente.',
    );
    expect(diagnosticWarnMock).toHaveBeenCalledWith(
      'dossierDuplicate',
      'Falha de transporte ao reutilizar dossiê',
      { code: undefined, error: 'fetch failed at private endpoint' },
    );
  });
});

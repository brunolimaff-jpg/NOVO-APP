import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Sender } from '../../../types';

const rpcMock = vi.fn();

vi.mock('../../../lib/supabaseClient', () => ({
  supabase: { rpc: rpcMock },
  isSupabaseAvailable: vi.fn(() => true),
}));

beforeEach(() => {
  vi.clearAllMocks();
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
      id: 'dossier-1',
      title: 'Empresa Teste',
      empresaAlvo: 'Empresa Teste',
      createdAt: '2026-05-29T10:00:00Z',
      scoreOportunidade: 82,
      isOwner: false,
    });
  });

  it('não consulta quando identidade local ainda não foi resolvida', async () => {
    const { findExistingDossier } = await import('../../../lib/supabase/dossierDuplicate');
    expect(await findExistingDossier('12345678000199', 'Empresa', '')).toBeNull();
    expect(rpcMock).not.toHaveBeenCalled();
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
});

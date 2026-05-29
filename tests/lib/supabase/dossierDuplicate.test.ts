import { describe, it, expect, vi } from 'vitest';

const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockIs = vi.fn();
const mockLimit = vi.fn();
const mockMaybeSingle = vi.fn();

vi.mock('../../../lib/supabaseClient', () => ({
  get supabase() {
    return {
      from: mockFrom,
    };
  },
  isSupabaseAvailable: vi.fn(() => true),
}));

describe('findExistingDossier', () => {
  it('retorna null quando Supabase indisponível', async () => {
    const { isSupabaseAvailable } = await import('../../../lib/supabaseClient');
    vi.mocked(isSupabaseAvailable).mockReturnValueOnce(false);
    const { findExistingDossier } = await import('../../../lib/supabase/dossierDuplicate');
    const result = await findExistingDossier('123', 'Empresa X', 'op-1');
    expect(result).toBeNull();
  });

  it('retorna null quando operatorId é vazio', async () => {
    const { findExistingDossier } = await import('../../../lib/supabase/dossierDuplicate');
    const result = await findExistingDossier('123', 'Empresa X', '');
    expect(result).toBeNull();
  });

  it('retorna dossiê existente quando encontra por CNPJ', async () => {
    const { isSupabaseAvailable } = await import('../../../lib/supabaseClient');
    vi.mocked(isSupabaseAvailable).mockReturnValueOnce(true);

    const chain = {
      eq: mockEq.mockReturnThis(),
      is: mockIs.mockReturnThis(),
      limit: mockLimit.mockReturnThis(),
      maybeSingle: mockMaybeSingle.mockResolvedValueOnce({
        data: {
          id: 'dossier-1',
          title: 'Empresa Teste',
          empresa_alvo: 'Empresa Teste',
          created_at: '2026-05-29T10:00:00Z',
          score_oportunidade: 82,
        },
        error: null,
      }),
    };
    mockSelect.mockReturnValueOnce(chain);
    mockFrom.mockReturnValueOnce({ select: mockSelect });

    const { findExistingDossier } = await import('../../../lib/supabase/dossierDuplicate');
    const result = await findExistingDossier('45.543.915/0001-81', 'Empresa Teste', 'op-1');

    expect(result).toEqual({
      id: 'dossier-1',
      title: 'Empresa Teste',
      empresaAlvo: 'Empresa Teste',
      createdAt: '2026-05-29T10:00:00Z',
      scoreOportunidade: 82,
    });
  });

  it('faz fallback por razão social quando CNPJ não retorna resultado', async () => {
    const { isSupabaseAvailable } = await import('../../../lib/supabaseClient');
    vi.mocked(isSupabaseAvailable).mockReturnValueOnce(true);

    const chainCnpj = {
      eq: mockEq.mockReturnThis(),
      is: mockIs.mockReturnThis(),
      limit: mockLimit.mockReturnThis(),
      maybeSingle: mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null }),
    };
    const chainRazao = {
      eq: mockEq.mockReturnThis(),
      is: mockIs.mockReturnThis(),
      limit: mockLimit.mockReturnThis(),
      maybeSingle: mockMaybeSingle.mockResolvedValueOnce({
        data: {
          id: 'dossier-2',
          title: 'Empresa Filial',
          empresa_alvo: 'Empresa Filial',
          created_at: '2026-05-28T08:00:00Z',
          score_oportunidade: 60,
        },
        error: null,
      }),
    };
    mockSelect.mockReturnValueOnce(chainCnpj).mockReturnValueOnce(chainRazao);
    mockFrom.mockReturnValueOnce({ select: mockSelect }).mockReturnValueOnce({ select: mockSelect });

    const { findExistingDossier } = await import('../../../lib/supabase/dossierDuplicate');
    const result = await findExistingDossier('00000000000000', 'Empresa Filial', 'op-1');

    expect(result).toEqual({
      id: 'dossier-2',
      title: 'Empresa Filial',
      empresaAlvo: 'Empresa Filial',
      createdAt: '2026-05-28T08:00:00Z',
      scoreOportunidade: 60,
    });
  });

  it('retorna null quando nenhum CNPJ nem razão social fornecidos', async () => {
    const { findExistingDossier } = await import('../../../lib/supabase/dossierDuplicate');
    const result = await findExistingDossier(null, null, 'op-1');
    expect(result).toBeNull();
  });
});

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const fetchCompanyByCnpjMock = vi.hoisted(() => vi.fn());

vi.mock('../../../services/brasilApiService', () => ({
  fetchCompanyByCnpj: fetchCompanyByCnpjMock,
}));

vi.mock('../../../components/MarkdownRenderer', () => ({
  default: ({ content }: { content: string }) => <pre data-testid="mermaid-content">{content}</pre>,
}));

import SocietaryMap from '../../../features/dossier/SocietaryMap';

describe('SocietaryMap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(globalThis, 'fetch').mockReset();
    window.localStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  it('renderiza Mermaid TD com QSA e drill-down do primeiro sócio', async () => {
    fetchCompanyByCnpjMock.mockResolvedValueOnce({
      cnpj: '04733767000180',
      companyName: 'Scheffer & Cia Ltda',
      city: 'Sapezal',
      state: 'MT',
      qsa: [
        {
          name: 'Guilherme M. Scheffer',
          role: 'Administrador',
          source: 'BrasilAPI',
          confidence: 'official',
        },
      ],
    });
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        companies: [
          {
            name: 'Scheffer Colombia S.A.S.',
            country: 'CO',
            partnerName: 'Guilherme M. Scheffer',
            sourceUrl: 'https://example.com/colombia',
            sourceTitle: 'Fonte internacional',
            snippet: 'Operação internacional conectada ao grupo.',
            confidence: 'strong',
            evidenceType: 'institutional',
            rootContext: true,
            rootCompanyName: 'Scheffer & Cia Ltda',
            rootCnpj: '04733767000180',
          },
        ],
        rejected: [],
        degraded: false,
        cached: false,
      }),
    } as Response);

    render(<SocietaryMap cnpj="04733767000180" empresaAlvo="Scheffer & Cia" isDarkMode={false} />);
    fireEvent.click(screen.getByText('Grafo'));

    await waitFor(() => expect(screen.getByTestId('mermaid-content')).toHaveTextContent('Scheffer Colombia S.A.S.'));
    expect(screen.getByTestId('mermaid-content')).toHaveTextContent('País CO');
    expect(screen.getByTestId('mermaid-content')).not.toHaveTextContent('estimado');
    expect(screen.getByTestId('mermaid-content')).not.toHaveTextContent('oficial');
    expect(screen.queryByTestId('societary-evidence-list')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('societary-evidence-toggle'));
    expect(screen.getByTestId('societary-evidence-list')).toHaveTextContent('Fonte internacional');
    expect(screen.getByTestId('societary-evidence-list')).toHaveTextContent(
      'Sócio/admin: Guilherme M. Scheffer - Administrador',
    );
    expect(screen.getByTestId('societary-evidence-list')).toHaveTextContent('Tipo: Empresa internacional');
  });

  it('envia trace true para socio-search quando o rastreador da teia esta ativo', async () => {
    window.localStorage.setItem('scoutTrace', 'teia');
    const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    fetchCompanyByCnpjMock.mockResolvedValueOnce({
      cnpj: '04733767000180',
      companyName: 'Scheffer & Cia Ltda',
      city: 'Sapezal',
      state: 'MT',
      qsa: [
        {
          name: 'Guilherme M. Scheffer',
          role: 'Administrador',
          source: 'BrasilAPI',
          confidence: 'official',
        },
      ],
    });
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        companies: [],
        rejected: [],
        degraded: true,
        cached: false,
        diagnostics: { queriesRun: [], pagesFetched: 0, cacheSource: 'none', rejectedCount: 0 },
        trace: {
          enabled: true,
          providers: [],
          totals: { companiesCount: 0, rejectedCount: 0 },
          rejectedByReason: {},
        },
      }),
    } as Response);

    render(<SocietaryMap cnpj="04733767000180" empresaAlvo="Scheffer & Cia" isDarkMode={false} />);

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
    expect(body).toMatchObject({
      socioName: 'Guilherme M. Scheffer',
      rootCompanyName: 'Scheffer & Cia Ltda',
      rootCnpj: '04733767000180',
      trace: true,
    });
    consoleInfoSpy.mockRestore();
  });

  it('faz drill-down automático de todos os sócios e inicia na visão Todos', async () => {
    fetchCompanyByCnpjMock.mockResolvedValueOnce({
      cnpj: '04733767000180',
      companyName: 'Scheffer & Cia Ltda',
      city: 'Sapezal',
      state: 'MT',
      qsa: [
        {
          name: 'Guilherme M. Scheffer',
          role: 'Administrador',
          source: 'BrasilAPI',
          confidence: 'official',
        },
        {
          name: 'Luciano R. Scheffer',
          role: 'Socio',
          source: 'BrasilAPI',
          confidence: 'official',
        },
      ],
    });
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          companies: [
            {
              name: 'Scheffer Colombia S.A.S.',
              country: 'CO',
              partnerName: 'Guilherme M. Scheffer',
              sourceUrl: 'https://example.com/colombia',
              sourceTitle: 'Fonte internacional',
              snippet: 'Operação internacional conectada ao grupo.',
              confidence: 'strong',
              evidenceType: 'institutional',
              rootContext: true,
              rootCompanyName: 'Scheffer & Cia Ltda',
              rootCnpj: '04733767000180',
            },
          ],
          rejected: [],
          degraded: false,
          cached: false,
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          companies: [
            {
              name: 'Scheffer Participações S/A',
              partnerName: 'Luciano R. Scheffer',
              sourceUrl: 'https://example.com/participacoes',
              sourceTitle: 'Fonte societaria',
              snippet: 'Luciano R. Scheffer e Scheffer & Cia Ltda aparecem no mesmo contexto societario.',
              confidence: 'strong',
              evidenceType: 'registry',
              rootContext: true,
              rootCompanyName: 'Scheffer & Cia Ltda',
              rootCnpj: '04733767000180',
            },
          ],
          rejected: [],
          degraded: false,
          cached: false,
        }),
      } as Response);

    render(<SocietaryMap cnpj="04733767000180" empresaAlvo="Scheffer & Cia" isDarkMode={false} />);
    fireEvent.click(screen.getByText('Grafo'));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const secondBody = JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body));
    expect(secondBody.socioName).toBe('Luciano R. Scheffer');
    expect(screen.getByRole('button', { name: /Todos/i })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('mermaid-content')).toHaveTextContent('Guilherme'));
    await waitFor(() => expect(screen.getByTestId('mermaid-content')).toHaveTextContent('Luciano'));
    fireEvent.click(screen.getByTestId('societary-evidence-toggle'));
    expect(screen.getByTestId('societary-evidence-list')).toHaveTextContent('Fonte societaria');

    fireEvent.click(screen.getByRole('button', { name: 'Luciano' }));
    await waitFor(() =>
      expect(screen.getByTestId('mermaid-content')).not.toHaveTextContent('Scheffer Colombia S.A.S.'),
    );
    expect(screen.queryByTestId('societary-evidence-list')).not.toBeInTheDocument();
  });

  it('renderiza resultados parciais enquanto ainda busca outros socios', async () => {
    fetchCompanyByCnpjMock.mockResolvedValueOnce({
      cnpj: '04733767000180',
      companyName: 'Scheffer & Cia Ltda',
      city: 'Sapezal',
      state: 'MT',
      qsa: [
        {
          name: 'Guilherme M. Scheffer',
          role: 'Administrador',
          source: 'BrasilAPI',
          confidence: 'official',
        },
        {
          name: 'Luciano R. Scheffer',
          role: 'Socio',
          source: 'BrasilAPI',
          confidence: 'official',
        },
      ],
    });

    let resolveSecond: (response: Response) => void = () => {};
    const secondResponse = new Promise<Response>(resolve => {
      resolveSecond = resolve;
    });

    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          companies: [
            {
              name: 'Primeira Empresa Parcial LTDA',
              cnpj: '12345678000195',
              partnerName: 'Guilherme M. Scheffer',
              sourceTitle: 'CNPJ Aberto',
              snippet: 'Guilherme M. Scheffer consta no QSA oficial.',
              confidence: 'strong',
              evidenceType: 'qsa',
              rootContext: false,
              relationshipScope: 'partner_other_cnpj',
            },
          ],
          rejected: [],
          degraded: false,
          cached: false,
        }),
      } as Response)
      .mockImplementationOnce(() => secondResponse);

    render(<SocietaryMap cnpj="04733767000180" empresaAlvo="Scheffer & Cia" isDarkMode={false} />);

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Primeira Empresa Parcial LTDA')).toBeInTheDocument();

    await act(async () => {
      resolveSecond({
        ok: true,
        json: async () => ({
          companies: [
            {
              name: 'Segunda Empresa Final LTDA',
              cnpj: '09567366000111',
              partnerName: 'Luciano R. Scheffer',
              sourceTitle: 'CNPJ Aberto',
              snippet: 'Luciano R. Scheffer consta no QSA oficial.',
              confidence: 'strong',
              evidenceType: 'qsa',
              rootContext: false,
              relationshipScope: 'partner_other_cnpj',
            },
          ],
          rejected: [],
          degraded: false,
          cached: false,
        }),
      } as Response);
    });

    await waitFor(() => expect(screen.getByText('Segunda Empresa Final LTDA')).toBeInTheDocument());
  });

  it('exibe badge premium de filiais na tabela quando CNPJs do grupo sao consolidados', async () => {
    fetchCompanyByCnpjMock.mockResolvedValueOnce({
      cnpj: '04733767000180',
      companyName: 'Scheffer & Cia Ltda',
      city: 'Sapezal',
      state: 'MT',
      qsa: [
        {
          name: 'Guilherme M. Scheffer',
          role: 'Administrador',
          source: 'BrasilAPI',
          confidence: 'official',
        },
      ],
    });
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        companies: [
          {
            name: 'Fazenda Independente LTDA',
            cnpj: '12345678000195',
            partnerName: 'Guilherme M. Scheffer',
            sourceTitle: 'Fonte oficial do grupo',
            sourceUrl: 'https://example.com/grupo-matriz',
            snippet: 'Scheffer & Cia Ltda comprova a Fazenda Independente LTDA como empresa do grupo.',
            confidence: 'strong',
            evidenceType: 'qsa',
            relationshipScope: 'group_link',
            rootContext: true,
            rootCompanyName: 'Scheffer & Cia Ltda',
            rootCnpj: '04733767000180',
          },
          {
            name: 'Fazenda Independente Filial LTDA',
            cnpj: '12345678000276',
            partnerName: 'Guilherme M. Scheffer',
            sourceTitle: 'Fonte oficial do grupo',
            sourceUrl: 'https://example.com/grupo-filial',
            snippet: 'Scheffer & Cia Ltda comprova filial da Fazenda Independente LTDA como empresa do grupo.',
            confidence: 'strong',
            evidenceType: 'qsa',
            relationshipScope: 'group_link',
            rootContext: true,
            rootCompanyName: 'Scheffer & Cia Ltda',
            rootCnpj: '04733767000180',
          },
        ],
        rejected: [],
        degraded: false,
        cached: false,
      }),
    } as Response);

    render(<SocietaryMap cnpj="04733767000180" empresaAlvo="Scheffer & Cia" isDarkMode={false} />);

    await waitFor(() => expect(screen.getByText('Fazenda Independente LTDA')).toBeInTheDocument());
    const branchBadge = await screen.findByTestId('branch-premium-badge');
    expect(branchBadge).toHaveTextContent('Matriz · 1 filial');
    expect(screen.queryByText('CNPJs laterais')).not.toBeInTheDocument();
  });

  it('exibe CNPJ do socio admin sem tratar como empresa do grupo', async () => {
    fetchCompanyByCnpjMock.mockResolvedValueOnce({
      cnpj: '04733767000180',
      companyName: 'Scheffer & Cia Ltda',
      city: 'Sapezal',
      state: 'MT',
      qsa: [
        {
          name: 'Guilherme M. Scheffer',
          role: 'Administrador',
          source: 'BrasilAPI',
          confidence: 'official',
        },
      ],
    });
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        companies: [
          {
            name: 'Fazenda Independente LTDA',
            cnpj: '12345678000195',
            partnerName: 'Guilherme M. Scheffer',
            sourceUrl: 'https://consultasocio.com/q/sa/guilherme-m-scheffer',
            sourceTitle: 'Consulta Sócio',
            snippet: 'Guilherme M. Scheffer consta como sócio administrador.',
            confidence: 'strong',
            evidenceType: 'qsa',
            rootContext: false,
            relationshipScope: 'partner_other_cnpj',
          },
        ],
        rejected: [],
        degraded: false,
        cached: false,
      }),
    } as Response);

    render(<SocietaryMap cnpj="04733767000180" empresaAlvo="Scheffer & Cia" isDarkMode={false} />);
    fireEvent.click(screen.getByText('Grafo'));

    await waitFor(() => expect(screen.getByTestId('mermaid-content')).toHaveTextContent('Fazenda Independente LTDA'));
    expect(screen.getByTestId('mermaid-content')).toHaveTextContent('CNPJ 12.345.678/0001-95');
    expect(screen.getByTestId('mermaid-content')).not.toHaveTextContent('Root -- CNPJ relacionado');
    fireEvent.click(screen.getByTestId('societary-evidence-toggle'));
    expect(screen.getByTestId('societary-evidence-list')).toHaveTextContent('Escopo: Sócio admin');
    expect(screen.getByTestId('societary-evidence-list')).not.toHaveTextContent('Escopo: Empresa do grupo');
  });

  it('na tabela lista CNPJs de socio admin e nao duplica os filtros externos do grafo', async () => {
    fetchCompanyByCnpjMock
      .mockResolvedValueOnce({
        cnpj: '04733767000180',
        companyName: 'Scheffer & Cia Ltda',
        city: 'Sapezal',
        state: 'MT',
        qsa: [
          {
            name: 'Guilherme M. Scheffer',
            role: 'Administrador',
            source: 'BrasilAPI',
            confidence: 'official',
          },
        ],
      })
      .mockResolvedValue({
        cnpj: '09567366000111',
        companyName: 'E.Z.M.S. Participações Ltda',
        cnae: '6462000',
        cnaeDescricao: 'Holdings de instituições não-financeiras',
      });
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        companies: [
          {
            name: 'E.Z.M.S. Participações Ltda',
            cnpj: '09567366000111',
            partnerName: 'Guilherme M. Scheffer',
            sourceTitle: 'CNPJ Aberto',
            snippet: 'Guilherme M. Scheffer consta no QSA oficial.',
            confidence: 'strong',
            evidenceType: 'qsa',
            rootContext: false,
            relationshipScope: 'partner_other_cnpj',
          },
        ],
        rejected: [
          {
            sourceTitle: 'CNPJ Aberto — Empresa Baixada LTDA',
            sourceUrl: 'https://cnpjaberto.com.br/11111111000191',
            snippet: 'Empresa Baixada LTDA — CNPJ 11.111.111/0001-91 — Situação Baixada',
            reason: 'CNPJ baixado/inativo na Receita: Baixada. Referenciado fora do inventario principal.',
          },
        ],
        degraded: false,
        cached: false,
      }),
    } as Response);

    render(<SocietaryMap cnpj="04733767000180" empresaAlvo="Scheffer & Cia" isDarkMode={false} />);

    await waitFor(() => expect(screen.getByText('E.Z.M.S. Participações Ltda')).toBeInTheDocument());
    expect(screen.getByTestId('societary-summary-metrics')).toBeInTheDocument();
    expect(screen.getByTestId('summary-metric-matrizes')).toHaveTextContent('1');
    expect(screen.queryByTestId('branch-premium-badge')).not.toBeInTheDocument();
    expect(screen.queryByText('frentes estratégicas')).not.toBeInTheDocument();
    expect(screen.queryByText('empresas do grupo')).not.toBeInTheDocument();
    expect(screen.queryByText('CNPJs laterais')).not.toBeInTheDocument();
    expect(screen.queryByText('Laterais')).not.toBeInTheDocument();
    expect(screen.queryByText('Relação')).not.toBeInTheDocument();
    expect(screen.queryByText('CNPJ lateral')).not.toBeInTheDocument();
    expect(screen.getByTestId('societary-map-shell')).toHaveTextContent(
      '1 CNPJ baixado/inativo foi referenciado pelas fontes e excluído do inventário principal.',
    );
    expect(screen.queryByText('Side business')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Guilherme M\. Scheffer/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guilherme' })).toBeInTheDocument();

    fireEvent.click(screen.getByText('Grafo'));

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Guilherme M\. Scheffer/i })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Guilherme' })).toBeInTheDocument();
  });

  it('exibe CNPJ hipotetico com asterisco, borda tracejada e validacao pendente', async () => {
    fetchCompanyByCnpjMock.mockResolvedValueOnce({
      cnpj: '04733767000180',
      companyName: 'Scheffer & Cia Ltda',
      city: 'Sapezal',
      state: 'MT',
      qsa: [
        {
          name: 'Guilherme M. Scheffer',
          role: 'Administrador',
          source: 'BrasilAPI',
          confidence: 'official',
        },
      ],
    });
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        companies: [
          {
            name: 'Condomínio Rural X*',
            cnpj: null,
            rawCnpjLabel: '11.222.333/0001-44*',
            partnerName: 'Guilherme M. Scheffer',
            sourceUrl: 'https://consultasocio.com/q/sa/guilherme-m-scheffer',
            sourceTitle: 'Consulta Sócio',
            snippet: 'CNPJ citado sem confirmação oficial.',
            confidence: 'weak',
            evidenceType: 'web',
            rootContext: false,
            relationshipScope: 'unconfirmed',
            validationStatus: 'pending',
          },
        ],
        rejected: [],
        degraded: true,
        cached: false,
      }),
    } as Response);

    render(<SocietaryMap cnpj="04733767000180" empresaAlvo="Scheffer & Cia" isDarkMode={false} />);
    fireEvent.click(screen.getByText('Grafo'));

    await waitFor(() => expect(screen.getByTestId('mermaid-content')).toHaveTextContent('Condomínio Rural X*'));
    expect(screen.getByTestId('mermaid-content')).toHaveTextContent('CNPJ 11.222.333/0001-44*');
    expect(screen.getByTestId('mermaid-content')).toHaveTextContent('class company_condominio_rural_x_br evidence;');
    expect(screen.getByTestId('mermaid-content')).not.toHaveTextContent('Root -- CNPJ relacionado');
    fireEvent.click(screen.getByTestId('societary-evidence-toggle'));
    expect(screen.getByTestId('societary-evidence-list')).toHaveTextContent('CNPJ 11.222.333/0001-44*');
    expect(screen.getByTestId('societary-evidence-list')).toHaveTextContent('Escopo: Validação pendente');
  });

  it('mantem outros CNPJs dos socios na visao Todos e filtra por socio sem mudar o escopo', async () => {
    fetchCompanyByCnpjMock.mockResolvedValueOnce({
      cnpj: '04733767000180',
      companyName: 'Scheffer & Cia Ltda',
      city: 'Sapezal',
      state: 'MT',
      qsa: [
        {
          name: 'Guilherme M. Scheffer',
          role: 'Administrador',
          source: 'BrasilAPI',
          confidence: 'official',
        },
        {
          name: 'Gislayne Rafaela Scheffer',
          role: 'Sócia',
          source: 'BrasilAPI',
          confidence: 'official',
        },
      ],
    });
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          companies: [
            {
              name: 'Agropecuaria Norte LTDA',
              cnpj: '11111111000191',
              partnerName: 'Guilherme M. Scheffer',
              sourceTitle: 'Consulta Sócio',
              snippet: 'Guilherme M. Scheffer consta como sócio administrador.',
              confidence: 'strong',
              evidenceType: 'qsa',
              rootContext: false,
              relationshipScope: 'partner_other_cnpj',
            },
          ],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          companies: [
            {
              name: 'Associacao Scheffer de Lazer',
              cnpj: '21333444000119',
              partnerName: 'Gislayne Rafaela Scheffer',
              sourceTitle: 'Consulta Sócio',
              snippet: 'Gislayne Rafaela Scheffer consta como sócia.',
              confidence: 'medium',
              evidenceType: 'registry',
              rootContext: false,
              relationshipScope: 'partner_other_cnpj',
            },
          ],
        }),
      } as Response);

    render(<SocietaryMap cnpj="04733767000180" empresaAlvo="Scheffer & Cia" isDarkMode={false} />);
    fireEvent.click(screen.getByText('Grafo'));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTestId('mermaid-content')).toHaveTextContent('Guilherme'));
    expect(screen.getByTestId('mermaid-content')).toHaveTextContent('Gislayne');

    fireEvent.click(screen.getByTestId('societary-evidence-toggle'));
    expect(screen.getByTestId('societary-evidence-list')).toHaveTextContent(/Agropecu[aá]ria Norte LTDA/);
    expect(screen.getByTestId('societary-evidence-list')).toHaveTextContent('Associacao Scheffer de Lazer');
    expect(screen.getByTestId('societary-evidence-list')).toHaveTextContent('Escopo: Sócio admin');
    expect(screen.getByTestId('societary-evidence-list')).not.toHaveTextContent('Escopo: Empresa do grupo');

    fireEvent.click(screen.getByRole('button', { name: 'Gislayne' }));
    await waitFor(() =>
      expect(screen.getByTestId('mermaid-content')).not.toHaveTextContent(/Agropecu[aá]ria Norte LTDA/),
    );
    expect(screen.getByTestId('mermaid-content')).toHaveTextContent('Associacao Scheffer de Lazer');
    fireEvent.click(screen.getByTestId('societary-evidence-toggle'));
    expect(screen.getByTestId('societary-evidence-list')).toHaveTextContent('Escopo: Sócio admin');
    expect(screen.getByTestId('societary-evidence-list')).not.toHaveTextContent('Escopo: Empresa do grupo');
  });

  it('avisa quando a busca do socio retorna inventario truncado mesmo com empresas renderizadas', async () => {
    fetchCompanyByCnpjMock.mockResolvedValueOnce({
      cnpj: '04733767000180',
      companyName: 'Scheffer & Cia Ltda',
      city: 'Sapezal',
      state: 'MT',
      qsa: [
        {
          name: 'Guilherme M. Scheffer',
          role: 'Administrador',
          source: 'BrasilAPI',
          confidence: 'official',
        },
      ],
    });
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        companies: [
          {
            name: 'Agropecuaria Norte LTDA',
            cnpj: '11111111000191',
            partnerName: 'Guilherme M. Scheffer',
            sourceTitle: 'Consulta Sócio',
            snippet: 'Guilherme M. Scheffer consta como sócio administrador.',
            confidence: 'strong',
            evidenceType: 'qsa',
            rootContext: false,
            relationshipScope: 'partner_other_cnpj',
          },
        ],
        degraded: true,
        diagnostics: {
          truncated: true,
          totalCnpjsFound: 62,
          truncatedReason: 'company_limit',
        },
      }),
    } as Response);

    render(<SocietaryMap cnpj="04733767000180" empresaAlvo="Scheffer & Cia" isDarkMode={false} />);
    fireEvent.click(screen.getByText('Grafo'));

    await waitFor(() => expect(screen.getByTestId('mermaid-content')).toHaveTextContent(/Agropecu[aá]ria Norte LTDA/));
    expect(screen.getByText(/inventario parcial/i)).toBeInTheDocument();
  });

  it('coleta todos os socios antes de renderizar o mapa de uma vez', async () => {
    fetchCompanyByCnpjMock.mockResolvedValueOnce({
      cnpj: '04733767000180',
      companyName: 'Scheffer & Cia Ltda',
      city: 'Sapezal',
      state: 'MT',
      qsa: [
        { name: 'Guilherme M. Scheffer', role: 'Administrador', source: 'BrasilAPI', confidence: 'official' },
        { name: 'Luciano R. Scheffer', role: 'Socio', source: 'BrasilAPI', confidence: 'official' },
      ],
    });

    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          companies: [
            {
              name: 'Scheffer Colombia S.A.S.',
              country: 'CO',
              partnerName: 'Guilherme M. Scheffer',
              sourceUrl: 'https://example.com/colombia',
              sourceTitle: 'Fonte internacional',
              snippet: 'Operacao internacional',
              confidence: 'strong',
              evidenceType: 'institutional',
              rootContext: true,
              rootCompanyName: 'Scheffer & Cia Ltda',
              rootCnpj: '04733767000180',
            },
          ],
          rejected: [],
          degraded: false,
          cached: false,
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          companies: [
            {
              name: 'Scheffer Participações S/A',
              partnerName: 'Luciano R. Scheffer',
              sourceUrl: 'https://example.com/participacoes',
              sourceTitle: 'Fonte societaria',
              snippet: 'Luciano R. Scheffer no contexto.',
              confidence: 'strong',
              evidenceType: 'registry',
              rootContext: true,
              rootCompanyName: 'Scheffer & Cia Ltda',
              rootCnpj: '04733767000180',
            },
          ],
          rejected: [],
          degraded: false,
          cached: false,
        }),
      } as Response);

    render(<SocietaryMap cnpj="04733767000180" empresaAlvo="Scheffer & Cia" isDarkMode={false} />);
    fireEvent.click(screen.getByText('Grafo'));

    await waitFor(() => {
      expect(screen.getByTestId('mermaid-content')).toHaveTextContent('Guilherme');
      expect(screen.getByTestId('mermaid-content')).toHaveTextContent('Luciano');
    });
  });

  it('aborta buscas de socios em andamento ao desmontar o mapa', async () => {
    fetchCompanyByCnpjMock.mockResolvedValueOnce({
      cnpj: '04733767000180',
      companyName: 'Scheffer & Cia Ltda',
      city: 'Sapezal',
      state: 'MT',
      qsa: [
        {
          name: 'Guilherme M. Scheffer',
          role: 'Administrador',
          source: 'BrasilAPI',
          confidence: 'official',
        },
      ],
    });

    let capturedSignal: AbortSignal | undefined;
    vi.mocked(fetch).mockImplementationOnce((_url, init) => {
      capturedSignal = init?.signal as AbortSignal | undefined;
      return new Promise<Response>(() => undefined);
    });

    const { unmount } = render(<SocietaryMap cnpj="04733767000180" empresaAlvo="Scheffer & Cia" isDarkMode={false} />);

    await waitFor(() => expect(capturedSignal).toBeDefined());
    expect(capturedSignal?.aborted).toBe(false);

    unmount();

    expect(capturedSignal?.aborted).toBe(true);
  });

  it('mostra fallback discreto quando nao ha QSA', async () => {
    fetchCompanyByCnpjMock.mockResolvedValueOnce({
      cnpj: '04733767000180',
      companyName: 'Scheffer & Cia Ltda',
      city: 'Sapezal',
      state: 'MT',
    });

    render(<SocietaryMap cnpj="04733767000180" empresaAlvo="Scheffer & Cia" isDarkMode={false} />);
    fireEvent.click(screen.getByText('Grafo'));

    await waitFor(() => expect(screen.getByText(/QSA ainda nao disponivel/i)).toBeInTheDocument());
    expect(fetch).not.toHaveBeenCalled();
  });

  it('usa empresas extraídas do Gemini como fonte visual quando QSA oficial está ausente', async () => {
    fetchCompanyByCnpjMock.mockResolvedValueOnce({
      cnpj: '04733767000180',
      companyName: 'Scheffer & Cia Ltda',
      city: 'Sapezal',
      state: 'MT',
    });

    render(
      <SocietaryMap
        cnpj="04733767000180"
        empresaAlvo="Scheffer & Cia"
        isDarkMode={false}
        geminiCnpjs={[
          {
            name: 'Agropecuaria Scheffer Ltda',
            cnpj: '00.111.222/0001-81',
            partnerName: 'Guilherme M. Scheffer',
            sourceTitle: 'Gemini — Tabela Mestre',
            confidence: 'strong',
            evidenceType: 'qsa',
            rootContext: true,
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByText('Grafo'));

    await waitFor(() => expect(screen.getByTestId('mermaid-content')).toHaveTextContent('Agropecuária Scheffer LTDA'));
    expect(screen.getByTestId('mermaid-content')).toHaveTextContent('CNPJ 00.111.222/0001-81');
    expect(screen.queryByTestId('societary-evidence-list')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('societary-evidence-toggle'));
    expect(screen.getByTestId('societary-evidence-list')).toHaveTextContent('Gemini — Tabela Mestre');
    expect(screen.getByTestId('societary-evidence-list')).toHaveTextContent('CNPJ 00.111.222/0001-81');
    // CNAE enrichment now uses fetchCompanyByCnpj (mocked) not fetch directly;
    // only the /api/socio-search call for the partner remains in fetch
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('usa fetchCompanyByCnpj (proxy) para enriquecimento CNAE — nao chama brasilapi.com.br diretamente', async () => {
    // Root lookup
    fetchCompanyByCnpjMock
      .mockResolvedValueOnce({
        cnpj: '04733767000180',
        companyName: 'Scheffer & Cia Ltda',
        city: 'Sapezal',
        state: 'MT',
        qsa: [
          { name: 'Guilherme M. Scheffer', role: 'Administrador', source: 'BrasilAPI', confidence: 'official' },
        ],
      })
      // CNAE enrichment for partner company
      .mockResolvedValue({
        cnpj: '09567366000111',
        companyName: 'E.Z.M.S. Participações Ltda',
        city: 'Cuiabá',
        state: 'MT',
        cnae: '6462000',
        cnaeDescricao: 'Holdings de instituições não-financeiras',
      });

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        companies: [
          {
            name: 'E.Z.M.S. Participações Ltda',
            cnpj: '09567366000111',
            partnerName: 'Guilherme M. Scheffer',
            sourceTitle: 'CNPJ Aberto',
            snippet: 'Sócio admin',
            confidence: 'strong',
            evidenceType: 'qsa',
            rootContext: false,
          },
        ],
        rejected: [],
        degraded: false,
        cached: false,
      }),
    } as Response);

    render(<SocietaryMap cnpj="04733767000180" empresaAlvo="Scheffer & Cia" isDarkMode={false} />);

    // Wait for table to render (default view)
    await waitFor(() =>
      expect(screen.getByTestId('societary-summary-metrics')).toBeInTheDocument(),
    );

    // fetchCompanyByCnpj must have been called for CNAE enrichment
    await waitFor(() => expect(fetchCompanyByCnpjMock).toHaveBeenCalled());

    // Ensure fetch() was NOT called with brasilapi.com.br directly (CORS violation)
    const directBrasilApiCalls = vi.mocked(fetch).mock.calls.filter(
      ([url]) => typeof url === 'string' && url.includes('brasilapi.com.br'),
    );
    expect(directBrasilApiCalls).toHaveLength(0);
  });
});

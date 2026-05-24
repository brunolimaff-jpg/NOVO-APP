import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  });

  it('renderiza Mermaid LR com QSA e drill-down do primeiro sócio', async () => {
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

    await waitFor(() => expect(screen.getByTestId('mermaid-content')).toHaveTextContent('Scheffer Colombia S.A.S.'));
    expect(screen.getByTestId('mermaid-content')).toHaveTextContent('Administrador Guilherme');
    expect(screen.getByTestId('mermaid-content')).toHaveTextContent('Empresa internacional');
    expect(screen.getByTestId('mermaid-content')).not.toHaveTextContent('estimado');
    expect(screen.getByTestId('mermaid-content')).not.toHaveTextContent('oficial');
    expect(screen.queryByTestId('societary-evidence-list')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('societary-evidence-toggle'));
    expect(screen.getByTestId('societary-evidence-list')).toHaveTextContent('Fonte internacional');
    expect(screen.getByTestId('societary-evidence-list')).toHaveTextContent('Sócio/admin: Guilherme M. Scheffer - Administrador');
    expect(screen.getByTestId('societary-evidence-list')).toHaveTextContent('Tipo: Empresa internacional');
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

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const secondBody = JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body));
    expect(secondBody.socioName).toBe('Luciano R. Scheffer');
    expect(screen.getByRole('button', { name: /Todos/i })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('mermaid-content')).toHaveTextContent('Scheffer Colombia S.A.S.'));
    await waitFor(() => expect(screen.getByTestId('mermaid-content')).toHaveTextContent('Scheffer Participações S/A'));
    fireEvent.click(screen.getByTestId('societary-evidence-toggle'));
    expect(screen.getByTestId('societary-evidence-list')).toHaveTextContent('Fonte societaria');

    fireEvent.click(screen.getByRole('button', { name: /Luciano R\. Scheffer/i }));
    await waitFor(() => expect(screen.getByTestId('mermaid-content')).not.toHaveTextContent('Scheffer Colombia S.A.S.'));
    expect(screen.queryByTestId('societary-evidence-list')).not.toBeInTheDocument();
  });

  it('atualiza o mapa incrementalmente enquanto ainda busca outros socios', async () => {
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

    let resolveSecondSearch: (value: Response) => void = () => undefined;
    const secondSearchPromise = new Promise<Response>(resolve => {
      resolveSecondSearch = resolve;
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
      .mockImplementationOnce(() => secondSearchPromise);

    render(<SocietaryMap cnpj="04733767000180" empresaAlvo="Scheffer & Cia" isDarkMode={false} />);

    await waitFor(() => expect(screen.getByTestId('mermaid-content')).toHaveTextContent('Scheffer Colombia S.A.S.'));
    expect(screen.getByTestId('mermaid-content')).not.toHaveTextContent('Scheffer Participações S/A');

    resolveSecondSearch({
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

    await waitFor(() => expect(screen.getByTestId('mermaid-content')).toHaveTextContent('Scheffer Participações S/A'));
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
            cnpj: '00.111.222/0001-33',
            partnerName: 'Guilherme M. Scheffer',
            sourceTitle: 'Gemini — Tabela Mestre',
            confidence: 'strong',
            evidenceType: 'qsa',
            rootContext: true,
          },
        ]}
      />,
    );

    await waitFor(() => expect(screen.getByTestId('mermaid-content')).toHaveTextContent('Agropecuária Scheffer LTDA'));
    expect(screen.getByTestId('mermaid-content')).toHaveTextContent('CNPJ 00.111.222/0001-33');
    expect(screen.queryByTestId('societary-evidence-list')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('societary-evidence-toggle'));
    expect(screen.getByTestId('societary-evidence-list')).toHaveTextContent('Gemini — Tabela Mestre');
    expect(screen.getByTestId('societary-evidence-list')).toHaveTextContent('CNPJ 00.111.222/0001-33');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

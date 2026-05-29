import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import EmptyStateHome from '../../components/EmptyStateHome';

const { fetchCompanyByCnpjMock, validateCityInStateMock } = vi.hoisted(() => ({
  fetchCompanyByCnpjMock: vi.fn(),
  validateCityInStateMock: vi.fn(async (city: string, state: string) => ({
    normalizedCity: city,
    normalizedState: state,
    isValid: true,
  })),
}));

vi.mock('../../contexts/OperatorContext', () => ({
  useOperator: () => ({
    name: 'Bruno',
    email: 'bruno@senior.com.br',
    operatorId: 'op-1',
    loading: false,
    setName: vi.fn(),
    setEmail: vi.fn(),
    registerOperator: vi.fn(),
    clearName: vi.fn(),
    linkToExistingOperator: vi.fn(),
  }),
}));

vi.mock('../../services/brasilApiService', () => ({
  fetchCompanyByCnpj: fetchCompanyByCnpjMock,
  formatCnpj: (value: string) => value,
  isValidCnpj: (value: string) => value.replace(/\D/g, '').length === 14,
  normalizeCnpj: (value: string) => value.replace(/\D/g, '').slice(0, 14),
  validateCityInState: validateCityInStateMock,
}));

describe('EmptyStateHome onboarding gate', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.beforeEach(() => {
    vi.clearAllMocks();
    validateCityInStateMock.mockImplementation(async (city: string, state: string) => ({
      normalizedCity: city,
      normalizedState: state,
      isValid: true,
    }));
  });

  it('mostra aviso sobre impacto de iniciar sem CNPJ no Score PORTA', () => {
    render(<EmptyStateHome mode="investigacao" onStartInvestigation={vi.fn()} isDarkMode={false} />);

    expect(
      screen.getByText(
        /Sem CNPJ confirmado, a investigação pode ficar incompleta e reduzir a precisão do Score PORTA\./i,
      ),
    ).toBeInTheDocument();
  });

  it('does not submit while required fields are missing', () => {
    const onStartInvestigation = vi.fn();

    render(<EmptyStateHome mode="investigacao" onStartInvestigation={onStartInvestigation} isDarkMode={true} />);

    fireEvent.click(screen.getByRole('button', { name: /Iniciar investigação completa/i }));
    expect(onStartInvestigation).not.toHaveBeenCalled();
  });

  it('shows preview demo button only when preview demo env is complete', () => {
    vi.stubEnv('VITE_ENABLE_PREVIEW_DEMO', 'true');
    vi.stubEnv('VITE_PREVIEW_DEMO_COMPANY', 'Grupo Scheffer');
    vi.stubEnv('VITE_PREVIEW_DEMO_CNPJ', '04.733.767/0001-80');
    vi.stubEnv('VITE_PREVIEW_DEMO_CITY', 'Cuiaba');
    vi.stubEnv('VITE_PREVIEW_DEMO_STATE', 'MT');
    const onStartInvestigation = vi.fn();

    render(<EmptyStateHome mode="investigacao" onStartInvestigation={onStartInvestigation} isDarkMode={false} />);

    fireEvent.click(screen.getByRole('button', { name: /Investigar empresa demo: Grupo Scheffer/i }));

    expect(onStartInvestigation).toHaveBeenCalledWith({
      companyName: 'Grupo Scheffer',
      cnpj: '04733767000180',
      city: 'Cuiaba',
      state: 'MT',
    });
  });

  it('hides preview demo button when the flag is off', () => {
    vi.stubEnv('VITE_ENABLE_PREVIEW_DEMO', 'false');
    vi.stubEnv('VITE_PREVIEW_DEMO_COMPANY', 'Grupo Scheffer');
    vi.stubEnv('VITE_PREVIEW_DEMO_CITY', 'Cuiaba');
    vi.stubEnv('VITE_PREVIEW_DEMO_STATE', 'MT');

    render(<EmptyStateHome mode="investigacao" onStartInvestigation={vi.fn()} isDarkMode={false} />);

    expect(screen.queryByTestId('preview-demo-investigation-button')).not.toBeInTheDocument();
  });

  it('submits once mandatory fields are valid', async () => {
    const onStartInvestigation = vi.fn();

    render(<EmptyStateHome mode="investigacao" onStartInvestigation={onStartInvestigation} isDarkMode={false} />);

    fireEvent.change(screen.getByLabelText(/Nome da empresa/i), { target: { value: 'Grupo Scheffer' } });
    fireEvent.change(screen.getByLabelText(/Cidade/i), { target: { value: 'Cuiabá' } });
    fireEvent.change(screen.getByLabelText(/^UF/i), { target: { value: 'MT' } });
    fireEvent.click(screen.getByRole('button', { name: /Iniciar investigação completa/i }));

    await waitFor(() => {
      expect(onStartInvestigation).toHaveBeenCalledTimes(1);
      expect(onStartInvestigation).toHaveBeenCalledWith({
        companyName: 'Grupo Scheffer',
        cnpj: null,
        city: 'Cuiabá',
        state: 'MT',
      });
    });
  });

  it('shows Configurar Radar and Varrer agora together when radar is configured', () => {
    const onOpenRadar = vi.fn();
    const onForceScan = vi.fn();

    render(
      <EmptyStateHome
        mode="investigacao"
        onStartInvestigation={vi.fn()}
        isDarkMode={false}
        radarAlerts={[]}
        radarIsScanning={false}
        onOpenRadar={onOpenRadar}
        onForceScan={onForceScan}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Configurar Radar/i }));
    fireEvent.click(screen.getByRole('button', { name: /Varrer agora/i }));

    expect(onOpenRadar).toHaveBeenCalledTimes(1);
    expect(onForceScan).toHaveBeenCalledTimes(1);
  });

  it('keeps the large "Configurar Radar agora" CTA when radar is not configured', () => {
    render(<EmptyStateHome mode="investigacao" onStartInvestigation={vi.fn()} isDarkMode={true} />);

    expect(screen.getByRole('button', { name: /Configurar Radar agora/i })).toBeInTheDocument();
  });

  it('preenche nome, cidade e uf e trava o cnpj quando a consulta funciona', async () => {
    fetchCompanyByCnpjMock.mockResolvedValueOnce({
      cnpj: '04252011000110',
      companyName: 'A Predial Materiais Para Construcao',
      city: 'Vilhena',
      state: 'RO',
    });

    render(<EmptyStateHome mode="investigacao" onStartInvestigation={vi.fn()} isDarkMode={false} />);

    fireEvent.change(screen.getByTestId('investigation-cnpj-input'), { target: { value: '04.252.011/0001-10' } });
    fireEvent.click(screen.getByTestId('investigation-cnpj-validate-button'));

    await waitFor(() => {
      expect(fetchCompanyByCnpjMock).toHaveBeenCalledWith('04252011000110');
      expect(screen.getByTestId('investigation-company-input')).toHaveValue('A Predial Materiais Para Construcao');
      expect(screen.getByLabelText(/Cidade/i)).toHaveValue('Vilhena');
      expect(screen.getByLabelText(/^UF/i)).toHaveValue('RO');
      expect(screen.getByRole('button', { name: /Alterar/i })).toBeInTheDocument();
    });
  });

  it('mostra mensagem especifica para 404 de cnpj nao encontrado', async () => {
    fetchCompanyByCnpjMock.mockRejectedValueOnce(new Error('HTTP 404'));

    render(<EmptyStateHome mode="investigacao" onStartInvestigation={vi.fn()} isDarkMode={false} />);

    fireEvent.change(screen.getByTestId('investigation-cnpj-input'), { target: { value: '04.252.011/0001-10' } });
    fireEvent.click(screen.getByTestId('investigation-cnpj-validate-button'));

    await waitFor(() => {
      expect(screen.getByText(/CNPJ não encontrado na Receita Federal/i)).toBeInTheDocument();
    });
  });

  it('mostra mensagem de indisponibilidade quando o proxy falha', async () => {
    fetchCompanyByCnpjMock.mockRejectedValueOnce(new Error('HTTP 503'));

    render(<EmptyStateHome mode="investigacao" onStartInvestigation={vi.fn()} isDarkMode={false} />);

    fireEvent.change(screen.getByTestId('investigation-cnpj-input'), { target: { value: '04.252.011/0001-10' } });
    fireEvent.click(screen.getByTestId('investigation-cnpj-validate-button'));

    await waitFor(() => {
      expect(screen.getByText(/Serviço de consulta indisponível no momento/i)).toBeInTheDocument();
    });
  });

  it('mostra orientacao de proxy no localhost quando o browser recebe o app html', async () => {
    fetchCompanyByCnpjMock.mockRejectedValueOnce(
      new Error('Local dev sem proxy para /api/cnpj. Rode via vercel dev ou configure VITE_CNPJ_PROXY_URL.'),
    );

    render(<EmptyStateHome mode="investigacao" onStartInvestigation={vi.fn()} isDarkMode={false} />);

    fireEvent.change(screen.getByTestId('investigation-cnpj-input'), { target: { value: '04.252.011/0001-10' } });
    fireEvent.click(screen.getByTestId('investigation-cnpj-validate-button'));

    await waitFor(() => {
      expect(screen.getByText(/Ambiente local sem proxy para consulta de CNPJ/i)).toBeInTheDocument();
    });
  });
});

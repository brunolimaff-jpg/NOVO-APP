import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import EmptyStateHome from '../../components/EmptyStateHome';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { displayName: 'Bruno' } }),
}));

vi.mock('../../services/brasilApiService', () => ({
  fetchCompanyByCnpj: vi.fn(),
  formatCnpj: (value: string) => value,
  isValidCnpj: () => false,
  normalizeCnpj: (value: string) => value.replace(/\D/g, '').slice(0, 14),
  validateCityInState: vi.fn(async (city: string, state: string) => ({
    normalizedCity: city,
    normalizedState: state,
    isValid: true,
  })),
}));

describe('EmptyStateHome onboarding gate', () => {
  it('does not submit while required fields are missing', () => {
    const onStartInvestigation = vi.fn();

    render(
      <EmptyStateHome
        mode="investigacao"
        onStartInvestigation={onStartInvestigation}
        isDarkMode={true}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Iniciar investigação completa/i }));
    expect(onStartInvestigation).not.toHaveBeenCalled();
  });

  it('submits once mandatory fields are valid', async () => {
    const onStartInvestigation = vi.fn();

    render(
      <EmptyStateHome
        mode="investigacao"
        onStartInvestigation={onStartInvestigation}
        isDarkMode={false}
      />,
    );

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
});

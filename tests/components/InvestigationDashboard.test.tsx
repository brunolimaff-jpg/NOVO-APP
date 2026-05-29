import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import InvestigationDashboard from '../../components/InvestigationDashboard';

// Mock do investigationStore
vi.mock('../../services/investigationStore', () => ({
  getInvestigations: vi.fn().mockReturnValue([
    {
      id: 'inv-1',
      empresa: 'Fazenda Modelo',
      score: 85,
      data: new Date().toISOString(),
      isCliente: false,
      familias: ['ERP'],
      gaps: [],
      resumo: 'Empresa quente',
    },
  ]),
  subscribe: vi.fn().mockReturnValue(() => {}),
  addInvestigation: vi.fn(),
}));

describe('InvestigationDashboard', () => {
  it('renderiza o painel com a lista de investigações', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();

    render(<InvestigationDashboard onSelectEmpresa={onSelect} onClose={onClose} />);

    expect(screen.getByText(/Meu Painel/i)).toBeTruthy();
    expect(screen.getByText(/Fazenda Modelo/i)).toBeTruthy();
  });

  it('chama onSelectEmpresa ao clicar em um item', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();

    render(<InvestigationDashboard onSelectEmpresa={onSelect} onClose={onClose} />);

    const item = screen.getByText(/Fazenda Modelo/i);
    fireEvent.click(item);

    expect(onSelect).toHaveBeenCalledWith('Fazenda Modelo');
    expect(onClose).toHaveBeenCalled();
  });

  it('chama onClose ao clicar no botão fechar', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();

    render(<InvestigationDashboard onSelectEmpresa={onSelect} onClose={onClose} />);

    const closeBtn = screen.getByLabelText(/Fechar painel/i);
    fireEvent.click(closeBtn);

    expect(onClose).toHaveBeenCalled();
  });
});

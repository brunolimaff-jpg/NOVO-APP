import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import ClienteSeniorScore from '../../components/ClienteSeniorScore';

const mockData = {
  encontrado: true,
  matchType: 'exact' as const,
  grupo: 'Grupo Modelo',
  familias: ['ERP', 'HCM'],
  totalModulos: 12,
  modulosPorFamilia: {
    'ERP': ['Financeiro', 'Compras'],
    'HCM': ['Folha', 'Ponto']
  }
};

describe('ClienteSeniorScore', () => {
  it('renderiza quando data.encontrado é true', () => {
    render(<ClienteSeniorScore data={mockData} />);
    expect(screen.getByText(/CLIENTE SENIOR CONFIRMADO/i)).toBeTruthy();
    expect(screen.getByText(/Grupo Modelo/i)).toBeTruthy();
    expect(screen.getByText(/12/)).toBeTruthy();
  });

  it('renderiza null quando data.encontrado é false', () => {
    const { container } = render(<ClienteSeniorScore data={{ ...mockData, encontrado: false }} />);
    expect(container.firstChild).toBeNull();
  });

  it('renderiza null quando o match não é exato', () => {
    const { container } = render(<ClienteSeniorScore data={{ ...mockData, matchType: 'partial', encontrado: false }} />);
    expect(container.firstChild).toBeNull();
  });

  it('exibe as famílias de produtos', () => {
    render(<ClienteSeniorScore data={mockData} />);
    expect(screen.getByText(/ERP/)).toBeTruthy();
    expect(screen.getByText(/HCM/)).toBeTruthy();
  });
});

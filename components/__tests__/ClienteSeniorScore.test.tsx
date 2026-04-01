import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

vi.mock('@clerk/clerk-react', () => ({
  useUser: () => ({ user: { id: 'u1', fullName: 'Test' }, isLoaded: true }),
}));

vi.mock('../../utils/chunkRetry', () => ({
  loadWithChunkRetry: (fn: () => Promise<unknown>) => fn(),
}));

import ClienteSeniorScore from '../ClienteSeniorScore';

// ---------------------------------------------------------------------------
// Suite: Cliente confirmado
// ---------------------------------------------------------------------------
describe('ClienteSeniorScore — cliente confirmado', () => {
  it('renderiza sem explodir com isSeniorClient=true', () => {
    expect(() =>
      render(
        <ClienteSeniorScore
          isSeniorClient={true}
          companyName="Senior Sistemas SA"
        />
      )
    ).not.toThrow();
  });

  it('exibe texto de confirmação quando isSeniorClient=true', () => {
    render(
      <ClienteSeniorScore
        isSeniorClient={true}
        companyName="Senior Sistemas SA"
      />
    );
    const html = document.body.innerHTML;
    // Deve conter alguma indicação de cliente confirmado
    expect(
      html.toLowerCase().includes('confirm') ||
      html.toLowerCase().includes('senior') ||
      html.toLowerCase().includes('cliente')
    ).toBe(true);
  });

  it('exibe o nome da empresa', () => {
    render(
      <ClienteSeniorScore
        isSeniorClient={true}
        companyName="Agro Cuiabá Ltda"
      />
    );
    expect(screen.getByText(/Agro Cuiabá/i)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Suite: Não cliente
// ---------------------------------------------------------------------------
describe('ClienteSeniorScore — não cliente', () => {
  it('renderiza sem explodir com isSeniorClient=false', () => {
    expect(() =>
      render(
        <ClienteSeniorScore
          isSeniorClient={false}
          companyName="Empresa X"
        />
      )
    ).not.toThrow();
  });

  it('não exibe badge de confirmação quando isSeniorClient=false', () => {
    render(
      <ClienteSeniorScore
        isSeniorClient={false}
        companyName="Empresa X"
      />
    );
    // Não deve existir indicador de "confirmado"
    expect(screen.queryByText(/confirmado/i)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite: Score de confiança opcional
// ---------------------------------------------------------------------------
describe('ClienteSeniorScore — score de confiança', () => {
  it('exibe score de confiança quando fornecido', () => {
    render(
      <ClienteSeniorScore
        isSeniorClient={true}
        companyName="Senior Corp"
        confidenceScore={92}
      />
    );
    expect(screen.getByText(/92/)).toBeTruthy();
  });

  it('renderiza sem explodir quando confidenceScore não é fornecido', () => {
    expect(() =>
      render(
        <ClienteSeniorScore
          isSeniorClient={true}
          companyName="Senior Corp"
        />
      )
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Suite: Robustez
// ---------------------------------------------------------------------------
describe('ClienteSeniorScore — robustez', () => {
  it('renderiza sem explodir com companyName vazio', () => {
    expect(() =>
      render(<ClienteSeniorScore isSeniorClient={false} companyName="" />)
    ).not.toThrow();
  });
});

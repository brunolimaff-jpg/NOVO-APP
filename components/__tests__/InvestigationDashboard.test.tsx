import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
vi.mock('@clerk/clerk-react', () => ({
  useUser: () => ({
    user: { id: 'u1', fullName: 'Bruno Lima' },
    isLoaded: true,
  }),
}));

vi.mock('../ScorePorta', () => ({
  default: ({ scorePorta }: { scorePorta: unknown }) =>
    scorePorta ? <div data-testid="score-porta-widget">Score PORTA</div> : null,
}));

vi.mock('../MarkdownRenderer', () => ({
  default: ({ content }: { content: string }) => (
    <div data-testid="markdown">{content}</div>
  ),
}));

vi.mock('../ClienteSeniorScore', () => ({
  default: ({ isSeniorClient, companyName }: { isSeniorClient: boolean; companyName: string }) => (
    <div data-testid="cliente-senior-score">
      {isSeniorClient ? 'CLIENTE SENIOR CONFIRMADO' : 'NÃO CLIENTE'} — {companyName}
    </div>
  ),
}));

vi.mock('../../utils/chunkRetry', () => ({
  loadWithChunkRetry: (fn: () => Promise<unknown>) => fn(),
}));

import InvestigationDashboard from '../InvestigationDashboard';

// ---------------------------------------------------------------------------
// Factory de sessão mock
// ---------------------------------------------------------------------------
function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-test-1',
    empresaAlvo: 'Fazenda Modelo MT',
    cnpj: '12.345.678/0001-99',
    isClienteSenior: false,
    scorePorta: null,
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Suite: Renderização básica
// ---------------------------------------------------------------------------
describe('InvestigationDashboard — renderização básica', () => {
  it('renderiza sem explodir com sessão mínima', () => {
    expect(() =>
      render(<InvestigationDashboard session={makeSession()} />)
    ).not.toThrow();
  });

  it('exibe o nome da empresa alvo', () => {
    render(<InvestigationDashboard session={makeSession({ empresaAlvo: 'Fazenda Modelo MT' })} />);
    expect(screen.getByText(/Fazenda Modelo MT/i)).toBeTruthy();
  });

  it('exibe CNPJ da sessão', () => {
    render(<InvestigationDashboard session={makeSession({ cnpj: '12.345.678/0001-99' })} />);
    const html = document.body.innerHTML;
    expect(html).toContain('12.345.678');
  });
});

// ---------------------------------------------------------------------------
// Suite: Score PORTA
// ---------------------------------------------------------------------------
describe('InvestigationDashboard — ScorePorta', () => {
  it('renderiza widget ScorePorta quando session.scorePorta está presente', () => {
    const score = {
      porte: 80, operacao: 70, retorno: 60,
      tecnologia: 75, adocao: 65, total: 70, classificacao: 'Forte',
    };
    render(<InvestigationDashboard session={makeSession({ scorePorta: score })} />);
    expect(screen.getByTestId('score-porta-widget')).toBeTruthy();
  });

  it('NÃO renderiza widget ScorePorta quando session.scorePorta é null', () => {
    render(<InvestigationDashboard session={makeSession({ scorePorta: null })} />);
    expect(screen.queryByTestId('score-porta-widget')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite: Badge Cliente Senior
// ---------------------------------------------------------------------------
describe('InvestigationDashboard — Badge Cliente Senior', () => {
  it('exibe CLIENTE SENIOR CONFIRMADO quando isClienteSenior=true', () => {
    render(
      <InvestigationDashboard
        session={makeSession({ isClienteSenior: true, empresaAlvo: 'Senior Corp' })}
      />
    );
    expect(screen.getByText(/CLIENTE SENIOR CONFIRMADO/i)).toBeTruthy();
  });

  it('NÃO exibe badge senior quando isClienteSenior=false', () => {
    render(
      <InvestigationDashboard
        session={makeSession({ isClienteSenior: false })}
      />
    );
    expect(screen.queryByText(/CLIENTE SENIOR CONFIRMADO/i)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Suite: Robustez
// ---------------------------------------------------------------------------
describe('InvestigationDashboard — robustez', () => {
  it('renderiza sem explodir quando session não tem cnpj', () => {
    expect(() =>
      render(<InvestigationDashboard session={makeSession({ cnpj: undefined })} />)
    ).not.toThrow();
  });

  it('renderiza sem explodir quando messages está vazio', () => {
    expect(() =>
      render(<InvestigationDashboard session={makeSession({ messages: [] })} />)
    ).not.toThrow();
  });
});

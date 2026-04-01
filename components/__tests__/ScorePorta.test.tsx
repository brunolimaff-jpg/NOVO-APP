import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

vi.mock('@clerk/clerk-react', () => ({
  useUser: () => ({ user: { id: 'u1', fullName: 'Test' }, isLoaded: true }),
}));

import ScorePorta from '../ScorePorta';

// ---------------------------------------------------------------------------
// Factory de score PORTA completo
// ---------------------------------------------------------------------------
function makeScore(overrides: Record<string, unknown> = {}) {
  return {
    porte: 80,
    operacao: 70,
    retorno: 60,
    tecnologia: 75,
    adocao: 65,
    total: 70,
    classificacao: 'Forte',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Suite: Renderização básica
// ---------------------------------------------------------------------------
describe('ScorePorta — renderização básica', () => {
  it('renderiza sem explodir com score completo', () => {
    expect(() => render(<ScorePorta scorePorta={makeScore()} />)).not.toThrow();
  });

  it('renderiza o score total numérico', () => {
    render(<ScorePorta scorePorta={makeScore({ total: 72 })} />);
    expect(screen.getByText(/72/)).toBeTruthy();
  });

  it('renderiza classificação textual', () => {
    render(<ScorePorta scorePorta={makeScore({ classificacao: 'Forte' })} />);
    expect(screen.getByText(/Forte/i)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Suite: As 5 dimensões PORTA aparecem
// ---------------------------------------------------------------------------
describe('ScorePorta — dimensões PORTA', () => {
  it('exibe label Porte (P)', () => {
    render(<ScorePorta scorePorta={makeScore()} />);
    expect(screen.getByText(/Porte/i)).toBeTruthy();
  });

  it('exibe label Operação (O)', () => {
    render(<ScorePorta scorePorta={makeScore()} />);
    expect(screen.getByText(/Opera[çc][aã]o/i)).toBeTruthy();
  });

  it('exibe label Retorno (R)', () => {
    render(<ScorePorta scorePorta={makeScore()} />);
    expect(screen.getByText(/Retorno/i)).toBeTruthy();
  });

  it('exibe label Tecnologia (T)', () => {
    render(<ScorePorta scorePorta={makeScore()} />);
    expect(screen.getByText(/Tecnologia/i)).toBeTruthy();
  });

  it('exibe label Adoção (A)', () => {
    render(<ScorePorta scorePorta={makeScore()} />);
    expect(screen.getByText(/Ado[çc][aã]o/i)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Suite: Código de cor por score
// ---------------------------------------------------------------------------
describe('ScorePorta — código de cor por faixa de score', () => {
  it('score >= 70 usa classe de cor verde/success', () => {
    const { container } = render(<ScorePorta scorePorta={makeScore({ total: 85, classificacao: 'Excelente' })} />);
    // Procura por qualquer elemento com classe relacionada a verde/emerald/green
    const html = container.innerHTML;
    expect(
      html.includes('green') || html.includes('emerald') || html.includes('success')
    ).toBe(true);
  });

  it('score <= 39 usa classe de cor vermelha/danger', () => {
    const { container } = render(
      <ScorePorta scorePorta={makeScore({ total: 25, classificacao: 'Fraco' })} />
    );
    const html = container.innerHTML;
    expect(
      html.includes('red') || html.includes('rose') || html.includes('danger') || html.includes('error')
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Suite: Robustez com dados parciais / ausentes
// ---------------------------------------------------------------------------
describe('ScorePorta — robustez', () => {
  it('renderiza sem explodir quando scorePorta é undefined', () => {
    // @ts-expect-error testando prop ausente intencionalmente
    expect(() => render(<ScorePorta scorePorta={undefined} />)).not.toThrow();
  });

  it('renderiza com dimensões zeradas', () => {
    expect(() =>
      render(
        <ScorePorta
          scorePorta={makeScore({
            porte: 0,
            operacao: 0,
            retorno: 0,
            tecnologia: 0,
            adocao: 0,
            total: 0,
          })}
        />
      )
    ).not.toThrow();
  });

  it('renderiza com dimensões no máximo (100)', () => {
    expect(() =>
      render(
        <ScorePorta
          scorePorta={makeScore({
            porte: 100,
            operacao: 100,
            retorno: 100,
            tecnologia: 100,
            adocao: 100,
            total: 100,
          })}
        />
      )
    ).not.toThrow();
  });

  it('exibe o valor numérico de cada dimensão', () => {
    render(<ScorePorta scorePorta={makeScore({ porte: 88 })} />);
    expect(screen.getByText(/88/)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Suite: Prop empresaAlvo opcional
// ---------------------------------------------------------------------------
describe('ScorePorta — prop empresaAlvo', () => {
  it('exibe nome da empresa quando fornecido', () => {
    render(<ScorePorta scorePorta={makeScore()} empresaAlvo="Agro MT Ltda" />);
    expect(screen.getByText(/Agro MT Ltda/i)).toBeTruthy();
  });
});

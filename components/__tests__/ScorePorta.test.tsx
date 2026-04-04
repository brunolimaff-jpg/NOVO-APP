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
    p: 8,
    o: 7,
    r: 6,
    t: 7,
    a: 6,
    score: 70,
    segmento: 'AGRO' as any,
    flags: [],
    justificativas: { P: '', O: '', R: '', T: '', A: '' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Suite: Renderização básica
// ---------------------------------------------------------------------------
describe('ScorePorta — renderização básica', () => {
  it('renderiza sem explodir com score completo', () => {
    expect(() => render(<ScorePorta {...makeScore()} />)).not.toThrow();
  });

  it('renderiza o score total numérico', () => {
    render(<ScorePorta {...makeScore({ score: 72 })} />);
    expect(screen.getByText(/72/)).toBeTruthy();
  });

  it('renderiza classificação textual', () => {
    render(<ScorePorta {...makeScore()} />);
    expect(screen.getByText(/Forte/i)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Suite: As 5 dimensões PORTA aparecem
// ---------------------------------------------------------------------------
describe('ScorePorta — dimensões PORTA', () => {
  it('exibe label Porte (P)', () => {
    render(<ScorePorta {...makeScore()} />);
    expect(screen.getByText(/Porte/i)).toBeTruthy();
  });

  it('exibe label Operação (O)', () => {
    render(<ScorePorta {...makeScore()} />);
    expect(screen.getByText(/Opera[çc][aã]o/i)).toBeTruthy();
  });

  it('exibe label Retorno (R)', () => {
    render(<ScorePorta {...makeScore()} />);
    expect(screen.getByText(/Retorno/i)).toBeTruthy();
  });

  it('exibe label Tecnologia (T)', () => {
    render(<ScorePorta {...makeScore()} />);
    expect(screen.getByText(/Tecnologia/i)).toBeTruthy();
  });

  it('exibe label Adoção (A)', () => {
    render(<ScorePorta {...makeScore()} />);
    expect(screen.getByText(/Ado[çc][aã]o/i)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Suite: Código de cor por score
// ---------------------------------------------------------------------------
describe('ScorePorta — código de cor por faixa de score', () => {
  it('score >= 70 usa classe de cor verde/success', () => {
    const { container } = render(<ScorePorta {...makeScore({ score: 85 })} />);
    // Procura por qualquer elemento com classe relacionada a verde/emerald/green
    const html = container.innerHTML;
    expect(
      html.includes('green') || html.includes('emerald') || html.includes('success')
    ).toBe(true);
  });

  it('score <= 39 usa classe de cor vermelha/danger', () => {
    const { container } = render(
      <ScorePorta {...makeScore({ score: 25 })} />
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
    expect(() => render(<ScorePorta {...(undefined as any)} />)).not.toThrow();
  });

  it('renderiza com dimensões zeradas', () => {
    expect(() =>
      render(
        <ScorePorta
          {...makeScore({
            p: 0,
            o: 0,
            r: 0,
            t: 0,
            a: 0,
            score: 0,
          })}
        />
      )
    ).not.toThrow();
  });

  it('renderiza com dimensões no máximo (100)', () => {
    expect(() =>
      render(
        <ScorePorta
          {...makeScore({
            p: 10,
            o: 10,
            r: 10,
            t: 10,
            a: 10,
            score: 100,
          })}
        />
      )
    ).not.toThrow();
  });

  it('exibe o valor numérico de cada dimensão', () => {
    render(<ScorePorta {...makeScore({ p: 8 })} />);
    expect(screen.getByText(/88/)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Suite: Prop empresaAlvo opcional
// ---------------------------------------------------------------------------
describe('ScorePorta — prop empresaAlvo', () => {
  it('exibe nome da empresa quando fornecido', () => {
    render(<ScorePorta {...makeScore()} />);
    expect(screen.getByText(/Agro MT Ltda/i)).toBeTruthy();
  });
});

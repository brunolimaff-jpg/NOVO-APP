import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ScorePorta from '../../components/ScorePorta';

describe('ScorePorta', () => {
  it('renders supported flags and ignores deprecated LOCK', () => {
    render(
      <ScorePorta
        score={45}
        p={9}
        o={9}
        r={8}
        t={6}
        a={5}
        segmento="AGI"
        flags={['TRAD', 'LOCK']}
        scoreBruto={76}
        isDarkMode={false}
      />,
    );

    expect(screen.getByText('PORTA')).toBeInTheDocument();
    expect(screen.getByText('AGI')).toBeInTheDocument();
    expect(screen.getByText('🚩')).toBeInTheDocument();
    expect(screen.getByText('TRAD')).toBeInTheDocument();
    expect(screen.queryByText('LOCK')).not.toBeInTheDocument();
    expect(screen.getByText('🟡 Média Compatibilidade')).toBeInTheDocument();
    expect(screen.queryByText(/Score final/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Segmento:/i)).not.toBeInTheDocument();
  });

  it('hides flags block when no flags are active', () => {
    render(<ScorePorta score={84} p={8} o={10} r={7} t={8} a={8} segmento="AGI" flags={[]} scoreBruto={84} />);

    expect(screen.queryByText('Flags: NONE')).not.toBeInTheDocument();
  });

  it('shows and toggles pillar explanation popover on badge click', () => {
    render(<ScorePorta score={84} p={8} o={10} r={7} t={8} a={8} segmento="AGI" flags={[]} scoreBruto={84} />);

    const porteBadge = screen.getByRole('button', { name: /P8· Porte/i });
    fireEvent.click(porteBadge);
    expect(screen.getByText('Porte (P)')).toBeInTheDocument();
    expect(screen.getByText(/Mede escala da conta/i)).toBeInTheDocument();

    fireEvent.click(porteBadge);
    expect(screen.queryByText('Porte (P)')).not.toBeInTheDocument();
  });
});

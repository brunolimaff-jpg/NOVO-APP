import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import HelpCenterFloating from '../../components/HelpCenterFloating';

describe('HelpCenterFloating', () => {
  it('abre e fecha o guia pelo botao e pelo Escape', () => {
    render(<HelpCenterFloating isDarkMode={false} onAskScout={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /abrir ajuda do scout/i }));
    expect(screen.getByRole('dialog', { name: /entenda o senior scout 360/i })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: /entenda o senior scout 360/i })).not.toBeInTheDocument();
  });

  it('responde pergunta pronta no painel sem enviar ao chat', () => {
    const onAskScout = vi.fn();
    render(<HelpCenterFloating isDarkMode={false} onAskScout={onAskScout} />);

    fireEvent.click(screen.getByRole('button', { name: /abrir ajuda do scout/i }));
    fireEvent.click(screen.getByRole('button', { name: /como funciona o score porta/i }));

    expect(screen.getByText(/O PORTA prioriza contas por cinco dimensoes/i)).toBeInTheDocument();
    expect(onAskScout).not.toHaveBeenCalled();
  });

  it('filtra perguntas por busca local', () => {
    render(<HelpCenterFloating isDarkMode={false} onAskScout={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /abrir ajuda do scout/i }));
    fireEvent.change(screen.getByLabelText(/pergunte sobre o scout/i), { target: { value: 'Radar' } });

    expect(screen.getByRole('button', { name: /o que o radar monitora/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /como funciona o score porta/i })).not.toBeInTheDocument();
  });

  it('bloqueia perguntas fora do escopo da ajuda', () => {
    const onAskScout = vi.fn();
    render(<HelpCenterFloating isDarkMode={false} onAskScout={onAskScout} />);

    fireEvent.click(screen.getByRole('button', { name: /abrir ajuda do scout/i }));
    fireEvent.change(screen.getByLabelText(/pergunte sobre o scout/i), { target: { value: 'investigue a SLC' } });
    fireEvent.click(screen.getByRole('button', { name: /responder/i }));

    expect(screen.getByText(/Esse painel e so para entender o Scout/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /aprofundar no scout/i })).not.toBeInTheDocument();
    expect(onAskScout).not.toHaveBeenCalled();
  });

  it('envia aprofundamento ao Scout apenas para pergunta valida', () => {
    const onAskScout = vi.fn();
    render(<HelpCenterFloating isDarkMode={false} onAskScout={onAskScout} />);

    fireEvent.click(screen.getByRole('button', { name: /abrir ajuda do scout/i }));
    fireEvent.click(screen.getByRole('button', { name: /quais sao as fases da investigacao/i }));
    fireEvent.click(screen.getByRole('button', { name: /aprofundar no scout/i }));

    expect(onAskScout).toHaveBeenCalledWith(
      expect.stringContaining('<help_guide>'),
      'Quero entender melhor: Quais sao as fases da investigacao?',
    );
  });
});

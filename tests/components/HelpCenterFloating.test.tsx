import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import HelpCenterFloating from '../../components/HelpCenterFloating';

describe('HelpCenterFloating', () => {
  it('abre e fecha as perguntas frequentes pelo botão e pelo Escape', () => {
    render(<HelpCenterFloating isDarkMode={false} />);

    fireEvent.click(screen.getByRole('button', { name: /abrir ajuda do scout/i }));
    expect(screen.getByRole('dialog', { name: /perguntas frequentes/i })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: /perguntas frequentes/i })).not.toBeInTheDocument();
  });

  it('mostra somente as 9 dúvidas frequentes clicáveis do fluxo ativo', () => {
    render(<HelpCenterFloating isDarkMode={false} />);

    fireEvent.click(screen.getByRole('button', { name: /abrir ajuda do scout/i }));
    const dialog = screen.getByRole('dialog', { name: /perguntas frequentes/i });
    const faqButtons = within(dialog).getAllByRole('button', { expanded: false });

    expect(faqButtons).toHaveLength(9);
    expect(within(dialog).queryByRole('button', { name: /o que o radar monitora/i })).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText(/pergunte sobre o scout/i)).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /aprofundar no scout/i })).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/guia rapido/i)).not.toBeInTheDocument();
  });

  it('abre a resposta local ao clicar em uma dúvida', () => {
    render(<HelpCenterFloating isDarkMode={false} />);

    fireEvent.click(screen.getByRole('button', { name: /abrir ajuda do scout/i }));
    fireEvent.click(screen.getByRole('button', { name: /como funciona o score porta/i }));

    expect(screen.getByText(/O PORTA ajuda a priorizar contas por Porte/i)).toBeInTheDocument();
  });

  it('mantém as perguntas em português do Brasil', () => {
    render(<HelpCenterFloating isDarkMode={false} />);

    fireEvent.click(screen.getByRole('button', { name: /abrir ajuda do scout/i }));

    expect(screen.getByRole('button', { name: /Quais são as fases da investigação/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Quais são os limites do Scout/i })).toBeInTheDocument();
    expect(screen.queryByText(/\bFeatures\b/i)).not.toBeInTheDocument();
  });
});

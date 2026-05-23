import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import MessageActionsBar from '../../components/MessageActionsBar';

function renderBar(props: Partial<React.ComponentProps<typeof MessageActionsBar>> = {}) {
  return render(
    <MessageActionsBar
      content="Conteúdo"
      verifiedSourcesCount={0}
      citedLinksCount={0}
      onFeedback={vi.fn()}
      onSubmitFeedback={vi.fn()}
      onToggleSources={vi.fn()}
      isSourcesVisible={false}
      isDarkMode={false}
      {...props}
    />,
  );
}

describe('MessageActionsBar', () => {
  it('mostra fontes verificadas separadas de links citados', () => {
    renderBar({ verifiedSourcesCount: 2, citedLinksCount: 3 });
    expect(screen.getByText('Fontes (2)')).toBeInTheDocument();
    expect(screen.queryByText('Links (3)')).not.toBeInTheDocument();
  });

  it('mostra links citados quando nao ha fontes verificadas', () => {
    renderBar({ verifiedSourcesCount: 0, citedLinksCount: 3 });
    expect(screen.getByText('Links (3)')).toBeInTheDocument();
  });

  it('mostra pergunta comercial e mantem like em um clique', () => {
    const onFeedback = vi.fn();
    const onSubmitFeedback = vi.fn();
    renderBar({ onFeedback, onSubmitFeedback });

    expect(screen.getByText('Essa resposta ajudou a avançar com a conta?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /útil/i }));

    expect(onFeedback).toHaveBeenCalledWith('up');
    expect(onSubmitFeedback).toHaveBeenCalledWith('up', '', 'Conteúdo', { scope: 'message' });
    expect(screen.getByText('Obrigado, isso ajuda a melhorar os próximos dossiês.')).toBeInTheDocument();
  });

  it('oferece motivos rapidos no dislike e comentario opcional', () => {
    const onSubmitFeedback = vi.fn();
    renderBar({ onSubmitFeedback });

    fireEvent.click(screen.getByRole('button', { name: /ajustar/i }));
    expect(screen.getByText('Sem evidência')).toBeInTheDocument();

    const submit = screen.getByRole('button', { name: /registrar ajuste/i });
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Sem evidência' }));
    fireEvent.click(submit);

    expect(onSubmitFeedback).toHaveBeenCalledWith('down', '', 'Conteúdo', {
      scope: 'message',
      reason: 'no_evidence',
    });
    expect(screen.getByText('Registrado. Vamos usar isso para ajustar esse tipo de análise.')).toBeInTheDocument();
  });
});

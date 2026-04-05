/**
 * QW-2 — ErrorToast test suite
 * 5 cenários Whittaker para garantir comportamento em produção.
 */

import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ErrorToast } from '../../components/ErrorToast';

describe('ErrorToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Cenário 1 — Happy null: toast não aparece quando não há erro
  it('não renderiza nada quando error é null', () => {
    const { container } = render(
      <ErrorToast error={null} context="generic" onClose={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  // Cenário 2 — Render correto: título e detalhe amigável aparecem
  it('renderiza título e detalhe traduzidos para o contexto gemini', () => {
    render(
      <ErrorToast
        error={new Error('gemini unavailable')}
        context="gemini"
        onClose={vi.fn()}
      />
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
    // Deve conter algum texto de título (não expõe mensagem técnica raw)
    expect(screen.getByText(/IA temporariamente indisponível/i)).toBeInTheDocument();
  });

  // Cenário 3 — Dismiss manual: callback onClose chamado ao clicar no botão
  it('chama onClose quando usuário clica no botão fechar', async () => {
    const onClose = vi.fn();

    render(
      <ErrorToast
        error={new Error('network error')}
        context="network"
        onClose={onClose}
        autoDismissMs={0}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /fechar aviso de erro/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // Cenário 4 — Auto-dismiss: onClose chamado após o timeout configurado
  it('auto-dismiss chama onClose após autoDismissMs', async () => {
    const onClose = vi.fn();

    render(
      <ErrorToast
        error={new Error('rate limit 429')}
        context="generic"
        onClose={onClose}
        autoDismissMs={5000}
      />
    );

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // Cenário 5 — Contexto RAG: mensagem correta para falha de base de dados
  it('exibe mensagem específica para contexto rag', () => {
    render(
      <ErrorToast
        error={new Error('rag service unavailable')}
        context="rag"
        onClose={vi.fn()}
        autoDismissMs={0}
      />
    );
    expect(screen.getByText(/Base de dados indisponível/i)).toBeInTheDocument();
    expect(screen.getByText(/contexto adicional/i)).toBeInTheDocument();
  });
});

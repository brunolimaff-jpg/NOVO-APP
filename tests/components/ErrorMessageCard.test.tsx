// tests/components/ErrorMessageCard.test.tsx
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorMessageCard from '../../components/ErrorMessageCard';
import type { AppError } from '../../types';

function makeAppError(overrides: Partial<AppError> = {}): AppError {
  return {
    code: 'SERVER',
    message: 'LLM proxy failed (500): interno',
    friendlyMessage: 'Erro interno nos servidores da IA.',
    retryable: true,
    transient: true,
    source: 'UNKNOWN',
    ...overrides,
  };
}

describe('ErrorMessageCard', () => {
  it('renderiza o card SC-429 para erro RATE_LIMIT com status 429 (contrato do Planejador)', () => {
    const onRetry = vi.fn();
    render(
      <ErrorMessageCard
        error={makeAppError({
          code: 'RATE_LIMIT',
          httpStatus: 429,
          message: 'LLM proxy failed (429): {"error":{"code":"LLM_GATEWAY_HTTP","message":"LiteLLM HTTP 429","retryable":true}}',
          friendlyMessage: 'Muitas requisições simultâneas. Aguarde alguns instantes.',
        })}
        onRetry={onRetry}
        isLoadingRetry={false}
        isDarkMode={false}
      />,
    );

    const card = screen.getByTestId('error-message-card');
    expect(card).toHaveAttribute('data-error-code', 'SC-429');
    expect(card).toHaveTextContent('Não foi possível concluir o dossiê agora');
    expect(card).toHaveTextContent('O serviço de análise do Scout está com alta demanda no momento');
    expect(card).toHaveTextContent('Código para suporte: SC-429');

    // Contrato: nada de jargão técnico visível
    expect(card).not.toHaveTextContent('LiteLLM');
    expect(card).not.toHaveTextContent('LLM proxy failed');
    expect(card).not.toHaveTextContent('Rate limit');
    expect(card).not.toHaveTextContent('429 Too Many Requests');

    // CTA "Tentar novamente" dispara onRetry
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('mantém o card genérico para erros que não são SC-429', () => {
    render(
      <ErrorMessageCard
        error={makeAppError()}
        onRetry={vi.fn()}
        isLoadingRetry={false}
        isDarkMode={false}
      />,
    );

    const card = screen.getByTestId('error-message-card');
    expect(card).not.toHaveAttribute('data-error-code', 'SC-429');
    expect(card).toHaveTextContent('Não foi possível concluir a investigação.');
    expect(card).toHaveTextContent('Ocorreu uma falha temporária nos servidores de IA.');
  });

  it('renderiza SC-429B sem CTA e sem detalhes internos para budget terminal', () => {
    render(
      <ErrorMessageCard
        error={makeAppError({
          code: 'LLM_BUDGET_EXCEEDED' as AppError['code'],
          httpStatus: 429,
          message: 'upstream secret body must stay server-side',
          friendlyMessage: 'upstream secret body must stay server-side',
          retryable: false,
          transient: false,
        })}
        onRetry={vi.fn()}
        isLoadingRetry={false}
        isDarkMode={false}
      />,
    );

    const card = screen.getByTestId('error-message-card');
    expect(card).toHaveAttribute('data-error-code', 'SC-429B');
    expect(card).toHaveTextContent('Não foi possível iniciar a análise agora');
    expect(card).toHaveTextContent('O serviço de análise está temporariamente indisponível. Tente novamente mais tarde.');
    expect(card).toHaveTextContent('Código para suporte: SC-429B');
    expect(card.querySelectorAll('button')).toHaveLength(0);
    expect(card).not.toHaveTextContent(/budget|secret|key|LiteLLM|custo|provider/i);
  });
});

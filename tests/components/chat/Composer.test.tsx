import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Composer from '../../../components/chat/Composer';
import type { ChatTheme } from '../../../components/chat/contracts';

const theme: ChatTheme = {
  bg: 'bg-slate-950',
  surface: 'bg-slate-900',
  border: 'border-slate-800',
  textPrimary: 'text-slate-100',
  textSecondary: 'text-slate-400',
  inputBg: 'bg-slate-800',
  inputBorder: 'border-slate-700',
  itemHover: 'hover:bg-slate-800',
  itemActive: 'bg-slate-800',
  btnSecondary: 'bg-slate-800 text-slate-200 border border-slate-700',
};

function buildProps(
  overrides: Partial<React.ComponentProps<typeof Composer>> = {},
): React.ComponentProps<typeof Composer> {
  return {
    isHidden: false,
    isLoading: false,
    processing: undefined,
    sessionId: 'session-1',
    theme,
    onSendMessage: vi.fn(),
    onRetry: vi.fn(),
    onStop: vi.fn(),
    ...overrides,
  };
}

describe('Composer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('envia a mensagem ao pressionar Enter sem Shift', () => {
    const props = buildProps();
    render(<Composer {...props} />);

    const input = screen.getByLabelText('Campo de mensagem');
    fireEvent.change(input, { target: { value: 'Investigar Acme Agro' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', charCode: 13 });

    expect(props.onSendMessage).toHaveBeenCalledWith('Investigar Acme Agro');
    expect(input).toHaveValue('');
  });

  it('bloqueia o composer durante loading e exibe o botao de parar', () => {
    render(
      <Composer
        {...buildProps({
          isLoading: true,
          processing: {
            stage: 'Analisando',
            completedStages: [],
            failureCount: 0,
            totalStages: 5,
          },
        })}
      />,
    );

    expect(screen.getByLabelText('Campo de mensagem')).toBeDisabled();
    expect(screen.getByTestId('chat-stop-button')).toBeInTheDocument();
    expect(screen.queryByTestId('send-message-button')).not.toBeInTheDocument();
  });

  it('abre o aviso de retry quando o usuario interrompe a geracao', () => {
    const props = buildProps({
      isLoading: true,
      processing: {
        stage: 'Analisando',
        completedStages: ['Entrada'],
        failureCount: 0,
        totalStages: 5,
      },
    });

    render(<Composer {...props} />);
    fireEvent.click(screen.getByTestId('chat-stop-button'));

    expect(props.onStop).toHaveBeenCalled();
    expect(screen.getByText(/geração interrompida/i)).toBeInTheDocument();
  });

  it('fecha o aviso e dispara retry ao clicar em tentar de novo', () => {
    const props = buildProps({
      isLoading: true,
      processing: {
        stage: 'Analisando',
        completedStages: ['Entrada'],
        failureCount: 0,
        totalStages: 5,
      },
    });

    render(<Composer {...props} />);
    fireEvent.click(screen.getByTestId('chat-stop-button'));
    fireEvent.click(screen.getByRole('button', { name: /tentar de novo/i }));

    expect(props.onRetry).toHaveBeenCalled();
    expect(screen.queryByText(/geração interrompida/i)).not.toBeInTheDocument();
  });
});

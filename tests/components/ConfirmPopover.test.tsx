// tests/components/ConfirmPopover.test.tsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ConfirmPopover from '../../components/ConfirmPopover';

function renderPopover(onConfirm = vi.fn(), message = 'Confirmar exclusão?') {
  return render(
    <ConfirmPopover message={message} onConfirm={onConfirm}>
      {({ onClick }) => (
        <button data-testid="trigger" onClick={onClick}>
          Excluir
        </button>
      )}
    </ConfirmPopover>,
  );
}

describe('ConfirmPopover', () => {
  it('renderiza o trigger filho normalmente', () => {
    renderPopover();
    expect(screen.getByTestId('trigger')).toBeInTheDocument();
    expect(screen.getByText('Excluir')).toBeInTheDocument();
  });

  it('não mostra mensagem de confirmação inicialmente', () => {
    renderPopover(vi.fn(), 'Confirmar exclusão?');
    expect(screen.queryByText('Confirmar exclusão?')).not.toBeInTheDocument();
  });

  it('mostra confirmação após clicar no trigger', () => {
    renderPopover(vi.fn(), 'Excluir item?');
    fireEvent.click(screen.getByTestId('trigger'));
    expect(screen.getByText('Excluir item?')).toBeInTheDocument();
  });

  it('mostra botões Sim e Não após trigger', () => {
    renderPopover();
    fireEvent.click(screen.getByTestId('trigger'));
    expect(screen.getByRole('button', { name: /sim/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /não/i })).toBeInTheDocument();
  });

  it('chama onConfirm ao clicar em Sim', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    renderPopover(onConfirm);
    fireEvent.click(screen.getByTestId('trigger'));
    fireEvent.click(screen.getByRole('button', { name: /sim/i }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('não chama onConfirm ao clicar em Não', () => {
    const onConfirm = vi.fn();
    renderPopover(onConfirm);
    fireEvent.click(screen.getByTestId('trigger'));
    fireEvent.click(screen.getByRole('button', { name: /não/i }));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('fecha confirmação ao clicar em Não', () => {
    renderPopover(vi.fn(), 'Excluir?');
    fireEvent.click(screen.getByTestId('trigger'));
    expect(screen.getByText('Excluir?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /não/i }));
    expect(screen.queryByText('Excluir?')).not.toBeInTheDocument();
  });

  it('fecha confirmação após clicar em Sim', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    renderPopover(onConfirm, 'Deletar?');
    fireEvent.click(screen.getByTestId('trigger'));
    fireEvent.click(screen.getByRole('button', { name: /sim/i }));
    expect(screen.queryByText('Deletar?')).not.toBeInTheDocument();
  });

  it('renderiza no modo dark sem crashar', () => {
    expect(() =>
      render(
        <ConfirmPopover message="msg" onConfirm={vi.fn()} isDarkMode>
          {({ onClick }) => <button onClick={onClick}>btn</button>}
        </ConfirmPopover>,
      ),
    ).not.toThrow();
  });
});

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const saveUserContextMock = vi.hoisted(() => vi.fn());
const scheduleDossierSyncMock = vi.hoisted(() => vi.fn());

vi.mock('../../services/storage', () => ({
  storage: {
    saveUserContext: saveUserContextMock,
    scheduleDossierSync: scheduleDossierSyncMock,
  },
}));

import {
  OperatorProvider,
  useOperator,
} from '../../contexts/OperatorContext';

const Probe: React.FC = () => {
  const { name, email, operatorId, clearName, setName, registerOperator, loading } = useOperator();

  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="name">{name || 'empty'}</span>
      <span data-testid="email">{email || 'empty'}</span>
      <span data-testid="operator-id">{operatorId || 'empty'}</span>
      <button type="button" onClick={() => setName('Bruno Lima')}>
        set-name
      </button>
      <button type="button" onClick={() => registerOperator('Bruno Lima', 'bruno@senior.com.br')}>
        register-operator
      </button>
      <button type="button" onClick={() => clearName()}>
        clear-name
      </button>
    </div>
  );
};

function renderProvider() {
  return render(
    <OperatorProvider>
      <Probe />
    </OperatorProvider>,
  );
}

describe('OperatorProvider', () => {
  beforeEach(() => {
    window.localStorage.clear();
    saveUserContextMock.mockClear();
    scheduleDossierSyncMock.mockClear();
  });

  it('starts without a name but with a stable operator id', () => {
    renderProvider();

    expect(screen.getByTestId('loading')).toHaveTextContent('false');
    expect(screen.getByTestId('name')).toHaveTextContent('empty');
    expect(screen.getByTestId('operator-id')).not.toHaveTextContent('empty');
  });

  it('persists the operator name locally', () => {
    renderProvider();

    fireEvent.click(screen.getByRole('button', { name: 'set-name' }));

    expect(screen.getByTestId('name')).toHaveTextContent('Bruno Lima');
    expect(window.localStorage.getItem('scout360:operator_name')).toBe('Bruno Lima');
  });

  it('registers name and email together and syncs user context once', () => {
    renderProvider();

    fireEvent.click(screen.getByRole('button', { name: 'register-operator' }));

    const operatorId = screen.getByTestId('operator-id').textContent;
    expect(screen.getByTestId('name')).toHaveTextContent('Bruno Lima');
    expect(screen.getByTestId('email')).toHaveTextContent('bruno@senior.com.br');
    expect(window.localStorage.getItem('scout360:operator_name')).toBe('Bruno Lima');
    expect(window.localStorage.getItem('scout360:operator_email')).toBe('bruno@senior.com.br');
    expect(saveUserContextMock).toHaveBeenCalledTimes(1);
    expect(saveUserContextMock).toHaveBeenCalledWith({
      operatorId,
      name: 'Bruno Lima',
      email: 'bruno@senior.com.br',
    });
    expect(scheduleDossierSyncMock).toHaveBeenCalledWith({ pull: true });
  });

  it('backfills saved name and email once on mount', async () => {
    window.localStorage.setItem('scout360:operator_id', 'op_saved');
    window.localStorage.setItem('scout360:operator_name', 'Bruno Lima');
    window.localStorage.setItem('scout360:operator_email', 'bruno@senior.com.br');

    renderProvider();

    await waitFor(() => {
      expect(saveUserContextMock).toHaveBeenCalledTimes(1);
    });
    expect(saveUserContextMock).toHaveBeenCalledWith({
      operatorId: 'op_saved',
      name: 'Bruno Lima',
      email: 'bruno@senior.com.br',
    });
  });

  it('clears only the name and preserves the operator id', () => {
    renderProvider();

    const initialOperatorId = screen.getByTestId('operator-id').textContent;

    fireEvent.click(screen.getByRole('button', { name: 'set-name' }));
    fireEvent.click(screen.getByRole('button', { name: 'clear-name' }));

    expect(screen.getByTestId('name')).toHaveTextContent('empty');
    expect(screen.getByTestId('operator-id').textContent).toBe(initialOperatorId);
    expect(window.localStorage.getItem('scout360:operator_name')).toBeNull();
  });
});

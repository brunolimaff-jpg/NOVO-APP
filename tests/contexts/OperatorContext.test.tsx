import React from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  OperatorProvider,
  useOperator,
} from '../../contexts/OperatorContext';

const Probe: React.FC = () => {
  const { name, operatorId, clearName, setName, loading } = useOperator();

  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="name">{name || 'empty'}</span>
      <span data-testid="operator-id">{operatorId || 'empty'}</span>
      <button type="button" onClick={() => setName('Bruno Lima')}>
        set-name
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

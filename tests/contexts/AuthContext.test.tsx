import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import {
  AuthProvider,
  useAuth,
} from '../../contexts/AuthContext';

const Probe: React.FC = () => {
  const { isAuthenticated, user, logout } = useAuth();
  return (
    <div>
      <span data-testid="is-auth">{String(isAuthenticated)}</span>
      <span data-testid="display-name">{user?.displayName || 'null'}</span>
      <span data-testid="is-guest">{String(user?.isGuest || false)}</span>
      <button onClick={() => logout()}>logout</button>
    </div>
  );
};

function renderProvider() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
}

describe('AuthProvider', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('shows unauthenticated state when no session', () => {
    renderProvider();
    expect(screen.getByTestId('is-auth')).toHaveTextContent('false');
    expect(screen.getByTestId('display-name')).toHaveTextContent('null');
  });
});

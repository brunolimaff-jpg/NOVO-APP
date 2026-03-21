import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import {
  AuthProvider,
  TEMPORARILY_DISABLE_CLERK,
  useAuth,
} from '../../contexts/AuthContext';

const clerkState = vi.hoisted(() => ({
  user: null as
    | {
        id: string;
        fullName?: string | null;
        firstName?: string | null;
        primaryEmailAddress?: { emailAddress: string } | null;
        update: ReturnType<typeof vi.fn>;
      }
    | null,
  isLoaded: true,
  isSignedIn: false,
  signOut: vi.fn().mockResolvedValue(undefined),
  openSignIn: vi.fn(),
  openSignUp: vi.fn(),
}));

vi.mock('@clerk/react', () => ({
  useUser: () => ({
    user: clerkState.user,
    isLoaded: clerkState.isLoaded,
    isSignedIn: clerkState.isSignedIn,
  }),
  useAuth: () => ({
    signOut: clerkState.signOut,
  }),
  useClerk: () => ({
    openSignIn: clerkState.openSignIn,
    openSignUp: clerkState.openSignUp,
  }),
}));

const Probe: React.FC = () => {
  const { isAuthenticated, user, continueAsGuest, logout } = useAuth();
  return (
    <div>
      <span data-testid="is-auth">{String(isAuthenticated)}</span>
      <span data-testid="display-name">{user?.displayName || 'null'}</span>
      <span data-testid="is-guest">{String(user?.isGuest || false)}</span>
      <button onClick={continueAsGuest}>guest</button>
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

describe('AuthProvider guest mode', () => {
  beforeEach(() => {
    window.localStorage.clear();
    clerkState.user = null;
    clerkState.isLoaded = true;
    clerkState.isSignedIn = false;
    clerkState.signOut.mockClear();
    clerkState.openSignIn.mockClear();
    clerkState.openSignUp.mockClear();
  });

  it('reflects guest access according to the current auth mode', () => {
    renderProvider();

    if (TEMPORARILY_DISABLE_CLERK) {
      expect(screen.getByTestId('is-auth')).toHaveTextContent('true');
      expect(screen.getByTestId('display-name')).toHaveTextContent('Visitante');
      expect(screen.getByTestId('is-guest')).toHaveTextContent('true');
      expect(window.localStorage.getItem('scout360:guest_mode')).toBeNull();
      return;
    }

    expect(screen.getByTestId('is-auth')).toHaveTextContent('false');
    expect(screen.getByTestId('display-name')).toHaveTextContent('null');

    fireEvent.click(screen.getByText('guest'));

    expect(screen.getByTestId('is-auth')).toHaveTextContent('true');
    expect(screen.getByTestId('display-name')).toHaveTextContent('Visitante');
    expect(screen.getByTestId('is-guest')).toHaveTextContent('true');
    expect(window.localStorage.getItem('scout360:guest_mode')).toBe('1');
  });

  it('handles logout without forcing Clerk signOut in guest mode', async () => {
    renderProvider();
    fireEvent.click(screen.getByText('guest'));
    fireEvent.click(screen.getByText('logout'));

    await waitFor(() => {
      expect(screen.getByTestId('is-auth')).toHaveTextContent(
        TEMPORARILY_DISABLE_CLERK ? 'true' : 'false',
      );
    });
    expect(clerkState.signOut).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('scout360:guest_mode')).toBeNull();

    if (TEMPORARILY_DISABLE_CLERK) {
      expect(screen.getByTestId('display-name')).toHaveTextContent('Visitante');
      expect(screen.getByTestId('is-guest')).toHaveTextContent('true');
    }
  });

  it('maps signed Clerk users only when Clerk is enabled', () => {
    clerkState.user = {
      id: 'usr_123',
      fullName: 'Maria Souza',
      firstName: 'Maria',
      primaryEmailAddress: { emailAddress: 'maria@empresa.com' },
      update: vi.fn(),
    };
    clerkState.isSignedIn = true;
    window.localStorage.setItem('scout360:guest_mode', '1');

    renderProvider();

    expect(screen.getByTestId('is-auth')).toHaveTextContent('true');
    if (TEMPORARILY_DISABLE_CLERK) {
      expect(screen.getByTestId('display-name')).toHaveTextContent('Visitante');
      expect(screen.getByTestId('is-guest')).toHaveTextContent('true');
    } else {
      expect(screen.getByTestId('display-name')).toHaveTextContent('Maria Souza');
      expect(screen.getByTestId('is-guest')).toHaveTextContent('false');
    }
  });
});

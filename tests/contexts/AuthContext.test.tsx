import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import {
  AuthProvider,
  TEMPORARILY_DISABLE_CLERK,
  REQUIRE_CLERK_AUTH,
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

describe('AuthProvider', () => {
  beforeEach(() => {
    window.localStorage.clear();
    clerkState.user = null;
    clerkState.isLoaded = true;
    clerkState.isSignedIn = false;
    clerkState.signOut.mockClear();
    clerkState.openSignIn.mockClear();
    clerkState.openSignUp.mockClear();
  });

  it('has correct flag values', () => {
    expect(TEMPORARILY_DISABLE_CLERK).toBe(false);
    expect(REQUIRE_CLERK_AUTH).toBe(false);
  });

  it('shows unauthenticated state when not signed in and no guest mode', () => {
    renderProvider();
    expect(screen.getByTestId('is-auth')).toHaveTextContent('false');
    expect(screen.getByTestId('display-name')).toHaveTextContent('null');
  });

  it('activates guest mode via continueAsGuest', () => {
    renderProvider();

    expect(screen.getByTestId('is-auth')).toHaveTextContent('false');

    fireEvent.click(screen.getByText('guest'));

    expect(screen.getByTestId('is-auth')).toHaveTextContent('true');
    expect(screen.getByTestId('display-name')).toHaveTextContent('Visitante');
    expect(screen.getByTestId('is-guest')).toHaveTextContent('true');
    expect(window.localStorage.getItem('scout360:guest_mode')).toBe('1');
  });

  it('handles logout in guest mode without calling Clerk signOut', async () => {
    renderProvider();
    fireEvent.click(screen.getByText('guest'));
    fireEvent.click(screen.getByText('logout'));

    await waitFor(() => {
      expect(screen.getByTestId('is-auth')).toHaveTextContent('false');
    });
    expect(clerkState.signOut).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('scout360:guest_mode')).toBeNull();
  });

  it('maps signed Clerk users correctly', () => {
    clerkState.user = {
      id: 'usr_123',
      fullName: 'Maria Souza',
      firstName: 'Maria',
      primaryEmailAddress: { emailAddress: 'maria@empresa.com' },
      update: vi.fn(),
    };
    clerkState.isSignedIn = true;

    renderProvider();

    expect(screen.getByTestId('is-auth')).toHaveTextContent('true');
    expect(screen.getByTestId('display-name')).toHaveTextContent('Maria Souza');
    expect(screen.getByTestId('is-guest')).toHaveTextContent('false');
  });

  it('calls Clerk signOut on logout when signed in via Clerk', async () => {
    clerkState.user = {
      id: 'usr_123',
      fullName: 'Maria Souza',
      firstName: 'Maria',
      primaryEmailAddress: { emailAddress: 'maria@empresa.com' },
      update: vi.fn(),
    };
    clerkState.isSignedIn = true;

    renderProvider();
    fireEvent.click(screen.getByText('logout'));

    await waitFor(() => {
      expect(clerkState.signOut).toHaveBeenCalled();
    });
  });
});

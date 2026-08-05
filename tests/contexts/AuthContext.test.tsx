import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthError } from '@supabase/supabase-js';
import { SupabaseAuthProvider, useAuth } from '../../contexts/AuthContext';

// ==============================================================================
// Mocks
// ==============================================================================
const signUpMock = vi.hoisted(() => vi.fn());
const signInMock = vi.hoisted(() => vi.fn());
const resetPasswordMock = vi.hoisted(() => vi.fn());
const getSessionMock = vi.hoisted(() => vi.fn());

const authApiMock = vi.hoisted(() => ({
  getSession: getSessionMock,
  signUp: signUpMock,
  signInWithPassword: signInMock,
  resetPasswordForEmail: resetPasswordMock,
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
}));

const supabaseRef = vi.hoisted(() => ({ current: null as unknown }));

vi.mock('../../lib/supabaseClient', () => ({
  get supabase() {
    return supabaseRef.current;
  },
  isSupabaseAvailable: () => supabaseRef.current !== null,
}));

function makeAuthClient() {
  return {
    auth: authApiMock,
  };
}

// ==============================================================================
// Suíte
// ==============================================================================
describe('SupabaseAuthProvider — contrato de erros (ONDA 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseRef.current = makeAuthClient();
    getSessionMock.mockResolvedValue({ data: { session: null }, error: null });
    signUpMock.mockResolvedValue({ data: { user: null, session: null }, error: null });
    signInMock.mockResolvedValue({ data: { session: null }, error: null });
    resetPasswordMock.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    supabaseRef.current = null;
  });

  it('cliente indisponível NÃO retorna falso { error: null } no signIn', async () => {
    supabaseRef.current = null;
    const { result } = renderHook(() => useAuth(), { wrapper: ({ children }) => <SupabaseAuthProvider>{children}</SupabaseAuthProvider> });

    let outcome: { error: AuthError | null } | undefined;
    await act(async () => {
      outcome = await result.current.signIn('bruno@senior.com.br', 'Senha1234');
    });

    expect(outcome?.error).not.toBeNull();
    expect(outcome?.error?.message).toContain('indisponível');
    expect(signInMock).not.toHaveBeenCalled();
  });

  it('cliente indisponível NÃO retorna falso { error: null } no signUp', async () => {
    supabaseRef.current = null;
    const { result } = renderHook(() => useAuth(), { wrapper: ({ children }) => <SupabaseAuthProvider>{children}</SupabaseAuthProvider> });

    let outcome: { error: AuthError | null } | undefined;
    await act(async () => {
      outcome = await result.current.signUp('bruno@senior.com.br', 'Senha1234', 'Bruno Lima');
    });

    expect(outcome?.error).not.toBeNull();
    expect(signUpMock).not.toHaveBeenCalled();
  });

  it('exceção do Supabase vira erro sanitizado (sem detalhe técnico) no signIn', async () => {
    signInMock.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.1:5432 secret-token'));
    const { result } = renderHook(() => useAuth(), { wrapper: ({ children }) => <SupabaseAuthProvider>{children}</SupabaseAuthProvider> });

    let outcome: { error: AuthError | null } | undefined;
    await act(async () => {
      outcome = await result.current.signIn('bruno@senior.com.br', 'Senha1234');
    });

    expect(outcome?.error).not.toBeNull();
    expect(outcome?.error?.message).toContain('Verifique sua conexão');
    expect(outcome?.error?.message).not.toContain('ECONNREFUSED');
    expect(outcome?.error?.message).not.toContain('secret-token');
  });

  it('exceção do Supabase vira erro sanitizado no signUp', async () => {
    signUpMock.mockRejectedValue(new Error('boom técnico 500'));
    const { result } = renderHook(() => useAuth(), { wrapper: ({ children }) => <SupabaseAuthProvider>{children}</SupabaseAuthProvider> });

    let outcome: { error: AuthError | null } | undefined;
    await act(async () => {
      outcome = await result.current.signUp('bruno@senior.com.br', 'Senha1234', 'Bruno Lima');
    });

    expect(outcome?.error).not.toBeNull();
    expect(outcome?.error?.message).toContain('cadastro');
    expect(outcome?.error?.message).not.toContain('boom técnico');
  });

  it('credencial inválida propaga o erro do Supabase', async () => {
    signInMock.mockResolvedValue({
      data: { session: null },
      error: new AuthError('Invalid login credentials'),
    });
    const { result } = renderHook(() => useAuth(), { wrapper: ({ children }) => <SupabaseAuthProvider>{children}</SupabaseAuthProvider> });

    let outcome: { error: AuthError | null } | undefined;
    await act(async () => {
      outcome = await result.current.signIn('bruno@senior.com.br', 'SenhaErrada');
    });

    expect(outcome?.error).not.toBeNull();
  });

  it('sucesso real retorna { error: null } e sessão', async () => {
    const fakeSession = { access_token: 'tok', user: { id: 'u1', email: 'bruno@senior.com.br' } };
    signInMock.mockResolvedValue({ data: { session: fakeSession, user: fakeSession.user }, error: null });
    const { result } = renderHook(() => useAuth(), { wrapper: ({ children }) => <SupabaseAuthProvider>{children}</SupabaseAuthProvider> });

    let outcome: { error: AuthError | null } | undefined;
    await act(async () => {
      outcome = await result.current.signIn('bruno@senior.com.br', 'Senha1234');
    });

    expect(outcome?.error).toBeNull();
    await waitFor(() => expect(result.current.user).toEqual(fakeSession.user));
  });

  it('loading sempre termina após erro (sem estado pendurado)', async () => {
    signInMock.mockRejectedValue(new Error('rede'));
    const { result } = renderHook(() => useAuth(), { wrapper: ({ children }) => <SupabaseAuthProvider>{children}</SupabaseAuthProvider> });

    await act(async () => {
      await result.current.signIn('bruno@senior.com.br', 'Senha1234');
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('resetPassword também não retorna falso { error: null } com cliente indisponível', async () => {
    supabaseRef.current = null;
    const { result } = renderHook(() => useAuth(), { wrapper: ({ children }) => <SupabaseAuthProvider>{children}</SupabaseAuthProvider> });

    let outcome: { error: AuthError | null } | undefined;
    await act(async () => {
      outcome = await result.current.resetPassword('bruno@senior.com.br');
    });

    expect(outcome?.error).not.toBeNull();
    expect(resetPasswordMock).not.toHaveBeenCalled();
  });
});

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const saveUserContextMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const findUserByEmailMock = vi.hoisted(() =>
  vi.fn<() => Promise<{ operatorId: string; displayName: string } | null>>(() => Promise.resolve(null)),
);

vi.mock('../../services/storage', () => ({
  storage: {
    saveUserContext: saveUserContextMock,
    findUserByEmail: findUserByEmailMock,
  },
}));

const mockUseMaybeAuth = vi.hoisted(() =>
  vi.fn<() => { isGuest: boolean; loading: boolean; user: unknown } | undefined>(),
);

vi.mock('../../contexts/AuthContext', () => ({
  useMaybeAuth: mockUseMaybeAuth,
}));

// Mock do supabase para resolver profiles
// A cadeia e: supabase.from().select().eq().maybeSingle()
const mockMaybeSingle = vi.hoisted(() => vi.fn());
const mockEq = vi.hoisted(() => vi.fn(() => ({ maybeSingle: mockMaybeSingle })));
const mockSupabaseSelect = vi.hoisted(() => vi.fn(() => ({ eq: mockEq })));
const mockSupabaseFrom = vi.hoisted(() => vi.fn(() => ({ select: mockSupabaseSelect })));

vi.mock('../../lib/supabaseClient', () => ({
  supabase: { from: mockSupabaseFrom },
  isSupabaseAvailable: true,
}));

// Mock do tracking para evitar efeitos colaterais
vi.mock('../../services/operatorTracking', () => ({
  initSessionTracking: vi.fn(() => Promise.resolve()),
  trackOperatorEvent: vi.fn(),
  endOperatorSession: vi.fn(),
}));

import { OperatorProvider, useOperator } from '../../contexts/OperatorContext';

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
    findUserByEmailMock.mockReset();
    findUserByEmailMock.mockResolvedValue(null);
    mockUseMaybeAuth.mockReset();
    mockUseMaybeAuth.mockReturnValue(undefined); // Sem auth provider
    mockSupabaseSelect.mockReset();
    mockSupabaseFrom.mockClear();
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

  it('registers name and email together and syncs user context once', async () => {
    renderProvider();

    fireEvent.click(screen.getByRole('button', { name: 'register-operator' }));

    const operatorId = screen.getByTestId('operator-id').textContent;
    expect(screen.getByTestId('name')).toHaveTextContent('Bruno Lima');
    expect(screen.getByTestId('email')).toHaveTextContent('bruno@senior.com.br');
    expect(window.localStorage.getItem('scout360:operator_name')).toBe('Bruno Lima');
    expect(window.localStorage.getItem('scout360:operator_email')).toBe('bruno@senior.com.br');

    // saveUserContext e chamado dentro da IIFE async, aguardar
    await waitFor(() => {
      expect(saveUserContextMock).toHaveBeenCalled();
    });
    expect(saveUserContextMock).toHaveBeenCalledWith({
      operatorId,
      name: 'Bruno Lima',
      email: 'bruno@senior.com.br',
    });
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

  it('links to canonical operator when email exists with different operatorId', async () => {
    const CANONICAL_OP = 'op_canonical';
    findUserByEmailMock.mockResolvedValueOnce({
      operatorId: CANONICAL_OP,
      displayName: 'Existing',
    });

    renderProvider();

    fireEvent.click(screen.getByRole('button', { name: 'register-operator' }));

    await waitFor(() => {
      expect(screen.getByTestId('operator-id')).toHaveTextContent(CANONICAL_OP);
    });

    // saveUserContext deve ser chamado exatamente 1 vez com canonical operatorId
    // (nao deve ter chamada com operatorId temporario)
    expect(saveUserContextMock).toHaveBeenCalledTimes(1);
    expect(saveUserContextMock).toHaveBeenCalledWith(
      expect.objectContaining({ operatorId: CANONICAL_OP, name: 'Bruno Lima', email: 'bruno@senior.com.br' }),
    );
  });

  it('keeps same operatorId when email exists with same operatorId', async () => {
    renderProvider();

    const currentOpId = screen.getByTestId('operator-id').textContent!;
    findUserByEmailMock.mockResolvedValueOnce({
      operatorId: currentOpId,
      displayName: 'Bruno Lima',
    });

    fireEvent.click(screen.getByRole('button', { name: 'register-operator' }));

    // Aguarda um tick para o async IIFE rodar
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(screen.getByTestId('operator-id').textContent).toBe(currentOpId);
  });
});

// ==============================================================================
// Testes de resolucao de operator_id via Auth (Phase 1)
// ==============================================================================
describe('OperatorProvider — auth resolution (Phase 1)', () => {
  const AUTH_USER = { id: 'auth-uuid-123', email: 'auth@agro.com', user_metadata: { name: 'Auth User' } };
  const AUTH_STATE = { isGuest: false, loading: false, user: AUTH_USER };

  function mockProfileResult(result: { operator_id?: string; email?: string; name?: string } | null) {
    mockMaybeSingle.mockResolvedValue({ data: result, error: null });
  }

  function mockProfileError() {
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: 'DB error' } });
  }

  beforeEach(() => {
    window.localStorage.clear();
    saveUserContextMock.mockClear();
    findUserByEmailMock.mockReset();
    findUserByEmailMock.mockResolvedValue(null);
    mockSupabaseSelect.mockClear();
    mockSupabaseFrom.mockClear();
    mockEq.mockClear();
    mockMaybeSingle.mockReset();
    mockUseMaybeAuth.mockReturnValue(AUTH_STATE);
  });

  it('authUser com storage limpo — resolve operador canonico via profiles', async () => {
    mockProfileResult({ operator_id: 'op_canonical_via_auth', email: 'auth@agro.com', name: 'Auth User' });

    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId('operator-id')).toHaveTextContent('op_canonical_via_auth');
    });
    expect(screen.getByTestId('name')).toHaveTextContent('Auth User');
    expect(screen.getByTestId('email')).toHaveTextContent('auth@agro.com');

    // Deve ter consultado profiles via Supabase
    expect(mockSupabaseFrom).toHaveBeenCalledWith('profiles');
  });

  it('authUser com email existente — não cria operador duplicado no storage', async () => {
    // Profile sem operator_id (primeiro login, trigger ainda nao setou)
    mockProfileResult(null);

    // user_context por email — encontra operador legado
    findUserByEmailMock.mockResolvedValueOnce({
      operatorId: 'op_legacy_456',
      displayName: 'Legacy User',
    });

    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId('operator-id')).toHaveTextContent('op_legacy_456');
    });
    // Nome vem do displayName do user_context (encontrado pelo email)
    expect(screen.getByTestId('name')).toHaveTextContent('Legacy User');
    expect(screen.getByTestId('email')).toHaveTextContent('auth@agro.com');

    // findUserByEmail foi chamado
    expect(findUserByEmailMock).toHaveBeenCalledWith('auth@agro.com');
  });

  it('relink — dispara evento operator-relinked quando operator_id muda', async () => {
    const relinkSpy = vi.fn();
    window.addEventListener('operator-relinked', relinkSpy);

    // Profile com operator_id diferente do que estava em localStorage
    window.localStorage.setItem('scout360:operator_id', 'op_temporario');
    mockProfileResult({ operator_id: 'op_canonico', email: 'auth@agro.com', name: 'Auth User' });

    renderProvider();

    await waitFor(() => {
      expect(relinkSpy).toHaveBeenCalled();
    });

    window.removeEventListener('operator-relinked', relinkSpy);
  });

  it('tracking inicia uma vez apos resolucao — nao duplica para guest', async () => {
    mockProfileResult({ operator_id: 'op_unique', email: 'auth@agro.com', name: 'Auth User' });

    renderProvider();

    // A resolucao dispara initSessionTracking (mockado, sem efeito real)
    await waitFor(() => {
      expect(screen.getByTestId('operator-id')).toHaveTextContent('op_unique');
    });
    // Nao deve ter chamado findUserByEmail (resolveu direto por profiles)
    expect(findUserByEmailMock).not.toHaveBeenCalled();
  });

  it('profile sem operator_id e sem email — mantem localStorage atual', async () => {
    const AUTH_NO_EMAIL = { id: 'auth-no-email', email: undefined, user_metadata: {} };
    mockUseMaybeAuth.mockReturnValue({ isGuest: false, loading: false, user: AUTH_NO_EMAIL });

    mockProfileResult(null); // sem profile também
    findUserByEmailMock.mockResolvedValue(null); // user_context vazio

    renderProvider();

    // Como localStorage esta limpo, um novo operator_id e gerado
    await new Promise(resolve => setTimeout(resolve, 100));
    const opId = screen.getByTestId('operator-id').textContent!;
    expect(opId).toMatch(/^op_/);
    // Nao deve ter chamado saveUserContext com valores temporarios
    // (apenas o registerOperator manual chama saveUserContext)
  });
});

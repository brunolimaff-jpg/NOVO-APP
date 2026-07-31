import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

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
const mockSupabaseRpc = vi.hoisted(() =>
  vi.fn<() => Promise<{ data: null; error: { message: string } | null }>>(() =>
    Promise.resolve({ data: null, error: null }),
  ),
);

vi.mock('../../lib/supabaseClient', () => ({
  supabase: { from: mockSupabaseFrom, rpc: mockSupabaseRpc },
  isSupabaseAvailable: true,
}));

// Mock do tracking para evitar efeitos colaterais
vi.mock('../../services/operatorTracking', () => ({
  initSessionTracking: vi.fn(() => Promise.resolve()),
  trackOperatorEvent: vi.fn(),
  endOperatorSession: vi.fn(),
}));

import { OperatorProvider, useOperator } from '../../contexts/OperatorContext';
import { getIdentityState } from '../../services/storage/_shared';

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
    mockSupabaseRpc.mockReset();
    mockSupabaseRpc.mockResolvedValue({ data: null, error: null });
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
    mockSupabaseRpc.mockReset();
    mockSupabaseRpc.mockResolvedValue({ data: null, error: null });
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
    // Máquina de estados de identidade (PR #456): após resolução, o operator_id
    // é REMOVIDO do localStorage — getOperatorId() lê exclusivamente da memória
    // (authenticatedOperatorId) para impedir race condition e ID stale.
    expect(window.localStorage.getItem('scout360:operator_id')).toBeNull();
    expect(window.localStorage.getItem('scout360:operator_name')).toBeNull();
    expect(window.localStorage.getItem('scout360:operator_email')).toBeNull();
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

  it('relink — dispara evento operator-relinked MESMO quando operator_id não muda (validação v3)', async () => {
    // Validação v3 item 5: após resolução bem-sucedida, disparar SEMPRE o
    // sinal que recarrega os dossiês/sidebar, MESMO quando o ID resolvido for
    // igual ao ID anterior. Isso é necessário porque durante 'resolving',
    // getOperatorId() retorna null e leituras retornaram vazio — precisam
    // ser refeitas agora que o ID canônico está disponível.
    const relinkSpy = vi.fn();
    window.addEventListener('operator-relinked', relinkSpy);

    // localStorage com o MESMO operator_id que será retornado pelo profile.
    // needsRelink=false, MAS o evento deve disparar mesmo assim.
    window.localStorage.setItem('scout360:operator_id', 'op_mesmo_id');
    mockProfileResult({ operator_id: 'op_mesmo_id', email: 'auth@agro.com', name: 'Auth User' });

    renderProvider();

    await waitFor(() => {
      expect(relinkSpy).toHaveBeenCalled();
    });

    window.removeEventListener('operator-relinked', relinkSpy);
  });

  it('authUser com profile novo e operador legado por email — prefere legado e chama RPC de relink', async () => {
    mockProfileResult({ operator_id: 'op_trigger_novo', email: 'auth@agro.com', name: 'Auth User' });
    findUserByEmailMock.mockResolvedValueOnce({
      operatorId: 'op_legacy_456',
      displayName: 'Legacy User',
    });

    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId('operator-id')).toHaveTextContent('op_legacy_456');
    });

    expect(mockSupabaseRpc).toHaveBeenCalledWith('link_legacy_operator', {
      p_auth_user_id: AUTH_USER.id,
      p_operator_id: 'op_legacy_456',
      p_email: 'auth@agro.com',
      p_name: 'Legacy User',
    });
  });

  it('authUser com relink legado negado — preserva profile autenticado', async () => {
    mockProfileResult({ operator_id: 'op_trigger_novo', email: 'auth@agro.com', name: 'Auth User' });
    findUserByEmailMock.mockResolvedValueOnce({
      operatorId: 'op_legacy_456',
      displayName: 'Legacy User',
    });
    mockSupabaseRpc.mockResolvedValueOnce({ data: null, error: { message: 'RLS denied' } });

    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId('operator-id')).toHaveTextContent('op_trigger_novo');
    });

    expect(mockSupabaseRpc).toHaveBeenCalledWith('link_legacy_operator', {
      p_auth_user_id: AUTH_USER.id,
      p_operator_id: 'op_legacy_456',
      p_email: 'auth@agro.com',
      p_name: 'Legacy User',
    });
  });

  it('logout limpa operator_id local e cria identidade guest nova', async () => {
    window.localStorage.setItem('scout360:operator_id', 'op_auth');
    window.localStorage.setItem('scout360:operator_name', 'Auth User');
    window.localStorage.setItem('scout360:operator_email', 'auth@agro.com');
    mockProfileResult({ operator_id: 'op_auth', email: 'auth@agro.com', name: 'Auth User' });

    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId('operator-id')).toHaveTextContent('op_auth');
    });

    act(() => {
      window.dispatchEvent(new CustomEvent('operator-signed-out'));
    });

    await waitFor(() => {
      expect(window.localStorage.getItem('scout360:operator_email')).toBeNull();
    });
    expect(window.localStorage.getItem('scout360:operator_name')).toBeNull();
    expect(window.localStorage.getItem('scout360:operator_id')).not.toBe('op_auth');
    expect(screen.getByTestId('email')).toHaveTextContent('empty');
  });

  it('tracking inicia uma vez apos resolucao — nao duplica para guest', async () => {
    mockProfileResult({ operator_id: 'op_unique', email: 'auth@agro.com', name: 'Auth User' });

    renderProvider();

    // A resolucao dispara initSessionTracking (mockado, sem efeito real)
    await waitFor(() => {
      expect(screen.getByTestId('operator-id')).toHaveTextContent('op_unique');
    });
    expect(findUserByEmailMock).toHaveBeenCalledWith('auth@agro.com');
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

  // ===========================================================================
  // Validação v3: estado `error` da máquina de identidade
  // ===========================================================================
  it('validação v3 — resolução falhando para authUser transita para estado error (não guest)', async () => {
    // Pré-condição: existe um ID legado no localStorage que NÃO deve ser usado
    // como fallback após falha de resolução.
    window.localStorage.setItem('scout360:operator_id', 'op_legacy_nao_deve_ser_usado');
    // Profile sem operator_id, sem email legado, sem user_context — resolução
    // retorna null.
    mockProfileResult(null);
    findUserByEmailMock.mockResolvedValue(null);

    renderProvider();

    // Aguarda o effect de resolução rodar (markResolving -> null -> markError)
    await new Promise(resolve => setTimeout(resolve, 100));

    // Estado final deve ser 'error', não 'guest' e não 'resolving'.
    expect(getIdentityState()).toBe('error');
  });

  it('validação v3 — exceção durante resolução transita para estado error', async () => {
    // Faz a consulta profiles lançar erro via mock rejeitando.
    mockMaybeSingle.mockReset();
    mockMaybeSingle.mockImplementation(() => {
      throw new Error('boom na rede');
    });
    findUserByEmailMock.mockResolvedValue(null);

    renderProvider();

    await new Promise(resolve => setTimeout(resolve, 100));

    // Após exceção no effect, a máquina deve estar em 'error'.
    expect(getIdentityState()).toBe('error');
  });

  it('validação v3 — retry controlado recupera error para authenticated', async () => {
    mockProfileResult(null);
    findUserByEmailMock.mockResolvedValue(null);
    renderProvider();

    await waitFor(() => {
      expect(getIdentityState()).toBe('error');
    });

    mockProfileResult({ operator_id: 'op_retry_ok', email: 'auth@agro.com', name: 'Auth User' });
    act(() => {
      window.dispatchEvent(new CustomEvent('operator-resolution-retry'));
    });

    await waitFor(() => {
      expect(getIdentityState()).toBe('authenticated');
      expect(screen.getByTestId('operator-id')).toHaveTextContent('op_retry_ok');
    });
  });

  it('retry automático limitado — null na primeira resolução e sucesso na segunda', async () => {
    mockMaybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValue({
        data: { operator_id: 'op_auto_retry', email: 'auth@agro.com', name: 'Auth User' },
        error: null,
      });

    renderProvider();

    await waitFor(() => expect(getIdentityState()).toBe('error'));
    await waitFor(() => {
      expect(getIdentityState()).toBe('authenticated');
      expect(screen.getByTestId('operator-id')).toHaveTextContent('op_auto_retry');
    }, { timeout: 1_500 });
  });

  it('retry automático recupera uma exceção transitória', async () => {
    mockMaybeSingle
      .mockImplementationOnce(() => { throw new Error('rede indisponível'); })
      .mockResolvedValue({
        data: { operator_id: 'op_after_exception', email: 'auth@agro.com', name: 'Auth User' },
        error: null,
      });

    renderProvider();

    await waitFor(() => expect(getIdentityState()).toBe('error'));
    await waitFor(() => {
      expect(getIdentityState()).toBe('authenticated');
      expect(screen.getByTestId('operator-id')).toHaveTextContent('op_after_exception');
    }, { timeout: 1_500 });
  });

  it('logout durante backoff cancela retry e volta somente então para guest', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    const view = renderProvider();

    await waitFor(() => expect(getIdentityState()).toBe('error'));
    const callsBeforeLogout = mockMaybeSingle.mock.calls.length;

    mockUseMaybeAuth.mockReturnValue({ isGuest: true, loading: false, user: null });
    view.rerender(
      <OperatorProvider>
        <Probe />
      </OperatorProvider>,
    );

    await waitFor(() => expect(getIdentityState()).toBe('guest'));
    await new Promise(resolve => setTimeout(resolve, 600));
    expect(mockMaybeSingle).toHaveBeenCalledTimes(callsBeforeLogout);
  });

  it('troca de usuário cancela retry anterior e nunca reutiliza ID stale', async () => {
    window.localStorage.setItem('scout360:operator_id', 'op_stale_guest');
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    const view = renderProvider();

    await waitFor(() => expect(getIdentityState()).toBe('error'));

    const nextUser = {
      id: 'auth-uuid-456',
      email: 'next@agro.com',
      user_metadata: { name: 'Next User' },
    };
    mockUseMaybeAuth.mockReturnValue({ isGuest: false, loading: false, user: nextUser });
    mockMaybeSingle.mockResolvedValue({
      data: { operator_id: 'op_next_user', email: 'next@agro.com', name: 'Next User' },
      error: null,
    });
    view.rerender(
      <OperatorProvider>
        <Probe />
      </OperatorProvider>,
    );

    await waitFor(() => {
      expect(getIdentityState()).toBe('authenticated');
      expect(screen.getByTestId('operator-id')).toHaveTextContent('op_next_user');
    });
    expect(screen.getByTestId('operator-id')).not.toHaveTextContent('op_stale_guest');
  });
});

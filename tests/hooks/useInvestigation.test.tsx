import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useInvestigation } from '../../hooks/useInvestigation';
import { Sender, type ChatSession } from '../../types';

const findExistingDossierMock = vi.hoisted(() => vi.fn());
const reuseDossierMock = vi.hoisted(() => vi.fn());
const saveDossierMock = vi.hoisted(() => vi.fn());
const getRemoteSessionMock = vi.hoisted(() => vi.fn());

vi.mock('../../lib/supabase/dossierDuplicate', () => ({
  findExistingDossier: findExistingDossierMock,
  reuseDossierForCurrentOperator: reuseDossierMock,
}));

vi.mock('../../services/storage', () => ({
  storage: {
    saveDossier: saveDossierMock,
    touchUserContext: vi.fn(),
    deleteDossier: vi.fn(),
  },
}));

vi.mock('../../services/sessionRemoteStore', () => ({ getRemoteSession: getRemoteSessionMock }));
vi.mock('../../services/operatorTracking', () => ({ trackOperatorEvent: vi.fn() }));

const existing = {
  id: 'source-id',
  title: 'Empresa Teste',
  empresaAlvo: 'Empresa Teste',
  createdAt: '2026-01-01T00:00:00.000Z',
  scoreOportunidade: 75,
  isOwner: false,
};

const copiedSession: ChatSession = {
  id: 'copy-id',
  title: 'Empresa Teste',
  empresaAlvo: 'Empresa Teste',
  cnpj: '12345678000199',
  modoPrincipal: 'default',
  scoreOportunidade: 75,
  resumoDossie: 'Resumo',
  createdAt: '2026-07-30T00:00:00.000Z',
  updatedAt: '2026-07-30T00:00:00.000Z',
  messages: [{ id: 'm1', sender: Sender.Bot, text: 'Conteúdo', timestamp: new Date() }],
};

function renderInvestigation() {
  const onOpenLoadedSession = vi.fn();
  const hook = renderHook(() => useInvestigation({
    mode: 'default',
    onDeepDive: vi.fn(),
    operatorId: 'op-b',
    onOpenLoadedSession,
  }));
  return { ...hook, onOpenLoadedSession };
}

describe('useInvestigation — copy-on-access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findExistingDossierMock.mockResolvedValue(existing);
    reuseDossierMock.mockResolvedValue({ dossierId: 'copy-id', content: copiedSession, wasCloned: true });
  });

  it('usa a RPC de descoberta ao iniciar investigação', async () => {
    const { result } = renderInvestigation();
    await act(() => result.current.handleStartInvestigation({
      companyName: 'Empresa Teste', cnpj: '12345678000199', city: 'Cuiabá', state: 'MT',
    }));
    expect(findExistingDossierMock).toHaveBeenCalledWith('12345678000199', 'Empresa Teste', 'op-b');
    expect(result.current.duplicateDossier).toEqual(existing);
  });

  it('mantém modal durante loading e injeta diretamente a sessão copiada', async () => {
    let resolveReuse: ((value: unknown) => void) | undefined;
    reuseDossierMock.mockReturnValue(new Promise(resolve => { resolveReuse = resolve; }));
    const { result, onOpenLoadedSession } = renderInvestigation();
    act(() => result.current.setDuplicateDossier(existing));

    let accessPromise: Promise<void>;
    act(() => { accessPromise = result.current.handleAccessExistingDossier(); });
    expect(result.current.isAccessingDossier).toBe(true);
    expect(result.current.duplicateDossier).toEqual(existing);

    await act(async () => {
      resolveReuse?.({ dossierId: 'copy-id', content: copiedSession, wasCloned: true });
      await accessPromise!;
    });
    expect(onOpenLoadedSession).toHaveBeenCalledWith(copiedSession);
    expect(result.current.duplicateDossier).toBeNull();
    expect(saveDossierMock).not.toHaveBeenCalled();
    expect(getRemoteSessionMock).not.toHaveBeenCalled();
  });

  it('mantém erro visível e não fecha o modal quando a RPC falha', async () => {
    reuseDossierMock.mockRejectedValue(new Error('Acesso negado'));
    const { result, onOpenLoadedSession } = renderInvestigation();
    act(() => result.current.setDuplicateDossier(existing));
    await act(() => result.current.handleAccessExistingDossier());
    expect(result.current.accessDossierError).toBe('Acesso negado');
    expect(result.current.duplicateDossier).toEqual(existing);
    expect(onOpenLoadedSession).not.toHaveBeenCalled();
  });

  it('bloqueia clique duplo com uma única chamada à RPC', async () => {
    let resolveReuse: ((value: unknown) => void) | undefined;
    reuseDossierMock.mockReturnValue(new Promise(resolve => { resolveReuse = resolve; }));
    const { result } = renderInvestigation();
    act(() => result.current.setDuplicateDossier(existing));
    let first: Promise<void>;
    act(() => {
      first = result.current.handleAccessExistingDossier();
      void result.current.handleAccessExistingDossier();
    });
    expect(reuseDossierMock).toHaveBeenCalledOnce();
    await act(async () => {
      resolveReuse?.({ dossierId: 'copy-id', content: copiedSession, wasCloned: true });
      await first!;
    });
  });
});

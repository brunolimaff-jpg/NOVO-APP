import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useInvestigation } from '../../hooks/useInvestigation';
import { Sender, type ChatSession } from '../../types';
import type { ExistingDossier } from '../../lib/supabase/dossierDuplicate';

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

const existing: ExistingDossier = {
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

function renderInvestigation(operatorId = 'op-b') {
  const onOpenLoadedSession = vi.fn();
  const onDeepDive = vi.fn().mockResolvedValue(undefined);
  const hook = renderHook(() => useInvestigation({
    mode: 'default',
    onDeepDive,
    operatorId,
    onOpenLoadedSession,
  }));
  return { ...hook, onOpenLoadedSession, onDeepDive };
}

describe('useInvestigation — copy-on-access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findExistingDossierMock.mockResolvedValue({ status: 'FOUND', dossier: existing });
    reuseDossierMock.mockResolvedValue({ dossierId: 'copy-id', content: copiedSession, wasCloned: true });
  });

  it('usa a RPC de descoberta ao iniciar investigação', async () => {
    const { result, onDeepDive } = renderInvestigation();
    await act(() => result.current.handleStartInvestigation({
      companyName: 'Empresa Teste', cnpj: '12345678000199', city: 'Cuiabá', state: 'MT',
    }));
    expect(findExistingDossierMock).toHaveBeenCalledWith('12345678000199', 'Empresa Teste', 'op-b');
    expect(result.current.duplicateDossier).toEqual(existing);
    expect(onDeepDive).not.toHaveBeenCalled();
  });

  it('somente NOT_FOUND permite iniciar geração', async () => {
    findExistingDossierMock.mockResolvedValue({ status: 'NOT_FOUND' });
    const { result, onDeepDive } = renderInvestigation();

    await act(() => result.current.handleStartInvestigation({
      companyName: 'Empresa Nova', cnpj: null, city: 'Cuiabá', state: 'MT',
    }));

    expect(onDeepDive).toHaveBeenCalledOnce();
    expect(result.current.discoveryError).toBeNull();
  });

  it.each(['UNAVAILABLE', 'ACCESS_DENIED'] as const)(
    '%s bloqueia geração paga e mostra erro genérico',
    async status => {
      findExistingDossierMock.mockResolvedValue({ status });
      const { result, onDeepDive } = renderInvestigation();

      await act(() => result.current.handleStartInvestigation({
        companyName: 'Empresa Bloqueada', cnpj: null, city: 'Cuiabá', state: 'MT',
      }));

      expect(onDeepDive).not.toHaveBeenCalled();
      expect(result.current.discoveryError).toBe(
        'Não foi possível verificar dossiês existentes. Tente novamente antes de iniciar uma nova pesquisa.',
      );
    },
  );

  it('operatorId vazio falha fechado sem iniciar geração', async () => {
    findExistingDossierMock.mockResolvedValue({ status: 'UNAVAILABLE' });
    const { result, onDeepDive } = renderInvestigation('');

    await act(() => result.current.handleStartInvestigation({
      companyName: 'Empresa', cnpj: null, city: 'Cuiabá', state: 'MT',
    }));

    expect(onDeepDive).not.toHaveBeenCalled();
    expect(result.current.discoveryError).not.toBeNull();
  });

  it('nova submissão limpa o erro e tenta descoberta novamente', async () => {
    findExistingDossierMock
      .mockResolvedValueOnce({ status: 'UNAVAILABLE' })
      .mockResolvedValueOnce({ status: 'NOT_FOUND' });
    const { result, onDeepDive } = renderInvestigation();
    const payload = { companyName: 'Empresa Retry', cnpj: null, city: 'Cuiabá', state: 'MT' };

    await act(() => result.current.handleStartInvestigation(payload));
    expect(result.current.discoveryError).not.toBeNull();

    await act(() => result.current.handleStartInvestigation(payload));
    expect(result.current.discoveryError).toBeNull();
    expect(findExistingDossierMock).toHaveBeenCalledTimes(2);
    expect(onDeepDive).toHaveBeenCalledOnce();
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
    expect(reuseDossierMock).toHaveBeenCalledWith('source-id');
    expect(result.current.duplicateDossier).toBeNull();
    expect(saveDossierMock).not.toHaveBeenCalled();
    expect(getRemoteSessionMock).not.toHaveBeenCalled();
  });

  it('abre o dossiê próprio retornado pela descoberta sem criar cópia no cliente', async () => {
    const ownedSession: ChatSession = { ...copiedSession, id: 'source-id' };
    reuseDossierMock.mockResolvedValue({
      dossierId: 'source-id',
      content: ownedSession,
      wasCloned: false,
    });
    const ownedDossier = { ...existing, isOwner: true };
    const { result, onOpenLoadedSession } = renderInvestigation();
    act(() => result.current.setDuplicateDossier(ownedDossier));

    await act(() => result.current.handleAccessExistingDossier());

    expect(reuseDossierMock).toHaveBeenCalledWith('source-id');
    expect(onOpenLoadedSession).toHaveBeenCalledWith(ownedSession);
    expect(saveDossierMock).not.toHaveBeenCalled();
    expect(getRemoteSessionMock).not.toHaveBeenCalled();
  });

  it('mantém erro visível e não fecha o modal quando a RPC falha', async () => {
    reuseDossierMock.mockRejectedValue(new Error('Não foi possível abrir o dossiê. Tente novamente.'));
    const { result, onOpenLoadedSession } = renderInvestigation();
    act(() => result.current.setDuplicateDossier(existing));
    await act(() => result.current.handleAccessExistingDossier());
    expect(result.current.accessDossierError).toBe('Não foi possível abrir o dossiê. Tente novamente.');
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

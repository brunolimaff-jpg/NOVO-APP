import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { ChatStoreProvider, useChatStore } from '../../stores/chatStore';
import {
  clearActiveDossierRunsMemoryForTest,
  setActiveDossierRun,
  clearAllActiveDossierRunsForTest,
  peekPersistedActiveDossierRuns,
} from '../../features/dossier/active-run-registry';
import { useInterruptedDossierRunRecovery } from '../../hooks/useInterruptedDossierRunRecovery';
import type { ChatSession, Message } from '../../types';

/**
 * Teste integrado do boot real pós-reload (BRU-7 — Alternativa A).
 *
 * Exercita o fluxo REAL do App sem mockar updateSessionById:
 * ChatStoreProvider real → useSessionStorage.loadSessions() (storage stubado
 * apenas no Supabase) → isInitialized=true → useInterruptedDossierRunRecovery
 * → updateSessionById real do store → mensagem de interrupção aplicada.
 *
 * Cobre a corrida que o auditor identificou: a recuperação só roda depois
 * das sessões carregadas, e o registro só é consumido após aplicação.
 */

const { storageGetDossiersMock } = vi.hoisted(() => ({ storageGetDossiersMock: vi.fn() }));

// Stuba APENAS a superfície de storage (Supabase). updateSessionById vem do
// ChatStoreProvider real — não é mockado.
vi.mock('../../services/storage', () => ({
  storage: {
    getDossiers: () => storageGetDossiersMock(),
    saveAllDossiers: vi.fn().mockResolvedValue(undefined),
  },
}));

beforeEach(() => {
  // jsdom já expõe sessionStorage nativo; limpa entre testes.
  window.sessionStorage.clear();
  clearAllActiveDossierRunsForTest();
  storageGetDossiersMock.mockResolvedValue([]);
});

afterEach(() => {
  window.sessionStorage.clear();
  clearAllActiveDossierRunsForTest();
  vi.clearAllMocks();
});

const makeSession = (id: string): ChatSession => ({
  id,
  title: 'Sessão',
  empresaAlvo: 'Empresa Teste',
  cnpj: '04733767000180',
  modoPrincipal: null,
  scoreOportunidade: null,
  resumoDossie: null,
  createdAt: '2026-08-06T10:00:00.000Z',
  updatedAt: '2026-08-06T10:00:00.000Z',
  messages: [
    {
      id: 'msg-1',
      sender: 'user',
      text: 'Monte o dossiê da Empresa Teste',
      timestamp: new Date('2026-08-06T10:00:00.000Z'),
    } as Message,
    {
      id: 'msg-2',
      sender: 'bot',
      text: 'Dossiê anterior preservado — conteúdo persistido antes do reload.',
      timestamp: new Date('2026-08-06T10:05:00.000Z'),
    } as Message,
  ],
});

function BootHarness() {
  const { isInitialized, sessions, updateSessionById, setIsLoading, resetLoadingProgress } = useChatStore();

  useInterruptedDossierRunRecovery({ isInitialized, updateSessionById, setIsLoading, resetLoadingProgress });

  const interrupted = sessions
    .flatMap(s => s.messages)
    .filter(m => m.id.startsWith('dossier-interrupted-'));

  return (
    <div>
      <div data-testid="initialized">{String(isInitialized)}</div>
      <div data-testid="session-count">{sessions.length}</div>
      <div data-testid="interrupted-count">{interrupted.length}</div>
      <div data-testid="interrupted-text">{interrupted[0] ? String(interrupted[0].text) : ''}</div>
    </div>
  );
}

describe('boot integrado pós-reload (ChatStoreProvider real)', () => {
  it('aplica a mensagem de interrupção à sessão carregada após o boot', async () => {
    // Supabase retorna a sessão — simula sessão persistida antes do reload
    storageGetDossiersMock.mockResolvedValue([makeSession('s1')]);
    // run ativo persistido no sessionStorage (sobreviveu ao reload)
    setActiveDossierRun({ sessionId: 's1', runId: 'run-1', leaseOwner: 'l', clientAttemptId: 'a' });
    // Simula reload real: contexto local perdido, sessionStorage preservado.
    clearActiveDossierRunsMemoryForTest();

    render(
      <ChatStoreProvider>
        <BootHarness />
      </ChatStoreProvider>,
    );

    // isInitialized só é true após loadSessions resolver
    await waitFor(() => expect(screen.getByTestId('initialized').textContent).toBe('true'));
    await waitFor(() => expect(screen.getByTestId('session-count').textContent).toBe('1'));

    // a mensagem de interrupção foi aplicada à sessão (updateSessionById real encontrou a sessão)
    await waitFor(() => expect(screen.getByTestId('interrupted-count').textContent).toBe('1'));
    expect(screen.getByTestId('interrupted-text').textContent).toContain('interrompida');
    expect(screen.getByTestId('interrupted-text').textContent).toContain('Nenhum dossiê foi marcado como concluído');

    // registro consumido (aplicado com sucesso)
    expect(peekPersistedActiveDossierRuns().length).toBe(0);
  });

  it('preserva o registro quando a sessão carregada não existe (sem falso consumo)', async () => {
    // Supabase retorna sessões, mas NENHUMA com o id do run persistido
    storageGetDossiersMock.mockResolvedValue([makeSession('outra-sessao')]);
    setActiveDossierRun({ sessionId: 's1', runId: 'run-1', leaseOwner: 'l', clientAttemptId: 'a' });
    // Simula reload real: contexto local perdido, sessionStorage preservado.
    clearActiveDossierRunsMemoryForTest();

    render(
      <ChatStoreProvider>
        <BootHarness />
      </ChatStoreProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('initialized').textContent).toBe('true'));

    // nenhuma mensagem de interrupção aplicada (sessão 's1' não existe no store real)
    expect(screen.getByTestId('interrupted-count').textContent).toBe('0');

    // registro NÃO foi consumido — permanece para quando a sessão existir
    expect(peekPersistedActiveDossierRuns().length).toBe(1);
  });
});

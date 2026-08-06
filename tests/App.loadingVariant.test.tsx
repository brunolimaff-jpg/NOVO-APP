import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { ChatStoreProvider } from '../stores/chatStore';
import { DossierStoreProvider } from '../stores/dossierStore';

const { deepDiveErrorRef, deepDiveAccessRef, sendMessageToLlmMock, generateDossierModuleMock, setSessionsMock, lifecycleMocks, waterfallRunMock } =
  vi.hoisted(() => ({
    deepDiveErrorRef: { current: null as unknown },
    deepDiveAccessRef: { current: true },
    sendMessageToLlmMock: vi.fn(async () => ({
      text: 'Resposta consolidada',
      sources: [],
      suggestions: [],
      scorePorta: null,
      ghostReason: null,
    })),
    generateDossierModuleMock: vi.fn(),
    setSessionsMock: vi.fn(),
    lifecycleMocks: {
      create: vi.fn(),
      acquire: vi.fn(),
      start: vi.fn(() => vi.fn()),
      set: vi.fn(),
      clear: vi.fn(),
      getRun: vi.fn(async () => ({
        run_id: 'run-1',
        status: 'RUNNING',
        lease_owner: 'lease-owner-1',
        lease_expires_at: new Date(Date.now() + 45_000).toISOString(),
      })),
      renew: vi.fn(async () => ({
        run_id: 'run-1',
        status: 'RUNNING',
        lease_owner: 'lease-owner-1',
        lease_expires_at: new Date(Date.now() + 45_000).toISOString(),
      })),
      markFailed: vi.fn(async () => ({ status: 'FAILED', runId: 'run-1' })),
      markCompleted: vi.fn(async () => ({ status: 'COMPLETED', runId: 'run-1' })),
      markCancelled: vi.fn(async () => ({ status: 'CANCELLED', runId: 'run-1' })),
      release: vi.fn(async () => ({})),
    },
    waterfallRunMock: vi.fn(),
  }));

vi.mock('../components/ChatInterface', () => ({
  default: (props: {
    onDeepDive?: (display: string, hidden: string, forcedCompanyName?: string) => Promise<void>;
    onSendMessage?: (text: string, displayText?: string, hintedCompanyOverride?: string | null) => Promise<void>;
    loadingVariant?: string;
    loadingPinnedLabel?: string | null;
  }) => (
    <div data-testid="chat-interface">
      <span data-testid="chat-loading-variant">{props.loadingVariant ?? 'missing'}</span>
      <span data-testid="chat-pinned-label">{props.loadingPinnedLabel ?? 'none'}</span>
      <button
        type="button"
        onClick={async () => {
          deepDiveErrorRef.current = null;
          try {
            await props.onSendMessage?.('Investigar Acme Agro');
          } catch (error) {
            deepDiveErrorRef.current = error;
          }
        }}
      >
        trigger-default-send
      </button>
      <button
        type="button"
        onClick={async () => {
          deepDiveErrorRef.current = null;
          try {
            await props.onDeepDive?.('Dossiê completo: Tech Stack', 'PROMPT_TECH', 'Acme Agro');
          } catch (error) {
            deepDiveErrorRef.current = error;
          }
        }}
      >
        trigger-deep-dive
      </button>
      <button
        type="button"
        onClick={async () => {
          deepDiveErrorRef.current = null;
          try {
            await props.onDeepDive?.('Investigando Acme Agro', 'PROMPT_INICIAL', 'Acme Agro');
          } catch (error) {
            deepDiveErrorRef.current = error;
          }
        }}
      >
        trigger-initial-investigation
      </button>
    </div>
  ),
}));

vi.mock('../components/LoadingSmart', () => ({
  default: () => <div data-testid="loading-smart" />,
}));

vi.mock('../components/ToastContainer', () => ({
  default: () => <div data-testid="toast-container" />,
}));

vi.mock('../components/EmailModal', () => ({
  EmailModal: () => <div data-testid="email-modal" />,
}));

vi.mock('../components/FollowUpModal', () => ({
  FollowUpModal: () => <div data-testid="follow-up-modal" />,
}));

vi.mock('../components/InstallPrompt', () => ({
  default: () => <div data-testid="install-prompt" />,
}));

vi.mock('../contexts/OperatorContext', () => ({
  useOperator: () => ({
    name: 'Bruno Lima',
    email: 'bruno@senior.com.br',
    operatorId: 'op-1',
    loading: false,
    setName: vi.fn(),
    setEmail: vi.fn(),
    registerOperator: vi.fn(),
    clearName: vi.fn(),
    linkToExistingOperator: vi.fn(),
  }),
  useMaybeOperator: () => ({
    name: 'Bruno Lima',
    email: 'bruno@senior.com.br',
    operatorId: 'op-1',
    loading: false,
    setName: vi.fn(),
    setEmail: vi.fn(),
    registerOperator: vi.fn(),
    clearName: vi.fn(),
    linkToExistingOperator: vi.fn(),
  }),
}));

vi.mock('../contexts/ModeContext', () => ({
  useMode: () => ({
    mode: 'investigacao',
    systemInstruction: 'SYSTEM',
  }),
  useMaybeMode: () => ({
    mode: 'investigacao',
    systemInstruction: 'SYSTEM',
  }),
}));

vi.mock('../hooks/useOffline', () => ({
  useOffline: () => ({
    isOnline: true,
    wasOffline: false,
    clearWasOffline: vi.fn(),
  }),
}));

vi.mock('../hooks/useToast', () => ({
  useToast: () => ({
    toasts: [],
    toast: { success: vi.fn(), error: vi.fn() },
    dismiss: vi.fn(),
  }),
}));

vi.mock('../hooks/useTheme', () => ({
  useTheme: () => ({
    isDarkMode: false,
    toggleTheme: vi.fn(),
  }),
}));

vi.mock('../hooks/useSessionStorage', () => ({
  useSessionStorage: () => ({
    sessions: [],
    setSessions: setSessionsMock,
    sessionsRef: { current: [] },
    isInitialized: true,
    setIsInitialized: vi.fn(),
    loadSessions: vi.fn(),
  }),
}));

vi.mock('../hooks/useUpdateNotification', () => ({
  useUpdateNotification: () => ({
    updateAvailable: false,
    currentVersion: null,
    newVersion: null,
    dismissUpdate: vi.fn(),
    updateNow: vi.fn(),
  }),
}));

vi.mock('../hooks/useAppInitialization', () => ({
  useAppInitialization: vi.fn(),
}));

vi.mock('../features/chat/session-controller', () => ({
  useSessionManager: () => ({
    handleNewSession: vi.fn(),
    handleSelectSession: vi.fn(),
    handleDeleteSession: vi.fn(),
  }),
  useSessionRemoteSave: () => ({
    isSavingRemote: false,
    remoteSaveStatus: 'idle',
    setRemoteSaveStatus: vi.fn(),
    handleSaveRemote: vi.fn(),
  }),
}));

vi.mock('../features/chat/feedback-actions', () => ({
  useChatFeedbackActions: () => ({
    handleReportError: vi.fn(),
    handleFeedback: vi.fn(),
    handleSendFeedback: vi.fn(),
    handleSectionFeedback: vi.fn(),
    handleToggleMessageSources: vi.fn(),
  }),
}));

function renderApp() {
  return render(
    <ChatStoreProvider>
      <DossierStoreProvider>
        <App />
      </DossierStoreProvider>
    </ChatStoreProvider>,
  );
}

vi.mock('../utils/featureAccess', () => ({
  getFeatureAccess: () => ({
    dashboard: false,
    clientLookup: false,
    deepDive: deepDiveAccessRef.current,
  }),
}));

vi.mock('../features/dossier/waterfall-orchestrator', () => ({
  useDossierWaterfallOrchestrator: () => ({ runMegaPromptWaterfall: waterfallRunMock }),
}));

vi.mock('../services/llmService', () => ({
  sendMessageToLlm: sendMessageToLlmMock,
  generateContinuityQuestion: vi.fn(),
  generateDossierModule: generateDossierModuleMock,
  getIsolatedBenchmark: vi.fn(),
}));

// Lifecycle do dossiê (message-orchestrator real): sem Supabase disponível no
// ambiente de teste, o fluxo lançaria "Supabase indisponível para lifecycle".
// Mesmo padrão de tests/features/chat/message-orchestrator.test.ts.
vi.mock('../lib/supabase/dossierRuns', () => ({
  DOSSIER_RUN_RPC_TIMEOUT_MS: 15_000,
  createOrGetDossierRun: lifecycleMocks.create,
  acquireDossierRunLease: lifecycleMocks.acquire,
  markDossierRunFailed: lifecycleMocks.markFailed,
  markDossierRunCompleted: lifecycleMocks.markCompleted,
  markDossierRunCancelled: lifecycleMocks.markCancelled,
  releaseDossierRunLease: lifecycleMocks.release,
  getDossierRun: lifecycleMocks.getRun,
  renewDossierRunLease: lifecycleMocks.renew,
}));
vi.mock('../features/dossier/dossier-run-heartbeat', () => ({ startDossierRunHeartbeat: lifecycleMocks.start }));
vi.mock('../features/dossier/active-run-registry', () => ({ setActiveDossierRun: lifecycleMocks.set, clearActiveDossierRun: lifecycleMocks.clear }));

describe('App loading variant regression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deepDiveErrorRef.current = null;
    deepDiveAccessRef.current = true;
    lifecycleMocks.create.mockResolvedValue({ run_id: 'run-1', status: 'RUNNING', owner_id: 'op-1' });
    lifecycleMocks.acquire.mockResolvedValue({
      run_id: 'run-1',
      status: 'RUNNING',
      lease_owner: 'lease-owner-1',
      lease_expires_at: new Date(Date.now() + 45_000).toISOString(),
    });
    // Waterfall sintético: chama o gerador de módulos (intenção original do
    // teste) e retorna COMPLETED — o teste cobre o loading, não o waterfall.
    waterfallRunMock.mockImplementation(async () => {
      await generateDossierModuleMock();
      return { status: 'COMPLETED' };
    });
  });

  it('renderiza o shell do chat sem ReferenceError de loadingVariant', () => {
    renderApp();

    expect(screen.getByTestId('chat-interface')).toBeInTheDocument();
    expect(screen.getByTestId('chat-loading-variant')).toBeInTheDocument();
  });

  it('mantém a primeira investigação em hero e mostra o LoadingSmart global', async () => {
    sendMessageToLlmMock.mockImplementationOnce(() => new Promise(() => {}));

    renderApp();

    fireEvent.click(screen.getByRole('button', { name: 'trigger-default-send' }));

    await waitFor(() => {
      expect(setSessionsMock).toHaveBeenCalled();
      expect(screen.getByTestId('chat-loading-variant')).toHaveTextContent('inline');
      expect(screen.queryByTestId('loading-smart')).not.toBeInTheDocument();
    });

    expect(deepDiveErrorRef.current).toBeNull();
  });

  it('executa deep dive sem quebrar por requestKind ou fixedLoadingLine indefinidos', async () => {
    sendMessageToLlmMock.mockImplementationOnce(() => new Promise(() => {}));

    renderApp();

    fireEvent.click(screen.getByRole('button', { name: 'trigger-deep-dive' }));

    await waitFor(() => {
      expect(setSessionsMock).toHaveBeenCalled();
      expect(screen.getByTestId('chat-loading-variant')).toHaveTextContent('inline');
      expect(screen.getByTestId('chat-pinned-label')).toHaveTextContent('Deep Dive em andamento: Tech Stack');
      expect(screen.queryByTestId('loading-smart')).not.toBeInTheDocument();
    });

    expect(generateDossierModuleMock).not.toHaveBeenCalled();
    expect(deepDiveErrorRef.current).toBeNull();
  });

  it('mantem investigacao inicial via onDeepDive no fluxo padrao (sem label de deep dive)', async () => {
    renderApp();

    fireEvent.click(screen.getByRole('button', { name: 'trigger-initial-investigation' }));

    await waitFor(() => {
      expect(setSessionsMock).toHaveBeenCalled();
      expect(screen.getByTestId('chat-loading-variant')).toHaveTextContent('inline');
      expect(screen.getByTestId('chat-pinned-label')).toHaveTextContent('none');
      expect(screen.queryByTestId('loading-smart')).not.toBeInTheDocument();
    });

    // O handleDeepDive monta "Dossiê completo de [empresa]..." → caminho
    // isMegaPrompt → waterfall sintético → generateDossierModule.
    expect(generateDossierModuleMock).toHaveBeenCalled();
    expect(deepDiveErrorRef.current).toBeNull();
  });

  it('bloqueia Deep Dive de tópico quando feature flag está desligada', async () => {
    deepDiveAccessRef.current = false;
    renderApp();
    setSessionsMock.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'trigger-deep-dive' }));

    await waitFor(() => {
      expect(setSessionsMock).not.toHaveBeenCalled();
      expect(screen.getByTestId('chat-pinned-label')).toHaveTextContent('none');
    });

    expect(deepDiveErrorRef.current).toBeNull();
  });
});

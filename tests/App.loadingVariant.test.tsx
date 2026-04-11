import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';

const {
  deepDiveErrorRef,
  deepDiveAccessRef,
  sendMessageToGeminiMock,
  generateDossierModuleMock,
  setSessionsMock,
} = vi.hoisted(() => ({
  deepDiveErrorRef: { current: null as unknown },
  deepDiveAccessRef: { current: true },
  sendMessageToGeminiMock: vi.fn(async () => ({
    text: 'Resposta consolidada',
    sources: [],
    suggestions: [],
    scorePorta: null,
    ghostReason: null,
  })),
  generateDossierModuleMock: vi.fn(),
  setSessionsMock: vi.fn(),
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

vi.mock('../components/CRMView', () => ({
  CRMView: () => <div data-testid="crm-view" />,
}));

vi.mock('../components/AdminDash', () => ({
  AdminDash: () => <div data-testid="admin-dash" />,
}));

vi.mock('../components/SuspenseWithError', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../contexts/OperatorContext', () => ({
  useOperator: () => ({
    name: 'Bruno Lima',
    operatorId: 'op-1',
    loading: false,
    setName: vi.fn(),
    clearName: vi.fn(),
  }),
}));

vi.mock('../contexts/ModeContext', () => ({
  useMode: () => ({
    mode: 'investigacao',
    systemInstruction: 'SYSTEM',
  }),
}));

vi.mock('../contexts/CRMContext', () => ({
  useCRM: () => ({
    cards: [],
    createCardFromSession: vi.fn(),
    moveCardToStage: vi.fn(),
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

vi.mock('../hooks/useRadar', () => ({
  useRadar: () => ({
    alerts: [],
    config: { isConfigured: false },
    unreadCount: 0,
    isScanning: false,
    lastScanAt: null,
    lastError: null,
    lastWarning: null,
    updateConfig: vi.fn(),
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
    dismissAlert: vi.fn(),
    forceScan: vi.fn(),
  }),
}));

vi.mock('../hooks/useAppInitialization', () => ({
  useAppInitialization: vi.fn(),
}));

vi.mock('../hooks/useSessionManager', () => ({
  useSessionManager: () => ({
    handleNewSession: vi.fn(),
    handleSelectSession: vi.fn(),
    handleDeleteSession: vi.fn(),
  }),
}));

vi.mock('../utils/featureAccess', () => ({
  getFeatureAccess: () => ({
    miniCRM: false,
    dashboard: false,
    integrityCheck: false,
    clientLookup: false,
    deepDive: deepDiveAccessRef.current,
    warRoom: false,
  }),
}));

vi.mock('../services/geminiService', () => ({
  sendMessageToGemini: sendMessageToGeminiMock,
  generateContinuityQuestion: vi.fn(),
  generateDossierModule: generateDossierModuleMock,
  getIsolatedBenchmark: vi.fn(),
}));

describe('App loading variant regression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deepDiveErrorRef.current = null;
    deepDiveAccessRef.current = true;
  });

  it('renderiza o shell do chat sem ReferenceError de loadingVariant', () => {
    render(<App />);

    expect(screen.getByTestId('chat-interface')).toBeInTheDocument();
    expect(screen.getByTestId('chat-loading-variant')).toHaveTextContent('hero');
  });

  it('mantém a primeira investigação em hero e mostra o LoadingSmart global', async () => {
    sendMessageToGeminiMock.mockImplementationOnce(() => new Promise(() => {}));

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'trigger-default-send' }));

    await waitFor(() => {
      expect(setSessionsMock).toHaveBeenCalled();
      expect(screen.getByTestId('chat-loading-variant')).toHaveTextContent('hero');
      expect(screen.getByTestId('loading-smart')).toBeInTheDocument();
    });

    expect(deepDiveErrorRef.current).toBeNull();
  });

  it('executa deep dive sem quebrar por requestKind ou fixedLoadingLine indefinidos', async () => {
    sendMessageToGeminiMock.mockImplementationOnce(() => new Promise(() => {}));

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'trigger-deep-dive' }));

    await waitFor(() => {
      expect(setSessionsMock).toHaveBeenCalled();
      expect(screen.getByTestId('chat-loading-variant')).toHaveTextContent('hero');
      expect(screen.getByTestId('chat-pinned-label')).toHaveTextContent('Deep Dive em andamento: Tech Stack');
      expect(screen.getByTestId('loading-smart')).toBeInTheDocument();
    });

    expect(generateDossierModuleMock).not.toHaveBeenCalled();
    expect(deepDiveErrorRef.current).toBeNull();
  });

  it('mantem investigacao inicial via onDeepDive no fluxo padrao (sem label de deep dive)', async () => {
    generateDossierModuleMock.mockImplementationOnce(() => new Promise(() => {}));

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'trigger-initial-investigation' }));

    await waitFor(() => {
      expect(setSessionsMock).toHaveBeenCalled();
      expect(screen.getByTestId('chat-loading-variant')).toHaveTextContent('hero');
      expect(screen.getByTestId('chat-pinned-label')).toHaveTextContent('none');
      expect(screen.getByTestId('loading-smart')).toBeInTheDocument();
    });

    expect(generateDossierModuleMock).toHaveBeenCalled();
    expect(deepDiveErrorRef.current).toBeNull();
  });

  it('bloqueia Deep Dive de tópico quando feature flag está desligada', async () => {
    deepDiveAccessRef.current = false;
    render(<App />);
    setSessionsMock.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'trigger-deep-dive' }));

    await waitFor(() => {
      expect(setSessionsMock).not.toHaveBeenCalled();
      expect(screen.getByTestId('chat-pinned-label')).toHaveTextContent('none');
    });

    expect(deepDiveErrorRef.current).toBeNull();
  });
});

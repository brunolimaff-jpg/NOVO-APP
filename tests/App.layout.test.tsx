import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';
import { ChatStoreProvider } from '../stores/chatStore';
import { DossierStoreProvider } from '../stores/dossierStore';

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
    toast: {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
    },
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
    setSessions: vi.fn(),
    sessionsRef: { current: [] },
    isInitialized: true,
    setIsInitialized: vi.fn(),
    loadSessions: vi.fn(),
  }),
  subscribeSessionPersistFailure: vi.fn(() => () => {}),
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

vi.mock('../features/radar', () => ({
  useRadar: () => ({
    alerts: [],
    config: {},
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

vi.mock('../contexts/OperatorContext', () => ({
  useOperator: () => ({
    name: 'Bruno',
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
    name: 'Bruno',
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
    systemInstruction: 'system',
  }),
  useMaybeMode: () => ({
    mode: 'investigacao',
    systemInstruction: 'system',
  }),
}));

vi.mock('../components/ToastContainer', () => ({
  default: () => <div data-testid="toast-container" />,
}));

vi.mock('../components/ChatInterface', () => ({
  default: () => <div data-testid="chat-interface" />,
}));

vi.mock('../components/LoadingSmart', () => ({
  default: () => null,
}));

vi.mock('../components/EmailModal', () => ({
  EmailModal: () => null,
}));

vi.mock('../components/FooterCredits', () => ({
  default: () => <div data-testid="footer-credits" />,
}));

vi.mock('../components/FollowUpModal', () => ({
  FollowUpModal: () => null,
}));

vi.mock('../components/InstallPrompt', () => ({
  default: () => null,
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

describe('App layout shell', () => {
  it('mantem o main flexivel e o footer fora do fluxo do chat', () => {
    renderApp();

    const chat = screen.getByTestId('chat-interface');
    const footer = screen.getByTestId('footer-credits');
    const shell = chat.closest('main')?.parentElement;
    const main = chat.closest('main');

    expect(shell).not.toBeNull();
    expect(shell?.className).toContain('h-[100dvh]');
    expect(shell?.className).toContain('min-h-screen');
    expect(main).not.toBeNull();
    expect(main?.className).toContain('flex-1');
    expect(main?.className).toContain('min-h-0');
    expect(footer.parentElement?.className).toContain('flex-none');
    expect(footer).toBeInTheDocument();
  });

  it('renderiza o layout principal sem erros', () => {
    renderApp();

    expect(screen.getByTestId('chat-interface')).toBeInTheDocument();
  });
});

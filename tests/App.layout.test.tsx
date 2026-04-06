import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';

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
}));

vi.mock('../hooks/useRadar', () => ({
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

vi.mock('../hooks/useSessionManager', () => ({
  useSessionManager: () => ({
    handleNewSession: vi.fn(),
    handleSelectSession: vi.fn(),
    handleDeleteSession: vi.fn(),
  }),
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    userId: 'user-1',
    user: {
      id: 'user-1',
      displayName: 'Bruno',
      email: 'bruno@example.com',
      isGuest: false,
      isAdmin: false,
    },
    logout: vi.fn(),
    isAuthenticated: true,
    isAdmin: false,
  }),
}));

vi.mock('../contexts/ModeContext', () => ({
  useMode: () => ({
    mode: 'investigacao',
    systemInstruction: 'system',
  }),
}));

vi.mock('../contexts/CRMContext', () => ({
  useCRM: () => ({
    cards: [],
    createCardFromSession: vi.fn(() => ({ id: 'card-1', companyName: 'Acme Agro' })),
    moveCardToStage: vi.fn(),
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

vi.mock('../components/AuthModal', () => ({
  AuthModal: () => null,
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

vi.mock('../components/CRMView', () => ({
  CRMView: () => <div data-testid="crm-view" />,
}));

vi.mock('../components/AdminDash', () => ({
  AdminDash: () => <div data-testid="admin-dash" />,
}));

vi.mock('../components/SuspenseWithError', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('App layout shell', () => {
  it('mantem o main flexivel e o footer fora do fluxo do chat', () => {
    const { container } = render(<App />);

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
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { ChatStoreProvider } from '../stores/chatStore';
import { DossierStoreProvider } from '../stores/dossierStore';
import type { ChatSession } from '../types';
import {
  evaluateDossierGolden,
  loadJsonFixture,
  type DossierGoldenCase,
  withSchefferGoldenRubric,
} from './helpers/dossierGolden';

const fixtureRoot = resolve(process.cwd(), 'tests', 'fixtures', 'dossier', 'scheffer-04733767000180');

const {
  sessionStateRef,
  downloadFileMock,
  sendMessageToGeminiMock,
  generateDossierModuleMock,
  generateContinuityQuestionMock,
  getIsolatedBenchmarkMock,
  lookupClienteMock,
  formatarParaPromptMock,
} = vi.hoisted(() => ({
  sessionStateRef: { current: [] as unknown[] },
  downloadFileMock: vi.fn(),
  sendMessageToGeminiMock: vi.fn(),
  generateDossierModuleMock: vi.fn(),
  generateContinuityQuestionMock: vi.fn(),
  getIsolatedBenchmarkMock: vi.fn(),
  lookupClienteMock: vi.fn(),
  formatarParaPromptMock: vi.fn(),
}));

vi.mock('../components/ChatInterface', () => ({
  default: (props: {
    messages: Array<{ sender: string; text: string }>;
    onSendMessage?: (
      text: string,
      displayText?: string,
      hintedCompanyOverride?: string | null,
      options?: { cnpj?: string | null },
    ) => Promise<void>;
    onExportConversation?: (format: 'md' | 'pdf' | 'doc', reportType: 'executive' | 'full' | 'tech') => Promise<void>;
  }) => {
    const lastBotMessage = [...props.messages].reverse().find(message => message.sender === 'bot');
    return (
      <div data-testid="chat-interface">
        <button
          type="button"
          onClick={async () => {
            await props.onSendMessage?.(
              'Dossiê completo de [Scheffer & CIA LTDA]. Protocolo de investigação forense especializada:\n\nContexto cadastral obrigatório: CNPJ 04.733.767/0001-80',
              'Dossiê completo: Scheffer & CIA LTDA',
              'Scheffer & CIA LTDA',
              { cnpj: '04.733.767/0001-80' },
            );
          }}
        >
          trigger-dossier
        </button>
        <button type="button" onClick={async () => props.onExportConversation?.('md', 'full')}>
          export-dossier-md
        </button>
        <span data-testid="message-count">{props.messages.length}</span>
        <pre data-testid="last-bot-message">{lastBotMessage?.text ?? ''}</pre>
      </div>
    );
  },
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
    toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
    dismiss: vi.fn(),
  }),
}));

vi.mock('../hooks/useTheme', () => ({
  useTheme: () => ({
    isDarkMode: false,
    toggleTheme: vi.fn(),
  }),
}));

vi.mock('../hooks/useSessionStorage', async () => {
  const ReactModule = await import('react');

  return {
    useSessionStorage: () => {
      const [sessions, setSessions] = ReactModule.useState<ChatSession[]>([]);
      const sessionsRef = ReactModule.useRef<ChatSession[]>(sessions);

      ReactModule.useEffect(() => {
        sessionsRef.current = sessions;
        sessionStateRef.current = sessions;
      }, [sessions]);

      return {
        sessions,
        setSessions,
        sessionsRef,
        isInitialized: true,
        setIsInitialized: vi.fn(),
        loadSessions: vi.fn(async () => []),
      };
    },
    subscribeSessionPersistFailure: vi.fn(() => () => {}),
  };
});

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

vi.mock('../utils/featureAccess', () => ({
  getFeatureAccess: () => ({
    dashboard: false,
    integrityCheck: false,
    clientLookup: true,
    deepDive: false,
    warRoom: false,
  }),
}));

vi.mock('../utils/downloadHelpers', () => ({
  downloadFile: downloadFileMock,
}));

vi.mock('../services/clientLookupService', () => ({
  lookupCliente: lookupClienteMock,
  formatarParaPrompt: formatarParaPromptMock,
}));

vi.mock('../services/geminiService', () => ({
  sendMessageToGemini: sendMessageToGeminiMock,
  generateContinuityQuestion: generateContinuityQuestionMock,
  generateDossierModule: generateDossierModuleMock,
  getIsolatedBenchmark: getIsolatedBenchmarkMock,
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

function readFixture(relativePath: string): string {
  return readFileSync(resolve(fixtureRoot, relativePath), 'utf8');
}

function loadModuleFixtures(): Record<string, string> {
  return {
    'Porte / Teia Societária': readFixture('modules/01-raio-x-operacional.md'),
    'Operação / Cadeia de Valor': readFixture('modules/02-tech-stack.md'),
    'Bordas de Controle': readFixture('modules/03-compliance-risco-fiscal.md'),
    'Riscos & Compliance': readFixture('modules/04-teia-societaria-massa-real.md'),
    'Caminho de Venda': readFixture('modules/05-rh-sst-gestao-pessoas.md'),
  };
}

describe('App dossier markdown golden flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStateRef.current = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (...args: Parameters<typeof fetch>) => {
        const [input, init] = args;
        if (String(input) !== '/api/link-status') {
          throw new Error(`Unexpected fetch in dossier golden test: ${String(input)}`);
        }
        const body = JSON.parse(String(init?.body ?? '{}')) as { urls?: string[] };
        const results = Object.fromEntries((body.urls ?? []).map(url => [url, { status: 'valid' }]));
        return new Response(JSON.stringify({ results }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );

    const moduleFixtures = loadModuleFixtures();
    const lookupFixture = loadJsonFixture<Record<string, unknown>>(resolve(fixtureRoot, 'lookup.json'));
    const suggestionsFixture = loadJsonFixture<string[]>(resolve(fixtureRoot, 'continuity-suggestions.json'));
    const benchmarkFixture = readFixture('benchmark.md');

    lookupClienteMock.mockResolvedValue(lookupFixture);
    formatarParaPromptMock.mockReturnValue('Contexto CRM interno Senior para Scheffer.');
    generateContinuityQuestionMock.mockResolvedValue(suggestionsFixture);
    getIsolatedBenchmarkMock.mockResolvedValue(benchmarkFixture);
    sendMessageToGeminiMock.mockRejectedValue(new Error('sendMessageToGemini should not be called for dossier flow'));
    generateDossierModuleMock.mockImplementation(async (moduleName: string) => {
      if (!(moduleName in moduleFixtures)) {
        throw new Error(`Unexpected dossier module request in golden test: ${moduleName}`);
      }
      return moduleFixtures[moduleName];
    });
  });

  it('gera e exporta o dossiê canônico em markdown para o caso Scheffer', async () => {
    renderApp();

    fireEvent.click(screen.getByRole('button', { name: 'trigger-dossier' }));

    await waitFor(() => {
      expect(generateDossierModuleMock).toHaveBeenCalledTimes(6);
      const text = screen.getByTestId('last-bot-message').textContent ?? '';
      expect(text.length).toBeGreaterThan(500);
      expect(text).toContain('Scheffer');
    });

    const completedSession = (sessionStateRef.current as ChatSession[])[0];
    act(() => {
      window.dispatchEvent(
        new CustomEvent('scout:cofre-render-ready', {
          detail: { sessionId: completedSession.id },
        }),
      );
    });
    await waitFor(() => expect(screen.queryByTestId('cofre-overlay')).not.toBeInTheDocument(), {
      timeout: 1_000,
    });

    fireEvent.click(screen.getByRole('button', { name: 'export-dossier-md' }));

    await waitFor(() => {
      expect(downloadFileMock).toHaveBeenCalledTimes(1);
    });

    expect(sendMessageToGeminiMock).not.toHaveBeenCalled();
    expect(lookupClienteMock).toHaveBeenCalledWith('Scheffer & CIA LTDA');
    expect(downloadFileMock).toHaveBeenCalledWith(
      expect.stringMatching(/\.md$/),
      expect.any(String),
      'text/markdown;charset=utf-8',
    );

    const exportedMarkdown = downloadFileMock.mock.calls[0][1] as string;
    const expectedMarkdown = readFixture('expected-dossier.md');
    const dossierCase = withSchefferGoldenRubric(loadJsonFixture<DossierGoldenCase>(resolve(fixtureRoot, 'case.json')));
    const rubric = await evaluateDossierGolden(exportedMarkdown, expectedMarkdown, dossierCase);

    expect(rubric.errors, JSON.stringify(rubric, null, 2)).toEqual([]);
    expect(rubric.passed).toBe(true);
    expect(exportedMarkdown).toContain('> **CNPJ analisado:** 04.733.767/0001-80');
  });
});

import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import type { ChatSession } from '../types';
import {
  loadJsonFixture,
  validateDossierGolden,
  type DossierGoldenCase,
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
    onSendMessage?: (text: string, displayText?: string, hintedCompanyOverride?: string | null) => Promise<void>;
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
    miniCRM: false,
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

function readFixture(relativePath: string): string {
  return readFileSync(resolve(fixtureRoot, relativePath), 'utf8');
}

function loadModuleFixtures(): Record<string, string> {
  return {
    'Raio-X Operacional': readFixture('modules/01-raio-x-operacional.md'),
    'Tech Stack': readFixture('modules/02-tech-stack.md'),
    'Riscos & Compliance': readFixture('modules/03-compliance-risco-fiscal.md'),
    'Estratégia & Expansão': readFixture('modules/04-teia-societaria-massa-real.md'),
    'RH & Decisores': readFixture('modules/05-rh-sst-gestao-pessoas.md'),
  };
}

describe('App dossier markdown golden flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStateRef.current = [];

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
    const dossierCase = loadJsonFixture<DossierGoldenCase>(resolve(fixtureRoot, 'case.json'));
    const expectedMarkdown = readFixture('expected-dossier.md');

    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'trigger-dossier' }));

    await waitFor(() => {
      expect(generateDossierModuleMock).toHaveBeenCalledTimes(5);
      expect(screen.getByTestId('last-bot-message').textContent).toContain('## 📌 Resumo Executivo');
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
    const validationErrors = validateDossierGolden(exportedMarkdown, expectedMarkdown, dossierCase);

    expect(validationErrors).toEqual([]);
  });
});

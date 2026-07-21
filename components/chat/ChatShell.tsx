import React, { useCallback, useRef, useState, type ReactNode } from 'react';
import type { ChatSession, ExportFormat, ReportType } from '../../types';
import ExportDropdown from '../ExportDropdown';
import SessionsSidebar from '../SessionsSidebar';
import { SyncIndicator } from '../SyncIndicator';
import Tooltip from '../Tooltip';
import UserMenu from '../UserMenu';
import type { ChatTheme } from './contracts';

interface ChatShellProps {
  sessions: ChatSession[];
  currentSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onNewSession: () => void;
  onDeleteSession: (sessionId: string) => void;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  isDarkMode: boolean;
  theme: ChatTheme;
  displayTitle: string;
  onToggleTheme: () => void;
  displayName: string;
  avatarUrl: string | null;
  onOpenSettings: () => void;
  onClearOperator: () => void;
  onExportPDF: () => void;
  onExportConversation?: (format: ExportFormat, reportType: ReportType) => void;
  onCopyMarkdown: () => void;
  exportStatus: 'idle' | 'loading' | 'success' | 'error';
  timeline: ReactNode;
  composer: ReactNode;
  panels?: ReactNode;
}

const ChatShell: React.FC<ChatShellProps> = ({
  sessions,
  currentSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  isSidebarOpen,
  onToggleSidebar,
  isDarkMode,
  theme,
  displayTitle,
  onToggleTheme,
  displayName,
  avatarUrl,
  onOpenSettings,
  onClearOperator,
  onExportPDF,
  onExportConversation,
  onCopyMarkdown,
  exportStatus,
  timeline,
  composer,
  panels,
}) => {
  const [sessionSearchTerm, setSessionSearchTerm] = useState('');
  const sidebarToggleRef = useRef<HTMLButtonElement>(null);

  const closeSidebarOnMobile = useCallback(() => {
    if (window.innerWidth < 768 && isSidebarOpen) {
      onToggleSidebar();
    }
  }, [isSidebarOpen, onToggleSidebar]);

  return (
    <div data-testid="messages-scroller" className={`flex flex-1 min-h-0 overflow-hidden ${theme.bg}`}>
      <div data-testid="session-sidebar">
        <SessionsSidebar
          sessions={sessions}
          currentSessionId={currentSessionId}
          onSelectSession={sessionId => {
            onSelectSession(sessionId);
            closeSidebarOnMobile();
          }}
          onNewSession={onNewSession}
          onDeleteSession={onDeleteSession}
          isOpen={isSidebarOpen}
          onCloseMobile={closeSidebarOnMobile}
          isDarkMode={isDarkMode}
          searchTerm={sessionSearchTerm}
          onSearchChange={setSessionSearchTerm}
          showSearchField
          toggleButtonRef={sidebarToggleRef}
        />
      </div>

      <main data-testid="chat-shell" className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <header
          data-testid="app-header"
          className={`flex items-center justify-between px-3 py-2 border-b flex-none ${theme.surface} ${theme.border}`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Tooltip label={isSidebarOpen ? 'Fechar painel lateral' : 'Abrir painel lateral'} position="bottom">
              <button
                data-testid="sidebar-toggle"
                ref={sidebarToggleRef}
                type="button"
                onClick={onToggleSidebar}
                className={`p-2 rounded-lg transition-colors flex-none ${theme.itemHover}`}
                aria-label={isSidebarOpen ? 'Fechar painel lateral' : 'Abrir painel lateral'}
              >
                {isSidebarOpen ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                )}
              </button>
            </Tooltip>

            <div data-testid="app-breadcrumb" className="flex items-center gap-2 min-w-0">
              <span
                data-testid="chat-header-breadcrumb-home"
                className={`text-sm font-semibold ${currentSessionId ? 'cursor-pointer hover:opacity-75 transition-opacity' : ''} ${theme.textPrimary}`}
                onClick={() => currentSessionId && onNewSession()}
              >
                Scout 360
              </span>
              {currentSessionId && (
                <>
                  <span className={`text-sm ${theme.textSecondary}`}>→</span>
                  <span
                    data-testid="chat-header-breadcrumb-session"
                    className={`text-sm font-semibold truncate ${theme.textPrimary}`}
                  >
                    {displayTitle}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 flex-none">
            <ExportDropdown
              isDarkMode={isDarkMode}
              onExportPDF={onExportPDF}
              onExportConversation={onExportConversation}
              onCopyMarkdown={onCopyMarkdown}
              exportStatus={exportStatus}
            />

            <Tooltip label={isDarkMode ? 'Mudar para modo claro' : 'Mudar para modo escuro'} position="bottom">
              <button
                data-testid="chat-theme-toggle"
                type="button"
                onClick={onToggleTheme}
                className={`p-2 rounded-lg transition-colors ${theme.itemHover}`}
                aria-label={isDarkMode ? 'Mudar para modo claro' : 'Mudar para modo escuro'}
              >
                {isDarkMode ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                    />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                    />
                  </svg>
                )}
              </button>
            </Tooltip>

            <SyncIndicator isDarkMode={isDarkMode} />

            <UserMenu
              isDarkMode={isDarkMode}
              displayName={displayName}
              avatarUrl={avatarUrl}
              onOpenSettings={onOpenSettings}
              onClearOperator={onClearOperator}
            />
          </div>
        </header>

        {timeline}
        {composer}
      </main>

      {panels}
    </div>
  );
};

export default ChatShell;

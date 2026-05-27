import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { APP_NAME } from '../constants';
import { useMode } from '../contexts/ModeContext';
import { useOperator } from '../contexts/OperatorContext';
import { buildInvestigationHiddenPrompt, PROMPT_VERSION } from '../prompts/megaPrompts';
import { fetchCompanyByCnpj } from '../services/brasilApiService';
import { storage } from '../services/storage';
import { Sender, type RadarAlert } from '../types';
import { scoutDiag } from '../utils/diagnosticLog';
import { cleanTitle } from '../utils/textCleaners';
import ChatPanels from './chat/ChatPanels';
import ChatShell from './chat/ChatShell';
import Composer from './chat/Composer';
import type {
  ChatTheme,
  ExtendedChatInterfaceProps,
  StartInvestigationPayload,
} from './chat/contracts';
import MessageTimeline from './chat/MessageTimeline';

export type { RadarProps } from './chat/contracts';

type PromptMode = 'standard' | 'executive' | 'ultraDepth' | 'warMode';

const resolvePromptMode = (appMode: unknown, canWarRoom?: boolean): PromptMode => {
  const raw = String(appMode || '').toLowerCase();

  if (raw.includes('war')) return 'warMode';
  if (raw.includes('ultra')) return 'ultraDepth';
  if (raw.includes('deep')) return 'ultraDepth';
  if (raw.includes('exec')) return 'executive';
  if (canWarRoom) return 'executive';
  return 'executive';
};

const shouldIncludeBudgetPrompt = (
  payload: StartInvestigationPayload,
  promptMode: PromptMode,
  radar?: ExtendedChatInterfaceProps['radar'],
): boolean => {
  if (promptMode === 'warMode') return true;
  if (promptMode === 'ultraDepth') return true;
  if (payload.cnpj) return true;
  if (radar?.metaInsight) return true;
  if ((radar?.alerts?.length || 0) > 0) return true;
  return false;
};

const buildRadarContextBlock = (radar?: ExtendedChatInterfaceProps['radar']): string => {
  if (!radar) return '';

  const topAlerts = (radar.alerts || [])
    .slice(0, 3)
    .map((alert: RadarAlert, index) => {
      const title = alert.title?.trim() || `Alerta ${index + 1}`;
      const detail = alert.summary?.trim() || 'Sem detalhe adicional';
      return `- ${title}: ${detail}`;
    });

  return [
    '<radar_context>',
    `RadarConfigured=${radar.config?.isConfigured ? 'SIM' : 'NAO'}`,
    `RadarUnreadCount=${radar.unreadCount ?? 0}`,
    `RadarIsScanning=${radar.isScanning ? 'SIM' : 'NAO'}`,
    `RadarMetaInsight=${radar.metaInsight || 'N/D'}`,
    `RadarLastWarning=${radar.lastWarning || 'N/D'}`,
    `RadarLastError=${radar.lastError ? `${radar.lastError.code}: ${radar.lastError.message}` : 'N/D'}`,
    topAlerts.length ? 'TopRadarAlerts:' : 'TopRadarAlerts: N/D',
    ...(topAlerts.length ? topAlerts : []),
    '</radar_context>',
  ].join('\n');
};

const ChatInterface: React.FC<ExtendedChatInterfaceProps> = ({
  currentSession,
  sessions,
  onNewSession,
  onSelectSession,
  onDeleteSession,
  isSidebarOpen,
  onToggleSidebar,
  messages,
  isLoading,
  hasMore,
  onSendMessage,
  onFeedback,
  onSendFeedback,
  onLoadMore,
  onExportConversation,
  onExportPDF,
  onRetry,
  onRegenerateSuggestions,
  onStop,
  onReportError,
  isDarkMode,
  onToggleTheme,
  onToggleMessageSources,
  exportStatus,
  canAccessIntegrityCheck = true,
  canDeepDive = false,
  canWarRoom = false,
  onClearOperator,
  lastUserQuery,
  processing,
  loadingVariant,
  loadingPinnedLabel,
  onDeleteMessage,
  onDeepDive,
  radar,
}) => {
  const { mode } = useMode();
  const {
    name: operatorName,
    operatorId,
    setName,
    registerOperator,
    linkToExistingOperator,
    loading: operatorLoading,
  } = useOperator();

  const [showSettings, setShowSettings] = useState(false);
  const [showWarRoom, setShowWarRoom] = useState(false);
  const [showRadarPanel, setShowRadarPanel] = useState(false);
  const [showRadarSettings, setShowRadarSettings] = useState(false);

  const safeMessages = Array.isArray(messages) ? messages : [];
  const hasOperatorName = operatorName.trim().length > 0;
  const showOperatorGate = !operatorLoading && !hasOperatorName;
  const showInitialHome = !currentSession || (safeMessages.length === 0 && !isLoading);
  const hasSubstantiveMessages = safeMessages.some(message => {
    const textLength = String(message.text || '').trim().length;
    return textLength > 200 || (!message.isThinking && textLength > 0);
  });
  const shouldSuspendVirtualizedList =
    isLoading && loadingVariant === 'hero' && !hasSubstantiveMessages;

  useEffect(() => {
    if (!operatorId || !hasOperatorName) return;
    void storage.touchUserContext(operatorId);
  }, [hasOperatorName, operatorId]);

  const handleStartInvestigation = useCallback(
    async (payload: StartInvestigationPayload) => {
      if (operatorId) {
        void storage.touchUserContext(operatorId);
      }

      const prompt = `🔍 Investigando ${payload.companyName}...`;
      const promptMode = resolvePromptMode(mode, canWarRoom);

      let segmentHint: string | undefined;
      if (payload.cnpj) {
        try {
          const signal = AbortSignal.timeout(8000);
          const companyData = await fetchCompanyByCnpj(payload.cnpj, signal);
          if (companyData.cnaeDescricao) {
            segmentHint = companyData.cnaeDescricao;
          }
        } catch (error) {
          scoutDiag.warn('ChatInterface', 'Falha ao buscar CNAE', { cnpj: payload.cnpj, error });
        }
      }

      const hiddenPromptBase = buildInvestigationHiddenPrompt(
        {
          companyName: payload.companyName,
          cnpj: payload.cnpj || undefined,
          city: payload.city,
          state: payload.state,
          segmentHint,
        },
        {
          includeBudget: shouldIncludeBudgetPrompt(payload, promptMode, radar),
          mode: promptMode,
          strictAudit: true,
          enableDiscrepancyHunter: true,
          enableCostOfDelay: true,
          promptVersion: PROMPT_VERSION,
        },
      );
      const hiddenPrompt = [hiddenPromptBase, buildRadarContextBlock(radar)].filter(Boolean).join('\n\n');
      await onDeepDive(prompt, hiddenPrompt, payload.companyName, payload.cnpj);
    },
    [mode, canWarRoom, operatorId, radar, onDeepDive],
  );

  const handleCopyMarkdown = useCallback(() => {
    const text = safeMessages
      .filter((message) => !message.isError && !message.isThinking)
      .map((message) => `**${message.sender === Sender.User ? 'Você' : 'Scout 360'}:**\n${message.text}`)
      .join('\n\n---\n\n')
      .replace(/\[\[PORTA:[^\]]+\]\]/g, '');

    void navigator.clipboard.writeText(text);
  }, [safeMessages]);

  const handlePrefillComposer = useCallback((text: string) => {
    window.dispatchEvent(new CustomEvent('scout:prefill', { detail: { text } }));
  }, []);

  const handleSendMessage = useCallback((text: string) => {
    if (operatorId) {
      void storage.touchUserContext(operatorId);
    }

    onSendMessage(text);
  }, [onSendMessage, operatorId]);

  const theme = useMemo<ChatTheme>(
    () => ({
      bg: isDarkMode ? 'bg-slate-950' : 'bg-slate-50',
      surface: isDarkMode ? 'bg-slate-900' : 'bg-white',
      border: isDarkMode ? 'border-slate-800' : 'border-slate-200',
      textPrimary: isDarkMode ? 'text-slate-100' : 'text-slate-900',
      textSecondary: isDarkMode ? 'text-slate-400' : 'text-slate-500',
      inputBg: isDarkMode ? 'bg-slate-800' : 'bg-white',
      inputBorder: isDarkMode ? 'border-slate-700' : 'border-slate-300',
      itemHover: isDarkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-100',
      itemActive: isDarkMode ? 'bg-slate-800' : 'bg-slate-100',
      btnSecondary: isDarkMode
        ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
        : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200',
    }),
    [isDarkMode],
  );

  const headerTitle = cleanTitle(currentSession?.empresaAlvo || currentSession?.title || APP_NAME);
  const displayTitle = headerTitle.length > 35 ? `${headerTitle.substring(0, 32)}...` : headerTitle;
  const displayName = operatorName.trim() || 'Operador';

  return (
    <ChatShell
      sessions={sessions}
      currentSessionId={currentSession?.id ?? null}
      onSelectSession={onSelectSession}
      onNewSession={onNewSession}
      onDeleteSession={onDeleteSession}
      isSidebarOpen={isSidebarOpen}
      onToggleSidebar={onToggleSidebar}
      isDarkMode={isDarkMode}
      theme={theme}
      displayTitle={displayTitle}
      radar={radar}
      onOpenRadarPanel={() => setShowRadarPanel(true)}
      canWarRoom={canWarRoom}
      onOpenWarRoom={() => setShowWarRoom(true)}
      onToggleTheme={onToggleTheme}
      displayName={displayName}
      avatarUrl={null}
      onOpenSettings={() => setShowSettings(true)}
      onClearOperator={onClearOperator}
      onExportPDF={onExportPDF}
      onExportConversation={onExportConversation}
      onCopyMarkdown={handleCopyMarkdown}
      exportStatus={exportStatus}
      timeline={
        <MessageTimeline
          currentSession={currentSession}
          messages={safeMessages}
          isLoading={isLoading}
          hasMore={hasMore}
          isDarkMode={isDarkMode}
          mode={mode}
          showOperatorGate={showOperatorGate}
          showInitialHome={showInitialHome}
          shouldSuspendVirtualizedList={shouldSuspendVirtualizedList}
          onConfirmOperatorName={(name, email, existingOperatorId) => {
            if (existingOperatorId) {
              linkToExistingOperator(existingOperatorId, name, email);
            } else {
              registerOperator(name, email);
            }
          }}
          onStartInvestigation={handleStartInvestigation}
          radar={radar}
          onOpenRadarPanel={() => setShowRadarPanel(true)}
          onLoadMore={onLoadMore}
          onRetry={onRetry}
          onDeleteMessage={onDeleteMessage}
          onReportError={onReportError}
          onFeedback={onFeedback}
          onSendFeedback={onSendFeedback}
          onToggleMessageSources={onToggleMessageSources}
          onDeepDive={onDeepDive}
          onRegenerateSuggestions={onRegenerateSuggestions}
          onPrefillComposer={handlePrefillComposer}
          operatorId={operatorId}
          processing={processing}
          lastUserQuery={lastUserQuery}
          onStop={onStop}
          onSendMessage={handleSendMessage}
          loadingPinnedLabel={loadingPinnedLabel}
          canDeepDive={canDeepDive}
          theme={theme}
        />
      }
      composer={
        <Composer
          isHidden={showInitialHome || showOperatorGate}
          isLoading={isLoading}
          processing={processing}
          sessionId={currentSession?.id ?? null}
          theme={theme}
          onSendMessage={handleSendMessage}
          onRetry={onRetry}
          onStop={onStop}
        />
      }
      panels={
        <ChatPanels
          showSettings={showSettings}
          operatorName={operatorName}
          onUpdateOperatorName={setName}
          isDarkMode={isDarkMode}
          onToggleTheme={onToggleTheme}
          onClearOperator={onClearOperator}
          canAccessIntegrityCheck={canAccessIntegrityCheck}
          onCloseSettings={() => setShowSettings(false)}
          showWarRoom={showWarRoom}
          canWarRoom={canWarRoom}
          onCloseWarRoom={() => setShowWarRoom(false)}
          showRadarPanel={showRadarPanel}
          radar={radar}
          onOpenRadarSettings={() => {
            setShowRadarPanel(false);
            setShowRadarSettings(true);
          }}
          onCloseRadarPanel={() => setShowRadarPanel(false)}
          showRadarSettings={showRadarSettings}
          onCloseRadarSettings={() => setShowRadarSettings(false)}
        />
      }
    />
  );
};

export default ChatInterface;

import { useMemo } from 'react';
import type { ChatSession, Message } from '../types';
import { Sender } from '../types';
import { APP_NAME } from '../constants';
import { maxExpectedBotChars } from '../utils/expectedBotContent';
import type { LoadingVariant } from '../utils/loadingVariant';
import { shouldSuspendHeroMessageTimeline } from '../utils/loadingVariant';
import type { PanelState } from '../utils/renderStateClassifier';
import { classifyPanelState } from '../utils/renderStateClassifier';
import { cleanTitle } from '../utils/textCleaners';

export interface UsePanelStateParams {
  messages: Message[];
  currentSession: ChatSession | null | undefined;
  isLoading: boolean;
  loadingVariant: LoadingVariant | undefined;
  operatorName: string | null | undefined;
  operatorLoading: boolean;
}

export interface UsePanelStateResult {
  safeMessages: Message[];
  hasOperatorName: boolean;
  showOperatorGate: boolean;
  showInitialHome: boolean;
  hasRenderableBotMessage: boolean;
  shouldSuspendVirtualizedList: boolean;
  headerTitle: string;
  displayTitle: string;
  displayName: string;
  hasActiveSession: boolean;
  hasErrorInMessages: boolean;
  hasDossierContent: boolean;
  panelState: PanelState;
  expectedBotCharsMax: number;
  hasBotThinkingPlaceholder: boolean;
}

export function usePanelState({
  messages,
  currentSession,
  isLoading,
  loadingVariant,
  operatorName,
  operatorLoading,
}: UsePanelStateParams): UsePanelStateResult {
  const safeMessages = Array.isArray(messages) ? messages : [];
  const hasOperatorName = (operatorName || '').trim().length > 0;
  const showOperatorGate = !operatorLoading && !hasOperatorName;
  const showInitialHome = !currentSession || (safeMessages.length === 0 && !isLoading);

  // A waterfall preview (isThinking=true) with enough text is renderable — show timeline incrementally.
  // Mirrors WATERFALL_PREVIEW_MIN_CHARS = 200 from waterfall-orchestrator.ts.
  const WATERFALL_PREVIEW_MIN_CHARS = 200;
  const hasRenderableBotMessage = safeMessages.some(
    message =>
      message.sender === Sender.Bot &&
      !message.isError &&
      Boolean(String(message.text || '').trim()) &&
      (!message.isThinking || String(message.text || '').trim().length >= WATERFALL_PREVIEW_MIN_CHARS),
  );
  const shouldSuspendVirtualizedList = shouldSuspendHeroMessageTimeline(
    isLoading,
    loadingVariant,
    hasRenderableBotMessage,
  );

  const headerTitle = cleanTitle(currentSession?.empresaAlvo || currentSession?.title || APP_NAME);
  const displayTitle = headerTitle.length > 35 ? `${headerTitle.substring(0, 32)}...` : headerTitle;
  const displayName = (operatorName || '').trim() || 'Operador';

  const hasActiveSession = currentSession !== null && currentSession !== undefined;
  const hasErrorInMessages = safeMessages.some(msg => Boolean(msg.isError));
  const hasDossierContent = Boolean(currentSession?.resumoDossie);
  const panelState = classifyPanelState({
    messages: safeMessages,
    hasDossierContent,
    isLoading,
    hasError: hasErrorInMessages,
  });
  const expectedBotCharsMax = useMemo(() => maxExpectedBotChars(safeMessages), [safeMessages]);
  const hasBotThinkingPlaceholder = safeMessages.some(
    message => message.sender === Sender.Bot && !message.isError && Boolean(message.isThinking),
  );

  return {
    safeMessages,
    hasOperatorName,
    showOperatorGate,
    showInitialHome,
    hasRenderableBotMessage,
    shouldSuspendVirtualizedList,
    headerTitle,
    displayTitle,
    displayName,
    hasActiveSession,
    hasErrorInMessages,
    hasDossierContent,
    panelState,
    expectedBotCharsMax,
    hasBotThinkingPlaceholder,
  };
}

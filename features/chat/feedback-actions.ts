import { useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { useMaybeOperator } from '../../contexts/OperatorContext';
import { sendFeedbackRemote } from '../../services/feedbackRemoteStore';
import { useMaybeChatStore } from '../../stores/chatStore';
import type { AppError, ChatSession, Feedback } from '../../types';

function requireDependency<T>(value: T | null | undefined, dependencyName: string): T {
  if (value === null || value === undefined) {
    throw new Error(`${dependencyName} is required for feedback-actions`);
  }

  return value;
}

export interface UseChatFeedbackActionsOptions {
  currentSession?: ChatSession | null;
  operatorId?: string;
  operatorName?: string;
  updateCurrentSession?: (updater: (session: ChatSession) => ChatSession) => void;
  updateSessionById?: (id: string, updater: (session: ChatSession) => ChatSession) => void;
}

export function useChatFeedbackActions(options: UseChatFeedbackActionsOptions = {}) {
  const chatStore = useMaybeChatStore();
  const operator = useMaybeOperator();

  const currentSession = options.currentSession ?? chatStore?.currentSession ?? null;
  const operatorId = options.operatorId ?? operator?.operatorId ?? '';
  const operatorName = options.operatorName ?? operator?.name;
  const updateCurrentSession = requireDependency(
    options.updateCurrentSession ?? chatStore?.updateCurrentSession,
    'updateCurrentSession',
  );
  const updateSessionById = requireDependency(
    options.updateSessionById ?? chatStore?.updateSessionById,
    'updateSessionById',
  );

  const handleReportError = useCallback(
    async (messageId: string, error: AppError) => {
      const sessionId = currentSession?.id;
      if (!sessionId) return;

      const errorPayload = JSON.stringify(
        { code: error.code, source: error.source, message: error.message, details: error.details },
        null,
        2,
      );

      try {
        await sendFeedbackRemote({
          feedbackId: uuidv4(),
          sessionId,
          messageId,
          sectionKey: 'ERROR_REPORT',
          sectionTitle: 'System Error',
          type: 'dislike',
          comment: `Automated Error Report: ${error.code}`,
          aiContent: errorPayload,
          userId: operatorId,
          userName: operatorName || undefined,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        console.error('Failed to report error', err);
      }
    },
    [currentSession?.id, operatorId, operatorName],
  );

  const handleFeedback = useCallback(
    (messageId: string, feedback: Feedback) => {
      updateCurrentSession(session => ({
        ...session,
        messages: (session.messages || []).map(message =>
          message.id === messageId
            ? { ...message, feedback: message.feedback === feedback ? undefined : feedback }
            : message,
        ),
      }));
    },
    [updateCurrentSession],
  );

  const handleSendFeedback = useCallback(
    async (messageId: string, feedback: Feedback, comment: string, content: string) => {
      const sessionId = currentSession?.id;
      if (!sessionId) return;

      updateSessionById(sessionId, session => ({
        ...session,
        messages: (session.messages || []).map(message =>
          message.id === messageId ? { ...message, feedback } : message,
        ),
      }));

      try {
        await sendFeedbackRemote({
          feedbackId: uuidv4(),
          sessionId,
          messageId,
          sectionKey: null,
          sectionTitle: null,
          type: feedback === 'up' ? 'like' : 'dislike',
          comment,
          aiContent: content,
          userId: operatorId,
          userName: operatorName || undefined,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error('Feedback error', error);
      }
    },
    [currentSession?.id, operatorId, operatorName, updateSessionById],
  );

  const handleSectionFeedback = useCallback(
    (messageId: string, sectionTitle: string, feedback: Feedback) => {
      updateCurrentSession(session => ({
        ...session,
        messages: (session.messages || []).map(message => {
          if (message.id !== messageId) return message;

          const currentSections = message.sectionFeedback || {};
          const nextFeedback = currentSections[sectionTitle] === feedback ? undefined : feedback;
          const nextSections = { ...currentSections };

          if (nextFeedback === undefined) delete nextSections[sectionTitle];
          else nextSections[sectionTitle] = nextFeedback;

          return { ...message, sectionFeedback: nextSections };
        }),
      }));
    },
    [updateCurrentSession],
  );

  const handleToggleMessageSources = useCallback(
    (messageId: string) => {
      updateCurrentSession(session => ({
        ...session,
        messages: (session.messages || []).map(message =>
          message.id === messageId ? { ...message, isSourcesOpen: !message.isSourcesOpen } : message,
        ),
      }));
    },
    [updateCurrentSession],
  );

  return {
    handleReportError,
    handleFeedback,
    handleSendFeedback,
    handleSectionFeedback,
    handleToggleMessageSources,
  };
}

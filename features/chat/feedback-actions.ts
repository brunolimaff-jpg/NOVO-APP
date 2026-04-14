import { useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { AppError, ChatSession, Feedback } from '../../types';
import { sendFeedbackRemote } from '../../services/feedbackRemoteStore';

export interface UseChatFeedbackActionsOptions {
  currentSession: ChatSession | null;
  operatorId: string;
  operatorName?: string;
  updateCurrentSession: (updater: (session: ChatSession) => ChatSession) => void;
  updateSessionById: (id: string, updater: (session: ChatSession) => ChatSession) => void;
}

export function useChatFeedbackActions({
  currentSession,
  operatorId,
  operatorName,
  updateCurrentSession,
  updateSessionById,
}: UseChatFeedbackActionsOptions) {
  const handleReportError = useCallback(
    async (messageId: string, error: AppError) => {
      if (!currentSession) return;

      const errorPayload = JSON.stringify(
        { code: error.code, source: error.source, message: error.message, details: error.details },
        null,
        2,
      );

      try {
        await sendFeedbackRemote({
          feedbackId: uuidv4(),
          sessionId: currentSession.id,
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
      } catch (error) {
        console.error('Failed to report error', error);
      }
    },
    [currentSession, operatorId, operatorName],
  );

  const handleFeedback = useCallback(
    (messageId: string, feedback: Feedback) => {
      if (!currentSession) return;

      updateCurrentSession(session => ({
        ...session,
        messages: (session.messages || []).map(message =>
          message.id === messageId
            ? { ...message, feedback: message.feedback === feedback ? undefined : feedback }
            : message,
        ),
      }));
    },
    [currentSession, updateCurrentSession],
  );

  const handleSendFeedback = useCallback(
    async (messageId: string, feedback: Feedback, comment: string, content: string) => {
      if (!currentSession) return;

      const snapshotSessionId = currentSession.id;
      updateSessionById(snapshotSessionId, session => ({
        ...session,
        messages: (session.messages || []).map(message =>
          message.id === messageId ? { ...message, feedback } : message,
        ),
      }));

      try {
        await sendFeedbackRemote({
          feedbackId: uuidv4(),
          sessionId: snapshotSessionId,
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
    [currentSession, operatorId, operatorName, updateSessionById],
  );

  const handleSectionFeedback = useCallback(
    (messageId: string, sectionTitle: string, feedback: Feedback) => {
      updateCurrentSession(session => ({
        ...session,
        messages: (session.messages || []).map(message => {
          if (message.id !== messageId) return message;

          const currentSections = message.sectionFeedback || {};
          const newVal = currentSections[sectionTitle] === feedback ? undefined : feedback;
          const newSections = { ...currentSections };
          if (newVal === undefined) delete newSections[sectionTitle];
          else newSections[sectionTitle] = newVal;

          return { ...message, sectionFeedback: newSections };
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

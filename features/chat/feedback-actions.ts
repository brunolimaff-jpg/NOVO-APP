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

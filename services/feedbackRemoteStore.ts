import { scoutDiag } from '../utils/diagnosticLog';
import { supabase, isSupabaseAvailable } from '../lib/supabaseClient';
import type { FeedbackReason, FeedbackScope } from '../types';

export type FeedbackType = 'like' | 'dislike';

export interface RemoteFeedbackPayload {
  feedbackId: string;
  sessionId: string;
  messageId: string;
  sectionKey: string | null;
  sectionTitle: string | null;
  type: FeedbackType;
  scope?: FeedbackScope;
  reason?: FeedbackReason | null;
  comment: string;
  aiContent: string;
  userId: string;
  userName?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export async function sendFeedbackRemote(entry: RemoteFeedbackPayload) {
  if (!isSupabaseAvailable() || !entry.userId) {
    scoutDiag.error('Feedback', 'Supabase indisponível ou userId ausente', {
      sessionId: entry.sessionId,
      messageId: entry.messageId,
    });
    return false;
  }

  try {
    const { error } = await supabase!.from('feedback_events').insert({
      feedback_id: entry.feedbackId,
      operator_id: entry.userId,
      user_name: entry.userName,
      session_id: entry.sessionId,
      message_id: entry.messageId,
      scope: entry.scope ?? (entry.sectionKey ? 'section' : 'message'),
      section_key: entry.sectionKey,
      section_title: entry.sectionTitle,
      feedback_type: entry.type,
      reason: entry.reason ?? null,
      comment: entry.comment,
      ai_content: entry.aiContent,
      metadata: entry.metadata ?? {},
      created_at: entry.timestamp,
    });

    if (error) throw error;
    return true;
  } catch (error) {
    scoutDiag.error('Feedback', 'envio Supabase falhou', {
      error: error instanceof Error ? error.message : String(error),
      sessionId: entry.sessionId,
      messageId: entry.messageId,
    });
    return false;
  }
}

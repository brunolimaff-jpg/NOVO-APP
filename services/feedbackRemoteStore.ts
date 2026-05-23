import { withAutoRetry } from "../utils/retry";
import { scoutDiag } from "../utils/diagnosticLog";
import { BACKEND_URL } from "./apiConfig";
import { supabase, isSupabaseAvailable } from "../lib/supabaseClient";
import type { FeedbackReason, FeedbackScope } from "../types";

// URL agora vem do apiConfig
const API_URL = BACKEND_URL;

export type FeedbackType = "like" | "dislike";

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

async function sendFeedbackToSupabase(entry: RemoteFeedbackPayload): Promise<boolean> {
  if (!isSupabaseAvailable() || !entry.userId) {
    return false;
  }

  const { error } = await supabase!
    .from('feedback_events')
    .insert({
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

  if (error) {
    throw new Error(error.message);
  }

  return true;
}

async function sendFeedbackToLegacyBackend(entry: RemoteFeedbackPayload): Promise<boolean> {
  const payload = { 
    action: "feedback", // Explicit action just in case
    feedback: entry 
  };

  const apiCall = async () => {
    const res = await fetch(API_URL, {
        method: "POST",
        redirect: "follow",
        // CRITICAL FOR APPS SCRIPT CORS: Use text/plain
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000), // 10s — Apps Script pode ser lento
    });
    
    // Safely read body once
    const text = await res.text();
    let data;
    try {
        data = JSON.parse(text);
    } catch (e) {
        throw new Error("Invalid JSON response from server", { cause: e });
    }

    if (!data.ok) throw new Error("Feedback API Error");
    return true;
  };

  try {
    return await withAutoRetry('Feedback:send', apiCall, { maxRetries: 2 });
  } catch (error) {
    scoutDiag.error("Feedback", "envio legado falhou após retries", {
      error: error instanceof Error ? error.message : String(error),
      sessionId: entry.sessionId,
      messageId: entry.messageId,
    });
    return false;
  }
}

export async function sendFeedbackRemote(entry: RemoteFeedbackPayload) {
  let supabaseOk = false;
  let legacyOk = false;

  try {
    supabaseOk = await sendFeedbackToSupabase(entry);
  } catch (error) {
    scoutDiag.error("Feedback", "envio Supabase falhou", {
      error: error instanceof Error ? error.message : String(error),
      sessionId: entry.sessionId,
      messageId: entry.messageId,
    });
  }

  legacyOk = await sendFeedbackToLegacyBackend(entry);

  if (!supabaseOk && !legacyOk) {
    scoutDiag.error("Feedback", "todos os destinos de feedback falharam", {
      sessionId: entry.sessionId,
      messageId: entry.messageId,
      scope: entry.scope ?? (entry.sectionKey ? 'section' : 'message'),
      reason: entry.reason,
    });
  }

  return supabaseOk || legacyOk;
}

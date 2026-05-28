// services/operatorTracking.ts
// Fire-and-forget tracking de eventos do operador via Supabase.
// NUNCA bloqueia a UX — falhas sao silenciosas.

import { supabase, isSupabaseAvailable } from '../lib/supabaseClient';

// ===================================================================
// TYPES
// ===================================================================

export type OperatorEventName =
  | 'app_opened'
  | 'operator_registered'
  | 'dossier_started'
  | 'dossier_completed'
  | 'dossier_failed'
  | 'dossier_opened'
  | 'dossier_shared';

export interface OperatorEventPayload {
  operatorId: string;
  email?: string;
  sessionId?: string;
  entityType?: string;
  entityId?: string;
  companyCnpj?: string;
  companyName?: string;
  route?: string;
  metadata?: Record<string, unknown>;
}

// ===================================================================
// HELPERS
// ===================================================================

function resolveEnvironment(): string {
  if (typeof window === 'undefined') return 'ssr';
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return 'development';
  if (host.includes('preview') || host.includes('vercel.app')) return 'preview';
  return 'production';
}

function resolveUserAgent(): string {
  return typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
}

function getCurrentSessionId(): string {
  // Gera ID de sessao no cliente — permite vincular eventos antes mesmo
  // do INSERT no Supabase retornar.
  let id = sessionStorage.getItem('scout:current_session_id');
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem('scout:current_session_id', id);
    sessionStorage.setItem('scout:session_started_at', new Date().toISOString());
  }
  return id;
}

// ===================================================================
// FIRE-AND-FORGET WRAPPER
// ===================================================================

/**
 * Encapsula uma PromiseLike do Supabase em fire-and-forget.
 * Usa .then(onSuccess, onError) porque PostgrestFilterBuilder nao expoe .catch().
 */
function ff<T>(promiseLike: PromiseLike<T>): void {
  promiseLike.then(
    () => {},
    () => {},
  );
}

// ===================================================================
// PUBLIC API
// ===================================================================

/**
 * Insere nova sessao no Supabase (fire-and-forget).
 * O ID e gerado no cliente para vincular eventos imediatamente.
 */
export function startOperatorSession(operatorId: string, email?: string): void {
  if (!isSupabaseAvailable() || !operatorId) return;

  const sessionId = getCurrentSessionId();
  const emailNormalized = email?.toLowerCase().trim() || '';

  ff(
    supabase!
      .from('operator_sessions')
      .insert({
        id: sessionId,
        operator_id: operatorId,
        email_normalized: emailNormalized || null,
        started_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
        environment: resolveEnvironment(),
        app_version: '1.0.0',
        user_agent: resolveUserAgent(),
      }),
  );
}

/**
 * Atualiza last_seen_at da sessao corrente (fire-and-forget).
 */
export function touchOperatorSession(): void {
  if (!isSupabaseAvailable()) return;

  const sessionId = sessionStorage.getItem('scout:current_session_id');
  if (!sessionId) return;

  ff(
    supabase!
      .from('operator_sessions')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', sessionId),
  );
}

/**
 * Finaliza a sessao corrente (fire-and-forget).
 */
export function endOperatorSession(
  reason: 'pagehide' | 'visibility_hidden' | 'manual' | 'timeout',
): void {
  if (!isSupabaseAvailable()) return;

  const sessionId = sessionStorage.getItem('scout:current_session_id');
  if (!sessionId) return;

  const startedAt = sessionStorage.getItem('scout:session_started_at');
  const durationSeconds = startedAt
    ? Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
    : null;

  const now = new Date().toISOString();

  ff(
    supabase!
      .from('operator_sessions')
      .update({
        ended_at: now,
        ended_reason: reason,
        duration_seconds: durationSeconds,
        last_seen_at: now,
      })
      .eq('id', sessionId),
  );
}

/**
 * Dispara evento de tracking (fire-and-forget).
 *
 * Regras:
 * - NUNCA incluir prompt, resposta Gemini, conteudo de dossie ou texto longo
 * - Metadata limitado a campos comerciais (CNPJ, nome empresa, contadores)
 * - Falha no Supabase = silencio absoluto
 */
export function trackOperatorEvent(
  eventName: OperatorEventName,
  payload: OperatorEventPayload,
): void {
  if (!isSupabaseAvailable() || !payload.operatorId) return;

  const emailNormalized = payload.email?.toLowerCase().trim() || '';
  const sessionId = payload.sessionId || getCurrentSessionId();
  const safeMetadata = sanitizeMetadata(payload.metadata);

  ff(
    supabase!
      .from('operator_events')
      .insert({
        operator_id: payload.operatorId,
        email_normalized: emailNormalized || null,
        session_id: sessionId,
        event_name: eventName,
        entity_type: payload.entityType ?? null,
        entity_id: payload.entityId ?? null,
        company_cnpj: payload.companyCnpj ?? null,
        company_name: payload.companyName ?? null,
        environment: resolveEnvironment(),
        route: payload.route || (typeof window !== 'undefined' ? window.location.pathname : ''),
        metadata: safeMetadata,
        created_at: new Date().toISOString(),
      }),
  );
}

/**
 * Inicializa o tracking de sessao.
 * Chame 1x no boot do app, apos confirmacao do operador.
 */
export function initSessionTracking(operatorId: string, email?: string): void {
  if (!operatorId) return;

  startOperatorSession(operatorId, email);

  trackOperatorEvent('app_opened', {
    operatorId,
    email,
    route: typeof window !== 'undefined' ? window.location.pathname : '',
  });
}

// ===================================================================
// INTERNAL
// ===================================================================

function sanitizeMetadata(meta?: Record<string, unknown>): Record<string, unknown> {
  if (!meta || typeof meta !== 'object') return {};

  const safe: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(meta)) {
    if (/prompt|gemini|response|token|secret|key|password/i.test(key)) continue;
    if (value === null || value === undefined) continue;

    if (typeof value === 'string') {
      safe[key] = value.length > 200 ? value.slice(0, 197) + '...' : value;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      safe[key] = value;
    } else if (Array.isArray(value)) {
      safe[key] = value.slice(0, 10).map((item) => {
        if (typeof item === 'string' && item.length > 100) return item.slice(0, 97) + '...';
        if (typeof item === 'object') return '[object]';
        return item;
      });
    } else if (typeof value === 'object') {
      safe[key] = sanitizeMetadata(value as Record<string, unknown>);
    }
  }

  return safe;
}

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
  | 'dossier_shared'
  | 'dossier_reopened'
  | 'dossier_override';

export interface OperatorEventPayload {
  operatorId: string;
  email?: string;
  sessionId?: string;
  entityType?: string;
  entityId?: string;
  companyCnpj?: string;
  companyName?: string;
  route?: string;
  previousDossierId?: string;
  shareChannel?: string;
  metadata?: Record<string, unknown>;
}

// ===================================================================
// HELPERS
// ===================================================================

function resolveEnvironment(): string {
  if (typeof window === 'undefined') return 'ssr';
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return 'development';
  if (host.includes('preview-') || host.endsWith('.vercel.app')) return 'preview';
  return 'production';
}

function resolveAppVersion(): string {
  try {
    return (import.meta as any).env?.VITE_APP_VERSION || '1.0.0';
  } catch {
    return '1.0.0';
  }
}

function resolveUserAgent(): string {
  return typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
}

function generateUUID(): string {
  try {
    return crypto.randomUUID();
  } catch {
    // Fallback para contextos não-seguros (HTTP, browsers antigos)
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }
}

function getCurrentSessionId(): string {
  let id = sessionStorage.getItem('scout:current_session_id');
  if (!id) {
    id = generateUUID();
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
    (err: unknown) => {
      console.warn('[operatorTracking] supabase write failed:', err);
    },
  );
}

// ===================================================================
// PUBLIC API
// ===================================================================

/**
 * Insere ou atualiza sessao no Supabase (fire-and-forget).
 * O ID e gerado no cliente para vincular eventos imediatamente.
 * Usa upsert para tolerar reentradas apos refresh (F5) ou falhas de rede.
 */
export function startOperatorSession(operatorId: string, email?: string): void {
  void startOperatorSessionAsync(operatorId, email);
}

async function startOperatorSessionAsync(operatorId: string, email?: string): Promise<void> {
  if (!isSupabaseAvailable() || !operatorId) return;

  const existingSessionId = sessionStorage.getItem('scout:current_session_id');
  if (existingSessionId) {
    touchOperatorSession();
    return;
  }

  const sessionId = getCurrentSessionId();
  const emailNormalized = email?.toLowerCase().trim() || '';
  const now = new Date().toISOString();

  const { error } = await supabase!.from('operator_sessions').upsert(
    {
      id: sessionId,
      operator_id: operatorId,
      email_normalized: emailNormalized || null,
      started_at: now,
      last_seen_at: now,
      environment: resolveEnvironment(),
      app_version: resolveAppVersion(),
      user_agent: resolveUserAgent(),
    },
    { onConflict: 'id' },
  );

  if (error) {
    console.warn('[operatorTracking] startOperatorSession failed:', error);
  }
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
      .update({
        last_seen_at: new Date().toISOString(),
        ended_at: null,
        ended_reason: null,
        duration_seconds: null,
      })
      .eq('id', sessionId),
  );
}

/**
 * Finaliza a sessao corrente (fire-and-forget).
 */
export function endOperatorSession(reason: 'pagehide' | 'visibility_hidden' | 'manual' | 'timeout'): void {
  if (!isSupabaseAvailable()) return;

  const sessionId = sessionStorage.getItem('scout:current_session_id');
  if (!sessionId) return;

  const startedAt = sessionStorage.getItem('scout:session_started_at');
  const parsedStart = startedAt ? Date.parse(startedAt) : NaN;
  const durationSeconds =
    !isNaN(parsedStart) && parsedStart > 0 && Date.now() > parsedStart
      ? Math.max(0, Math.floor((Date.now() - parsedStart) / 1000))
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
export function trackOperatorEvent(eventName: OperatorEventName, payload: OperatorEventPayload): void {
  if (!isSupabaseAvailable() || !payload.operatorId) return;

  const emailNormalized = payload.email?.toLowerCase().trim() || '';
  const sessionId = payload.sessionId || getCurrentSessionId();
  const safeMetadata = sanitizeMetadata(payload.metadata);

  ff(
    supabase!.from('operator_events').insert({
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
export async function initSessionTracking(operatorId: string, email?: string): Promise<void> {
  if (!operatorId) return;

  await startOperatorSessionAsync(operatorId, email);

  trackOperatorEvent('app_opened', {
    operatorId,
    email,
    route: typeof window !== 'undefined' ? window.location.pathname : '',
  });
}

// ===================================================================
// INTERNAL
// ===================================================================

export function sanitizeMetadata(meta?: Record<string, unknown>): Record<string, unknown> {
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
      safe[key] = value.slice(0, 10).map(item => {
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

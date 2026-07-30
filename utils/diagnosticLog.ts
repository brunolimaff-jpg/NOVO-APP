/**
 * diagnosticLog.ts — Logs estruturados do Scout360
 *
 * REGRA DE VISIBILIDADE:
 *   - error  → SEMPRE aparece (dev + produção)
 *   - warn   → SEMPRE aparece (dev + produção)
 *   - info   → apenas em DEV ou quando VITE_VERBOSE_LOGS=true
 *   - debug  → apenas em DEV ou quando VITE_DEBUG_CONSOLE=true
 *
 * Como ativar logs completos em homologação/produção:
 *   Adicione na Vercel: VITE_VERBOSE_LOGS=true
 *
 * DIAGNÓSTICO PERSISTENTE (Supabase):
 *   Ativar: VITE_SCOUT_DIAGNOSTICS_ENABLED=true ou localStorage.SCOUT_DIAG_ENABLED='1'
 *   Cada evento do scoutDiag é enviado em batch para /api/gemini endpoint (action: recordDiagnostics) → Supabase scout_diagnostics.
 *   Se a API falhar, eventos são salvos em localStorage para retry.
 */

const PREFIX = '\u{1F985} [Scout360]';
const TRACE_STORAGE_KEY = 'scoutTrace';
const DIAG_BUFFER_KEY = '__SCOUT_DIAG_HISTORY__';
const DIAG_LOCALSTORAGE_KEY = 'scout_diag_fallback';
const DIAG_VISIBILITY_KEY = 'scout_diag_visibility';
const DIAG_LOCALSTORAGE_MAX_KEYS = 5;
const DIAG_FLUSH_INTERVAL_MS = 5_000;
const DIAG_FLUSH_BATCH_SIZE = 10;
const DIAG_FLUSH_TIMEOUT_MS = 3_000;
const INFO_SAMPLE_PERCENT = 10;
const NOISY_DIAGNOSTIC_AREAS = new Set(['BlankPanelDebug', 'LayoutTrace', 'Visibility']);
const NOISY_DIAGNOSTIC_EVENTS = new Set([
  'heartbeat',
  'overlay:render-decision',
  'commit:dimensions',
  'panel:snapshot',
  'static-fallback-rendered',
]);
const BUSINESS_DIAGNOSTIC_AREA = /Lifecycle|Provider|Model|Usage|Lease/i;
const BUSINESS_DIAGNOSTIC_EVENT =
  /(^|:)(start|started|begin|end|ended|complete|completed|success|failed|failure|error|provider|model|tokens?|cost|retry|fallback|lifecycle|lease)(:|$)/i;

// ── Buffer global ──────────────────────────────────────────────────

interface DiagEntry {
  at: string;
  t: number;
  runId: string;
  sessionId?: string;
  area: string;
  event: string;
  severity: string;
  elapsedMs?: number;
  payload?: Record<string, unknown>;
}

declare global {
  interface Window {
    [DIAG_BUFFER_KEY]?: DiagEntry[];
    __SCOUT_DUMP_DIAG__?: () => DiagEntry[];
    __SCOUT_FLUSH_DIAG__?: (reason: string) => void;
  }
}

let diagRunId: string | null = null;
let diagSessionId: string | null = null;
let diagFlushTimer: ReturnType<typeof setTimeout> | null = null;
let diagFlushing = false;
let pendingForceFlush = false;

function getDiagnosticsRunId(): string {
  if (!diagRunId) {
    diagRunId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }
  return diagRunId;
}

function stableDiagnosticBucket(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 100;
}

function shouldBufferDiagnostic(area: string, event: string, severity: string, runId: string): boolean {
  if (
    area === 'Diagnostic' ||
    NOISY_DIAGNOSTIC_AREAS.has(area) ||
    NOISY_DIAGNOSTIC_EVENTS.has(event) ||
    event.startsWith('probe:')
  ) {
    return false;
  }
  if (severity === 'error' || severity === 'warn') return true;
  if (area === 'DossierModule' && event === 'usage metadata') return true;
  if (BUSINESS_DIAGNOSTIC_AREA.test(area) || BUSINESS_DIAGNOSTIC_EVENT.test(`${area}:${event}`)) return true;
  if (severity !== 'info') return false;
  return stableDiagnosticBucket(`${runId}:${area}:${event}`) < INFO_SAMPLE_PERCENT;
}

export function setDiagnosticsSessionId(sessionId: string): void {
  diagSessionId = sessionId;
}

function isDiagnosticsEnabled(): boolean {
  try {
    if (typeof window === 'undefined') return false;

    // Env var tem precedência: se explicitamente definida, ela decide
    const envValue =
      typeof process !== 'undefined' && process.env
        ? process.env.VITE_SCOUT_DIAGNOSTICS_ENABLED
        : (import.meta as any).env?.VITE_SCOUT_DIAGNOSTICS_ENABLED;

    if (envValue === 'true') return true;
    if (envValue === 'false') return false;

    // Se env var não está definida, localStorage pode ativar (útil em previews)
    return window.localStorage?.getItem('SCOUT_DIAG_ENABLED') === '1';
  } catch {
    return false;
  }
}

function getOperatorId(): string | null {
  try {
    return window.localStorage?.getItem('scout360:operator_id') || null;
  } catch {
    return null;
  }
}

function getBuffer(): DiagEntry[] {
  if (typeof window === 'undefined') return [];
  if (!window[DIAG_BUFFER_KEY]) {
    window[DIAG_BUFFER_KEY] = [];
  }
  return window[DIAG_BUFFER_KEY]!;
}

function pushToBuffer(entry: DiagEntry): void {
  if (!isDiagnosticsEnabled()) return;
  const buffer = getBuffer();
  buffer.push(entry);

  // Keep max 500 events in memory
  if (buffer.length > 500) {
    buffer.splice(0, buffer.length - 500);
  }

  // Save a copy to localStorage as emergency fallback
  try {
    const recent = buffer.slice(-50);
    window.localStorage?.setItem(DIAG_LOCALSTORAGE_KEY, JSON.stringify(recent));
  } catch {
    /* quota exceeded, ignore */
  }

  // Flush immediately on errors
  if (entry.severity === 'error') {
    scheduleFlush('error');
  }

  // Always schedule a deferred flush so tail events below batch size do not die with the tab.
  if (buffer.length % DIAG_FLUSH_BATCH_SIZE === 0) {
    scheduleFlush('batch');
  } else {
    scheduleFlush('buffer');
  }
}

function scheduleFlush(reason: string): void {
  const isImmediate = reason === 'error' || reason === 'immediate';
  if (isImmediate) {
    if (diagFlushTimer) {
      clearTimeout(diagFlushTimer);
      diagFlushTimer = null;
    }
    void flushToServer(reason);
    return;
  }
  if (diagFlushTimer) return; // already scheduled
  diagFlushTimer = setTimeout(() => {
    diagFlushTimer = null;
    void flushToServer(reason);
  }, DIAG_FLUSH_INTERVAL_MS);
}

async function flushToServer(_reason: string, force = false): Promise<void> {
  if (diagFlushing) {
    if (!force) return;
    // force=true: não inicia flush concorrente — agenda dreno pós-flush atual
    pendingForceFlush = true;
    return;
  }
  const buffer = getBuffer();
  if (buffer.length === 0) return;

  diagFlushing = true;
  const events = buffer.splice(0, buffer.length);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DIAG_FLUSH_TIMEOUT_MS);

    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'recordDiagnostics',
        runId: getDiagnosticsRunId(),
        sessionId: diagSessionId,
        operatorId: getOperatorId(),
        environment: (import.meta as any).env?.MODE || 'unknown',
        route: window.location?.pathname || '',
        userAgent: navigator.userAgent || '',
        events,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      saveToLocalStorageFallback(events);
    }
  } catch {
    saveToLocalStorageFallback(events);
  } finally {
    diagFlushing = false;
    // Reagenda se novos eventos chegaram durante o flush
    // ou se um force flush foi solicitado (ex: PostCompletion após finally)
    const needsDrain = getBuffer().length > 0 || pendingForceFlush;
    pendingForceFlush = false;
    if (needsDrain && !diagFlushTimer) {
      diagFlushTimer = setTimeout(() => {
        diagFlushTimer = null;
        void flushToServer('drain');
      }, DIAG_FLUSH_INTERVAL_MS);
    }
  }
}

function saveToLocalStorageFallback(events: DiagEntry[]): void {
  try {
    const ls = window.localStorage;
    if (!ls) return;

    const key = `${DIAG_LOCALSTORAGE_KEY}_${Date.now()}`;
    ls.setItem(key, JSON.stringify(events.slice(-50)));

    // Prune old fallback keys — keep only the most recent N
    const fallbackKeys: string[] = [];
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k?.startsWith(DIAG_LOCALSTORAGE_KEY)) {
        fallbackKeys.push(k);
      }
    }
    fallbackKeys.sort(); // oldest first (timestamps sort lexicographically)
    while (fallbackKeys.length > DIAG_LOCALSTORAGE_MAX_KEYS) {
      ls.removeItem(fallbackKeys.shift()!);
    }
  } catch {
    /* ignore */
  }
}

export function flushDiagnosticsNow(reason: string, force = false): void {
  if (diagFlushTimer) {
    clearTimeout(diagFlushTimer);
    diagFlushTimer = null;
  }
  void flushToServer(reason, force);
}

// ── Visibility tracking ─────────────────────────────────────────────

interface VisibilityState {
  isLoading: boolean;
  loadingVariant: string | null | undefined;
  requestKind: string;
}

const visibilityState: VisibilityState = {
  isLoading: false,
  loadingVariant: 'hero',
  requestKind: 'default',
};

let visibilityHiddenAt: number | null = null;
let visibilityTrackingSetup = false;

export function updateVisibilityState(patch: Partial<VisibilityState>): void {
  Object.assign(visibilityState, patch);
}

/**
 * Atualiza o timestamp de hidden para agora — usado quando pagehide/freeze
 * disparam sem um visibilitychange:hidden prévio (ex: Safari mobile).
 */
function ensureHiddenAt(): void {
  if (visibilityHiddenAt === null && document.visibilityState === 'hidden') {
    visibilityHiddenAt = Date.now();
  }
}

function pushVisibilityEvent(event: string, _severity: 'info' | 'warn', extra?: Record<string, unknown>): void {
  if (!isDiagnosticsEnabled()) return;

  // Salva evento de visibilidade em chave dedicada no localStorage
  // para sobreviver a descarte de tab (pagehide/freeze)
  try {
    const ls = window.localStorage;
    if (ls) {
      const existing = JSON.parse(ls.getItem(DIAG_VISIBILITY_KEY) || '[]');
      existing.push({
        at: new Date().toISOString(),
        t: Math.round(performance.now()),
        event,
        visibilityState: document.visibilityState,
        isLoading: visibilityState.isLoading,
        hiddenDurationMs: extra?.hiddenDurationMs ?? null,
      });
      ls.setItem(DIAG_VISIBILITY_KEY, JSON.stringify(existing.slice(-20)));
    }
  } catch {
    /* ignore */
  }
}

export function setupVisibilityTracking(): void {
  if (typeof window === 'undefined' || visibilityTrackingSetup) return;
  visibilityTrackingSetup = true;

  const handleVisibilityChange = (): void => {
    const now = Date.now();
    const hidden = document.visibilityState === 'hidden';

    if (hidden) {
      visibilityHiddenAt = now;
      pushVisibilityEvent('visibility:hidden', 'info', {
        hiddenAt: now,
      });
    } else {
      pushVisibilityEvent('visibility:visible', 'info', {
        hiddenDurationMs: visibilityHiddenAt ? now - visibilityHiddenAt : undefined,
      });
      visibilityHiddenAt = null;
    }

    flushDiagnosticsNow('visibility-change');
  };

  const handlePageHide = (event: PageTransitionEvent): void => {
    ensureHiddenAt();
    pushVisibilityEvent('pagehide', 'warn', {
      persisted: event.persisted,
      hiddenDurationMs: visibilityHiddenAt ? Date.now() - visibilityHiddenAt : undefined,
    });
    flushDiagnosticsNow('pagehide', true);
  };

  const handlePageShow = (event: PageTransitionEvent): void => {
    pushVisibilityEvent('pageshow', 'info', {
      persisted: event.persisted,
      hiddenDurationMs: visibilityHiddenAt ? Date.now() - visibilityHiddenAt : undefined,
    });
    visibilityHiddenAt = null;
    flushDiagnosticsNow('pageshow');
  };

  const handleFreeze = (): void => {
    ensureHiddenAt();
    pushVisibilityEvent('freeze', 'warn');
    flushDiagnosticsNow('freeze', true);
  };

  const handleResume = (): void => {
    pushVisibilityEvent('resume', 'info', {
      hiddenDurationMs: visibilityHiddenAt ? Date.now() - visibilityHiddenAt : undefined,
    });
    visibilityHiddenAt = null;
    flushDiagnosticsNow('resume');
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('pagehide', handlePageHide);
  window.addEventListener('pageshow', handlePageShow);

  if ('onfreeze' in document) {
    document.addEventListener('freeze', handleFreeze);
    document.addEventListener('resume', handleResume);
  }
}

// ── Heartbeat ────────────────────────────────────────────────────────

export function setupHeartbeat(): () => void {
  return () => {};
}

// ── Scout trace ────────────────────────────────────────────────────

function normalizeTraceTarget(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === 'off' || normalized === 'false' || normalized === '0') return null;
  return normalized
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
    .join(',');
}

export function getScoutTraceTarget(): string | null {
  try {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    if (params.has(TRACE_STORAGE_KEY)) {
      const target = normalizeTraceTarget(params.get(TRACE_STORAGE_KEY));
      if (target) {
        window.localStorage?.setItem(TRACE_STORAGE_KEY, target);
        return target;
      }
      window.localStorage?.removeItem(TRACE_STORAGE_KEY);
      return null;
    }
    return normalizeTraceTarget(window.localStorage?.getItem(TRACE_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function isScoutTraceEnabled(target: string): boolean {
  const activeTarget = getScoutTraceTarget();
  if (!activeTarget) return false;
  if (activeTarget === 'all') return true;
  return activeTarget.split(',').some(part => part === target.toLowerCase());
}

export function createScoutTraceId(target: string): string {
  return `${target}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ── Verbose gate ───────────────────────────────────────────────────

function isVerboseEnabled(): boolean {
  try {
    const isDev =
      typeof process !== 'undefined' && process.env
        ? process.env.NODE_ENV === 'development'
        : (import.meta as any).env?.DEV === true;

    const verbose =
      typeof process !== 'undefined' && process.env
        ? process.env.VITE_VERBOSE_LOGS === 'true' || process.env.VITE_DEBUG_CONSOLE === 'true'
        : (import.meta as any).env?.VITE_VERBOSE_LOGS === 'true' ||
          (import.meta as any).env?.VITE_DEBUG_CONSOLE === 'true';

    return isDev || verbose;
  } catch {
    return false;
  }
}

function safeDetails(details: Record<string, unknown> | undefined): unknown {
  if (!details) return '';
  try {
    return JSON.parse(
      JSON.stringify(details, (_k, v) => {
        if (v instanceof Error) {
          return { name: v.name, message: v.message, stack: v.stack };
        }
        return v;
      }),
    );
  } catch {
    return details;
  }
}

// ── Timer ──────────────────────────────────────────────────────────

function startTimer(scope: string, label: string) {
  const start = performance.now();
  if (isVerboseEnabled()) {
    console.debug(`${PREFIX}[${scope}] ▶ ${label} iniciado`);
  }
  return {
    end(details?: Record<string, unknown>): void {
      const ms = (performance.now() - start).toFixed(1);
      if (isVerboseEnabled()) {
        console.info(`${PREFIX}[${scope}] ✔ ${label} — ${ms}ms`, safeDetails(details));
      }
    },
    fail(err: unknown): void {
      const ms = (performance.now() - start).toFixed(1);
      console.error(
        `${PREFIX}[${scope}] ✖ ${label} falhou em ${ms}ms`,
        err instanceof Error ? { name: err.name, message: err.message } : err,
      );
    },
  };
}

// ── scoutDiag ──────────────────────────────────────────────────────

export function isScoutDiagEnabled(): boolean {
  return isVerboseEnabled();
}

function diagEntry(area: string, event: string, severity: string, payload?: Record<string, unknown>): void {
  if (!isDiagnosticsEnabled()) return;
  const runId = getDiagnosticsRunId();
  if (!shouldBufferDiagnostic(area, event, severity, runId)) return;
  pushToBuffer({
    at: new Date().toISOString(),
    t: performance.now(),
    runId,
    sessionId: diagSessionId || undefined,
    area,
    event,
    severity,
    payload: payload ? (safeDetails(payload) as Record<string, unknown>) : undefined,
  });
}

export const scoutDiag = {
  trace(target: string, scope: string, message: string, details?: Record<string, unknown>): void {
    if (!isScoutTraceEnabled(target)) return;
    const entry = `${PREFIX}[Trace:${target}][${scope}] ${message}`;
    console.info(entry, safeDetails(details));
    diagEntry(scope, message, 'debug', { traceTarget: target, ...details });
  },

  debug(scope: string, message: string, details?: Record<string, unknown>): void {
    if (!isVerboseEnabled()) return;
    console.debug(`${PREFIX}[${scope}] ${message}`, safeDetails(details));
    diagEntry(scope, message, 'debug', details);
  },

  info(scope: string, message: string, details?: Record<string, unknown>): void {
    if (!isVerboseEnabled()) return;
    console.info(`${PREFIX}[${scope}] ${message}`, safeDetails(details));
    diagEntry(scope, message, 'info', details);
  },

  warn(scope: string, message: string, details?: Record<string, unknown>): void {
    console.warn(`${PREFIX}[${scope}] ⚠ ${message}`, safeDetails(details));
    diagEntry(scope, message, 'warn', details);
  },

  error(scope: string, message: string, details?: Record<string, unknown>): void {
    console.error(`${PREFIX}[${scope}] ✖ ${message}`, safeDetails(details));
    diagEntry(scope, message, 'error', details);
  },

  startTimer,
};

// ── Dump helpers ───────────────────────────────────────────────────

if (typeof window !== 'undefined') {
  window.__SCOUT_DUMP_DIAG__ = () => {
    const buffer = getBuffer();
    console.table(
      buffer.slice(-50).map(e => ({
        area: e.area,
        event: e.event,
        severity: e.severity,
        elapsedMs: e.elapsedMs,
        t: e.t,
      })),
    );
    return [...buffer];
  };

  window.__SCOUT_FLUSH_DIAG__ = (reason: string) => {
    flushDiagnosticsNow(reason);
  };
}

/**
 * serverDiagnostics.ts — Lógica server-side de sanitização e insert no Supabase.
 *
 * IMPORTADO exclusivamente por api/llm.ts (action 'recordDiagnostics').
 * NÃO importar no frontend — este módulo usa process.env diretamente.
 */

interface DiagnosticEvent {
  at: string;
  t: number;
  runId: string;
  sessionId?: string;
  area: string;
  event: string;
  severity?: string;
  elapsedMs?: number;
  payload?: Record<string, unknown>;
}

interface DiagnosticBatch {
  runId: string;
  sessionId?: string;
  operatorId?: string;
  environment?: string;
  appVersion?: string;
  route?: string;
  userAgent?: string;
  events: DiagnosticEvent[];
}

const ALLOWED_FIELDS = new Set([
  'at',
  't',
  'runId',
  'sessionId',
  'area',
  'event',
  'severity',
  'elapsedMs',
  'payload',
  'operatorId',
  'environment',
  'appVersion',
  'route',
  'userAgent',
]);

const MAX_PAYLOAD_DEPTH = 4;
const MAX_STRING_LENGTH = 2000;
export const MAX_EVENTS_PER_BATCH = 100;
const INFO_SAMPLE_PERCENT = 10;
const NOISY_AREAS = new Set(['BlankPanelDebug', 'LayoutTrace', 'Visibility']);
const NOISY_EVENTS = new Set([
  'heartbeat',
  'overlay:render-decision',
  'commit:dimensions',
  'panel:snapshot',
  'static-fallback-rendered',
]);
const BUSINESS_EVENT_PATTERN =
  /(^|:)(start|started|begin|end|ended|complete|completed|success|failed|failure|error|provider|model|tokens?|cost|retry|fallback|lifecycle|lease)(:|$)/i;
const BUSINESS_AREA_PATTERN = /Lifecycle|Provider|Model|Usage|Lease/i;
const RETENTION_TIMEOUT_MS = 2_000;
let lastRetentionAttemptDay: string | null = null;

function stableBucket(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 100;
}

export function shouldPersistDiagnostic(event: DiagnosticEvent): boolean {
  const area = String(event.area || '');
  const name = String(event.event || '');
  const severity = String(event.severity || 'info').toLowerCase();

  if (area === 'Diagnostic' || NOISY_AREAS.has(area) || NOISY_EVENTS.has(name) || name.startsWith('probe:')) {
    return false;
  }
  if (severity === 'error' || severity === 'warn') return true;
  if (area === 'DossierModule' && name === 'usage metadata') return true;
  if (BUSINESS_AREA_PATTERN.test(area) || BUSINESS_EVENT_PATTERN.test(`${area}:${name}`)) return true;
  if (severity !== 'info') return false;
  return stableBucket(`${event.runId}:${area}:${name}`) < INFO_SAMPLE_PERCENT;
}

function sanitizeString(value: string, maxLen: number = MAX_STRING_LENGTH): string {
  return String(value).slice(0, maxLen);
}

function isSensitivePayloadKey(lower: string): boolean {
  return (
    lower.includes('token') ||
    lower.includes('key') ||
    lower.includes('secret') ||
    lower.includes('password') ||
    lower.includes('auth') ||
    lower.includes('credential') ||
    lower.includes('prompt') ||
    lower.includes('response') ||
    lower.includes('content') ||
    lower.includes('text') ||
    lower.includes('body')
  );
}

function isSafeTelemetryMetric(lower: string, value: unknown): boolean {
  if (typeof value !== 'number' && typeof value !== 'boolean') return false;

  return (
    lower.endsWith('len') ||
    lower.endsWith('length') ||
    lower.endsWith('chars') ||
    lower.endsWith('count') ||
    lower.endsWith('height') ||
    lower.endsWith('width') ||
    lower.includes('visible') ||
    lower.includes('exists') ||
    lower.includes('contains') ||
    lower.includes('offset') ||
    lower.includes('scroll') ||
    lower.includes('client') ||
    lower.includes('rect')
  );
}

function isSafeTelemetryLabel(lower: string, value: unknown): boolean {
  if (typeof value !== 'string') return false;

  return (
    lower.endsWith('testid') ||
    lower.endsWith('tag') ||
    lower.endsWith('role') ||
    lower.endsWith('reason') ||
    lower.endsWith('state') ||
    lower.endsWith('source') ||
    lower.endsWith('variant') ||
    lower.endsWith('branch')
  );
}

function sanitizePayload(obj: unknown, depth: number = 0): unknown {
  if (depth > MAX_PAYLOAD_DEPTH) return '[truncated: max depth]';
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return sanitizeString(obj);
  if (typeof obj === 'number' || typeof obj === 'boolean') return obj;
  if (Array.isArray(obj)) {
    return obj.slice(0, 50).map(item => sanitizePayload(item, depth + 1));
  }
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    const keys = Object.keys(obj as Record<string, unknown>).slice(0, 30);
    for (const key of keys) {
      const lower = key.toLowerCase();
      const value = (obj as Record<string, unknown>)[key];
      if (isSensitivePayloadKey(lower) && !isSafeTelemetryMetric(lower, value) && !isSafeTelemetryLabel(lower, value)) {
        continue;
      }
      result[key] = sanitizePayload(value, depth + 1);
    }
    return result;
  }
  return String(obj).slice(0, MAX_STRING_LENGTH);
}

function sanitizeEvent(event: DiagnosticEvent): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(event)) {
    if (!ALLOWED_FIELDS.has(key)) continue;
    if (value === undefined || value === null) continue;
    clean[key] = sanitizePayload(value);
  }
  return clean;
}

function getSupabaseConfig(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/g, ''), key };
}

export async function insertDiagnosticsBatch(
  batch: DiagnosticBatch,
  events: DiagnosticEvent[],
): Promise<{ inserted: number; error?: string }> {
  const config = getSupabaseConfig();
  if (!config) return { inserted: 0, error: 'Supabase not configured' };

  const rows = events
    .filter(shouldPersistDiagnostic)
    .slice(0, MAX_EVENTS_PER_BATCH)
    .map(event => {
      const clean = sanitizeEvent(event);
      return {
        run_id: batch.runId,
        session_id: batch.sessionId || event.sessionId || null,
        operator_id: batch.operatorId || null,
        environment: batch.environment || null,
        app_version: batch.appVersion || null,
        route: batch.route || null,
        user_agent: batch.userAgent || null,
        area: clean.area as string,
        event: clean.event as string,
        severity: (clean.severity as string) || 'info',
        elapsed_ms: typeof clean.elapsedMs === 'number' ? clean.elapsedMs : null,
        payload: clean.payload || null,
      };
    });

  if (rows.length === 0) return { inserted: 0 };

  try {
    const response = await fetch(`${config.url}/rest/v1/scout_diagnostics`, {
      method: 'POST',
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(rows),
    });

    if (!response.ok) {
      return { inserted: 0, error: `Supabase returned ${response.status}` };
    }

    await triggerOpportunisticRetention(config);

    return { inserted: rows.length };
  } catch (err) {
    return { inserted: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

async function triggerOpportunisticRetention(config: { url: string; key: string }): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  if (lastRetentionAttemptDay === today) return;
  lastRetentionAttemptDay = today;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RETENTION_TIMEOUT_MS);
  try {
    const response = await fetch(`${config.url}/rest/v1/rpc/cleanup_scout_diagnostics_opportunistic`, {
      method: 'POST',
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ retention_days: 14, batch_size: 500 }),
      signal: controller.signal,
    });
    if (!response.ok) {
      console.warn('[ScoutDiagnostics] opportunistic retention rejected', { status: response.status });
    }
  } catch (error) {
    console.warn('[ScoutDiagnostics] opportunistic retention failed', {
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    clearTimeout(timeout);
  }
}

export function resetDiagnosticsRetentionThrottleForTests(): void {
  lastRetentionAttemptDay = null;
}

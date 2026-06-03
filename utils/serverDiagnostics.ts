/**
 * serverDiagnostics.ts — Lógica server-side de sanitização e insert no Supabase.
 *
 * IMPORTADO exclusivamente por api/gemini.ts (action 'recordDiagnostics').
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
      if (
        isSensitivePayloadKey(lower) &&
        !isSafeTelemetryMetric(lower, value) &&
        !isSafeTelemetryLabel(lower, value)
      ) {
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

  const rows = events.map(event => {
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

    return { inserted: rows.length };
  } catch (err) {
    return { inserted: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

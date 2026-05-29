import { supabase } from '../lib/supabaseClient';

interface WaterfallLogEntry {
  session_id: string;
  operator_id?: string;
  company_name?: string;
  event: string;
  module_name?: string;
  status?: 'success' | 'failed' | 'timeout' | 'started';
  elapsed_ms?: number;
  detail?: Record<string, unknown>;
}

let currentSessionId: string | null = null;
let currentOperatorId: string | null = null;
let currentCompany: string | null = null;

export function initWaterfallTrace(sessionId: string, operatorId?: string, company?: string) {
  currentSessionId = sessionId;
  currentOperatorId = operatorId || null;
  currentCompany = company || null;
}

async function logEntry(event: string, extra?: Partial<WaterfallLogEntry>) {
  if (!supabase || !currentSessionId) return;

  const entry: WaterfallLogEntry = {
    session_id: currentSessionId,
    operator_id: currentOperatorId || undefined,
    company_name: currentCompany || undefined,
    event,
    ...extra,
  };

  try {
    await supabase.from('waterfall_logs').insert(entry);
  } catch {
    /* não pode quebrar o waterfall */
  }
}

/** Fire-and-forget — não espera o insert, não bloqueia */
function trace(event: string, extra?: Partial<WaterfallLogEntry>) {
  void logEntry(event, extra);
}

export const waterfallTrace = {
  start() {
    trace('waterfall:start');
  },

  moduleStart(name: string) {
    trace('module:start', { module_name: name, status: 'started' });
  },

  moduleEnd(name: string, elapsedMs: number, ok: boolean, errorDetail?: string) {
    trace('module:end', {
      module_name: name,
      status: ok ? 'success' : 'failed',
      elapsed_ms: elapsedMs,
      ...(errorDetail ? { detail: { error: errorDetail } } : {}),
    });
  },

  moduleTimeout(name: string, elapsedMs: number) {
    trace('module:end', {
      module_name: name,
      status: 'timeout',
      elapsed_ms: elapsedMs,
    });
  },

  end(totalMs: number) {
    trace('waterfall:end', { elapsed_ms: totalMs });
  },

  error(detail: Record<string, unknown>) {
    trace('waterfall:error', { status: 'failed', detail });
  },
};

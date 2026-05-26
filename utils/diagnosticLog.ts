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
 * Como ver timers de performance no DevTools:
 *   Adicione na Vercel: VITE_DEBUG_CONSOLE=true
 */

const PREFIX = '🦅 [Scout360]';
const TRACE_STORAGE_KEY = 'scoutTrace';

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

function isVerboseEnabled(): boolean {
  try {
    // No Vercel/Node usar process.env, no Vite/Browser usar import.meta.env
    const isDev = typeof process !== 'undefined' && process.env ? 
                  process.env.NODE_ENV === 'development' : 
                  (import.meta as any).env?.DEV === true;

    const verbose = typeof process !== 'undefined' && process.env ?
                    process.env.VITE_VERBOSE_LOGS === 'true' || process.env.VITE_DEBUG_CONSOLE === 'true' :
                    (import.meta as any).env?.VITE_VERBOSE_LOGS === 'true' || (import.meta as any).env?.VITE_DEBUG_CONSOLE === 'true';

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

/**
 * Timer de performance. Uso:
 *   const t = scoutDiag.startTimer('GeminiService', 'generateDossie');
 *   t.end({ chars: 1200 });
 *   t.fail(new Error('timeout'));
 */
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
      // fail sempre loga como error (visível em produção)
      console.error(
        `${PREFIX}[${scope}] ✖ ${label} falhou em ${ms}ms`,
        err instanceof Error ? { name: err.name, message: err.message } : err,
      );
    },
  };
}

/** Alias de compatibilidade legado */
export function isScoutDiagEnabled(): boolean {
  return isVerboseEnabled();
}

export const scoutDiag = {
  trace(target: string, scope: string, message: string, details?: Record<string, unknown>): void {
    if (!isScoutTraceEnabled(target)) return;
    console.info(`${PREFIX}[Trace:${target}][${scope}] ${message}`, safeDetails(details));
  },

  /**
   * debug — só aparece em DEV ou com VITE_DEBUG_CONSOLE=true
   * Use para rastreamento fino de estado interno.
   */
  debug(scope: string, message: string, details?: Record<string, unknown>): void {
    if (!isVerboseEnabled()) return;
    console.debug(`${PREFIX}[${scope}] ${message}`, safeDetails(details));
  },

  /**
   * info — só aparece em DEV ou com VITE_VERBOSE_LOGS=true
   * Use para milestones de fluxo (lookup concluído, RAG retornou N chunks, etc.)
   */
  info(scope: string, message: string, details?: Record<string, unknown>): void {
    if (!isVerboseEnabled()) return;
    console.info(`${PREFIX}[${scope}] ${message}`, safeDetails(details));
  },

  /**
   * warn — SEMPRE aparece em produção
   * Use para degradações esperadas (fallback ativado, API lenta, dado ausente).
   */
  warn(scope: string, message: string, details?: Record<string, unknown>): void {
    console.warn(`${PREFIX}[${scope}] ⚠ ${message}`, safeDetails(details));
  },

  /**
   * error — SEMPRE aparece em produção
   * Use para falhas reais que impactam o usuário.
   */
  error(scope: string, message: string, details?: Record<string, unknown>): void {
    console.error(`${PREFIX}[${scope}] ✖ ${message}`, safeDetails(details));
  },

  /**
   * startTimer — mede performance de operações assíncronas.
   * end() só loga em verbose; fail() sempre loga como error.
   *
   * Exemplo:
   *   const t = scoutDiag.startTimer('GeminiService', 'generateDossie → Senior Sistemas');
   *   try { await ...; t.end({ model }); }
   *   catch(err) { t.fail(err); throw err; }
   */
  startTimer,
};

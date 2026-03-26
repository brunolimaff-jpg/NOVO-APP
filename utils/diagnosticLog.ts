/**
 * Logs padronizados para validação no DevTools.
 * Ativo em: import.meta.env.DEV, VITE_VERBOSE_LOGS=true ou VITE_DEBUG_CONSOLE=true
 */
const PREFIX = '[Scout360]';

export function isScoutDiagEnabled(): boolean {
  try {
    const env = import.meta.env as Record<string, string | boolean | undefined>;
    if (env?.DEV) return true;
    if (env?.VITE_VERBOSE_LOGS === 'true') return true;
    if (env?.VITE_DEBUG_CONSOLE === 'true') return true;
  } catch {
    /* no-op */
  }
  return false;
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

export const scoutDiag = {
  debug(scope: string, message: string, details?: Record<string, unknown>): void {
    if (!isScoutDiagEnabled()) return;
    console.debug(`${PREFIX}[${scope}] ${message}`, safeDetails(details));
  },

  info(scope: string, message: string, details?: Record<string, unknown>): void {
    if (!isScoutDiagEnabled()) return;
    console.info(`${PREFIX}[${scope}] ${message}`, safeDetails(details));
  },

  warn(scope: string, message: string, details?: Record<string, unknown>): void {
    if (!isScoutDiagEnabled()) return;
    console.warn(`${PREFIX}[${scope}] ${message}`, safeDetails(details));
  },

  error(scope: string, message: string, details?: Record<string, unknown>): void {
    if (!isScoutDiagEnabled()) return;
    console.error(`${PREFIX}[${scope}] ${message}`, safeDetails(details));
  },
};

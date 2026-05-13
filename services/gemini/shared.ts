/**
 * Utilitários compartilhados entre os handlers Gemini.
 * Extraídos de api/gemini.ts e api/gerar-dossie.ts para eliminar duplicação.
 *
 * Uso:
 *   import { geminiShared } from '../services/gemini/shared';
 *   const keys = geminiShared.getApiKeys();
 */

export const geminiShared = {
  getApiKeys(): string[] {
    const primary = process.env.GEMINI_API_KEY;
    const fallback = process.env.GEMINI_API_KEY_FALLBACK;
    const keys = [primary, fallback].filter((key): key is string => Boolean(key));

    if (keys.length === 0) {
      throw new Error('Missing required env var: GEMINI_API_KEY');
    }

    return keys;
  },

  isQuotaExhausted(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /RESOURCE_EXHAUSTED|check quota|rate.?limit/i.test(message) || /"code"\s*:\s*429/.test(message);
  },

  toNumberSafe(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  },

  extractHttpStatus(error: unknown): number {
    if (error instanceof Error) {
      const message = error.message;
      if (/"code"\s*:\s*429/.test(message) || /RESOURCE_EXHAUSTED|rate.?limit|quota/i.test(message)) return 429;
    }

    const err = error as Record<string, unknown>;
    if (typeof err.status === 'number' && err.status >= 400 && err.status < 600) return err.status;
    if (typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 600) return err.statusCode;
    return 500;
  },
};

// Re-export as named for backward compat with existing imports
export const { getApiKeys, isQuotaExhausted, toNumberSafe, extractHttpStatus } = geminiShared;

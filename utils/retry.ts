import { AppError } from '../types';
import { normalizeAppError } from './errorHelpers';

interface RetryOptions {
  maxRetries?: number; // Default: 3
  baseDelayMs?: number; // Default: 1000ms
  maxDelayMs?: number; // Default: 10000ms
  jitter?: boolean; // Default: true
  abortSignal?: AbortSignal; // If provided, cancels retries when aborted
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Executa uma função assíncrona com retry automático para erros transientes.
 * Usa Exponential Backoff + Full Jitter.
 */
export async function withAutoRetry<T>(
  actionName: string,
  action: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 1000, maxDelayMs = 10000, jitter = true, abortSignal } = options;

  let attempt = 0;

  while (true) {
    if (abortSignal?.aborted) {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      throw abortError;
    }

    try {
      return await action();
    } catch (error: unknown) {
      const errorName = error instanceof Error ? error.name : undefined;

      // Não tenta novamente se foi abortado
      if (abortSignal?.aborted || errorName === 'AbortError') throw error;

      // Normaliza erro para checar se é transiente
      const appError: AppError = normalizeAppError(error);

      // Se não for transiente ou esgotou tentativas, falha
      if (!appError.transient || attempt >= maxRetries) {
        if (attempt >= maxRetries) {
          console.warn(`[AutoRetry] ${actionName} failed after ${attempt} retries.`);
        }
        throw appError; // Repassa o erro normalizado
      }

      attempt++;

      // Cálculo do Backoff Exponencial
      // delay = base * 2^(attempt-1)
      const exponentialDelay = baseDelayMs * Math.pow(2, attempt - 1);

      // Cap no delay máximo
      const cappedDelay = Math.min(exponentialDelay, maxDelayMs);

      // Full Jitter: random entre 0 e cappedDelay
      // Isso evita o problema de "thundering herd" onde todos retentam ao mesmo tempo
      const finalDelay = jitter ? Math.random() * cappedDelay : cappedDelay;

      console.warn(
        `[AutoRetry] ${actionName} error (${appError.code}). Retrying in ${Math.round(finalDelay)}ms (Attempt ${attempt}/${maxRetries})`,
      );

      await wait(finalDelay);
    }
  }
}

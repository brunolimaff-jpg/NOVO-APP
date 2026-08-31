import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { runWithStepTimeout } from '../../services/llm/runtime';
import {
  DOSSIER_REQUIRED_STEP_TIMEOUT_MS,
  LLM_PROXY_TIMEOUT_DEFAULT_MS,
} from '../../services/llm/budgets';

/**
 * BRU-157 — Zen-only stabilization: ownership do budget (REAL_PROVIDER_CALLS=0).
 *
 * Regressão: `DossierModule:Operação / Cadeia de Valor timeout after 90000ms`
 * abortou o consumidor antes de /api/llm/Zen terminar (proxy anuncia 210s,
 * Vercel recebe HTTP 200 após o abort).
 *
 * Invariante de ownership: o step interno deriva do proxy (210s + headroom).
 * O erro canônico é o do proxy; o step nunca aborta antes do proxy decidir.
 */
function actionThatResolvesAt(ms: number, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => resolve('completed'), ms);
    const onAbort = () => {
      clearTimeout(id);
      reject(new DOMException('The operation was aborted', 'AbortError'));
    };
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

describe('Ownership do budget LLM (BRU-157)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('step canônico cobre o proxy: nunca aborta chamada que o proxy ainda considera válida', () => {
    expect(DOSSIER_REQUIRED_STEP_TIMEOUT_MS).toBeGreaterThan(LLM_PROXY_TIMEOUT_DEFAULT_MS);
    expect(LLM_PROXY_TIMEOUT_DEFAULT_MS).toBe(210_000);
  });

  it('chamada que termina entre proxy e step NÃO é abortada pelo step (resolve)', async () => {
    // A action termina em 220s — depois do proxy (210s), antes do step canônico (225s).
    // Se o step abortasse antes do proxy decidir, isso falharia como TimeoutError.
    const promise = runWithStepTimeout(
      'módulo',
      signal => actionThatResolvesAt(220_000, signal),
      undefined,
      DOSSIER_REQUIRED_STEP_TIMEOUT_MS,
    );
    await vi.advanceTimersByTimeAsync(220_000);
    await expect(promise).resolves.toBe('completed');
  });

  it('abort do usuário continua abortando corretamente (não vira TimeoutError)', async () => {
    const controller = new AbortController();
    const promise = runWithStepTimeout(
      'módulo',
      signal => actionThatResolvesAt(500_000, signal),
      controller.signal,
      DOSSIER_REQUIRED_STEP_TIMEOUT_MS,
    );
    await vi.advanceTimersByTimeAsync(10_000);
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    await expect(promise).rejects.not.toMatchObject({ name: 'TimeoutError' });
  });

  it('timeout real do budget canônico continua fail-closed (TimeoutError)', async () => {
    // Action que só resolve após o tempo (não escuta abort) — mesmo padrão do
    // teste existente timeout-edge-cases, para não gerar unhandled rejection
    // quando o timeout aborta o controller interno.
    const promise = runWithStepTimeout(
      'módulo',
      () => new Promise(resolve => setTimeout(() => resolve('completed'), 500_000)),
      undefined,
      DOSSIER_REQUIRED_STEP_TIMEOUT_MS,
    );
    const assertion = expect(promise).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(DOSSIER_REQUIRED_STEP_TIMEOUT_MS + 1);
    await assertion;
  });
});

export const DOSSIER_RUN_RPC_NAMES = [
  'begin_dossier_run_attempt',
  'renew_dossier_run_attempt_lease',
  'record_dossier_run_checkpoint',
  'get_dossier_run_resume_state',
  'schedule_dossier_run_retry',
  'fail_dossier_run_attempt',
  'cancel_dossier_run_attempt',
  'persist_and_complete_dossier_run_attempt',
] as const;

export type DossierRunRpcName = (typeof DOSSIER_RUN_RPC_NAMES)[number];

export interface DossierRunRpcAuth {
  url: string;
  token: string;
  anonKey: string;
}

export type DossierRunRpcErrorCode =
  | 'REQUEST_ABORTED'
  | 'RPC_TIMEOUT'
  | 'RPC_INVALID_RESPONSE'
  | 'RPC_HTTP_ERROR'
  | 'RUN_NOT_FOUND'
  | 'RUN_TERMINAL'
  | 'RUN_CANCEL_REQUESTED'
  | 'RUN_LEASE_UNAVAILABLE'
  | 'ATTEMPT_NOT_ACTIVE'
  | 'ATTEMPT_FENCE_MISMATCH'
  | 'ATTEMPT_LEASE_EXPIRED'
  | 'ATTEMPT_LIMIT_REACHED'
  | 'PIPELINE_VERSION_MISMATCH'
  | 'RETRY_NOT_ALLOWED'
  | 'CHECKPOINT_CONFLICT'
  | 'CHECKPOINT_OUT_OF_ORDER'
  | 'CHECKPOINT_PAYLOAD_TOO_LARGE'
  | 'PERSISTENCE_FAILED'
  | 'DOSSIER_CONFLICT'
  | 'INTERNAL_ERROR';

export interface DossierRunRpcOptions {
  timeoutMs?: number;
  stage?: string;
}

export class DossierRunRpcError extends Error {
  constructor(
    readonly code: DossierRunRpcErrorCode,
    message: string,
    readonly retryable: boolean,
    readonly status = 502,
    readonly stage = 'rpc',
  ) {
    super(message);
    this.name = 'DossierRunRpcError';
  }
}

export type DossierRunRpcCaller = <T = unknown>(
  rpcName: DossierRunRpcName,
  body: Record<string, unknown>,
  signal: AbortSignal,
  options?: DossierRunRpcOptions,
) => Promise<T>;

const DEFAULT_RPC_TIMEOUT_MS = 10_000;

const KNOWN_CODES = new Set<DossierRunRpcErrorCode>([
  'REQUEST_ABORTED',
  'RPC_TIMEOUT',
  'RPC_INVALID_RESPONSE',
  'RPC_HTTP_ERROR',
  'RUN_NOT_FOUND',
  'RUN_TERMINAL',
  'RUN_CANCEL_REQUESTED',
  'RUN_LEASE_UNAVAILABLE',
  'ATTEMPT_NOT_ACTIVE',
  'ATTEMPT_FENCE_MISMATCH',
  'ATTEMPT_LEASE_EXPIRED',
  'ATTEMPT_LIMIT_REACHED',
  'PIPELINE_VERSION_MISMATCH',
  'RETRY_NOT_ALLOWED',
  'CHECKPOINT_CONFLICT',
  'CHECKPOINT_OUT_OF_ORDER',
  'CHECKPOINT_PAYLOAD_TOO_LARGE',
  'PERSISTENCE_FAILED',
  'DOSSIER_CONFLICT',
  'INTERNAL_ERROR',
]);

function normalizeUrl(value: string): string {
  const url = value.trim().replace(/\/+$/, '');
  if (!url) throw new DossierRunRpcError('INTERNAL_ERROR', 'RPC base URL ausente', false, 500);
  return url;
}

function readCode(value: unknown): DossierRunRpcErrorCode | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toUpperCase();
  if (KNOWN_CODES.has(normalized as DossierRunRpcErrorCode)) return normalized as DossierRunRpcErrorCode;
  for (const code of KNOWN_CODES) if (normalized.includes(code)) return code;
  return undefined;
}

function readErrorCode(body: unknown): DossierRunRpcErrorCode | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const candidate = body as Record<string, unknown>;
  return [candidate.code, candidate.message, candidate.details, candidate.hint]
    .map(readCode)
    .find((code): code is DossierRunRpcErrorCode => code !== undefined);
}

function responseRecord(body: unknown): Record<string, unknown> | null {
  const candidate = Array.isArray(body) ? body[0] : body;
  return candidate && typeof candidate === 'object' ? candidate as Record<string, unknown> : null;
}

function isRetryable(code: DossierRunRpcErrorCode, status: number): boolean {
  return (
    code === 'RPC_TIMEOUT' ||
    code === 'RPC_HTTP_ERROR' && (status === 408 || status === 429 || status >= 500) ||
    code === 'PERSISTENCE_FAILED' && (status === 408 || status === 429 || status >= 500) ||
    code === 'RUN_LEASE_UNAVAILABLE'
  );
}

function operationSignal(parent: AbortSignal, timeoutMs: number): {
  controller: AbortController;
  signal: AbortSignal;
  remainingMs: () => number;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const deadlineAt = Date.now() + timeoutMs;
  const abortFromParent = () => controller.abort();
  if (parent.aborted) controller.abort();
  else parent.addEventListener('abort', abortFromParent, { once: true });
  const timeout = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
  return {
    controller,
    signal: controller.signal,
    remainingMs: () => Math.max(0, deadlineAt - Date.now()),
    cleanup: () => {
      clearTimeout(timeout);
      parent.removeEventListener('abort', abortFromParent);
    },
  };
}

async function bounded<T>(
  operation: Promise<T>,
  timeoutMs: number,
  onTimeout: () => void,
  timeoutError: DossierRunRpcError,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const watchdog = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      onTimeout();
      reject(timeoutError);
    }, timeoutMs);
  });
  operation.catch(() => undefined);
  try {
    return await Promise.race([operation, watchdog]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function readBody(response: Response, operation: ReturnType<typeof operationSignal>, timeoutMs: number, stage: string): Promise<unknown> {
  const timeoutError = new DossierRunRpcError('RPC_TIMEOUT', 'Leitura da resposta RPC excedeu o limite', true, 504, stage);
  const remaining = operation.remainingMs();
  if (remaining <= 0) {
    operation.controller.abort();
    throw timeoutError;
  }
  const text = await bounded(
    response.text(),
    Math.min(timeoutMs, remaining),
    () => operation.controller.abort(),
    timeoutError,
  );
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new DossierRunRpcError('RPC_INVALID_RESPONSE', 'Resposta RPC inválida', true, 502, stage);
  }
}

export function createDossierRunRpcClient(auth: DossierRunRpcAuth): DossierRunRpcCaller {
  const baseUrl = normalizeUrl(auth.url);
  return async <T = unknown>(
    rpcName: DossierRunRpcName,
    body: Record<string, unknown>,
    signal: AbortSignal,
    options: DossierRunRpcOptions = {},
  ): Promise<T> => {
    const stage = options.stage ?? rpcName;
    const timeoutMs = Math.max(1, Math.floor(options.timeoutMs ?? DEFAULT_RPC_TIMEOUT_MS));
    if (signal.aborted) {
      throw new DossierRunRpcError('REQUEST_ABORTED', 'RPC cancelada antes do início', false, 499, stage);
    }

    const operation = operationSignal(signal, timeoutMs);
    const timeoutError = new DossierRunRpcError('RPC_TIMEOUT', 'RPC excedeu o limite', true, 504, stage);
    try {
      let response: Response;
      try {
        response = await bounded(
          fetch(`${baseUrl}/rest/v1/rpc/${rpcName}`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${auth.token}`,
              apikey: auth.anonKey,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
            signal: operation.signal,
          }),
          timeoutMs,
          () => operation.controller.abort(),
          timeoutError,
        );
      } catch (error) {
        if (error instanceof DossierRunRpcError) throw error;
        if (signal.aborted) throw new DossierRunRpcError('REQUEST_ABORTED', 'RPC cancelada', false, 499, stage);
        if (operation.signal.aborted) throw timeoutError;
        throw new DossierRunRpcError('RPC_HTTP_ERROR', 'Falha de transporte RPC', true, 502, stage);
      }

      const payload = await readBody(response, operation, timeoutMs, stage);
      if (!response.ok) {
        const code = readErrorCode(payload) ?? 'RPC_HTTP_ERROR';
        throw new DossierRunRpcError(
          code,
          'RPC recusou a operação',
          isRetryable(code, response.status),
          response.status >= 400 ? response.status : 502,
          stage,
        );
      }
      if (payload === null) {
        throw new DossierRunRpcError('RPC_INVALID_RESPONSE', 'RPC retornou corpo vazio', true, 502, stage);
      }
      return (responseRecord(payload) ?? payload) as T;
    } catch (error) {
      if (error instanceof DossierRunRpcError) throw error;
      if (signal.aborted) throw new DossierRunRpcError('REQUEST_ABORTED', 'RPC cancelada', false, 499, stage);
      throw new DossierRunRpcError('RPC_HTTP_ERROR', 'Falha inesperada na RPC', true, 502, stage);
    } finally {
      operation.cleanup();
    }
  };
}

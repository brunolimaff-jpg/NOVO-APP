import type { CreateRunPayload, FinalizeRunPayload } from './types.js';
import { getSupabaseAuthHeaders, refreshSupabaseAuthHeaders } from '../../lib/supabaseClient.js';
import { getExperimentConfig } from './modelRouter.js';

interface ExperimentApiResponse {
  id?: string;
  runToken?: string;
  error?: string;
}

interface ExperimentApiCallResult {
  data: ExperimentApiResponse;
  authHeaders: Record<string, string>;
}

export interface ExperimentRunHandle {
  id: string;
  runToken: string;
  authHeaders: Record<string, string>;
}

export interface ExperimentRequestOptions {
  authHeaders?: Record<string, string>;
  timeoutMs?: number;
}

const DEFAULT_EXPERIMENT_REQUEST_TIMEOUT_MS = 15_000;

class ExperimentApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function withinDeadline<T>(operation: Promise<T>, deadline: number, controller?: AbortController): Promise<T> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error('llm-experiment request timed out');

  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      controller?.abort();
      reject(new Error('llm-experiment request timed out'));
    }, remaining);
    operation.then(
      value => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      error => {
        clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

async function resolveExperimentAuthHeaders(
  payload: CreateRunPayload | FinalizeRunPayload,
  authHeadersOverride?: Record<string, string>,
): Promise<Record<string, string>> {
  const authHeaders = authHeadersOverride ? { ...authHeadersOverride } : await getSupabaseAuthHeaders();

  if (!authHeaders.Authorization) {
    const config = getExperimentConfig();
    if (config.previewLocalAuth) {
      const operatorEmail = 'operatorEmail' in payload ? payload.operatorEmail : undefined;
      if (operatorEmail) {
        authHeaders['x-experiment-operator-email'] = operatorEmail;
      }
    }
  }

  return authHeaders;
}

async function postExperimentAction(
  action: 'createRun' | 'finalizeRun',
  payload: CreateRunPayload | FinalizeRunPayload,
  options: ExperimentRequestOptions = {},
): Promise<ExperimentApiCallResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_EXPERIMENT_REQUEST_TIMEOUT_MS;
  const deadline =
    Date.now() + (Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_EXPERIMENT_REQUEST_TIMEOUT_MS);
  let authHeaders = await withinDeadline(resolveExperimentAuthHeaders(payload, options.authHeaders), deadline);

  let authRefreshed = false;
  let transientRetryUsed = false;

  while (true) {
    const controller = new AbortController();
    let response: Response;
    try {
      response = await withinDeadline(
        fetch('/api/llm-experiment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({ action, ...payload }),
          signal: controller.signal,
          keepalive: action === 'finalizeRun',
        }),
        deadline,
        controller,
      );
    } catch (error) {
      if (transientRetryUsed) throw error;
      transientRetryUsed = true;
      continue;
    }

    // A resposta 401 pode vir sem body. Renove a sessão antes de tentar parseá-la.
    if (response.status === 401 && !authRefreshed) {
      authRefreshed = true;
      authHeaders = await withinDeadline(refreshSupabaseAuthHeaders(), deadline);
      if (!authHeaders.Authorization) {
        throw new ExperimentApiError(401, 'llm-experiment session refresh failed');
      }
      continue;
    }

    if (response.status === 401) {
      throw new ExperimentApiError(401, 'llm-experiment authentication failed after session refresh');
    }

    if (
      !response.ok &&
      (response.status === 408 || response.status === 429 || response.status >= 500) &&
      !transientRetryUsed
    ) {
      transientRetryUsed = true;
      continue;
    }

    const data = await withinDeadline(response.json() as Promise<ExperimentApiResponse>, deadline, controller);
    if (response.ok) return { data, authHeaders };

    throw new ExperimentApiError(response.status, data.error ?? `llm-experiment ${action} failed (${response.status})`);
  }
}

export async function createExperimentRun(payload: CreateRunPayload): Promise<ExperimentRunHandle> {
  const result = await postExperimentAction('createRun', payload);
  if (!result.data.id || !result.data.runToken) {
    throw new Error('llm-experiment createRun did not return a run handle');
  }
  return { id: result.data.id, runToken: result.data.runToken, authHeaders: result.authHeaders };
}

export async function finalizeExperimentRun(
  payload: FinalizeRunPayload,
  options: ExperimentRequestOptions = {},
): Promise<void> {
  await postExperimentAction('finalizeRun', payload, options);
}

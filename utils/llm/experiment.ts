import type { CreateRunPayload, FinalizeRunPayload } from './types.js';
import { getSupabaseAuthHeaders } from '../../lib/supabaseClient.js';
import { getExperimentConfig } from './modelRouter.js';

interface ExperimentApiResponse {
  id?: string;
  runToken?: string;
  error?: string;
}

export interface ExperimentRunHandle {
  id: string;
  runToken: string;
}

async function postExperimentAction(
  action: 'createRun' | 'finalizeRun',
  payload: CreateRunPayload | FinalizeRunPayload,
): Promise<ExperimentApiResponse> {
  const authHeaders = await getSupabaseAuthHeaders();

  if (!authHeaders.Authorization) {
    const config = getExperimentConfig();
    if (config.previewLocalAuth) {
      const operatorEmail = 'operatorEmail' in payload ? (payload as CreateRunPayload).operatorEmail : undefined;
      if (operatorEmail) {
        authHeaders['x-experiment-operator-email'] = operatorEmail;
      }
    }
  }

  const response = await fetch('/api/llm-experiment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify({ action, ...payload }),
  });

  const data = (await response.json()) as ExperimentApiResponse;
  if (!response.ok) {
    throw new Error(data.error ?? `llm-experiment ${action} failed (${response.status})`);
  }

  return data;
}

export async function createExperimentRun(payload: CreateRunPayload): Promise<ExperimentRunHandle> {
  const result = await postExperimentAction('createRun', payload);
  if (!result.id || !result.runToken) {
    throw new Error('llm-experiment createRun did not return a run handle');
  }
  return { id: result.id, runToken: result.runToken };
}

export async function finalizeExperimentRun(payload: FinalizeRunPayload): Promise<void> {
  await postExperimentAction('finalizeRun', payload);
}

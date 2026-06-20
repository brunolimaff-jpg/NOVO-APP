import type { CreateRunPayload, FinalizeRunPayload } from './types.js';

interface ExperimentApiResponse {
  id?: string;
  error?: string;
}

async function postExperimentAction(
  action: 'createRun' | 'finalizeRun',
  payload: CreateRunPayload | FinalizeRunPayload,
): Promise<ExperimentApiResponse> {
  const response = await fetch('/api/llm-experiment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  });

  const data = (await response.json()) as ExperimentApiResponse;
  if (!response.ok) {
    throw new Error(data.error ?? `llm-experiment ${action} failed (${response.status})`);
  }

  return data;
}

export async function createExperimentRun(payload: CreateRunPayload): Promise<string> {
  const result = await postExperimentAction('createRun', payload);
  if (!result.id) {
    throw new Error('llm-experiment createRun did not return id');
  }
  return result.id;
}

export async function finalizeExperimentRun(payload: FinalizeRunPayload): Promise<void> {
  await postExperimentAction('finalizeRun', payload);
}

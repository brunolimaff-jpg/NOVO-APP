import { createDossierRunRpcClient, DossierRunRpcError, type DossierRunRpcAuth, type DossierRunRpcCaller } from './_dossier-run-rpc.js';
import type { DossierServerPipelineOutput } from './_dossier-server-pipeline.js';
import { sanitizeDossierEvidenceContract, type DossierEvidenceContract } from '../shared/dossierGatewayContracts.js';

export type DossierPersistenceAuth = DossierRunRpcAuth;

export interface PersistAndCompleteDossierAttemptInput {
  runId: string;
  attemptId: string;
  fenceToken: string;
  pipelineVersion: string;
  dossierId: string;
  companyName: string;
  cnpj?: string;
  pipelineOutput: DossierServerPipelineOutput;
  evidence?: DossierEvidenceContract;
}

export type DossierPersistenceErrorCode =
  | 'REQUEST_ABORTED'
  | 'RPC_TIMEOUT'
  | 'RPC_INVALID_RESPONSE'
  | 'PERSISTENCE_FAILED'
  | 'RUN_CANCEL_REQUESTED'
  | 'RUN_LEASE_UNAVAILABLE'
  | 'RUN_NOT_FOUND'
  | 'DOSSIER_CONFLICT'
  | 'ATTEMPT_FENCE_MISMATCH'
  | 'ATTEMPT_LEASE_EXPIRED'
  | 'PIPELINE_VERSION_MISMATCH';

export class DossierPersistenceError extends Error {
  constructor(
    readonly code: DossierPersistenceErrorCode,
    message: string,
    readonly retryable: boolean,
    readonly status = 502,
  ) {
    super(message);
    this.name = 'DossierPersistenceError';
  }
}

export interface PersistAndCompleteDossierAttemptResult {
  runId: string;
  dossierId: string;
  status: 'COMPLETED';
}

function required(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new DossierPersistenceError('PERSISTENCE_FAILED', `${field} ausente`, false, 400);
  return normalized;
}

function buildPersistedContent(input: PersistAndCompleteDossierAttemptInput, timestamp: string): Record<string, unknown> {
  const companyPrompt = `Gere o dossiê de ${input.companyName}${input.cnpj ? `, CNPJ ${input.cnpj}` : ''}.`;
  const output = input.pipelineOutput;
  return {
    id: input.dossierId,
    title: input.companyName,
    empresaAlvo: input.companyName,
    cnpj: input.cnpj ?? null,
    modoPrincipal: 'investigacao',
    scoreOportunidade: null,
    resumoDossie: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    messages: [
      {
        id: `${input.dossierId}:user`,
        sender: 'user',
        text: companyPrompt,
        timestamp,
      },
      {
        id: `${input.dossierId}:bot`,
        sender: 'bot',
        text: output.text,
        timestamp,
        isThinking: false,
        isError: false,
      },
    ],
    gateway: {
      runId: input.runId,
      usage: output.usage,
      finishReason: output.finishReason,
    },
    serverPipeline: {
      version: output.version,
      categoryStatuses: output.categoryStatuses,
      evidencePackStatus: output.evidencePackStatus,
      benchmarkStatus: output.benchmarkStatus,
      fontes: output.fontes,
      runtimeBudget: output.runtimeBudget,
    },
    ...(input.evidence ? { evidence: input.evidence } : {}),
  };
}

function mapRpcError(error: DossierRunRpcError): DossierPersistenceError {
  const code: DossierPersistenceErrorCode =
    error.code === 'REQUEST_ABORTED' ? 'REQUEST_ABORTED' :
      error.code === 'RPC_TIMEOUT' ? 'RPC_TIMEOUT' :
        error.code === 'RPC_INVALID_RESPONSE' ? 'RPC_INVALID_RESPONSE' :
          error.code === 'RUN_CANCEL_REQUESTED' ? 'RUN_CANCEL_REQUESTED' :
            error.code === 'RUN_LEASE_UNAVAILABLE' ? 'RUN_LEASE_UNAVAILABLE' :
              error.code === 'RUN_NOT_FOUND' ? 'RUN_NOT_FOUND' :
                error.code === 'DOSSIER_CONFLICT' ? 'DOSSIER_CONFLICT' :
                  error.code === 'ATTEMPT_FENCE_MISMATCH' ? 'ATTEMPT_FENCE_MISMATCH' :
                    error.code === 'ATTEMPT_LEASE_EXPIRED' ? 'ATTEMPT_LEASE_EXPIRED' :
                      error.code === 'PIPELINE_VERSION_MISMATCH' ? 'PIPELINE_VERSION_MISMATCH' :
                        'PERSISTENCE_FAILED';
  return new DossierPersistenceError(code, 'Persistência terminal não confirmada', error.retryable, error.status);
}

export async function persistAndCompleteDossierRunAttempt(
  auth: DossierPersistenceAuth,
  input: PersistAndCompleteDossierAttemptInput,
  signal: AbortSignal,
  rpc?: DossierRunRpcCaller,
): Promise<PersistAndCompleteDossierAttemptResult> {
  const runId = required(input.runId, 'runId');
  const attemptId = required(input.attemptId, 'attemptId');
  const fenceToken = required(input.fenceToken, 'fenceToken');
  const pipelineVersion = required(input.pipelineVersion, 'pipelineVersion');
  const dossierId = required(input.dossierId, 'dossierId');
  const companyName = required(input.companyName, 'companyName');
  required(input.pipelineOutput.text, 'generatedText');
  if (input.pipelineOutput.version !== pipelineVersion) {
    throw new DossierPersistenceError('PIPELINE_VERSION_MISMATCH', 'Versão do pipeline divergente', false, 409);
  }
  const evidence = input.evidence === undefined ? undefined : sanitizeDossierEvidenceContract(input.evidence);
  const content = buildPersistedContent({ ...input, runId, attemptId, fenceToken, pipelineVersion, dossierId, companyName, evidence }, new Date().toISOString());
  if (signal.aborted) throw new DossierPersistenceError('REQUEST_ABORTED', 'Persistência cancelada', false, 499);

  const callRpc = rpc ?? createDossierRunRpcClient(auth);
  let result: unknown;
  try {
    result = await callRpc(
      'persist_and_complete_dossier_run_attempt',
      {
        p_run_id: runId,
        p_attempt_id: attemptId,
        p_fence_token: fenceToken,
        p_pipeline_version: pipelineVersion,
        p_dossier_id: dossierId,
        p_title: companyName,
        p_empresa_alvo: companyName,
        p_cnpj: input.cnpj ?? null,
        p_modo_principal: 'investigacao',
        p_score_oportunidade: null,
        p_resumo_dossie: null,
        p_content: content,
      },
      signal,
      { stage: 'persistence', timeoutMs: 10_000 },
    );
  } catch (error) {
    if (error instanceof DossierRunRpcError) throw mapRpcError(error);
    if (signal.aborted) throw new DossierPersistenceError('REQUEST_ABORTED', 'Persistência cancelada', false, 499);
    throw new DossierPersistenceError('PERSISTENCE_FAILED', 'Falha de transporte na persistência terminal', true);
  }

  const record = result && typeof result === 'object' ? result as Record<string, unknown> : null;
  if (
    record?.status !== 'COMPLETED' ||
    record.run_id !== runId ||
    record.dossier_id !== dossierId
  ) {
    throw new DossierPersistenceError('PERSISTENCE_FAILED', 'Persistência terminal não foi confirmada', true);
  }
  return { runId, dossierId, status: 'COMPLETED' };
}

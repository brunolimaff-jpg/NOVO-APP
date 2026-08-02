import {
  sanitizeDossierEvidenceContract,
  type DossierEvidenceContract,
  type DossierUsage,
} from '../shared/dossierGatewayContracts.js';

export interface DossierPersistenceAuth {
  url: string;
  token: string;
  anonKey: string;
}

export interface PersistAndCompleteDossierInput {
  runId: string;
  leaseOwner: string;
  dossierId: string;
  companyName: string;
  cnpj?: string;
  generatedText: string;
  usage: DossierUsage;
  finishReason: string;
  evidence?: DossierEvidenceContract;
}

export type DossierPersistenceErrorCode =
  | 'PERSISTENCE_FAILED'
  | 'RUN_CANCEL_REQUESTED'
  | 'RUN_LEASE_UNAVAILABLE'
  | 'RUN_NOT_FOUND'
  | 'DOSSIER_CONFLICT';

const KNOWN_RPC_ERROR_CODES: DossierPersistenceErrorCode[] = [
  'PERSISTENCE_FAILED',
  'RUN_CANCEL_REQUESTED',
  'RUN_LEASE_UNAVAILABLE',
  'RUN_NOT_FOUND',
  'DOSSIER_CONFLICT',
];

export interface PersistAndCompleteDossierResult {
  runId: string;
  dossierId: string;
  status: 'COMPLETED';
}

export class DossierPersistenceError extends Error {
  constructor(
    readonly code: DossierPersistenceErrorCode,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'DossierPersistenceError';
  }
}

function normalizeRequiredText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new DossierPersistenceError('PERSISTENCE_FAILED', `Missing ${field}`, false);
  }
  return normalized;
}

function normalizeUsage(usage: DossierUsage): DossierUsage {
  const promptTokens = Number.isFinite(usage.promptTokens) && usage.promptTokens >= 0
    ? Math.floor(usage.promptTokens)
    : 0;
  const completionTokens = Number.isFinite(usage.completionTokens) && usage.completionTokens >= 0
    ? Math.floor(usage.completionTokens)
    : 0;
  const totalTokens = Number.isFinite(usage.totalTokens) && usage.totalTokens >= 0
    ? Math.floor(usage.totalTokens)
    : promptTokens + completionTokens;
  return { promptTokens, completionTokens, totalTokens };
}

function buildPersistedContent(input: {
  runId: string;
  companyName: string;
  cnpj?: string;
  generatedText: string;
  usage: DossierUsage;
  finishReason: string;
  timestamp: string;
  evidence?: DossierEvidenceContract;
}): Record<string, unknown> {
  const companyPrompt = `Gere o dossiê de ${input.companyName}${input.cnpj ? `, CNPJ ${input.cnpj}` : ''}.`;
  return {
    id: input.runId,
    title: input.companyName,
    empresaAlvo: input.companyName,
    cnpj: input.cnpj ?? null,
    modoPrincipal: 'investigacao',
    scoreOportunidade: null,
    resumoDossie: null,
    createdAt: input.timestamp,
    updatedAt: input.timestamp,
    messages: [
      {
        id: `${input.runId}:user`,
        sender: 'user',
        text: companyPrompt,
        timestamp: input.timestamp,
      },
      {
        id: `${input.runId}:bot`,
        sender: 'bot',
        text: input.generatedText,
        timestamp: input.timestamp,
        isThinking: false,
        isError: false,
      },
    ],
    gateway: {
      runId: input.runId,
      usage: input.usage,
      finishReason: input.finishReason,
    },
    ...(input.evidence ? { evidence: input.evidence } : {}),
  };
}

function extractRpcErrorCode(body: unknown): DossierPersistenceErrorCode | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const candidate = body as Record<string, unknown>;
  const values = [candidate.code, candidate.message, candidate.details, candidate.hint];
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const found = KNOWN_RPC_ERROR_CODES.find(code => value.includes(code));
    if (found) return found;
  }
  return undefined;
}

function isRetryableCode(code: DossierPersistenceErrorCode, status: number): boolean {
  return code === 'PERSISTENCE_FAILED' && (status === 408 || status === 429 || status >= 500);
}

async function readResponseBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function responseRecord(body: unknown): Record<string, unknown> | null {
  const candidate = Array.isArray(body) ? body[0] : body;
  return candidate && typeof candidate === 'object' ? candidate as Record<string, unknown> : null;
}

export async function persistAndCompleteDossierRun(
  auth: DossierPersistenceAuth,
  input: PersistAndCompleteDossierInput,
  signal: AbortSignal,
): Promise<PersistAndCompleteDossierResult> {
  const runId = normalizeRequiredText(input.runId, 'runId');
  const leaseOwner = normalizeRequiredText(input.leaseOwner, 'leaseOwner');
  const dossierId = normalizeRequiredText(input.dossierId, 'dossierId');
  const companyName = normalizeRequiredText(input.companyName, 'companyName');
  const generatedText = normalizeRequiredText(input.generatedText, 'generatedText');
  const finishReason = normalizeRequiredText(input.finishReason, 'finishReason');
  const usage = normalizeUsage(input.usage);
  const evidence = input.evidence === undefined ? undefined : sanitizeDossierEvidenceContract(input.evidence);
  const timestamp = new Date().toISOString();
  const content = buildPersistedContent({
    runId,
    companyName,
    cnpj: input.cnpj,
    generatedText,
    usage,
    finishReason,
    timestamp,
    evidence,
  });
  const url = auth.url.replace(/\/+$/, '');

  let response: Response;
  try {
    response = await fetch(`${url}/rest/v1/rpc/persist_and_complete_dossier_run`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.token}`,
        apikey: auth.anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_run_id: runId,
        p_lease_owner: leaseOwner,
        p_dossier_id: dossierId,
        p_title: companyName,
        p_empresa_alvo: companyName,
        p_cnpj: input.cnpj ?? null,
        p_modo_principal: 'investigacao',
        p_score_oportunidade: null,
        p_resumo_dossie: null,
        p_content: content,
      }),
      signal,
    });
  } catch (error) {
    if (signal.aborted || (error instanceof Error && error.name === 'AbortError')) throw error;
    throw new DossierPersistenceError('PERSISTENCE_FAILED', 'Dossier persistence request failed', true);
  }

  const body = await readResponseBody(response);
  if (!response.ok) {
    const code = extractRpcErrorCode(body) ?? 'PERSISTENCE_FAILED';
    throw new DossierPersistenceError(code, 'Dossier persistence failed', isRetryableCode(code, response.status));
  }

  const record = responseRecord(body);
  const returnedStatus = record?.status;
  if (returnedStatus === 'CANCEL_REQUESTED' || returnedStatus === 'CANCELLED') {
    throw new DossierPersistenceError('RUN_CANCEL_REQUESTED', 'Dossier run cancellation requested', false);
  }
  if (returnedStatus !== 'COMPLETED' || record?.run_id !== runId || record?.dossier_id !== dossierId) {
    throw new DossierPersistenceError('PERSISTENCE_FAILED', 'Dossier persistence was not confirmed', true);
  }

  return { runId, dossierId, status: 'COMPLETED' };
}

import { randomUUID } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';

import { runDossierGateway } from './_dossier-llm-gateway.js';
import { LiteLLMRequestError, type LiteLLMErrorCode } from './_llm-client.js';
import { DossierPersistenceError, persistAndCompleteDossierRun } from './_dossier-persistence.js';
import {
  sanitizeDossierEvidenceContract,
  type DossierEvidenceContract,
  type DossierUsage,
} from '../shared/dossierGatewayContracts.js';

const HistoryItemSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(20_000),
});

const GenerateRequestSchema = z.object({
  action: z.literal('generate'),
  runId: z.string().uuid(),
  companyName: z.string().trim().min(1).max(240),
  cnpj: z.string().regex(/^\d{14}$/).optional(),
  context: z.string().trim().min(1).max(200_000),
  evidence: z.unknown().optional(),
});

const ChatRequestSchema = z.object({
  action: z.literal('chat'),
  runId: z.string().uuid(),
  dossierId: z.string().uuid(),
  message: z.string().trim().min(1).max(20_000),
  history: z.array(HistoryItemSchema).max(40).default([]),
});

const DossierRequestSchema = z.discriminatedUnion('action', [GenerateRequestSchema, ChatRequestSchema]);
type DossierRequest = z.infer<typeof DossierRequestSchema>;

const REQUEST_ID_PATTERN = /^[a-zA-Z0-9._:-]{8,128}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_SERVER_DOSSIER_CONTEXT_CHARS = 200_000;
const MAX_AGGREGATE_PAYLOAD_CHARS = 240_000;
const LEASE_SECONDS = 60;
const LEASE_HEARTBEAT_MS = 20_000;
const CANCELLATION_FINALIZATION_ATTEMPTS = 2;
const CANCELLATION_FINALIZATION_TIMEOUT_MS = 1_500;

export const config = { runtime: 'nodejs' };
export const maxDuration = 60;

type DossierErrorCode =
  | 'AUTH_REQUIRED'
  | 'INVALID_REQUEST'
  | 'PAYLOAD_TOO_LARGE'
  | 'RUN_NOT_FOUND'
  | 'RUN_NOT_OWNED'
  | 'RUN_CANCEL_REQUESTED'
  | 'RUN_CANCELLATION_FINALIZATION_FAILED'
  | 'RUN_TERMINAL'
  | 'RUN_LEASE_UNAVAILABLE'
  | 'REQUEST_ABORTED'
  | 'DOSSIER_CONTENT_UNAVAILABLE'
  | 'PERSISTENCE_FAILED'
  | 'DOSSIER_CONFLICT'
  | LiteLLMErrorCode
  | 'INTERNAL_ERROR';

type DossierStage = 'validation' | 'auth' | 'ownership' | 'lease' | 'gateway' | 'persistence' | 'request';

class DossierApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: DossierErrorCode,
    message: string,
    readonly stage: DossierStage,
    readonly retryable: boolean,
    readonly cancellationConfirmed = false,
  ) {
    super(message);
    this.name = 'DossierApiError';
  }
}

interface AuthenticatedUser {
  id: string;
  token: string;
  supabase: { url: string; anonKey: string };
}

interface DossierRunRecord {
  run_id?: unknown;
  dossier_id?: unknown;
  operator_id?: unknown;
  status?: unknown;
  lease_owner?: unknown;
  lease_expires_at?: unknown;
  cancel_requested_at?: unknown;
}

interface DossierRecord {
  id?: unknown;
  operator_id?: unknown;
  content?: unknown;
}

type GenerateGatewayResult = {
  text: string;
  usage: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  finishReason?: string;
};

interface LogContext {
  correlationId: string;
  runId: string;
  action: 'generate' | 'chat' | 'unknown';
  startedAt: number;
}

function getHeader(req: VercelRequest, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function resolveCorrelationId(req: VercelRequest): string {
  const candidate = getHeader(req, 'x-request-id')?.trim();
  return candidate && REQUEST_ID_PATTERN.test(candidate) ? candidate : randomUUID();
}

function resolveUntrustedRunId(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const runId = (body as { runId?: unknown }).runId;
  return typeof runId === 'string' && UUID_PATTERN.test(runId) ? runId : undefined;
}

function getSupabaseAuthConfig(): { url: string; anonKey: string } | null {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  return url && anonKey ? { url: url.replace(/\/+$/, ''), anonKey } : null;
}

function logEvent(
  level: 'info' | 'warn' | 'error',
  event: string,
  context: LogContext,
  stage: DossierStage,
  errorCode: DossierErrorCode | null = null,
): void {
  // Never add request content, credentials or provider responses to this payload.
  // eslint-disable-next-line no-console
  console[level](`[DossierAPI] ${event}`, {
    correlationId: context.correlationId,
    runId: context.runId,
    action: context.action,
    stage,
    durationMs: Date.now() - context.startedAt,
    errorCode,
  });
}

function sendError(
  res: VercelResponse,
  correlationId: string,
  runId: string | undefined,
  error: DossierApiError,
) {
  // Only report CANCELLED when the lifecycle RPC has explicitly confirmed
  // the cancellation-requested terminal path. An abort or failed finalizer
  // does not prove the run was cancelled and must remain FAILED/ambiguous.
  const status = error.code === 'RUN_CANCEL_REQUESTED' && error.cancellationConfirmed ? 'CANCELLED' : 'FAILED';
  return res.status(error.status).json({
    ok: false,
    correlationId,
    ...(runId ? { runId } : {}),
    status,
    error: {
      code: error.code,
      message: error.message,
      stage: error.stage,
      retryable: error.retryable,
    },
  });
}

function aggregatePayloadSize(request: DossierRequest): number {
  if (request.action === 'generate') {
    const evidenceSize = request.evidence === undefined ? 0 : JSON.stringify(request.evidence)?.length ?? 0;
    return request.context.length + evidenceSize;
  }
  return (
    request.message.length +
    request.history.reduce((total, item) => total + item.content.length, 0)
  );
}

async function authenticate(req: VercelRequest, signal: AbortSignal): Promise<AuthenticatedUser | null> {
  const authorization = getHeader(req, 'authorization');
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const authConfig = getSupabaseAuthConfig();
  if (!token || !authConfig) return null;

  const response = await fetch(`${authConfig.url}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: authConfig.anonKey },
    signal,
  });
  if (!response.ok) return null;

  const body = (await response.json()) as { id?: unknown };
  return typeof body.id === 'string' && body.id ? { id: body.id, token, supabase: authConfig } : null;
}

async function callRunRpc(
  user: AuthenticatedUser,
  rpcName: string,
  body: Record<string, unknown>,
  signal: AbortSignal,
  stage: 'ownership' | 'lease',
): Promise<DossierRunRecord | null> {
  const response = await fetch(`${user.supabase.url}/rest/v1/rpc/${rpcName}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${user.token}`,
      apikey: user.supabase.anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    throw new DossierApiError(502, 'INTERNAL_ERROR', 'Dossier lifecycle service unavailable', stage, true);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new DossierApiError(502, 'INTERNAL_ERROR', 'Invalid dossier lifecycle response', stage, true);
  }
  const record = Array.isArray(payload) ? payload[0] : payload;
  return record && typeof record === 'object' ? (record as DossierRunRecord) : null;
}

async function loadDossierContent(
  user: AuthenticatedUser,
  dossierId: string,
  operatorId: string,
  signal: AbortSignal,
): Promise<string | null> {
  const dossier = await loadDossierRecord(user, dossierId, operatorId, signal);
  if (!dossier) return null;
  if (
    !dossier.content ||
    typeof dossier.content !== 'object'
  ) return null;
  const messages = (dossier.content as { messages?: unknown }).messages;
  if (!Array.isArray(messages) || messages.length === 0) return null;

  const contextLines: string[] = [];
  let contextChars = 0;
  for (const message of messages) {
    if (!message || typeof message !== 'object') return null;
    const { sender, text } = message as { sender?: unknown; text?: unknown };
    if ((sender !== 'user' && sender !== 'bot') || typeof text !== 'string' || !text.trim()) return null;
    const line = `${sender === 'bot' ? 'assistant' : 'user'}: ${text.trim()}`;
    contextChars += (contextLines.length > 0 ? 2 : 0) + line.length;
    if (contextChars > MAX_SERVER_DOSSIER_CONTEXT_CHARS) {
      throw new DossierApiError(
        400,
        'PAYLOAD_TOO_LARGE',
        'Persisted dossier context exceeds the allowed limit',
        'validation',
        false,
      );
    }
    contextLines.push(line);
  }
  return contextLines.join('\n\n');
}

async function loadDossierRecord(
  user: AuthenticatedUser,
  dossierId: string,
  operatorId: string,
  signal: AbortSignal,
): Promise<DossierRecord | null> {
  const response = await fetch(
    `${user.supabase.url}/rest/v1/dossies?id=eq.${encodeURIComponent(dossierId)}` +
      `&operator_id=eq.${encodeURIComponent(operatorId)}&select=id,operator_id,content&limit=1`,
    {
      headers: {
        Authorization: `Bearer ${user.token}`,
        apikey: user.supabase.anonKey,
      },
      signal,
    },
  );
  if (!response.ok) {
    throw new DossierApiError(502, 'INTERNAL_ERROR', 'Dossier content lookup failed', 'ownership', true);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new DossierApiError(502, 'INTERNAL_ERROR', 'Invalid dossier content response', 'ownership', true);
  }
  const record = Array.isArray(payload) ? payload[0] : payload;
  if (!record || typeof record !== 'object') return null;
  const dossier = record as DossierRecord;
  if (dossier.id !== dossierId || dossier.operator_id !== operatorId) return null;
  return dossier;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(item => canonicalJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>).sort().map(key =>
      `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`,
    ).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: string[]): boolean {
  return canonicalJson(Object.keys(value).sort()) === canonicalJson([...expected].sort());
}

function matchesPersistedGenerateContent(
  dossier: DossierRecord,
  run: DossierRunRecord,
  request: Extract<DossierRequest, { action: 'generate' }>,
  gatewayResult: GenerateGatewayResult,
  evidenceContract: DossierEvidenceContract | undefined,
): boolean {
  if (typeof run.operator_id !== 'string' || !run.operator_id.trim()) return false;
  if (dossier.id !== request.runId || dossier.operator_id !== run.operator_id) return false;
  if (!dossier.content || typeof dossier.content !== 'object') return false;
  const content = dossier.content as Record<string, unknown>;
  const expectedCnpj = request.cnpj ?? null;
  if (
    !hasExactKeys(content, [
      'id',
      'title',
      'empresaAlvo',
      'cnpj',
      'modoPrincipal',
      'scoreOportunidade',
      'resumoDossie',
      'createdAt',
      'updatedAt',
      'messages',
      'gateway',
      ...(evidenceContract === undefined ? [] : ['evidence']),
    ]) ||
    content.id !== request.runId ||
    content.title !== request.companyName ||
    content.empresaAlvo !== request.companyName ||
    content.cnpj !== expectedCnpj ||
    content.modoPrincipal !== 'investigacao' ||
    content.scoreOportunidade !== null ||
    content.resumoDossie !== null ||
    typeof content.createdAt !== 'string' ||
    typeof content.updatedAt !== 'string'
  ) return false;

  const messages = content.messages;
  if (!Array.isArray(messages) || messages.length !== 2) return false;
  const userMessage = messages[0];
  const botMessage = messages[1];
  const expectedPrompt = `Gere o dossiê de ${request.companyName}${request.cnpj ? `, CNPJ ${request.cnpj}` : ''}.`;
  if (
    !userMessage || typeof userMessage !== 'object' ||
    !botMessage || typeof botMessage !== 'object' ||
    !hasExactKeys(userMessage as Record<string, unknown>, ['id', 'sender', 'text', 'timestamp']) ||
    !hasExactKeys(botMessage as Record<string, unknown>, [
      'id',
      'sender',
      'text',
      'timestamp',
      'isThinking',
      'isError',
    ]) ||
    (userMessage as Record<string, unknown>).id !== `${request.runId}:user` ||
    (userMessage as Record<string, unknown>).sender !== 'user' ||
    (userMessage as Record<string, unknown>).text !== expectedPrompt ||
    typeof (userMessage as Record<string, unknown>).timestamp !== 'string' ||
    (botMessage as Record<string, unknown>).id !== `${request.runId}:bot` ||
    (botMessage as Record<string, unknown>).sender !== 'bot' ||
    (botMessage as Record<string, unknown>).text !== gatewayResult.text ||
    typeof (botMessage as Record<string, unknown>).timestamp !== 'string' ||
    (botMessage as Record<string, unknown>).isThinking !== false ||
    (botMessage as Record<string, unknown>).isError !== false
  ) return false;

  const gateway = content.gateway;
  if (!gateway || typeof gateway !== 'object') return false;
  const expectedGateway = {
    runId: request.runId,
    usage: mapGatewayUsage(gatewayResult.usage),
    finishReason: gatewayResult.finishReason ?? 'unknown',
  };
  if (canonicalJson(gateway) !== canonicalJson(expectedGateway)) return false;
  if (evidenceContract === undefined) return !Object.prototype.hasOwnProperty.call(content, 'evidence');
  return canonicalJson(content.evidence) === canonicalJson(evidenceContract);
}

async function readPersistedGenerateDossier(
  user: AuthenticatedUser,
  run: DossierRunRecord,
  dossierId: string,
): Promise<DossierRecord | null> {
  if (typeof run.operator_id !== 'string' || !run.operator_id.trim()) return null;
  try {
    return await loadDossierRecord(user, dossierId, run.operator_id, AbortSignal.timeout(2_000));
  } catch {
    return null;
  }
}

function assertRunIdentity(
  run: DossierRunRecord | null,
  runId: string,
  stage: 'ownership' | 'lease',
): DossierRunRecord {
  if (!run) throw new DossierApiError(404, 'RUN_NOT_FOUND', 'Dossier run not found', stage, false);
  if (run.run_id !== runId) {
    throw new DossierApiError(502, 'INTERNAL_ERROR', 'Invalid dossier lifecycle response', stage, true);
  }
  return run;
}

function assertRunNotCancelled(run: DossierRunRecord, stage: 'ownership' | 'lease'): void {
  if (run.status === 'CANCEL_REQUESTED' || run.status === 'CANCELLED' || run.cancel_requested_at) {
    throw new DossierApiError(
      409,
      'RUN_CANCEL_REQUESTED',
      'Dossier run cancellation requested',
      stage,
      false,
      run.status === 'CANCELLED',
    );
  }
}

async function assertChatOwnership(
  user: AuthenticatedUser,
  request: Extract<DossierRequest, { action: 'chat' }>,
  signal: AbortSignal,
): Promise<DossierRunRecord> {
  const run = assertRunIdentity(
    await callRunRpc(user, 'get_own_dossier_run', { p_run_id: request.runId }, signal, 'ownership'),
    request.runId,
    'ownership',
  );
  assertRunNotCancelled(run, 'ownership');
  if (run.status !== 'COMPLETED') {
    throw new DossierApiError(409, 'RUN_TERMINAL', 'Dossier run is not completed', 'ownership', false);
  }
  if (run.dossier_id !== request.dossierId) {
    throw new DossierApiError(404, 'RUN_NOT_OWNED', 'Dossier does not belong to the authenticated run', 'ownership', false);
  }
  if (typeof run.operator_id !== 'string' || !run.operator_id.trim()) {
    throw new DossierApiError(502, 'INTERNAL_ERROR', 'Invalid dossier lifecycle response', 'ownership', true);
  }
  return run;
}

function hasValidLease(run: DossierRunRecord, runId: string, leaseOwner: string): boolean {
  const expiresAt = typeof run.lease_expires_at === 'string' ? Date.parse(run.lease_expires_at) : Number.NaN;
  return (
    run.run_id === runId &&
    run.status === 'RUNNING' &&
    run.lease_owner === leaseOwner &&
    Number.isFinite(expiresAt) &&
    expiresAt > Date.now()
  );
}

function cancellationFinalizationError(): DossierApiError {
  return new DossierApiError(
    502,
    'RUN_CANCELLATION_FINALIZATION_FAILED',
    'Dossier run cancellation could not be finalized',
    'lease',
    true,
  );
}

async function finalizeRunCancellation(
  user: AuthenticatedUser,
  runId: string,
  leaseOwner: string,
  context: LogContext,
): Promise<boolean> {
  for (let attempt = 1; attempt <= CANCELLATION_FINALIZATION_ATTEMPTS; attempt += 1) {
    try {
      const cancelled = await callRunRpc(
        user,
        'mark_dossier_run_cancelled',
        { p_run_id: runId, p_lease_owner: leaseOwner },
        AbortSignal.timeout(CANCELLATION_FINALIZATION_TIMEOUT_MS),
        'lease',
      );
      if (cancelled?.status === 'CANCELLED') return true;
    } catch {
      // The bounded retry below preserves the server-side owner for recovery.
    }
  }
  logEvent('error', 'lease:cancel_finalization_failed', context, 'lease', 'RUN_CANCELLATION_FINALIZATION_FAILED');
  return false;
}

async function acquireGenerateLease(
  user: AuthenticatedUser,
  runId: string,
  leaseOwner: string,
  signal: AbortSignal,
  context: LogContext,
): Promise<void> {
  const current = assertRunIdentity(
    await callRunRpc(user, 'get_own_dossier_run', { p_run_id: runId }, signal, 'lease'),
    runId,
    'lease',
  );
  if (current.status === 'CANCEL_REQUESTED' || current.cancel_requested_at) {
    const recoverableOwner = typeof current.lease_owner === 'string' && current.lease_owner.trim()
      ? current.lease_owner
      : null;
    let cancellationConfirmed = false;
    if (recoverableOwner) {
      const finalized = await finalizeRunCancellation(user, runId, recoverableOwner, context);
      if (!finalized) throw cancellationFinalizationError();
      cancellationConfirmed = true;
    }
    throw new DossierApiError(
      409,
      'RUN_CANCEL_REQUESTED',
      'Dossier run cancellation requested',
      'lease',
      false,
      cancellationConfirmed,
    );
  }
  assertRunNotCancelled(current, 'lease');
  if (current.status !== 'PENDING' && current.status !== 'RUNNING') {
    throw new DossierApiError(409, 'RUN_TERMINAL', 'Dossier run is terminal', 'lease', false);
  }

  const leased = await callRunRpc(
    user,
    'acquire_dossier_run_lease',
    { p_run_id: runId, p_lease_owner: leaseOwner, p_lease_seconds: LEASE_SECONDS },
    signal,
    'lease',
  );
  if (!leased || !hasValidLease(leased, runId, leaseOwner)) {
    throw new DossierApiError(409, 'RUN_LEASE_UNAVAILABLE', 'Dossier run lease unavailable', 'lease', true);
  }
  assertRunNotCancelled(leased, 'lease');
}

async function validateFinalLease(
  user: AuthenticatedUser,
  runId: string,
  leaseOwner: string,
  signal: AbortSignal,
): Promise<{ valid: boolean; run: DossierRunRecord | null }> {
  const run = await callRunRpc(
    user,
    'renew_dossier_run_lease',
    { p_run_id: runId, p_lease_owner: leaseOwner, p_lease_seconds: LEASE_SECONDS },
    signal,
    'lease',
  );
  if (!run) return { valid: false, run: null };
  assertRunIdentity(run, runId, 'lease');
  return { valid: hasValidLease(run, runId, leaseOwner), run };
}

async function readPersistenceLifecycle(
  user: AuthenticatedUser,
  runId: string,
): Promise<DossierRunRecord | null> {
  try {
    const run = await callRunRpc(
      user,
      'get_own_dossier_run',
      { p_run_id: runId },
      AbortSignal.timeout(2_000),
      'lease',
    );
    if (!run || run.run_id !== runId) return null;
    return run;
  } catch {
    return null;
  }
}

function combineSignals(first: AbortSignal, second: AbortSignal): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (first.aborted || second.aborted) controller.abort();
  else {
    first.addEventListener('abort', abort, { once: true });
    second.addEventListener('abort', abort, { once: true });
  }
  return {
    signal: controller.signal,
    cleanup: () => {
      first.removeEventListener('abort', abort);
      second.removeEventListener('abort', abort);
    },
  };
}

function startLeaseHeartbeat(
  user: AuthenticatedUser,
  runId: string,
  leaseOwner: string,
  requestSignal: AbortSignal,
): {
  signal: AbortSignal;
  getError: () => DossierApiError | undefined;
  stop: () => Promise<void>;
  cleanup: () => void;
} {
  const heartbeatController = new AbortController();
  const gatewayController = new AbortController();
  const combined = combineSignals(requestSignal, gatewayController.signal);
  let stopped = false;
  let heartbeatInFlight = false;
  let heartbeatError: DossierApiError | undefined;
  let inFlightHeartbeat: Promise<void> | undefined;

  const runHeartbeat = async (): Promise<void> => {
    try {
      const renewed = await callRunRpc(
        user,
        'renew_dossier_run_lease',
        { p_run_id: runId, p_lease_owner: leaseOwner, p_lease_seconds: LEASE_SECONDS },
        heartbeatController.signal,
        'lease',
      );
      if (stopped) return;
      if (!renewed) {
        heartbeatError = new DossierApiError(409, 'RUN_LEASE_UNAVAILABLE', 'Dossier run lease lost', 'lease', true);
      } else if (renewed.status === 'CANCELLED') {
        heartbeatError = new DossierApiError(
          409,
          'RUN_CANCEL_REQUESTED',
          'Dossier run cancellation requested',
          'lease',
          false,
          true,
        );
      } else if (renewed.status === 'CANCEL_REQUESTED' || renewed.cancel_requested_at) {
        heartbeatError = new DossierApiError(409, 'RUN_CANCEL_REQUESTED', 'Dossier run cancellation requested', 'lease', false);
      } else if (!hasValidLease(renewed, runId, leaseOwner)) {
        heartbeatError = new DossierApiError(409, 'RUN_LEASE_UNAVAILABLE', 'Dossier run lease lost', 'lease', true);
      }
    } catch (error) {
      if (!stopped) {
        heartbeatError = error instanceof DossierApiError
          ? error
          : new DossierApiError(502, 'INTERNAL_ERROR', 'Lease heartbeat failed', 'lease', true);
      }
    } finally {
      heartbeatInFlight = false;
    }
    if (!stopped && heartbeatError) gatewayController.abort();
  };

  const timer = setInterval(() => {
    if (stopped || heartbeatInFlight) return;
    heartbeatInFlight = true;
    inFlightHeartbeat = runHeartbeat();
  }, LEASE_HEARTBEAT_MS);

  return {
    signal: combined.signal,
    getError: () => heartbeatError,
    stop: async () => {
      stopped = true;
      clearInterval(timer);
      heartbeatController.abort();
      combined.cleanup();
      await inFlightHeartbeat;
    },
    cleanup: () => {
      stopped = true;
      clearInterval(timer);
      heartbeatController.abort();
      combined.cleanup();
    },
  };
}

async function releaseLease(
  user: AuthenticatedUser,
  runId: string,
  leaseOwner: string,
  context: LogContext,
): Promise<void> {
  try {
    await callRunRpc(
      user,
      'release_dossier_run_lease',
      { p_run_id: runId, p_lease_owner: leaseOwner },
      AbortSignal.timeout(2_000),
      'lease',
    );
  } catch {
    logEvent('error', 'lease:release_failed', context, 'lease', 'INTERNAL_ERROR');
  }
}

function createRequestAbortController(req: VercelRequest, res: VercelResponse): {
  controller: AbortController;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const abort = () => controller.abort();
  req.once('aborted', abort);
  res.once('close', abort);
  return {
    controller,
    cleanup: () => {
      req.off('aborted', abort);
      res.off('close', abort);
    },
  };
}

function mapGatewayError(error: LiteLLMRequestError, requestAborted: boolean): DossierApiError {
  if (requestAborted) {
    return new DossierApiError(499, 'REQUEST_ABORTED', 'Request cancelled', 'request', false);
  }
  if (error.code === 'GATEWAY_TIMEOUT') {
    return new DossierApiError(504, error.code, 'Dossier gateway timed out', 'gateway', true);
  }
  if (error.code === 'GATEWAY_ABORTED') {
    return new DossierApiError(499, error.code, 'Dossier gateway aborted', 'gateway', false);
  }
  if (error.code === 'GATEWAY_NOT_CONFIGURED') {
    return new DossierApiError(503, error.code, 'Dossier gateway not configured', 'gateway', false);
  }
  return new DossierApiError(502, error.code, 'Dossier gateway unavailable', 'gateway', error.retryable);
}

function mapGatewayUsage(usage: {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}): DossierUsage {
  const promptTokens = Number.isFinite(usage.promptTokenCount) && (usage.promptTokenCount ?? 0) >= 0
    ? Math.floor(usage.promptTokenCount ?? 0)
    : 0;
  const completionTokens = Number.isFinite(usage.candidatesTokenCount) && (usage.candidatesTokenCount ?? 0) >= 0
    ? Math.floor(usage.candidatesTokenCount ?? 0)
    : 0;
  const totalTokens = Number.isFinite(usage.totalTokenCount) && (usage.totalTokenCount ?? 0) >= 0
    ? Math.floor(usage.totalTokenCount ?? 0)
    : promptTokens + completionTokens;
  return { promptTokens, completionTokens, totalTokens };
}

function mapPersistenceError(error: DossierPersistenceError): DossierApiError {
  if (error.code === 'RUN_CANCEL_REQUESTED') {
    return new DossierApiError(409, 'RUN_CANCEL_REQUESTED', 'Dossier run cancellation requested', 'lease', false);
  }
  if (error.code === 'RUN_LEASE_UNAVAILABLE') {
    return new DossierApiError(409, 'RUN_LEASE_UNAVAILABLE', 'Dossier run lease unavailable', 'lease', true);
  }
  if (error.code === 'RUN_NOT_FOUND') {
    return new DossierApiError(404, 'RUN_NOT_FOUND', 'Dossier run not found', 'ownership', false);
  }
  if (error.code === 'DOSSIER_CONFLICT') {
    return new DossierApiError(409, 'DOSSIER_CONFLICT', 'Dossier persistence conflict', 'persistence', false);
  }
  return new DossierApiError(502, 'PERSISTENCE_FAILED', 'Dossier persistence failed', 'persistence', error.retryable);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const correlationId = resolveCorrelationId(req);
  const untrustedRunId = resolveUntrustedRunId(req.body);
  res.setHeader('x-request-id', correlationId);

  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    return sendError(
      res,
      correlationId,
      untrustedRunId,
      new DossierApiError(405, 'INVALID_REQUEST', 'Method not allowed', 'validation', false),
    );
  }

  const parsed = DossierRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(
      res,
      correlationId,
      untrustedRunId,
      new DossierApiError(400, 'INVALID_REQUEST', 'Invalid request', 'validation', false),
    );
  }
  let evidenceContract: DossierEvidenceContract | undefined;
  if (parsed.data.action === 'generate' && parsed.data.evidence !== undefined) {
    try {
      const candidateEvidence = parsed.data.evidence;
      evidenceContract = sanitizeDossierEvidenceContract(candidateEvidence);
    } catch {
      return sendError(
        res,
        correlationId,
        parsed.data.runId,
        new DossierApiError(400, 'INVALID_REQUEST', 'Invalid dossier evidence contract', 'validation', false),
      );
    }
  }
  if (aggregatePayloadSize(parsed.data) > MAX_AGGREGATE_PAYLOAD_CHARS) {
    return sendError(
      res,
      correlationId,
      parsed.data.runId,
      new DossierApiError(400, 'PAYLOAD_TOO_LARGE', 'Aggregate payload exceeds the allowed limit', 'validation', false),
    );
  }

  const { controller, cleanup } = createRequestAbortController(req, res);
  const context: LogContext = {
    correlationId,
    runId: parsed.data.runId,
    action: parsed.data.action,
    startedAt: Date.now(),
  };
  let leaseOwner: string | undefined;
  let leaseAcquired = false;
  let leaseFinalized = false;
  let cancellationDetected = false;
  let generatedDossierId: string | undefined;
  let dossierContent: string | undefined;
  let user: AuthenticatedUser | null = null;
  let heartbeat: ReturnType<typeof startLeaseHeartbeat> | undefined;
  let gatewayResult: Awaited<ReturnType<typeof runDossierGateway>> | undefined;
  let persistenceStarted = false;
  logEvent('info', 'request:start', context, 'auth');

  try {
    user = await authenticate(req, controller.signal);
    if (!user) throw new DossierApiError(401, 'AUTH_REQUIRED', 'Authentication required', 'auth', false);

    if (parsed.data.action === 'chat') {
      const run = await assertChatOwnership(user, parsed.data, controller.signal);
      dossierContent = await loadDossierContent(
        user,
        parsed.data.dossierId,
        run.operator_id as string,
        controller.signal,
      ) ?? undefined;
      if (!dossierContent) {
        throw new DossierApiError(404, 'DOSSIER_CONTENT_UNAVAILABLE', 'Dossier content not available', 'ownership', false);
      }
      if (dossierContent.length + aggregatePayloadSize(parsed.data) > MAX_AGGREGATE_PAYLOAD_CHARS) {
        throw new DossierApiError(
          400,
          'PAYLOAD_TOO_LARGE',
          'Aggregate payload exceeds the allowed limit',
          'validation',
          false,
        );
      }
    } else {
      leaseOwner = randomUUID();
      await acquireGenerateLease(user, parsed.data.runId, leaseOwner, controller.signal, context);
      leaseAcquired = true;
      heartbeat = startLeaseHeartbeat(user, parsed.data.runId, leaseOwner, controller.signal);
    }

    const gatewaySignal = heartbeat?.signal ?? controller.signal;
    gatewayResult =
      parsed.data.action === 'chat'
        ? await runDossierGateway({
            mode: 'chat',
            userContent: parsed.data.message,
            dossierContext: dossierContent ?? '',
            history: parsed.data.history,
            signal: gatewaySignal,
            correlationId,
            runId: parsed.data.runId,
          })
        : await runDossierGateway({
            mode: 'generate',
            userContent: `Gere o dossiê de ${parsed.data.companyName}${parsed.data.cnpj ? `, CNPJ ${parsed.data.cnpj}` : ''}.`,
            dossierContext: parsed.data.context,
            signal: gatewaySignal,
            correlationId,
            runId: parsed.data.runId,
          });

    if (parsed.data.action === 'generate' && leaseOwner) {
      await heartbeat?.stop();
      const heartbeatError = heartbeat?.getError();
      if (heartbeatError) throw heartbeatError;
      const { valid, run } = await validateFinalLease(user, parsed.data.runId, leaseOwner, controller.signal);
      if (run && (run.status === 'CANCEL_REQUESTED' || run.status === 'CANCELLED' || run.cancel_requested_at)) {
        cancellationDetected = true;
        leaseFinalized = await finalizeRunCancellation(user, parsed.data.runId, leaseOwner, context);
        if (!leaseFinalized) throw cancellationFinalizationError();
        throw new DossierApiError(
          409,
          'RUN_CANCEL_REQUESTED',
          'Dossier run cancellation requested before response delivery',
          'gateway',
          false,
          true,
        );
      }
      if (!valid) {
        leaseFinalized = true;
        throw new DossierApiError(
          409,
          'RUN_LEASE_UNAVAILABLE',
          'Dossier run lease lost before response delivery',
          'gateway',
          true,
        );
      }

      persistenceStarted = true;
      const persisted = await persistAndCompleteDossierRun(
        {
          url: user.supabase.url,
          token: user.token,
          anonKey: user.supabase.anonKey,
        },
        {
          runId: parsed.data.runId,
          leaseOwner,
          dossierId: parsed.data.runId,
          companyName: parsed.data.companyName,
          cnpj: parsed.data.cnpj,
          generatedText: gatewayResult.text,
          usage: mapGatewayUsage(gatewayResult.usage),
          finishReason: gatewayResult.finishReason ?? 'unknown',
          evidence: evidenceContract,
        },
        controller.signal,
      );
      generatedDossierId = persisted.dossierId;
      leaseFinalized = true;
    }

    logEvent('info', 'request:complete', context, 'gateway');
    return res.status(200).json({
      ok: true,
      text: gatewayResult.text,
      usage: mapGatewayUsage(gatewayResult.usage),
      finishReason: gatewayResult.finishReason ?? 'unknown',
      correlationId,
      runId: parsed.data.runId,
      dossierId: parsed.data.action === 'chat' ? parsed.data.dossierId : generatedDossierId,
      status: 'COMPLETED',
    });
  } catch (error) {
    let normalized: DossierApiError;
    const heartbeatError = heartbeat?.getError();
    let persistenceCancellationError: DossierApiError | undefined;
    const persistenceFailureMayHaveCommitted =
      !(error instanceof DossierPersistenceError) || error.code === 'PERSISTENCE_FAILED';
    if (
      persistenceStarted &&
      persistenceFailureMayHaveCommitted &&
      user &&
      leaseOwner &&
      leaseAcquired &&
      gatewayResult
    ) {
      const observedRun = await readPersistenceLifecycle(user, parsed.data.runId);
      const observedDossier =
        parsed.data.action === 'generate' &&
        observedRun?.status === 'COMPLETED' &&
        observedRun.dossier_id === parsed.data.runId
          ? await readPersistedGenerateDossier(user, observedRun, parsed.data.runId)
          : null;
      if (
        parsed.data.action === 'generate' &&
        observedRun?.status === 'COMPLETED' &&
        observedRun.dossier_id === parsed.data.runId &&
        observedDossier &&
        matchesPersistedGenerateContent(observedDossier, observedRun, parsed.data, gatewayResult, evidenceContract)
      ) {
        generatedDossierId = observedRun.dossier_id as string;
        leaseFinalized = true;
        logEvent('info', 'request:reconciled-completed', context, 'persistence');
        return res.status(200).json({
          ok: true,
          text: gatewayResult.text,
          usage: mapGatewayUsage(gatewayResult.usage),
          finishReason: gatewayResult.finishReason ?? 'unknown',
          correlationId,
          runId: parsed.data.runId,
          dossierId: generatedDossierId,
          status: 'COMPLETED',
        });
      }
      if (
        observedRun &&
        (observedRun.status === 'CANCEL_REQUESTED' || observedRun.status === 'CANCELLED' || observedRun.cancel_requested_at) &&
        !cancellationDetected
      ) {
        cancellationDetected = true;
        leaseFinalized = await finalizeRunCancellation(user, parsed.data.runId, leaseOwner, context);
        persistenceCancellationError = leaseFinalized
          ? new DossierApiError(
            409,
            'RUN_CANCEL_REQUESTED',
            'Dossier run cancellation requested',
            'lease',
            false,
            true,
          )
          : cancellationFinalizationError();
      }
    }
    if (
      heartbeatError?.code === 'RUN_CANCEL_REQUESTED' &&
      user &&
      leaseOwner &&
      leaseAcquired &&
      !cancellationDetected
    ) {
      cancellationDetected = true;
      leaseFinalized = await finalizeRunCancellation(user, parsed.data.runId, leaseOwner, context);
    }
    if (persistenceCancellationError) {
      normalized = persistenceCancellationError;
    } else if (heartbeatError?.code === 'RUN_CANCEL_REQUESTED' && !leaseFinalized) {
      normalized = cancellationFinalizationError();
    } else if (heartbeatError) {
      normalized = heartbeatError.cancellationConfirmed || !leaseFinalized
        ? heartbeatError
        : new DossierApiError(
          heartbeatError.status,
          heartbeatError.code,
          heartbeatError.message,
          heartbeatError.stage,
          heartbeatError.retryable,
          true,
        );
    }
    else if (controller.signal.aborted) {
      normalized = new DossierApiError(499, 'REQUEST_ABORTED', 'Request cancelled', 'request', false);
    } else if (error instanceof DossierPersistenceError) {
      normalized = mapPersistenceError(error);
      if (
        normalized.code === 'RUN_CANCEL_REQUESTED' &&
        user &&
        leaseOwner &&
        leaseAcquired &&
        !cancellationDetected
      ) {
        cancellationDetected = true;
        leaseFinalized = await finalizeRunCancellation(user, parsed.data.runId, leaseOwner, context);
        if (!leaseFinalized) normalized = cancellationFinalizationError();
        else {
          normalized = new DossierApiError(
            normalized.status,
            normalized.code,
            normalized.message,
            normalized.stage,
            normalized.retryable,
            true,
          );
        }
      }
    } else if (error instanceof DossierApiError) normalized = error;
    else if (error instanceof LiteLLMRequestError) normalized = mapGatewayError(error, false);
    else normalized = new DossierApiError(500, 'INTERNAL_ERROR', 'Internal dossier error', 'request', true);

    if (
      user &&
      leaseOwner &&
      leaseAcquired &&
      !leaseFinalized &&
      !cancellationDetected &&
      normalized.code !== 'RUN_LEASE_UNAVAILABLE' &&
      normalized.code !== 'RUN_CANCEL_REQUESTED' &&
      normalized.code !== 'RUN_CANCELLATION_FINALIZATION_FAILED'
    ) {
      let failed: DossierRunRecord | null = null;
      try {
        failed = await callRunRpc(
          user,
          'fail_dossier_run',
          {
            p_run_id: parsed.data.runId,
            p_lease_owner: leaseOwner,
            p_error_code: normalized.code,
            p_error_stage: normalized.stage,
          },
          AbortSignal.timeout(2_000),
          'lease',
        );
      } catch {
        logEvent('error', 'lifecycle:failure_finalization_failed', context, normalized.stage, normalized.code);
      }
      if (failed?.status === 'FAILED') {
        leaseFinalized = true;
      } else if (persistenceStarted && gatewayResult) {
        const observedAfterFailure = failed ?? await readPersistenceLifecycle(user, parsed.data.runId);
        const observedDossierAfterFailure =
          parsed.data.action === 'generate' &&
          observedAfterFailure?.status === 'COMPLETED' &&
          observedAfterFailure.dossier_id === parsed.data.runId
            ? await readPersistedGenerateDossier(user, observedAfterFailure, parsed.data.runId)
            : null;
        if (
          parsed.data.action === 'generate' &&
          observedAfterFailure?.status === 'COMPLETED' &&
          observedAfterFailure.dossier_id === parsed.data.runId &&
          observedDossierAfterFailure &&
          matchesPersistedGenerateContent(
            observedDossierAfterFailure,
            observedAfterFailure,
            parsed.data,
            gatewayResult,
            evidenceContract,
          )
        ) {
          generatedDossierId = observedAfterFailure.dossier_id as string;
          leaseFinalized = true;
          logEvent('info', 'request:reconciled-completed-after-failure-finalization', context, 'persistence');
          return res.status(200).json({
            ok: true,
            text: gatewayResult.text,
            usage: mapGatewayUsage(gatewayResult.usage),
            finishReason: gatewayResult.finishReason ?? 'unknown',
            correlationId,
            runId: parsed.data.runId,
            dossierId: generatedDossierId,
            status: 'COMPLETED',
          });
        }
        if (
          observedAfterFailure &&
          (observedAfterFailure.status === 'CANCEL_REQUESTED' ||
            observedAfterFailure.status === 'CANCELLED' ||
            observedAfterFailure.cancel_requested_at)
        ) {
          cancellationDetected = true;
          leaseFinalized = await finalizeRunCancellation(user, parsed.data.runId, leaseOwner, context);
          normalized = leaseFinalized
            ? new DossierApiError(
              409,
              'RUN_CANCEL_REQUESTED',
              'Dossier run cancellation requested',
              'lease',
              false,
              true,
            )
            : cancellationFinalizationError();
        }
      }
    }

    logEvent('error', 'request:failed', context, normalized.stage, normalized.code);
    return sendError(res, correlationId, parsed.data.runId, normalized);
  } finally {
    heartbeat?.cleanup();
    if (user && leaseOwner && leaseAcquired && !leaseFinalized && !cancellationDetected) {
      await releaseLease(user, parsed.data.runId, leaseOwner, context);
    }
    cleanup();
  }
}

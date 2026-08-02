import { randomUUID } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';

import { runDossierGateway } from './_dossier-llm-gateway.js';
import { LiteLLMRequestError, type LiteLLMErrorCode } from './_llm-client.js';
import { DossierRuntimeError, runDossierRuntime } from './_dossier-runtime-orchestrator.js';
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

export const config = { runtime: 'nodejs', maxDuration: 300 };

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
  | 'ATTEMPT_FENCE_MISMATCH'
  | 'ATTEMPT_LEASE_EXPIRED'
  | 'ATTEMPT_LIMIT_REACHED'
  | 'RETRY_NOT_ALLOWED'
  | 'PIPELINE_VERSION_MISMATCH'
  | 'CHECKPOINT_CONFLICT'
  | 'CHECKPOINT_OUT_OF_ORDER'
  | 'CHECKPOINT_PAYLOAD_TOO_LARGE'
  | 'DEADLINE_EXCEEDED'
  | 'EXTERNAL_CALL_CUTOFF'
  | 'RPC_TIMEOUT'
  | 'RPC_HTTP_ERROR'
  | 'RPC_INVALID_RESPONSE'
  | 'SERVER_PIPELINE_RUNTIME_BUDGET_INSUFFICIENT'
  | 'SERVER_PIPELINE_STAGE_TIMEOUT'
  | 'SERVER_PIPELINE_STAGE_FAILED'
  | LiteLLMErrorCode
  | 'INTERNAL_ERROR';

type DossierStage = 'validation' | 'auth' | 'ownership' | 'lease' | 'gateway' | 'persistence' | 'request' | 'helper' | 'retry';

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
  cancel_requested_at?: unknown;
}

interface DossierRecord {
  id?: unknown;
  operator_id?: unknown;
  content?: unknown;
}

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
  // Nunca registrar request content, credenciais, prompts ou respostas do provider.
  // eslint-disable-next-line no-console
  console[level]('[DossierAPI] ' + event, {
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
  return request.message.length + request.history.reduce((total, item) => total + item.content.length, 0);
}

async function authenticate(req: VercelRequest, signal: AbortSignal): Promise<AuthenticatedUser | null> {
  if (signal.aborted) return null;
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
  stage: 'ownership',
): Promise<DossierRunRecord | null> {
  if (signal.aborted) throw new DossierApiError(499, 'REQUEST_ABORTED', 'Request cancelled', 'request', false);
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
  if (!response.ok) throw new DossierApiError(502, 'INTERNAL_ERROR', 'Dossier lifecycle service unavailable', stage, true);
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new DossierApiError(502, 'INTERNAL_ERROR', 'Invalid dossier lifecycle response', stage, true);
  }
  const record = Array.isArray(payload) ? payload[0] : payload;
  return record && typeof record === 'object' ? record as DossierRunRecord : null;
}

async function loadDossierRecord(
  user: AuthenticatedUser,
  dossierId: string,
  operatorId: string,
  signal: AbortSignal,
): Promise<DossierRecord | null> {
  if (signal.aborted) throw new DossierApiError(499, 'REQUEST_ABORTED', 'Request cancelled', 'request', false);
  const response = await fetch(
    `${user.supabase.url}/rest/v1/dossies?id=eq.${encodeURIComponent(dossierId)}&operator_id=eq.${encodeURIComponent(operatorId)}&select=id,operator_id,content&limit=1`,
    { headers: { Authorization: `Bearer ${user.token}`, apikey: user.supabase.anonKey }, signal },
  );
  if (!response.ok) throw new DossierApiError(502, 'INTERNAL_ERROR', 'Dossier content lookup failed', 'ownership', true);
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

async function loadDossierContent(user: AuthenticatedUser, dossierId: string, operatorId: string, signal: AbortSignal): Promise<string | null> {
  const dossier = await loadDossierRecord(user, dossierId, operatorId, signal);
  if (!dossier?.content || typeof dossier.content !== 'object') return null;
  const messages = (dossier.content as { messages?: unknown }).messages;
  if (!Array.isArray(messages) || messages.length === 0) return null;
  const lines: string[] = [];
  let chars = 0;
  for (const message of messages) {
    if (!message || typeof message !== 'object') return null;
    const { sender, text } = message as { sender?: unknown; text?: unknown };
    if ((sender !== 'user' && sender !== 'bot') || typeof text !== 'string' || !text.trim()) return null;
    const line = `${sender === 'bot' ? 'assistant' : 'user'}: ${text.trim()}`;
    chars += (lines.length ? 2 : 0) + line.length;
    if (chars > MAX_SERVER_DOSSIER_CONTEXT_CHARS) throw new DossierApiError(400, 'PAYLOAD_TOO_LARGE', 'Persisted dossier context exceeds the allowed limit', 'validation', false);
    lines.push(line);
  }
  return lines.join('\n\n');
}

function assertRunIdentity(run: DossierRunRecord | null, runId: string): DossierRunRecord {
  if (!run) throw new DossierApiError(404, 'RUN_NOT_FOUND', 'Dossier run not found', 'ownership', false);
  if (run.run_id !== runId) throw new DossierApiError(502, 'INTERNAL_ERROR', 'Invalid dossier lifecycle response', 'ownership', true);
  return run;
}

function assertRunNotCancelled(run: DossierRunRecord): void {
  if (run.status === 'CANCEL_REQUESTED' || run.status === 'CANCELLED' || run.cancel_requested_at) {
    throw new DossierApiError(409, 'RUN_CANCEL_REQUESTED', 'Dossier run cancellation requested', 'ownership', false, run.status === 'CANCELLED');
  }
}

async function assertChatOwnership(user: AuthenticatedUser, request: Extract<DossierRequest, { action: 'chat' }>, signal: AbortSignal): Promise<DossierRunRecord> {
  const run = assertRunIdentity(await callRunRpc(user, 'get_own_dossier_run', { p_run_id: request.runId }, signal, 'ownership'), request.runId);
  assertRunNotCancelled(run);
  if (run.status !== 'COMPLETED') throw new DossierApiError(409, 'RUN_TERMINAL', 'Dossier run is not completed', 'ownership', false);
  if (run.dossier_id !== request.dossierId) throw new DossierApiError(404, 'RUN_NOT_OWNED', 'Dossier does not belong to the authenticated run', 'ownership', false);
  if (typeof run.operator_id !== 'string' || !run.operator_id.trim()) throw new DossierApiError(502, 'INTERNAL_ERROR', 'Invalid dossier lifecycle response', 'ownership', true);
  return run;
}

function createRequestAbortController(req: VercelRequest, res: VercelResponse): { controller: AbortController; cleanup: () => void } {
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
  if (requestAborted || error.code === 'GATEWAY_ABORTED') return new DossierApiError(499, 'REQUEST_ABORTED', 'Request cancelled', 'request', false);
  if (error.code === 'GATEWAY_TIMEOUT') return new DossierApiError(504, error.code, 'Dossier gateway timed out', 'gateway', true);
  if (error.code === 'GATEWAY_NOT_CONFIGURED') return new DossierApiError(503, error.code, 'Dossier gateway not configured', 'gateway', false);
  return new DossierApiError(502, error.code, 'Dossier gateway unavailable', 'gateway', error.retryable);
}

function mapGatewayUsage(usage: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number }): DossierUsage {
  const promptTokens = Number.isFinite(usage.promptTokenCount) && (usage.promptTokenCount ?? 0) >= 0 ? Math.floor(usage.promptTokenCount ?? 0) : 0;
  const completionTokens = Number.isFinite(usage.candidatesTokenCount) && (usage.candidatesTokenCount ?? 0) >= 0 ? Math.floor(usage.candidatesTokenCount ?? 0) : 0;
  const totalTokens = Number.isFinite(usage.totalTokenCount) && (usage.totalTokenCount ?? 0) >= 0 ? Math.floor(usage.totalTokenCount ?? 0) : promptTokens + completionTokens;
  return { promptTokens, completionTokens, totalTokens };
}

function mapRuntimeError(error: DossierRuntimeError): DossierApiError {
  const stage: DossierStage = error.stage === 'persistence' ? 'persistence' : error.stage === 'helper' ? 'helper' : error.stage === 'retry' ? 'retry' : error.stage === 'auth' ? 'auth' : 'request';
  return new DossierApiError(error.status, error.code, error.message, stage, error.retryable, error.cancellationConfirmed);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const correlationId = resolveCorrelationId(req);
  const untrustedRunId = resolveUntrustedRunId(req.body);
  res.setHeader('x-request-id', correlationId);
  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    return sendError(res, correlationId, untrustedRunId, new DossierApiError(405, 'INVALID_REQUEST', 'Method not allowed', 'validation', false));
  }

  const parsed = DossierRequestSchema.safeParse(req.body);
  if (!parsed.success) return sendError(res, correlationId, untrustedRunId, new DossierApiError(400, 'INVALID_REQUEST', 'Invalid request', 'validation', false));

  let evidenceContract: DossierEvidenceContract | undefined;
  if (parsed.data.action === 'generate' && parsed.data.evidence !== undefined) {
    try {
      evidenceContract = sanitizeDossierEvidenceContract(parsed.data.evidence);
    } catch {
      return sendError(res, correlationId, parsed.data.runId, new DossierApiError(400, 'INVALID_REQUEST', 'Invalid dossier evidence contract', 'validation', false));
    }
  }
  if (aggregatePayloadSize(parsed.data) > MAX_AGGREGATE_PAYLOAD_CHARS) return sendError(res, correlationId, parsed.data.runId, new DossierApiError(400, 'PAYLOAD_TOO_LARGE', 'Aggregate payload exceeds the allowed limit', 'validation', false));

  const { controller, cleanup } = createRequestAbortController(req, res);
  const context: LogContext = { correlationId, runId: parsed.data.runId, action: parsed.data.action, startedAt: Date.now() };
  try {
    const user = await authenticate(req, controller.signal);
    if (!user) throw new DossierApiError(401, 'AUTH_REQUIRED', 'Authentication required', 'auth', false);

    if (parsed.data.action === 'chat') {
      const run = await assertChatOwnership(user, parsed.data, controller.signal);
      const dossierContent = await loadDossierContent(user, parsed.data.dossierId, run.operator_id as string, controller.signal);
      if (!dossierContent) throw new DossierApiError(404, 'DOSSIER_CONTENT_UNAVAILABLE', 'Dossier content not available', 'ownership', false);
      if (dossierContent.length + aggregatePayloadSize(parsed.data) > MAX_AGGREGATE_PAYLOAD_CHARS) throw new DossierApiError(400, 'PAYLOAD_TOO_LARGE', 'Aggregate payload exceeds the allowed limit', 'validation', false);
      const result = await runDossierGateway({
        mode: 'chat',
        userContent: parsed.data.message,
        dossierContext: dossierContent,
        history: parsed.data.history,
        signal: controller.signal,
        correlationId,
        runId: parsed.data.runId,
      });
      logEvent('info', 'request:complete', context, 'gateway');
      return res.status(200).json({
        ok: true,
        text: result.text,
        usage: mapGatewayUsage(result.usage),
        finishReason: result.finishReason ?? 'unknown',
        correlationId,
        runId: parsed.data.runId,
        dossierId: parsed.data.dossierId,
        status: 'COMPLETED',
      });
    }

    const result = await runDossierRuntime(
      { url: user.supabase.url, token: user.token, anonKey: user.supabase.anonKey },
      {
        runId: parsed.data.runId,
        companyName: parsed.data.companyName,
        context: parsed.data.context,
        ...(parsed.data.cnpj ? { cnpj: parsed.data.cnpj } : {}),
        ...(evidenceContract ? { evidence: evidenceContract } : {}),
        correlationId,
        signal: controller.signal,
      },
    );
    logEvent('info', 'request:complete', context, 'persistence');
    return res.status(200).json({
      ok: true,
      text: result.text,
      usage: result.usage,
      finishReason: result.finishReason,
      correlationId,
      runId: result.runId,
      dossierId: result.dossierId,
      status: result.status,
    });
  } catch (error) {
    const normalized = error instanceof DossierRuntimeError
      ? mapRuntimeError(error)
      : error instanceof DossierApiError
        ? error
        : error instanceof LiteLLMRequestError
          ? mapGatewayError(error, controller.signal.aborted)
          : new DossierApiError(500, 'INTERNAL_ERROR', 'Internal dossier error', 'request', true);
    logEvent('error', 'request:failed', context, normalized.stage, normalized.code);
    return sendError(res, correlationId, parsed.data.runId, normalized);
  } finally {
    cleanup();
  }
}

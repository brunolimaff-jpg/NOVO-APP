import { randomUUID } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';

import { runDossierGateway } from './_dossier-llm-gateway.js';
import { LiteLLMRequestError, type LiteLLMErrorCode } from './_llm-client.js';

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
const MAX_AGGREGATE_PAYLOAD_CHARS = 240_000;
const LEASE_SECONDS = 60;
const LEASE_HEARTBEAT_MS = 20_000;

export const config = { runtime: 'nodejs' };
export const maxDuration = 60;

type DossierErrorCode =
  | 'AUTH_REQUIRED'
  | 'INVALID_REQUEST'
  | 'PAYLOAD_TOO_LARGE'
  | 'RUN_NOT_FOUND'
  | 'RUN_NOT_OWNED'
  | 'RUN_CANCEL_REQUESTED'
  | 'RUN_TERMINAL'
  | 'RUN_LEASE_UNAVAILABLE'
  | 'REQUEST_ABORTED'
  | 'DOSSIER_CONTENT_UNAVAILABLE'
  | LiteLLMErrorCode
  | 'INTERNAL_ERROR';

type DossierStage = 'validation' | 'auth' | 'ownership' | 'lease' | 'gateway' | 'request';

class DossierApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: DossierErrorCode,
    message: string,
    readonly stage: DossierStage,
    readonly retryable: boolean,
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
  status?: unknown;
  lease_owner?: unknown;
  lease_expires_at?: unknown;
  cancel_requested_at?: unknown;
}

interface DossierRecord {
  id?: unknown;
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
  return res.status(error.status).json({
    ok: false,
    correlationId,
    ...(runId ? { runId } : {}),
    error: {
      code: error.code,
      message: error.message,
      stage: error.stage,
      retryable: error.retryable,
    },
  });
}

function aggregatePayloadSize(request: DossierRequest): number {
  if (request.action === 'generate') return request.context.length;
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
  signal: AbortSignal,
): Promise<string | null> {
  const response = await fetch(
    `${user.supabase.url}/rest/v1/dossies?id=eq.${encodeURIComponent(dossierId)}&select=id,content&limit=1`,
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
  if (dossier.id !== dossierId || !dossier.content || typeof dossier.content !== 'object') return null;
  const messages = (dossier.content as { messages?: unknown }).messages;
  if (!Array.isArray(messages) || messages.length === 0) return null;

  const contextLines: string[] = [];
  for (const message of messages) {
    if (!message || typeof message !== 'object') return null;
    const { sender, text } = message as { sender?: unknown; text?: unknown };
    if ((sender !== 'user' && sender !== 'bot') || typeof text !== 'string' || !text.trim()) return null;
    contextLines.push(`${sender === 'bot' ? 'assistant' : 'user'}: ${text.trim()}`);
  }
  return contextLines.join('\n\n');
}

function assertRunIdentity(run: DossierRunRecord | null, runId: string, stage: 'ownership' | 'lease'): DossierRunRecord {
  if (!run) throw new DossierApiError(404, 'RUN_NOT_FOUND', 'Dossier run not found', stage, false);
  if (run.run_id !== runId) {
    throw new DossierApiError(502, 'INTERNAL_ERROR', 'Invalid dossier lifecycle response', stage, true);
  }
  return run;
}

function assertRunNotCancelled(run: DossierRunRecord, stage: 'ownership' | 'lease'): void {
  if (run.status === 'CANCEL_REQUESTED' || run.status === 'CANCELLED' || run.cancel_requested_at) {
    throw new DossierApiError(409, 'RUN_CANCEL_REQUESTED', 'Dossier run cancellation requested', stage, false);
  }
}

async function assertChatOwnership(
  user: AuthenticatedUser,
  request: Extract<DossierRequest, { action: 'chat' }>,
  signal: AbortSignal,
): Promise<void> {
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

async function acquireGenerateLease(
  user: AuthenticatedUser,
  runId: string,
  leaseOwner: string,
  signal: AbortSignal,
): Promise<void> {
  const current = assertRunIdentity(
    await callRunRpc(user, 'get_own_dossier_run', { p_run_id: runId }, signal, 'lease'),
    runId,
    'lease',
  );
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

async function markRunCancelled(
  user: AuthenticatedUser,
  runId: string,
  leaseOwner: string,
  signal: AbortSignal,
  context: LogContext,
): Promise<boolean> {
  try {
    const cancelled = await callRunRpc(
      user,
      'mark_dossier_run_cancelled',
      { p_run_id: runId, p_lease_owner: leaseOwner },
      signal,
      'lease',
    );
    if (cancelled?.status === 'CANCELLED') return true;
  } catch {
    logEvent('error', 'lease:cancel_failed', context, 'lease', 'INTERNAL_ERROR');
  }
  return false;
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
  cleanup: () => void;
} {
  const heartbeatController = new AbortController();
  const gatewayController = new AbortController();
  const combined = combineSignals(requestSignal, gatewayController.signal);
  let stopped = false;
  let heartbeatInFlight = false;
  let heartbeatError: DossierApiError | undefined;

  const timer = setInterval(async () => {
    if (stopped || heartbeatInFlight) return;
    heartbeatInFlight = true;
    try {
      const renewed = await callRunRpc(
        user,
        'renew_dossier_run_lease',
        { p_run_id: runId, p_lease_owner: leaseOwner, p_lease_seconds: LEASE_SECONDS },
        heartbeatController.signal,
        'lease',
      );
      if (!renewed) {
        heartbeatError = new DossierApiError(409, 'RUN_LEASE_UNAVAILABLE', 'Dossier run lease lost', 'lease', true);
      } else if (renewed.status === 'CANCEL_REQUESTED' || renewed.status === 'CANCELLED' || renewed.cancel_requested_at) {
        heartbeatError = new DossierApiError(409, 'RUN_CANCEL_REQUESTED', 'Dossier run cancellation requested', 'lease', false);
      } else if (!hasValidLease(renewed, runId, leaseOwner)) {
        heartbeatError = new DossierApiError(409, 'RUN_LEASE_UNAVAILABLE', 'Dossier run lease lost', 'lease', true);
      }
    } catch (error) {
      if (!stopped) {
        heartbeatError =
          error instanceof DossierApiError
            ? error
            : new DossierApiError(502, 'INTERNAL_ERROR', 'Lease heartbeat failed', 'lease', true);
      }
    } finally {
      heartbeatInFlight = false;
    }
    if (heartbeatError) gatewayController.abort();
  }, LEASE_HEARTBEAT_MS);

  return {
    signal: combined.signal,
    getError: () => heartbeatError,
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
  let dossierContent: string | undefined;
  let user: AuthenticatedUser | null = null;
  let heartbeat: ReturnType<typeof startLeaseHeartbeat> | undefined;
  logEvent('info', 'request:start', context, 'auth');

  try {
    user = await authenticate(req, controller.signal);
    if (!user) throw new DossierApiError(401, 'AUTH_REQUIRED', 'Authentication required', 'auth', false);

    if (parsed.data.action === 'chat') {
      await assertChatOwnership(user, parsed.data, controller.signal);
      dossierContent = await loadDossierContent(user, parsed.data.dossierId, controller.signal) ?? undefined;
      if (!dossierContent) {
        throw new DossierApiError(404, 'DOSSIER_CONTENT_UNAVAILABLE', 'Dossier content not available', 'ownership', false);
      }
    } else {
      leaseOwner = randomUUID();
      await acquireGenerateLease(user, parsed.data.runId, leaseOwner, controller.signal);
      leaseAcquired = true;
      heartbeat = startLeaseHeartbeat(user, parsed.data.runId, leaseOwner, controller.signal);
    }

    const gatewaySignal = heartbeat?.signal ?? controller.signal;
    const gatewayResult =
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

    // Final lease validation before delivering response
    if (parsed.data.action === 'generate' && leaseOwner) {
      const { valid, run } = await validateFinalLease(user, parsed.data.runId, leaseOwner, controller.signal);
      if (run && (run.status === 'CANCEL_REQUESTED' || run.status === 'CANCELLED' || run.cancel_requested_at)) {
        cancellationDetected = true;
        leaseFinalized = await markRunCancelled(
          user,
          parsed.data.runId,
          leaseOwner,
          controller.signal,
          context,
        );
        throw new DossierApiError(409, 'RUN_CANCEL_REQUESTED', 'Dossier run cancellation requested before response delivery', 'gateway', false);
      }
      if (!valid) {
        leaseFinalized = true;
        throw new DossierApiError(409, 'RUN_LEASE_UNAVAILABLE', 'Dossier run lease lost before response delivery', 'gateway', true);
      }
    }

    logEvent('info', 'request:complete', context, 'gateway');
    return res.status(200).json({
      ok: true,
      text: gatewayResult.text,
      usage: gatewayResult.usage,
      finishReason: gatewayResult.finishReason,
      correlationId,
      runId: parsed.data.runId,
    });
  } catch (error) {
    let normalized: DossierApiError;
    const heartbeatError = heartbeat?.getError();
    if (
      heartbeatError?.code === 'RUN_CANCEL_REQUESTED' &&
      user &&
      leaseOwner &&
      leaseAcquired &&
      !cancellationDetected
    ) {
      cancellationDetected = true;
      leaseFinalized = await markRunCancelled(
        user,
        parsed.data.runId,
        leaseOwner,
        controller.signal,
        context,
      );
    }
    if (heartbeatError) normalized = heartbeatError;
    else if (controller.signal.aborted) {
      normalized = new DossierApiError(499, 'REQUEST_ABORTED', 'Request cancelled', 'request', false);
    } else if (error instanceof DossierApiError) normalized = error;
    else if (error instanceof LiteLLMRequestError) normalized = mapGatewayError(error, false);
    else normalized = new DossierApiError(500, 'INTERNAL_ERROR', 'Internal dossier error', 'request', true);

    logEvent('error', 'request:failed', context, normalized.stage, normalized.code);
    return sendError(res, correlationId, parsed.data.runId, normalized);
  } finally {
    heartbeat?.cleanup();
    if (user && leaseOwner && leaseAcquired && !leaseFinalized) {
      await releaseLease(user, parsed.data.runId, leaseOwner, context);
    }
    cleanup();
  }
}

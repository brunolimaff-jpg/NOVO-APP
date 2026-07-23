import { randomUUID } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';

import { runDossierGateway } from './_dossier-llm-gateway.js';

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
  dossierContext: z.string().trim().min(1).max(200_000),
  history: z.array(HistoryItemSchema).max(40).default([]),
});

const DossierRequestSchema = z.discriminatedUnion('action', [GenerateRequestSchema, ChatRequestSchema]);
const REQUEST_ID_PATTERN = /^[a-zA-Z0-9._:-]{8,128}$/;

export const config = { runtime: 'nodejs' };
export const maxDuration = 60;

function getHeader(req: VercelRequest, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function resolveCorrelationId(req: VercelRequest): string {
  const candidate = getHeader(req, 'x-request-id')?.trim();
  return candidate && REQUEST_ID_PATTERN.test(candidate) ? candidate : randomUUID();
}

function getSupabaseAuthConfig(): { url: string; anonKey: string } | null {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  return url && anonKey ? { url: url.replace(/\/+$/, ''), anonKey } : null;
}

interface AuthenticatedUser {
  id: string;
  token: string;
  supabase: { url: string; anonKey: string };
}

async function authenticate(req: VercelRequest, signal: AbortSignal): Promise<AuthenticatedUser | null> {
  const authorization = getHeader(req, 'authorization');
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const config = getSupabaseAuthConfig();
  if (!token || !config) return null;

  const response = await fetch(`${config.url}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: config.anonKey },
    signal,
  });
  if (!response.ok) return null;

  const body = (await response.json()) as { id?: unknown };
  return typeof body.id === 'string' && body.id ? { id: body.id, token, supabase: config } : null;
}

async function ownsDossierRun(
  user: AuthenticatedUser,
  runId: string,
  dossierId: string | undefined,
  signal: AbortSignal,
): Promise<boolean> {
  const response = await fetch(`${user.supabase.url}/rest/v1/rpc/get_own_dossier_run`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${user.token}`,
      apikey: user.supabase.anonKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_run_id: runId }),
    signal,
  });
  if (!response.ok) return false;

  const body = (await response.json()) as unknown;
  const record = Array.isArray(body) ? body[0] : body;
  if (!record || typeof record !== 'object') return false;
  const run = record as { run_id?: unknown; dossier_id?: unknown; status?: unknown };
  if (run.run_id !== runId) return false;
  if (dossierId === undefined) return run.status === 'PENDING' || run.status === 'RUNNING';
  return run.status === 'COMPLETED' && run.dossier_id === dossierId;
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const correlationId = resolveCorrelationId(req);
  res.setHeader('x-request-id', correlationId);

  if (req.method !== 'POST') {
    res.setHeader('allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed', correlationId });
  }

  const parsed = DossierRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request', correlationId });
  }

  const { controller, cleanup } = createRequestAbortController(req, res);
  const startedAt = Date.now();
  // eslint-disable-next-line no-console
  console.info('[DossierAPI] request:start', { correlationId, action: parsed.data.action });

  try {
    const user = await authenticate(req, controller.signal);
    if (!user) {
      console.warn('[DossierAPI] auth:denied', { correlationId });
      return res.status(401).json({ error: 'Unauthorized', correlationId });
    }

    const ownsRun = await ownsDossierRun(
      user,
      parsed.data.runId,
      parsed.data.action === 'chat' ? parsed.data.dossierId : undefined,
      controller.signal,
    );
    if (!ownsRun) {
      console.warn('[DossierAPI] ownership:denied', { correlationId, action: parsed.data.action });
      return res.status(404).json({ error: 'Dossier run not found', correlationId });
    }

    const gatewayResult =
      parsed.data.action === 'chat'
        ? await runDossierGateway({
            mode: 'chat',
            userContent: parsed.data.message,
            dossierContext: parsed.data.dossierContext,
            history: parsed.data.history,
            signal: controller.signal,
            correlationId,
          })
        : await runDossierGateway({
            mode: 'generate',
            userContent: `Gere o dossiê de ${parsed.data.companyName}${parsed.data.cnpj ? `, CNPJ ${parsed.data.cnpj}` : ''}.`,
            dossierContext: parsed.data.context,
            signal: controller.signal,
            correlationId,
          });

    // eslint-disable-next-line no-console
    console.info('[DossierAPI] request:complete', {
      correlationId,
      action: parsed.data.action,
      durationMs: Date.now() - startedAt,
    });
    return res.status(200).json({
      text: gatewayResult.text,
      usage: gatewayResult.usage,
      finishReason: gatewayResult.finishReason,
      correlationId,
    });
  } catch (error) {
    const aborted = controller.signal.aborted || (error instanceof Error && error.name === 'AbortError');
    console.error('[DossierAPI] request:failed', {
      correlationId,
      action: parsed.data.action,
      durationMs: Date.now() - startedAt,
      errorName: error instanceof Error ? error.name : 'Error',
      aborted,
    });
    if (aborted) {
      return res.status(499).json({ error: 'Request cancelled', correlationId });
    }
    return res.status(502).json({ error: 'Dossier gateway unavailable', correlationId });
  } finally {
    cleanup();
  }
}

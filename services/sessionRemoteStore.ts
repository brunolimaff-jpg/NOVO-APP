import { ChatSession, Message } from '../types';
import { withAutoRetry } from '../utils/retry';
import { scoutDiag } from '../utils/diagnosticLog';
import { BACKEND_URL } from './apiConfig';
import { stripInternalMarkers } from '../utils/textCleaners';
import { DEFAULT_MODE } from '../constants';

const SESSIONS_API_URL = BACKEND_URL;
const TIMEOUT_MS = 10000;
type FetchOptions = Parameters<typeof fetch>[1];
type RemoteStoreErrorKind = 'unavailable' | 'incompatible';

interface RemoteSessionRow {
  sessionId: string;
  userId?: string;
  userName?: string;
  title: string;
  empresaAlvo: string;
  cnpj: string;
  createdAt: string;
  updatedAt: string;
  messagesJson?: string;
  scoreOportunidade?: number | string;
  resumoDossie?: string;
}

interface ParsedRemoteEnvelope {
  payload: Record<string, unknown>;
  success: boolean | undefined;
  message?: string;
}

class RemoteStoreError extends Error {
  kind: RemoteStoreErrorKind;
  action: string;
  details?: Record<string, unknown>;

  constructor(kind: RemoteStoreErrorKind, action: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'RemoteStoreError';
    this.kind = kind;
    this.action = action;
    this.details = details;
  }
}

function isLookupLikePayload(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const candidate = payload as Record<string, unknown>;
  return 'results' in candidate && 'encontrado' in candidate;
}

function parseJsonObject(text: string, action: string): Record<string, unknown> {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new RemoteStoreError('incompatible', action, 'Invalid JSON response');
  }

  if (!data || typeof data !== 'object') {
    throw new RemoteStoreError('incompatible', action, 'Logical API error');
  }

  if (isLookupLikePayload(data)) {
    throw new RemoteStoreError('incompatible', action, 'Endpoint mismatch: backend respondeu payload de lookup');
  }

  return data as Record<string, unknown>;
}

function getSuccessFlag(payload: Record<string, unknown>): boolean | undefined {
  if (typeof payload.ok === 'boolean') return payload.ok;
  if (typeof payload.success === 'boolean') return payload.success;
  return undefined;
}

function getPayloadMessage(payload: Record<string, unknown>): string | undefined {
  if (typeof payload.message === 'string' && payload.message.trim().length > 0) return payload.message;
  if (typeof payload.error === 'string' && payload.error.trim().length > 0) return payload.error;
  return undefined;
}

function parseRemoteEnvelope(text: string, action: string): ParsedRemoteEnvelope {
  const payload = parseJsonObject(text, action);
  return {
    payload,
    success: getSuccessFlag(payload),
    message: getPayloadMessage(payload),
  };
}

function isUnknownActionMessage(message: string | undefined): boolean {
  if (!message) return false;
  const normalized = message.toLowerCase();
  return normalized.includes('ação desconhecida') || normalized.includes('acao desconhecida');
}

function isUsePostHintMessage(message: string | undefined): boolean {
  if (!message) return false;
  const normalized = message.toLowerCase();
  return normalized.includes('use post para ações') || normalized.includes('use post para acoes');
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseListSessionsResponse(text: string): RemoteSessionRow[] {
  const envelope = parseRemoteEnvelope(text, 'listSessions');

  if (envelope.success === true) {
    if (Array.isArray(envelope.payload.sessions)) {
      return envelope.payload.sessions as RemoteSessionRow[];
    }

    if (isUsePostHintMessage(envelope.message)) {
      throw new RemoteStoreError('unavailable', 'listSessions', envelope.message ?? 'Use POST para ações');
    }

    throw new RemoteStoreError('incompatible', 'listSessions', envelope.message ?? 'Invalid sessions payload');
  }

  if (envelope.success === false) {
    if (isUnknownActionMessage(envelope.message)) {
      throw new RemoteStoreError('unavailable', 'listSessions', envelope.message ?? 'Ação desconhecida');
    }

    throw new Error(envelope.message ?? 'Logical API error');
  }

  throw new RemoteStoreError('incompatible', 'listSessions', 'Invalid sessions payload');
}

function parseGetSessionResponse(text: string): RemoteSessionRow | null {
  const envelope = parseRemoteEnvelope(text, 'getSession');

  if (envelope.success === true) {
    if (!('session' in envelope.payload) || envelope.payload.session == null) return null;
    return envelope.payload.session as RemoteSessionRow;
  }

  if (envelope.success === false) {
    if (isUnknownActionMessage(envelope.message)) {
      throw new RemoteStoreError('unavailable', 'getSession', envelope.message ?? 'Ação desconhecida');
    }

    if (!('session' in envelope.payload) || envelope.payload.session == null) return null;
    return null;
  }

  throw new RemoteStoreError('incompatible', 'getSession', 'Invalid session payload');
}

function parseSaveSessionResponse(text: string): Record<string, unknown> {
  const envelope = parseRemoteEnvelope(text, 'saveSession');

  if (envelope.success === true) {
    return envelope.payload;
  }

  if (envelope.success === false) {
    const message = envelope.message ?? 'Save failed';
    if (isUnknownActionMessage(message)) {
      throw new RemoteStoreError('unavailable', 'saveSession', message);
    }

    throw new Error(message);
  }

  throw new RemoteStoreError('incompatible', 'saveSession', 'Invalid save response');
}

// Helper com timeout
async function fetchWithTimeout(url: string, options: FetchOptions, timeout: number = TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    throw err;
  }
}

export async function listRemoteSessions(): Promise<ChatSession[]> {
  const apiCall = async () => {
    const attempts: Array<{ name: string; request: () => Promise<Response> }> = [
      {
        name: 'GET querystring',
        request: () =>
          fetchWithTimeout(`${SESSIONS_API_URL}?action=listSessions`, {
            method: 'GET',
            redirect: 'follow',
          }),
      },
      {
        name: 'POST body',
        request: () =>
          fetchWithTimeout(SESSIONS_API_URL, {
            method: 'POST',
            redirect: 'follow',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'listSessions' }),
          }),
      },
    ];

    const attemptErrors: string[] = [];
    let lastError: unknown = null;

    for (const attempt of attempts) {
      try {
        const res = await attempt.request();
        if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
        const text = await res.text();
        return parseListSessionsResponse(text);
      } catch (error) {
        lastError = error;
        attemptErrors.push(`${attempt.name}: ${toErrorMessage(error)}`);
      }
    }

    if (lastError instanceof RemoteStoreError) {
      throw new RemoteStoreError(lastError.kind, lastError.action, lastError.message, {
        attempts: attemptErrors,
      });
    }

    throw new RemoteStoreError('unavailable', 'listSessions', toErrorMessage(lastError), {
      attempts: attemptErrors,
    });
  };

  try {
    const rows = await withAutoRetry<RemoteSessionRow[]>('RemoteStore:list', apiCall, { maxRetries: 2 });

    return rows.map(r => ({
      id: r.sessionId,
      title: r.title || 'Sessão sem título',
      empresaAlvo: r.empresaAlvo || null,
      cnpj: r.cnpj || null,
      modoPrincipal: DEFAULT_MODE,
      scoreOportunidade: r.scoreOportunidade ? Number(r.scoreOportunidade) : null,
      resumoDossie: r.resumoDossie || null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      messages: [],
    }));
  } catch (error) {
    const reason = toErrorMessage(error);
    scoutDiag.warn('RemoteStore', 'sync remoto indisponível; usando cache local', {
      action: 'listSessions',
      reason,
      attempts: error instanceof RemoteStoreError ? error.details?.attempts : undefined,
    });
    return [];
  }
}

export async function getRemoteSession(id: string): Promise<ChatSession | null> {
  const apiCall = async () => {
    const res = await fetchWithTimeout(SESSIONS_API_URL, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'getSession', sessionId: id }),
    });

    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);

    const text = await res.text();
    return parseGetSessionResponse(text);
  };

  try {
    const s = await withAutoRetry('RemoteStore:get', apiCall, { maxRetries: 2 });
    if (!s) return null;

    let messages: Message[] = [];
    if (s.messagesJson) {
      try {
        const parsed = JSON.parse(s.messagesJson);
        messages = parsed.map((message: Message & { timestamp: string }) => ({
          ...message,
          text: stripInternalMarkers(String(message.text || '')),
          timestamp: new Date(message.timestamp),
        }));
      } catch (parseErr: unknown) {
        scoutDiag.warn('RemoteStore', 'messagesJson inválido ao restaurar sessão', {
          sessionId: s.sessionId,
          error: toErrorMessage(parseErr),
        });
        messages = [];
      }
    }

    return {
      id: s.sessionId,
      title: s.title || 'Sessão sem título',
      empresaAlvo: s.empresaAlvo || null,
      cnpj: s.cnpj || null,
      modoPrincipal: DEFAULT_MODE,
      scoreOportunidade: s.scoreOportunidade ? Number(s.scoreOportunidade) : null,
      resumoDossie: s.resumoDossie || null,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      messages,
    };
  } catch (error) {
    const details = {
      id,
      error: toErrorMessage(error),
    };

    if (error instanceof RemoteStoreError) {
      scoutDiag.warn('RemoteStore', 'getRemoteSession indisponível', details);
    } else {
      scoutDiag.error('RemoteStore', 'getRemoteSession falhou', details);
    }
    return null;
  }
}

export async function saveRemoteSession(session: ChatSession, userId?: string, userName?: string) {
  const payload = {
    action: 'saveSession',
    session: {
      id: session.id,
      userId: userId || 'user_default',
      userName: userName || 'Convidado',
      title: session.title,
      empresaAlvo: session.empresaAlvo,
      cnpj: session.cnpj,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      messages: session.messages,
      scoreOportunidade: session.scoreOportunidade,
      resumoDossie: session.resumoDossie,
    },
  };

  const apiCall = async () => {
    const res = await fetchWithTimeout(SESSIONS_API_URL, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);

    const text = await res.text();
    return parseSaveSessionResponse(text);
  };

  return await withAutoRetry('RemoteStore:save', apiCall, { maxRetries: 3 });
}

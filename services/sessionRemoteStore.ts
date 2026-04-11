import { ChatSession, Message } from "../types";
import { withAutoRetry } from "../utils/retry";
import { scoutDiag } from "../utils/diagnosticLog";
import { BACKEND_URL } from "./apiConfig";
import { stripInternalMarkers } from "../utils/textCleaners";
import { DEFAULT_MODE } from "../constants";

const SESSIONS_API_URL = BACKEND_URL;
const TIMEOUT_MS = 10000;
type FetchOptions = Parameters<typeof fetch>[1];

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

function isLookupLikePayload(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const candidate = payload as Record<string, unknown>;
  return 'results' in candidate && 'encontrado' in candidate;
}

function parseListSessionsResponse(text: string): RemoteSessionRow[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON response");
  }

  if (!data || typeof data !== 'object') {
    throw new Error('Logical API error');
  }

  if (isLookupLikePayload(data)) {
    throw new Error('Endpoint mismatch: backend respondeu payload de lookup');
  }

  const parsed = data as {
    ok?: boolean;
    message?: string;
    sessions?: unknown;
  };

  if (!parsed.ok) throw new Error(parsed.message || "Logical API error");
  if (!Array.isArray(parsed.sessions)) throw new Error('Invalid sessions payload');
  return parsed.sessions as RemoteSessionRow[];
}

// Helper com timeout
async function fetchWithTimeout(url: string, options: FetchOptions, timeout: number = TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (err: any) {
    clearTimeout(timeoutId);
    throw err;
  }
}

export async function listRemoteSessions(): Promise<ChatSession[]> {
  const apiCall = async () => {
    const attempts: Array<{ name: string; request: () => Promise<Response> }> = [
      {
        name: 'GET querystring',
        request: () => fetchWithTimeout(`${SESSIONS_API_URL}?action=listSessions`, {
          method: "GET",
          redirect: "follow",
        }),
      },
      {
        name: 'POST body',
        request: () => fetchWithTimeout(SESSIONS_API_URL, {
          method: "POST",
          redirect: "follow",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({ action: "listSessions" }),
        }),
      },
    ];

    let lastError: unknown = null;

    for (const attempt of attempts) {
      try {
        const res = await attempt.request();
        if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
        const text = await res.text();
        return parseListSessionsResponse(text);
      } catch (error) {
        lastError = error;
        scoutDiag.warn("RemoteStore", "listRemoteSessions tentativa falhou", {
          attempt: attempt.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Failed to list sessions');
  };

  try {
    const rows = await withAutoRetry<RemoteSessionRow[]>('RemoteStore:list', apiCall, { maxRetries: 2 });
    
    return rows.map((r) => ({
      id: r.sessionId,
      title: r.title || "Sessão sem título",
      empresaAlvo: r.empresaAlvo || null,
      cnpj: r.cnpj || null,
      modoPrincipal: DEFAULT_MODE,
      scoreOportunidade: r.scoreOportunidade ? Number(r.scoreOportunidade) : null,
      resumoDossie: r.resumoDossie || null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      messages: [] 
    }));
  } catch (error) {
    scoutDiag.warn("RemoteStore", "listRemoteSessions falhou — retornando vazio", {
      error: error instanceof Error ? error.message : String(error),
      action: "listSessions",
    });
    return [];
  }
}

export async function getRemoteSession(id: string): Promise<ChatSession | null> {
  const apiCall = async () => {
    const res = await fetchWithTimeout(SESSIONS_API_URL, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "getSession", sessionId: id })
    });

    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("Invalid JSON response");
    }

    if (!data.ok || !data.session) return null;
    return data.session as RemoteSessionRow;
  };

  try {
    const s = await withAutoRetry('RemoteStore:get', apiCall, { maxRetries: 2 });
    if (!s) return null;

    let messages: Message[] = [];
    if (s.messagesJson) {
      try {
        const parsed = JSON.parse(s.messagesJson);
        messages = parsed.map((m: any) => ({
          ...m,
          text: stripInternalMarkers(String(m.text || '')),
          timestamp: new Date(m.timestamp)
        }));
      } catch (parseErr: unknown) {
        scoutDiag.warn("RemoteStore", "messagesJson inválido ao restaurar sessão", {
          sessionId: s.sessionId,
          error: parseErr instanceof Error ? parseErr.message : String(parseErr),
        });
        messages = [];
      }
    }

    return {
      id: s.sessionId,
      title: s.title || "Sessão sem título",
      empresaAlvo: s.empresaAlvo || null,
      cnpj: s.cnpj || null,
      modoPrincipal: DEFAULT_MODE,
      scoreOportunidade: s.scoreOportunidade ? Number(s.scoreOportunidade) : null,
      resumoDossie: s.resumoDossie || null,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      messages
    };
  } catch (error) {
    scoutDiag.error("RemoteStore", "getRemoteSession falhou", {
      id,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function saveRemoteSession(session: ChatSession, userId?: string, userName?: string) {
  const payload = {
    action: "saveSession",
    session: {
      id: session.id,
      userId: userId || "user_default",
      userName: userName || "Convidado",
      title: session.title,
      empresaAlvo: session.empresaAlvo,
      cnpj: session.cnpj,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      messages: session.messages,
      scoreOportunidade: session.scoreOportunidade,
      resumoDossie: session.resumoDossie
    }
  };

  const apiCall = async () => {
    const res = await fetchWithTimeout(SESSIONS_API_URL, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });
    
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("Invalid JSON response");
    }

    if (!data.ok) throw new Error(data.message || "Save failed");
    return data;
  };

  return await withAutoRetry('RemoteStore:save', apiCall, { maxRetries: 3 });
}

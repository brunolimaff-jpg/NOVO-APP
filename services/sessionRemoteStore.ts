import { ChatSession, Message } from "../types";
import { withAutoRetry } from "../utils/retry";
import { scoutDiag } from "../utils/diagnosticLog";
import { BACKEND_URL } from "./apiConfig";
import { stripInternalMarkers } from "../utils/textCleaners";

const SESSIONS_API_URL = BACKEND_URL;
const TIMEOUT_MS = 10000;

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

// Helper com timeout
async function fetchWithTimeout(url: string, options: RequestInit, timeout: number = TIMEOUT_MS): Promise<Response> {
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
    // FIX: Apps Script converte POST→GET no redirect 302, perdendo o body.
    // Usando GET com querystring garante que o parâmetro chega após o redirect.
    const url = `${SESSIONS_API_URL}?action=listSessions`;
    const res = await fetchWithTimeout(url, {
      method: "GET",
      redirect: "follow",
    });
    
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("Invalid JSON response");
    }

    if (!data.ok) throw new Error(data.message || "Logical API error");
    return data.sessions || [];
  };

  try {
    const rows = await withAutoRetry<RemoteSessionRow[]>('RemoteStore:list', apiCall, { maxRetries: 2 });
    
    return rows.map((r) => ({
      id: r.sessionId,
      title: r.title || "Sessão sem título",
      empresaAlvo: r.empresaAlvo || null,
      cnpj: r.cnpj || null,
      modoPrincipal: null,
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
      modoPrincipal: null,
      scoreOportunidade: s.scoreOportunidade ? Number(s.scoreOportunidade) : null,
      resumoDossie: r.resumoDossie || null,
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

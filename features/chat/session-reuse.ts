import type { ChatSession } from '../../types';

export const REUSABLE_SESSION_MAX_AGE_MS = 5000;

export function isSessionReusable(session: ChatSession): boolean {
  if (session.empresaAlvo) return false;
  if (session.cnpj) return false;
  if (session.messages && session.messages.length > 0) return false;
  const createdAtMs = new Date(session.createdAt).getTime();
  if (!Number.isFinite(createdAtMs)) return false;
  const age = Date.now() - createdAtMs;
  if (age > REUSABLE_SESSION_MAX_AGE_MS) return false;
  return true;
}

export function findReusableEmptySession(sessions: ChatSession[]): ChatSession | null {
  for (const session of sessions) {
    if (isSessionReusable(session)) return session;
  }
  return null;
}

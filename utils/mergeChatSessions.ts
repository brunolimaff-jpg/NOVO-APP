import type { ChatSession, Message } from '../types';

function parseUpdatedAt(value: string | undefined): number {
  if (!value) return 0;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : 0;
}

function hasSubstantiveMessages(messages: Message[] | undefined): boolean {
  if (!messages || messages.length === 0) return false;
  return messages.some(message => {
    const text = String(message.text || '').trim();
    if (text.length > 0) return true;
    return Boolean(message.isThinking);
  });
}

function pickCreatedAt(local: ChatSession, remote: ChatSession): string {
  const localCreatedTs = parseUpdatedAt(local.createdAt);
  const remoteCreatedTs = parseUpdatedAt(remote.createdAt);
  if (localCreatedTs > 0 && remoteCreatedTs > 0) {
    return localCreatedTs <= remoteCreatedTs ? local.createdAt : remote.createdAt;
  }
  if (localCreatedTs > 0) return local.createdAt;
  if (remoteCreatedTs > 0) return remote.createdAt;
  return local.createdAt || remote.createdAt;
}

function pickMessages(local: Message[] | undefined, remote: Message[] | undefined): Message[] {
  const localMessages = local ?? [];
  const remoteMessages = remote ?? [];
  const localHas = hasSubstantiveMessages(localMessages);
  const remoteHas = hasSubstantiveMessages(remoteMessages);

  if (localHas && !remoteHas) return localMessages;
  if (remoteHas && !localHas) return remoteMessages;
  if (!localHas && !remoteHas) return localMessages.length > 0 ? localMessages : remoteMessages;

  const localChars = localMessages.reduce((sum, m) => sum + String(m.text || '').length, 0);
  const remoteChars = remoteMessages.reduce((sum, m) => sum + String(m.text || '').length, 0);
  return localChars >= remoteChars ? localMessages : remoteMessages;
}

function mergeSessionPair(local: ChatSession, remote: ChatSession): ChatSession {
  const localTs = parseUpdatedAt(local.updatedAt);
  const remoteTs = parseUpdatedAt(remote.updatedAt);
  const newerIsLocal = localTs >= remoteTs;
  const base = newerIsLocal ? { ...local } : { ...remote };
  const other = newerIsLocal ? remote : local;

  return {
    ...base,
    title: base.title?.trim() ? base.title : other.title,
    empresaAlvo: base.empresaAlvo?.trim() ? base.empresaAlvo : other.empresaAlvo,
    cnpj: base.cnpj?.trim() ? base.cnpj : other.cnpj,
    modoPrincipal: base.modoPrincipal ?? other.modoPrincipal,
    scoreOportunidade: base.scoreOportunidade ?? other.scoreOportunidade,
    resumoDossie: base.resumoDossie?.trim() ? base.resumoDossie : other.resumoDossie,
    companyContext: base.companyContext?.trim() ? base.companyContext : other.companyContext,
    createdAt: pickCreatedAt(local, remote),
    updatedAt: localTs >= remoteTs ? local.updatedAt : remote.updatedAt,
    messages: pickMessages(local.messages, remote.messages),
  };
}

/**
 * Mescla listas de sessões sem apagar mensagens locais com versão remota vazia/stale.
 * Sessões só em uma das listas são preservadas.
 */
export function mergeChatSessions(localSessions: ChatSession[], incomingSessions: ChatSession[]): ChatSession[] {
  const byId = new Map<string, ChatSession>();

  for (const session of localSessions) {
    byId.set(session.id, session);
  }

  for (const incoming of incomingSessions) {
    const existing = byId.get(incoming.id);
    if (!existing) {
      byId.set(incoming.id, incoming);
      continue;
    }
    byId.set(incoming.id, mergeSessionPair(existing, incoming));
  }

  return Array.from(byId.values()).sort((a, b) => parseUpdatedAt(b.updatedAt) - parseUpdatedAt(a.updatedAt));
}

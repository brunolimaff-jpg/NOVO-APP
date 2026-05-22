// utils/conversationHistory.ts
// Sistema de histórico de conversas com LocalStorage

import { scoutDiag } from './diagnosticLog';

export interface ConversationEntry {
  id: string;
  timestamp: number;
  query: string;
  response: string;
  type: 'chat' | 'warroom';
  mode?: string; // Para War Room: tech, killscript, etc
}

const STORAGE_KEY = 'scout360_history';
const MAX_ENTRIES = 50;

export function saveConversation(entry: Omit<ConversationEntry, 'id' | 'timestamp'>): void {
  if (typeof window === 'undefined') return;

  const history = getConversationHistory();
  const newEntry: ConversationEntry = {
    ...entry,
    id: Date.now().toString(),
    timestamp: Date.now(),
  };

  history.unshift(newEntry);
  const trimmed = history.slice(0, MAX_ENTRIES);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch (err) {
    console.error('Erro ao salvar histórico:', err);
  }
}

export function getConversationHistory(): ConversationEntry[] {
  if (typeof window === 'undefined') return [];

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (err) {
    scoutDiag.warn('ConversationHistory', 'Histórico corrompido, iniciando novo', {
      error: err instanceof Error ? err.message : String(err),
    });
    localStorage.removeItem(STORAGE_KEY);
    return [];
  }
}

export function searchHistory(query: string): ConversationEntry[] {
  const history = getConversationHistory();
  const lowerQuery = query.toLowerCase();

  return history.filter(entry =>
    entry.query.toLowerCase().includes(lowerQuery) ||
    entry.response.toLowerCase().includes(lowerQuery)
  );
}

export function clearHistory(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

export function deleteEntry(id: string): void {
  if (typeof window === 'undefined') return;

  const history = getConversationHistory();
  const filtered = history.filter(e => e.id !== id);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch (err) {
    console.error('Erro ao deletar entrada:', err);
  }
}

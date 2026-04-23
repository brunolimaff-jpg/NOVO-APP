import { MAX_HISTORY_CHARS, MAX_HISTORY_TURNS } from './config';
import type { WarRoomMessage } from './contracts';

export function trimText(input: string, maxChars: number): string {
  if (!input) return '';
  const value = input.trim();
  if (value.length <= maxChars) return value;
  return value.slice(0, maxChars) + '...';
}

export function buildHistorySnippet(history: WarRoomMessage[]): string {
  if (!history.length) return '';

  const recent = history.slice(-MAX_HISTORY_TURNS);
  let budget = MAX_HISTORY_CHARS;
  const chunks: string[] = [];

  for (let i = recent.length - 1; i >= 0; i -= 1) {
    const msg = recent[i];
    const prefix = msg.role === 'user' ? '**Usuário:** ' : '**Assistente:** ';
    const text = trimText(msg.text, 1200);
    const block = `${prefix}${text}\n\n`;
    if (block.length > budget) continue;
    chunks.unshift(block);
    budget -= block.length;
  }

  if (!chunks.length) return '';
  return `## CONVERSA ANTERIOR\n${chunks.join('')}---\n\n`;
}

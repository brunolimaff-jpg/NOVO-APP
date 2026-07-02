import type { Message } from '../types';
import { Sender } from '../types';

/** Mínimo de caracteres no texto do bot para preferir timeline estática (evita Virtuoso em dossiês gigantes). */
export const LARGE_DOSSIER_STATIC_FALLBACK_CHARS = 60_000;

export function maxBotTextChars(messages: Message[]): number {
  return Math.max(
    0,
    ...messages
      .filter(message => message.sender === Sender.Bot && !message.isError)
      .map(message => String(message.text || '').trim().length),
  );
}

/**
 * Caracteres esperados no painel — inclui preview waterfall (`isThinking`) para telemetria e fallback.
 */
export function maxExpectedBotChars(messages: Message[]): number {
  return maxBotTextChars(messages);
}

export function shouldPreferStaticTimelineForBotVolume(botTextCharsMax: number): boolean {
  return botTextCharsMax >= LARGE_DOSSIER_STATIC_FALLBACK_CHARS;
}

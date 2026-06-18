import type { Message } from '../types';
import { Sender } from '../types';

export function maxBotTextChars(messages: Message[]): number {
  return Math.max(
    0,
    ...messages
      .filter(message => message.sender === Sender.Bot && !message.isError)
      .map(message => String(message.text || '').trim().length),
  );
}

/** Caracteres esperados no painel para telemetria. */
export function maxExpectedBotChars(messages: Message[]): number {
  return maxBotTextChars(messages);
}

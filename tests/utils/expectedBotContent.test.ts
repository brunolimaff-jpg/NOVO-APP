import { describe, expect, it } from 'vitest';
import { Sender, type Message } from '../../types';
import { maxExpectedBotChars } from '../../utils/expectedBotContent';

const bot = (text: string, isThinking = false): Message => ({
  id: 'b1',
  sender: Sender.Bot,
  text,
  timestamp: new Date(),
  isThinking,
});

describe('expectedBotContent', () => {
  it('conta texto do bot mesmo com isThinking true', () => {
    const chars = 'x'.repeat(5_000);
    expect(maxExpectedBotChars([bot(chars, true)])).toBe(5_000);
  });
});

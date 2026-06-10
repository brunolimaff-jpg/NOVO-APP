import { useCallback } from 'react';
import { Sender } from '../types';
import type { Message } from '../types';

export function useChatActions(safeMessages: Message[]) {
  const handleCopyMarkdown = useCallback(() => {
    const text = safeMessages
      .filter(message => !message.isError && !message.isThinking)
      .map(message => `**${message.sender === Sender.User ? 'Você' : 'Scout 360'}:**\n${message.text}`)
      .join('\n\n---\n\n')
      .replace(/\[\[PORTA:[^\]]+\]\]/g, '');

    void navigator.clipboard.writeText(text);
  }, [safeMessages]);

  const handlePrefillComposer = useCallback((text: string) => {
    window.dispatchEvent(new CustomEvent('scout:prefill', { detail: { text } }));
  }, []);

  return { handleCopyMarkdown, handlePrefillComposer };
}

import { describe, expect, it, vi } from 'vitest';
import { finalizeWaterfallUI } from '../../utils/finalizeWaterfallUI';

describe('finalizeWaterfallUI', () => {
  it('mede o estado do input real do chat no snapshot de diagnostico', () => {
    document.body.innerHTML = '<textarea data-testid="chat-input" disabled></textarea>';
    const log = vi.fn();

    finalizeWaterfallUI({
      store: {},
      sessionId: 'session-1',
      reason: 'completed',
      waterfallEndStatus: 'success',
      botMsgTextLen: 1200,
      log,
    });

    expect(log).toHaveBeenCalledWith(
      'WaterfallLifecycle',
      'ui-finalize-state',
      expect.objectContaining({
        domComposerDisabled: true,
      }),
    );
  });

  it('NÃO deleta activeGenerationRef — responsabilidade exclusiva do processMessage.finally', () => {
    const activeGenRef = { current: { 'session-1': 'bot-msg-123' } };

    finalizeWaterfallUI({
      store: { activeGenerationRef: activeGenRef },
      sessionId: 'session-1',
      reason: 'completed',
      waterfallEndStatus: 'success',
      botMsgTextLen: 500,
    });

    // Trava: a ref deve continuar intacta para os probes de segurança
    expect(activeGenRef.current['session-1']).toBe('bot-msg-123');
  });
});

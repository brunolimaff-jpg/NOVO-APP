import { afterEach, describe, expect, it, vi } from 'vitest';
import { finalizeWaterfallUI } from '../../utils/finalizeWaterfallUI';

function mountTestDom(children: Array<{ testId: string; text?: string; style?: Partial<CSSStyleDeclaration> }>) {
  document.body.replaceChildren();
  for (const child of children) {
    const el = document.createElement('div');
    el.dataset.testid = child.testId;
    if (child.text) el.textContent = child.text;
    if (child.style?.display) el.style.display = child.style.display;
    if (child.style?.width) el.style.width = child.style.width;
    if (child.style?.height) el.style.height = child.style.height;
    document.body.appendChild(el);
  }
}

async function flushFinalizeDomPasses(): Promise<void> {
  await new Promise<void>(resolve => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

describe('finalizeWaterfallUI', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('mede o estado do input real do chat no snapshot de diagnostico', () => {
    const input = document.createElement('textarea');
    input.dataset.testid = 'chat-input';
    input.disabled = true;
    document.body.appendChild(input);
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

  it('NÃO esconde inline-loading-bubble quando dossiê esperado mas bot-message-content ainda ausente', async () => {
    mountTestDom([{ testId: 'inline-loading-bubble' }, { testId: 'loading-smart-overlay' }]);

    finalizeWaterfallUI({
      store: {},
      sessionId: 'session-1',
      reason: 'completed',
      waterfallEndStatus: 'success',
      botMsgTextLen: 12_000,
    });

    await flushFinalizeDomPasses();

    const bubble = document.querySelector<HTMLElement>('[data-testid="inline-loading-bubble"]');
    const overlay = document.querySelector<HTMLElement>('[data-testid="loading-smart-overlay"]');

    expect(bubble?.style.display).not.toBe('none');
    expect(overlay?.style.display).toBe('none');
  });

  it('esconde inline-loading-bubble quando bot-message-content já está visível', async () => {
    mountTestDom([
      { testId: 'inline-loading-bubble' },
      { testId: 'bot-message-content', text: 'Dossiê', style: { width: '100px', height: '40px' } },
    ]);

    finalizeWaterfallUI({
      store: {},
      sessionId: 'session-1',
      reason: 'completed',
      waterfallEndStatus: 'success',
      botMsgTextLen: 12_000,
    });

    await flushFinalizeDomPasses();

    const bubble = document.querySelector<HTMLElement>('[data-testid="inline-loading-bubble"]');
    expect(bubble?.style.display).toBe('none');
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

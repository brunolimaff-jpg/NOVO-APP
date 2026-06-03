import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  collectBlankPanelSnapshot,
  reportBlankPanelIfDetected,
  resetBlankPanelTelemetryForTests,
} from '../../utils/blankPanelTelemetry';

const { captureMessageMock, flushDiagnosticsMock, scopeMock, warnMock, withScopeMock } = vi.hoisted(() => {
  interface MockScope {
    setContext: ReturnType<typeof vi.fn>;
    setLevel: ReturnType<typeof vi.fn>;
    setTag: ReturnType<typeof vi.fn>;
  }

  const scope = {
    setContext: vi.fn(),
    setLevel: vi.fn(),
    setTag: vi.fn(),
  } satisfies MockScope;

  return {
    captureMessageMock: vi.fn(),
    flushDiagnosticsMock: vi.fn(),
    scopeMock: scope,
    warnMock: vi.fn(),
    withScopeMock: vi.fn((callback: (scope: MockScope) => void) => callback(scope)),
  };
});

vi.mock('@sentry/react', () => ({
  captureMessage: captureMessageMock,
  withScope: withScopeMock,
}));

vi.mock('../../utils/diagnosticLog', () => ({
  flushDiagnosticsNow: flushDiagnosticsMock,
  scoutDiag: {
    warn: warnMock,
  },
}));

function installLayoutMocks() {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 });

  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function getRect() {
    const hidden = this.getAttribute('data-hidden') === 'true';
    const width = hidden ? 0 : Number(this.getAttribute('data-width') || 640);
    const height = hidden ? 0 : Number(this.getAttribute('data-height') || 320);

    return {
      bottom: height,
      height,
      left: 0,
      right: width,
      top: 0,
      width,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    };
  });

  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: vi.fn(() => document.querySelector('[data-testid="chat-main-panel"]')),
  });
}

describe('blankPanelTelemetry', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    resetBlankPanelTelemetryForTests();
    vi.clearAllMocks();
    installLayoutMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('detecta painel branco quando existe bot esperado, mas não há linha de mensagem visível', () => {
    document.body.innerHTML = '<div data-testid="chat-main-panel" data-width="900" data-height="600"></div>';

    const snapshot = collectBlankPanelSnapshot({
      sessionId: 'sess-1',
      source: 'unit-test',
      messageCount: 2,
      expectedBotCharsMax: 32_000,
      isLoading: false,
      loadingVariant: null,
      showInitialHome: false,
      shouldSuspendVirtualizedList: false,
    });

    expect(snapshot?.blankDetected).toBe(true);
    expect(snapshot?.reason).toBe('no-message-rows-in-panel');
    expect(snapshot?.panelVisible).toBe(true);
  });

  it('não aceita dossier-content vazio como prova de renderização do bot', () => {
    document.body.innerHTML = `
      <div data-testid="chat-main-panel" data-width="900" data-height="600">
        <div data-testid="dossier-content"></div>
      </div>
    `;

    const snapshot = collectBlankPanelSnapshot({
      sessionId: 'sess-1',
      source: 'unit-test',
      messageCount: 2,
      expectedBotCharsMax: 32_000,
      isLoading: false,
      loadingVariant: null,
      showInitialHome: false,
      shouldSuspendVirtualizedList: false,
    });

    expect(snapshot?.blankDetected).toBe(true);
    expect(snapshot?.dossierNodeVisible).toBe(true);
    expect(snapshot?.visibleBotWithCharsCount).toBe(0);
  });

  it('não detecta branco quando o conteúdo do bot está visível e tem texto', () => {
    document.body.innerHTML = `
      <div data-testid="chat-main-panel" data-width="900" data-height="600">
        <div data-testid="message-row">
          <div data-testid="bot-message-content">SCHEFFER_E2E_SENTINEL dossie completo</div>
        </div>
      </div>
    `;

    const snapshot = collectBlankPanelSnapshot({
      sessionId: 'sess-1',
      source: 'unit-test',
      messageCount: 2,
      expectedBotCharsMax: 32_000,
      isLoading: false,
      loadingVariant: null,
      showInitialHome: false,
      shouldSuspendVirtualizedList: false,
    });

    expect(snapshot?.blankDetected).toBe(false);
    expect(snapshot?.visibleBotWithCharsCount).toBe(1);
    expect(snapshot?.reason).toBeNull();
  });

  it('envia warning para Supabase/Sentry e limita duplicata por sessão e fonte', () => {
    document.body.innerHTML = '<div data-testid="chat-main-panel" data-width="900" data-height="600"></div>';

    const input = {
      sessionId: 'sess-1',
      source: 'unit-test',
      messageCount: 2,
      expectedBotCharsMax: 32_000,
      isLoading: false,
      loadingVariant: null,
      showInitialHome: false,
      shouldSuspendVirtualizedList: false,
    };

    reportBlankPanelIfDetected(input);
    reportBlankPanelIfDetected(input);

    expect(warnMock).toHaveBeenCalledTimes(1);
    expect(withScopeMock).toHaveBeenCalledTimes(1);
    expect(scopeMock.setTag).toHaveBeenCalledWith('area', 'blank-panel');
    expect(captureMessageMock).toHaveBeenCalledWith('Scout360 blank panel detected');
    expect(flushDiagnosticsMock).toHaveBeenCalledWith('blank-panel-detected', true);
  });
});

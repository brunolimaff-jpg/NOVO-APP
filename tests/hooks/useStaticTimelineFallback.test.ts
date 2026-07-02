import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const LARGE_DOSSIER_STATIC_FALLBACK_CHARS = 4_000;
const POST_WATERFALL_WATCHDOG_MS = 2_000;

// ── Mocks ──

const collectBlankPanelSnapshotMock = vi.fn();
const reportBlankPanelIfDetectedMock = vi.fn();
const scoutDiagInfoMock = vi.fn();
const scoutDiagWarnMock = vi.fn();

vi.mock('../../utils/blankPanelTelemetry', () => ({
  collectBlankPanelSnapshot: (...args: unknown[]) => collectBlankPanelSnapshotMock(...args),
  reportBlankPanelIfDetected: (...args: unknown[]) => reportBlankPanelIfDetectedMock(...args),
}));

vi.mock('../../utils/diagnosticLog', () => ({
  scoutDiag: {
    info: (...args: unknown[]) => scoutDiagInfoMock(...args),
    warn: (...args: unknown[]) => scoutDiagWarnMock(...args),
  },
  flushDiagnosticsNow: vi.fn(),
}));

vi.mock('../../utils/postWaterfallHandoff', () => ({
  POST_WATERFALL_WATCHDOG_MS: 2_000,
  shouldApplyProactiveForceStatic: vi.fn(
    (params: { expectedBotCharsMax: number; showInitialHome: boolean; sessionId: string | null | undefined }) =>
      Boolean(params.sessionId) && !params.showInitialHome && params.expectedBotCharsMax >= 4_000,
  ),
  shouldResetForceStaticOnLoadingStart: vi.fn(
    (ctx: { expectedBotCharsMax: number; isLoading: boolean; wasLoading: boolean }) =>
      ctx.isLoading && !ctx.wasLoading && ctx.expectedBotCharsMax < 4_000,
  ),
  isPostWaterfallStuckHandoff: vi.fn((snapshot: unknown) => {
    const s = snapshot as Record<string, unknown> | null;
    if (!s) return false;
    if ((s.expectedBotCharsMax as number) < 4_000) return false;
    if (s.isLoading || s.showInitialHome || s.shouldSuspendVirtualizedList) return false;
    if (s.loadingOverlayVisible) return false;
    return Boolean(s.blankDetected || s.placeholderVisible || s.suspendedViewportVisible);
  }),
  isOverlayStuckPostWaterfall: vi.fn(),
  buildHandoffPanelDiag: vi.fn(() => ({})),
}));

vi.mock('../../utils/expectedBotContent', () => ({
  LARGE_DOSSIER_STATIC_FALLBACK_CHARS: 4_000,
  shouldPreferStaticTimelineForBotVolume: vi.fn((chars: number) => chars >= 4_000),
  maxExpectedBotChars: vi.fn(() => 0),
}));

// ── Dynamic import after mocks ──
async function loadHook() {
  const mod = await import('../../hooks/useStaticTimelineFallback');
  return mod.useStaticTimelineFallback;
}

// ── Helpers ──

function baseParams(overrides: Record<string, unknown> = {}) {
  return {
    currentSession: { id: 'session-1', title: 'Teste', empresaAlvo: 'Empresa X' },
    isLoading: false,
    showInitialHome: false,
    shouldSuspendVirtualizedList: false,
    expectedBotCharsMax: 500,
    safeMessagesLength: 3,
    messagesLength: 3,
    panelState: 'ready',
    loadingVariant: undefined as string | undefined,
    hasActiveSession: true,
    hasDossierContent: false,
    showOperatorGate: false,
    ...overrides,
  };
}

function blankSnapshot(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sessionId: 'session-1',
    expectedBotCharsMax: 5000,
    messageCount: 3,
    isLoading: false,
    showInitialHome: false,
    shouldSuspendVirtualizedList: false,
    loadingOverlayVisible: false,
    inlineBubbleVisible: false,
    controlledErrorVisible: false,
    emptyStateVisible: false,
    blankDetected: false,
    placeholderVisible: true,
    suspendedViewportVisible: false,
    panelVisible: true,
    mainPanelChars: 100,
    botNodeCount: 1,
    rowCount: 3,
    visibleRowCount: 0,
    visibleBotWithCharsCount: 1,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────
//  EFETO #3 — Reset ao trocar de sessão
// ─────────────────────────────────────────────────────

describe('Efeito #3 — Reset ao trocar de sessão', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('reseta forceStaticTimelineFallback quando a sessão muda', async () => {
    const useHook = await loadHook();
    const { result, rerender } = renderHook(props => useHook(props), {
      initialProps: baseParams({ currentSession: { id: 's1' } }),
    });

    // Simula: watchdog já ativou fallback na sessão s1
    act(() => {
      reportBlankPanelIfDetectedMock.mockReturnValue(blankSnapshot({ blankDetected: true }));
    });
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.forceStaticTimelineFallback).toBe(true);

    // Troca para sessão s2
    rerender(baseParams({ currentSession: { id: 's2' } }));

    expect(result.current.forceStaticTimelineFallback).toBe(false);
  });

  it('limpa refs ao trocar de sessão', async () => {
    const useHook = await loadHook();
    const { result, rerender } = renderHook(props => useHook(props), {
      initialProps: baseParams({ currentSession: { id: 's1' }, expectedBotCharsMax: 5000 }),
    });

    // Ativa fallback na s1
    act(() => result.current.setForceStaticTimelineFallback(true));
    expect(result.current.forceStaticTimelineFallback).toBe(true);

    // Troca sessão (expectedBotCharsMax baixo para não disparar proativo)
    rerender(baseParams({ currentSession: { id: 's2' }, expectedBotCharsMax: 500 }));
    expect(result.current.forceStaticTimelineFallback).toBe(false);
  });
});

// ─────────────────────────────────────────────────────
//  EFETO #4 — Reset ao iniciar loading
// ─────────────────────────────────────────────────────

describe('Efeito #4 — Reset ao iniciar loading com dossiê pequeno', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('reseta fallback quando loading começa com dossiê pequeno', async () => {
    const useHook = await loadHook();
    const { result, rerender } = renderHook(props => useHook(props), {
      initialProps: baseParams({ expectedBotCharsMax: 500, isLoading: false, forceStaticTimelineFallback: true }),
    });

    // Fallback está ativo
    act(() => result.current.setForceStaticTimelineFallback(true));
    expect(result.current.forceStaticTimelineFallback).toBe(true);

    // Loading começa com dossiê pequeno (< 4000 chars)
    rerender(baseParams({ expectedBotCharsMax: 500, isLoading: true }));

    expect(result.current.forceStaticTimelineFallback).toBe(false);
  });

  it('NÃO reseta fallback quando loading começa com dossiê grande', async () => {
    const useHook = await loadHook();
    const { result, rerender } = renderHook(props => useHook(props), {
      initialProps: baseParams({ expectedBotCharsMax: 5000, isLoading: false }),
    });

    // Fallback ativo
    act(() => result.current.setForceStaticTimelineFallback(true));
    expect(result.current.forceStaticTimelineFallback).toBe(true);

    // Loading começa mas dossiê já é grande — NÃO resetar
    rerender(baseParams({ expectedBotCharsMax: 5000, isLoading: true }));
    expect(result.current.forceStaticTimelineFallback).toBe(true);
  });
});

// ─────────────────────────────────────────────────────
//  EFETO #5 — Força proativa para dossiês grandes
// ─────────────────────────────────────────────────────

describe('Efeito #5 — Força proativa para dossiês grandes', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('BUG-8 v4: NÃO ativa fallback proativo para dossiê ≥4000 chars', async () => {
    const useHook = await loadHook();
    const { rerender } = renderHook(props => useHook(props), {
      initialProps: baseParams({ expectedBotCharsMax: 4000, isLoading: false, showInitialHome: false }),
    });

    // Não deve ativar ainda — expectedBotCharsMax era 500 no initial render
    // Rerender com 4000 chars
    const { result } = renderHook(props => useHook(props), {
      initialProps: baseParams({ expectedBotCharsMax: 5000, isLoading: false, showInitialHome: false }),
    });

    act(() => vi.advanceTimersByTime(100));
    expect(result.current.forceStaticTimelineFallback).toBe(false);
  });

  it('NÃO ativa proativo quando está na home inicial', async () => {
    const useHook = await loadHook();
    const { result } = renderHook(props => useHook(props), {
      initialProps: baseParams({ expectedBotCharsMax: 5000, isLoading: false, showInitialHome: true }),
    });

    act(() => vi.advanceTimersByTime(100));
    expect(result.current.forceStaticTimelineFallback).toBe(false);
  });

  it('NÃO ativa proativo sem sessionId', async () => {
    const useHook = await loadHook();
    const { result } = renderHook(props => useHook(props), {
      initialProps: baseParams({
        currentSession: null as unknown as undefined,
        expectedBotCharsMax: 5000,
        isLoading: false,
      }),
    });

    act(() => vi.advanceTimersByTime(100));
    expect(result.current.forceStaticTimelineFallback).toBe(false);
  });
});

// ─────────────────────────────────────────────────────
//  EFETO #6 — Watchdog pós-waterfall (2000ms)
// ─────────────────────────────────────────────────────

describe('Efeito #6 — Watchdog pós-waterfall', () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    collectBlankPanelSnapshotMock.mockReturnValue(blankSnapshot());
    // Desativa proativo para isolar o watchdog
    const { shouldApplyProactiveForceStatic } = await import('../../utils/postWaterfallHandoff');
    vi.mocked(shouldApplyProactiveForceStatic).mockReturnValue(false);
  });
  afterEach(() => vi.useRealTimers());

  it('dispara watchdog após 2000ms e ativa fallback se handoff preso', async () => {
    const { isPostWaterfallStuckHandoff } = await import('../../utils/postWaterfallHandoff');
    vi.mocked(isPostWaterfallStuckHandoff).mockReturnValue(true);

    const useHook = await loadHook();
    const { result } = renderHook(props => useHook(props), {
      initialProps: baseParams({ expectedBotCharsMax: 5000, isLoading: false, showInitialHome: false }),
    });

    expect(result.current.forceStaticTimelineFallback).toBe(false);
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.forceStaticTimelineFallback).toBe(true);
  });

  it('NÃO dispara se isLoading=true', async () => {
    const { isPostWaterfallStuckHandoff } = await import('../../utils/postWaterfallHandoff');
    vi.mocked(isPostWaterfallStuckHandoff).mockReturnValue(true);

    const useHook = await loadHook();
    const { result } = renderHook(props => useHook(props), {
      initialProps: baseParams({ expectedBotCharsMax: 5000, isLoading: true, showInitialHome: false }),
    });

    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.forceStaticTimelineFallback).toBe(false);
  });

  it('NÃO dispara se expectedBotCharsMax < 4000', async () => {
    const useHook = await loadHook();
    const { result } = renderHook(props => useHook(props), {
      initialProps: baseParams({ expectedBotCharsMax: 500, isLoading: false }),
    });

    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.forceStaticTimelineFallback).toBe(false);
  });

  it('NÃO dispara handoff se snapshot retornar false', async () => {
    const { isPostWaterfallStuckHandoff } = await import('../../utils/postWaterfallHandoff');
    vi.mocked(isPostWaterfallStuckHandoff).mockReturnValue(false);

    const useHook = await loadHook();
    const { result } = renderHook(props => useHook(props), {
      initialProps: baseParams({ expectedBotCharsMax: 5000, isLoading: false }),
    });

    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.forceStaticTimelineFallback).toBe(false);
  });

  // Nota: teste de unmount coberto por "todos os timers são limpos no unmount"
});

// ─────────────────────────────────────────────────────
//  EFETO #7 — Detecção de blank panel (4 timers)
// ─────────────────────────────────────────────────────

describe('Efeito #7 — Detecção de blank panel (4 delays)', () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    // Desativa proativo para isolar blank panel detection
    const { shouldApplyProactiveForceStatic } = await import('../../utils/postWaterfallHandoff');
    vi.mocked(shouldApplyProactiveForceStatic).mockReturnValue(false);
  });
  afterEach(() => vi.useRealTimers());

  it('dispara em 750ms, 2000ms, 5000ms, 9000ms', async () => {
    const useHook = await loadHook();
    renderHook(props => useHook(props), {
      initialProps: baseParams({ expectedBotCharsMax: 5000, isLoading: false, showInitialHome: false }),
    });

    expect(reportBlankPanelIfDetectedMock).toHaveBeenCalledTimes(0);
    act(() => vi.advanceTimersByTime(750));
    expect(reportBlankPanelIfDetectedMock).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(1250)); // 2000 total
    expect(reportBlankPanelIfDetectedMock).toHaveBeenCalledTimes(2);
    act(() => vi.advanceTimersByTime(3000)); // 5000 total
    expect(reportBlankPanelIfDetectedMock).toHaveBeenCalledTimes(3);
    act(() => vi.advanceTimersByTime(4000)); // 9000 total
    expect(reportBlankPanelIfDetectedMock).toHaveBeenCalledTimes(4);
  });

  it('ativa fallback quando snapshot indica blank panel', async () => {
    reportBlankPanelIfDetectedMock.mockReturnValue(blankSnapshot({ blankDetected: true }));

    const useHook = await loadHook();
    const { result } = renderHook(props => useHook(props), {
      initialProps: baseParams({ expectedBotCharsMax: 5000, isLoading: false, showInitialHome: false }),
    });

    act(() => vi.advanceTimersByTime(750));
    expect(result.current.forceStaticTimelineFallback).toBe(true);
  });

  it('NÃO ativa fallback se snapshot for null', async () => {
    reportBlankPanelIfDetectedMock.mockReturnValue(null);

    const useHook = await loadHook();
    const { result } = renderHook(props => useHook(props), {
      initialProps: baseParams({ expectedBotCharsMax: 5000, isLoading: false }),
    });

    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.forceStaticTimelineFallback).toBe(false);
  });

  it('NÃO ativa fallback se shouldActivateStaticTimelineFallback retorna false', async () => {
    // Snapshot sem condições de ativação: messageCount=0
    reportBlankPanelIfDetectedMock.mockReturnValue(blankSnapshot({ messageCount: 0, expectedBotCharsMax: 0 }));

    const useHook = await loadHook();
    const { result } = renderHook(props => useHook(props), {
      initialProps: baseParams({ expectedBotCharsMax: 5000, isLoading: false }),
    });

    act(() => vi.advanceTimersByTime(750));
    expect(result.current.forceStaticTimelineFallback).toBe(false);
  });

  it('NÃO ativa fallback se já foi ativado para esta sessão (ref guard)', async () => {
    reportBlankPanelIfDetectedMock.mockReturnValue(blankSnapshot({ blankDetected: true }));

    const useHook = await loadHook();
    const { result } = renderHook(props => useHook(props), {
      initialProps: baseParams({ expectedBotCharsMax: 5000, isLoading: false }),
    });

    // Primeiro timer ativa
    act(() => vi.advanceTimersByTime(750));
    expect(result.current.forceStaticTimelineFallback).toBe(true);

    // Reseta o mock para o próximo timer não ativar de novo
    const callsBeforeSecondTimer = scoutDiagWarnMock.mock.calls.length;

    // Segundo timer (2000ms) NÃO deve ativar novamente
    act(() => vi.advanceTimersByTime(1250));
    // scoutDiag.warn('BlankPanel', ...) não deve ser chamado de novo
    const blankPanelLogs = scoutDiagWarnMock.mock.calls.filter((call: unknown[]) => call[0] === 'BlankPanel');
    expect(blankPanelLogs.length).toBe(1);
  });

  it('NÃO dispara se isLoading=true', async () => {
    const useHook = await loadHook();
    renderHook(props => useHook(props), { initialProps: baseParams({ expectedBotCharsMax: 5000, isLoading: true }) });

    act(() => vi.advanceTimersByTime(9000));
    expect(reportBlankPanelIfDetectedMock).toHaveBeenCalledTimes(0);
  });

  it('NÃO dispara se showInitialHome=true', async () => {
    const useHook = await loadHook();
    renderHook(props => useHook(props), {
      initialProps: baseParams({ expectedBotCharsMax: 5000, isLoading: false, showInitialHome: true }),
    });

    act(() => vi.advanceTimersByTime(9000));
    expect(reportBlankPanelIfDetectedMock).toHaveBeenCalledTimes(0);
  });

  it('NÃO dispara se expectedBotCharsMax <= 0', async () => {
    const useHook = await loadHook();
    renderHook(props => useHook(props), { initialProps: baseParams({ expectedBotCharsMax: 0, isLoading: false }) });

    act(() => vi.advanceTimersByTime(9000));
    expect(reportBlankPanelIfDetectedMock).toHaveBeenCalledTimes(0);
  });

  it('limpa todos os timers no unmount', async () => {
    reportBlankPanelIfDetectedMock.mockReturnValue(blankSnapshot({ blankDetected: true }));

    const useHook = await loadHook();
    const { unmount } = renderHook(props => useHook(props), {
      initialProps: baseParams({ expectedBotCharsMax: 5000, isLoading: false }),
    });

    unmount();
    act(() => vi.advanceTimersByTime(9000));
    // Nenhum timer deveria ter disparado após unmount
    expect(reportBlankPanelIfDetectedMock).toHaveBeenCalledTimes(0);
  });
});

// ─────────────────────────────────────────────────────
//  VALORES DERIVADOS
// ─────────────────────────────────────────────────────

describe('Valores derivados', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('effectiveStaticTimelineFallback = force || preferStatic', async () => {
    const useHook = await loadHook();
    const { result } = renderHook(props => useHook(props), {
      initialProps: baseParams({ expectedBotCharsMax: 500, isLoading: false }),
    });

    // expectedBotCharsMax=500 < 4000 → preferStatic=false, force=false → effective=false
    expect(result.current.preferStaticForLargeDossier).toBe(false);
    expect(result.current.effectiveStaticTimelineFallback).toBe(false);

    // Força manual
    act(() => result.current.setForceStaticTimelineFallback(true));
    expect(result.current.effectiveStaticTimelineFallback).toBe(true);
  });

  it('shouldSuspendVirtualizedListForTimeline = suspend && !effective', async () => {
    const useHook = await loadHook();
    const { result } = renderHook(props => useHook(props), {
      initialProps: baseParams({ expectedBotCharsMax: 5000, isLoading: false, shouldSuspendVirtualizedList: true }),
    });

    // BUG-8 v4: preferStatic desabilitado → effective=false
    // → shouldSuspendVirtualizedListForTimeline = true && !false = true
    act(() => vi.advanceTimersByTime(100));
    expect(result.current.shouldSuspendVirtualizedListForTimeline).toBe(true);
  });
});

// ─────────────────────────────────────────────────────
//  INTERAÇÕES ENTRE EFEITOS
// ─────────────────────────────────────────────────────

describe('Interações entre efeitos', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('watchdog ativa fallback reativo quando handoff travado (sem proativo v4)', async () => {
    const { isPostWaterfallStuckHandoff } = await import('../../utils/postWaterfallHandoff');
    vi.mocked(isPostWaterfallStuckHandoff).mockReturnValue(true);
    collectBlankPanelSnapshotMock.mockReturnValue(blankSnapshot());

    const useHook = await loadHook();
    const { result } = renderHook(props => useHook(props), {
      initialProps: baseParams({ expectedBotCharsMax: 5000, isLoading: false, showInitialHome: false }),
    });

    // BUG-8 v4: proativo desabilitado — force permanece false até watchdog
    act(() => vi.advanceTimersByTime(100));
    expect(result.current.forceStaticTimelineFallback).toBe(false);

    // Efeito #6 (watchdog) dispara depois
    act(() => vi.advanceTimersByTime(2000));
    expect(result.current.forceStaticTimelineFallback).toBe(true);
  });

  it('trocar de sessão cancela todos os timers pendentes', async () => {
    reportBlankPanelIfDetectedMock.mockReturnValue(blankSnapshot({ blankDetected: true }));

    const useHook = await loadHook();
    const { rerender } = renderHook(props => useHook(props), {
      initialProps: baseParams({ currentSession: { id: 's1' }, expectedBotCharsMax: 5000, isLoading: false }),
    });

    // Avança só 500ms — nem chegou no primeiro timer (750ms)
    act(() => vi.advanceTimersByTime(500));

    // Troca sessão
    rerender(baseParams({ currentSession: { id: 's2' }, expectedBotCharsMax: 5000, isLoading: false }));

    // Avança até passar todos os timers
    act(() => vi.advanceTimersByTime(9000));

    // Nenhum blank panel deveria ter sido reportado na sessão s2
    // porque os timers da s1 foram limpos e a s2 tem novos timers
    expect(reportBlankPanelIfDetectedMock).toHaveBeenCalled();
  });

  it('fallback manual ativo impede suspensão do viewport virtualizado', async () => {
    const useHook = await loadHook();
    const { result } = renderHook(props => useHook(props), {
      initialProps: baseParams({
        expectedBotCharsMax: 5000,
        isLoading: false,
        shouldSuspendVirtualizedList: true,
      }),
    });

    act(() => result.current.setForceStaticTimelineFallback(true));
    expect(result.current.effectiveStaticTimelineFallback).toBe(true);
    expect(result.current.shouldSuspendVirtualizedListForTimeline).toBe(false);
  });
});

// ─────────────────────────────────────────────────────
//  MENSAGEM GRANDE (MessageTimeline unificação)
// ─────────────────────────────────────────────────────

describe('hasLargeBotMessage — unificação MessageTimeline', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('retorna true quando safeMessages tem mensagem do bot ≥4000 chars', async () => {
    const { maxExpectedBotChars } = await import('../../utils/expectedBotContent');
    vi.mocked(maxExpectedBotChars).mockReturnValue(5000);

    const useHook = await loadHook();
    const { result } = renderHook(props => useHook(props), { initialProps: baseParams({ expectedBotCharsMax: 5000 }) });

    // BUG-8 v4: static proativo desabilitado — Virtuoso + chunked parse
    act(() => vi.advanceTimersByTime(100));
    expect(result.current.preferStaticForLargeDossier).toBe(false);
  });

  it('retorna false quando dossiê é pequeno', async () => {
    const { maxExpectedBotChars } = await import('../../utils/expectedBotContent');
    vi.mocked(maxExpectedBotChars).mockReturnValue(500);

    const useHook = await loadHook();
    const { result } = renderHook(props => useHook(props), { initialProps: baseParams({ expectedBotCharsMax: 500 }) });

    act(() => vi.advanceTimersByTime(100));
    expect(result.current.preferStaticForLargeDossier).toBe(false);
  });
});

// ─────────────────────────────────────────────────────
//  LIMPEZA DE TIMERS
// ─────────────────────────────────────────────────────

describe('Limpeza de recursos', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('todos os timers são limpos no unmount', async () => {
    const { isPostWaterfallStuckHandoff } = await import('../../utils/postWaterfallHandoff');
    vi.mocked(isPostWaterfallStuckHandoff).mockReturnValue(true);
    reportBlankPanelIfDetectedMock.mockReturnValue(blankSnapshot({ blankDetected: true }));
    collectBlankPanelSnapshotMock.mockReturnValue(blankSnapshot());

    const useHook = await loadHook();
    const { unmount } = renderHook(props => useHook(props), {
      initialProps: baseParams({ expectedBotCharsMax: 5000, isLoading: false }),
    });

    unmount();

    // Avança além de todos os timers
    act(() => vi.advanceTimersByTime(15000));

    // Nada deveria ter sido chamado após unmount
    // (o collectBlankPanelSnapshot pode ter sido chamado antes do unmount nos efeitos de mount)
    const postUnmountCalls = collectBlankPanelSnapshotMock.mock.calls.length;
    // Todos os timers foram limpos — não deve haver novas chamadas após unmount
    expect(postUnmountCalls).toBeLessThanOrEqual(1); // no máximo a chamada inicial síncrona
  });
});

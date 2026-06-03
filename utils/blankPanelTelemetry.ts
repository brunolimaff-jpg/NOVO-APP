import * as Sentry from '@sentry/react';
import { flushDiagnosticsNow, scoutDiag } from './diagnosticLog';

const REPORT_THROTTLE_MS = 60_000;
const recentReports = new Map<string, number>();

export interface BlankPanelInput {
  sessionId?: string | null;
  source: string;
  messageCount: number;
  expectedBotCharsMax: number;
  isLoading: boolean;
  loadingVariant?: string | null;
  panelState?: string;
  showInitialHome?: boolean;
  shouldSuspendVirtualizedList?: boolean;
}

interface RectMetric {
  width: number;
  height: number;
  top: number;
  left: number;
  inViewport: boolean;
}

interface NodeMetric {
  chars: number;
  visible: boolean;
  rect: RectMetric;
  display: string;
  visibility: string;
  opacity: string;
  overflow: string;
}

export interface BlankPanelSnapshot {
  sessionId?: string | null;
  source: string;
  route: string;
  messageCount: number;
  expectedBotCharsMax: number;
  isLoading: boolean;
  loadingVariant?: string | null;
  panelState?: string;
  showInitialHome: boolean;
  shouldSuspendVirtualizedList: boolean;
  panelVisible: boolean;
  mainPanelChars: number;
  rowCount: number;
  visibleRowCount: number;
  botNodeCount: number;
  visibleBotNodeCount: number;
  visibleBotWithCharsCount: number;
  botCharsMax: number;
  dossierNodeVisible: boolean;
  controlledErrorVisible: boolean;
  emptyStateVisible: boolean;
  loadingOverlayVisible: boolean;
  centerElementTag: string | null;
  centerElementTestId: string | null;
  centerElementRole: string | null;
  centerElementClass: string | null;
  suspendedViewportVisible: boolean;
  placeholderVisible: boolean;
  heroFallbackVisible: boolean;
  scrollerHeight: number;
  scrollerScrollHeight: number;
  scrollerScrollTop: number;
  panelRect: RectMetric;
  firstRow?: NodeMetric;
  firstBot?: NodeMetric;
  reason: string | null;
  blankDetected: boolean;
}

function getRectMetric(element: Element | null): RectMetric {
  if (!element || typeof window === 'undefined') {
    return { width: 0, height: 0, top: 0, left: 0, inViewport: false };
  }

  const rect = element.getBoundingClientRect();
  return {
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    top: Math.round(rect.top),
    left: Math.round(rect.left),
    inViewport:
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < window.innerHeight &&
      rect.left < window.innerWidth &&
      rect.width > 0 &&
      rect.height > 0,
  };
}

function getNodeMetric(element: Element | null): NodeMetric {
  const rect = getRectMetric(element);
  if (!element || typeof window === 'undefined') {
    return {
      chars: 0,
      visible: false,
      rect,
      display: '',
      visibility: '',
      opacity: '',
      overflow: '',
    };
  }

  const style = window.getComputedStyle(element);
  const opacity = Number(style.opacity || '1');
  return {
    chars: element.textContent?.trim().length ?? 0,
    visible: rect.inViewport && style.display !== 'none' && style.visibility !== 'hidden' && opacity > 0.01,
    rect,
    display: style.display,
    visibility: style.visibility,
    opacity: style.opacity,
    overflow: style.overflow,
  };
}

function isVisible(element: Element | null): boolean {
  return getNodeMetric(element).visible;
}

function getElements(selector: string, root: ParentNode = document): Element[] {
  return Array.from(root.querySelectorAll(selector));
}

function getPanelCenterElement(panel: Element | null): Element | null {
  if (!panel || typeof document === 'undefined') return null;
  if (typeof document.elementFromPoint !== 'function') return null;
  const rect = panel.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;

  const x = Math.max(0, Math.min(window.innerWidth - 1, rect.left + rect.width / 2));
  const y = Math.max(0, Math.min(window.innerHeight - 1, rect.top + rect.height / 2));
  return document.elementFromPoint(x, y);
}

export function collectBlankPanelSnapshot(input: BlankPanelInput): BlankPanelSnapshot | null {
  if (typeof document === 'undefined') return null;

  const panel = document.querySelector('[data-testid="chat-main-panel"]');
  const root = panel || document;
  const rows = getElements('[data-testid="message-row"]', root);
  const botNodes = getElements('[data-testid="bot-message-content"]', root);
  const scroller = root.querySelector('[data-virtuoso-scroller]') as HTMLElement | null;
  const panelMetric = getNodeMetric(panel);
  const rowMetrics = rows.map(getNodeMetric);
  const botMetrics = botNodes.map(getNodeMetric);
  const visibleRowCount = rowMetrics.filter(metric => metric.visible).length;
  const visibleBotNodeCount = botMetrics.filter(metric => metric.visible).length;
  const visibleBotWithCharsCount = botMetrics.filter(metric => metric.visible && metric.chars > 0).length;
  const botCharsMax = Math.max(0, ...botMetrics.map(metric => metric.chars));
  const centerElement = getPanelCenterElement(panel);
  const loadingOverlayVisible = isVisible(document.querySelector('[data-testid="loading-smart-overlay"]'));
  const controlledErrorVisible = isVisible(root.querySelector('[data-testid="controlled-error"]'));
  const emptyStateVisible = isVisible(root.querySelector('[data-testid="empty-state"]'));
  const dossierNodeVisible = isVisible(root.querySelector('[data-testid="dossier-content"]'));
  const suspendedViewportVisible = isVisible(root.querySelector('[data-testid="messages-viewport-suspended"]'));
  const placeholderVisible = isVisible(root.querySelector('[data-testid="messages-viewport-placeholder"]'));
  const heroFallbackVisible = isVisible(root.querySelector('[data-testid="hero-loading-inline-fallback"]'));
  // Placeholder/suspend are intermediate handoff states — not valid when we expect visible dossier content.
  const validVisualState =
    loadingOverlayVisible ||
    controlledErrorVisible ||
    emptyStateVisible ||
    heroFallbackVisible ||
    visibleBotWithCharsCount > 0;

  const expectsVisibleBot = input.messageCount > 0 && input.expectedBotCharsMax > 0;
  const shouldCheck =
    Boolean(input.sessionId) &&
    expectsVisibleBot &&
    !input.isLoading &&
    !input.showInitialHome &&
    !input.shouldSuspendVirtualizedList;

  let reason: string | null = null;
  if (shouldCheck && !panelMetric.visible) {
    reason = 'main-panel-not-visible';
  } else if (shouldCheck && placeholderVisible) {
    reason = 'stuck-viewport-placeholder';
  } else if (shouldCheck && suspendedViewportVisible) {
    reason = 'stuck-viewport-suspended';
  } else if (shouldCheck && !validVisualState && rows.length === 0) {
    reason = 'no-message-rows-in-panel';
  } else if (shouldCheck && !validVisualState && visibleRowCount === 0) {
    reason = 'message-rows-not-visible';
  } else if (shouldCheck && !validVisualState && botNodes.length === 0) {
    reason = 'no-bot-nodes-in-panel';
  } else if (shouldCheck && !validVisualState && visibleBotWithCharsCount === 0) {
    reason = 'bot-nodes-have-no-visible-chars';
  }

  return {
    sessionId: input.sessionId,
    source: input.source,
    route: window.location?.pathname || '',
    messageCount: input.messageCount,
    expectedBotCharsMax: input.expectedBotCharsMax,
    isLoading: input.isLoading,
    loadingVariant: input.loadingVariant,
    panelState: input.panelState,
    showInitialHome: Boolean(input.showInitialHome),
    shouldSuspendVirtualizedList: Boolean(input.shouldSuspendVirtualizedList),
    panelVisible: panelMetric.visible,
    mainPanelChars: panel?.textContent?.trim().length ?? 0,
    rowCount: rows.length,
    visibleRowCount,
    botNodeCount: botNodes.length,
    visibleBotNodeCount,
    visibleBotWithCharsCount,
    botCharsMax,
    dossierNodeVisible,
    controlledErrorVisible,
    emptyStateVisible,
    loadingOverlayVisible,
    centerElementTag: centerElement?.tagName ?? null,
    centerElementTestId: centerElement?.getAttribute('data-testid') ?? null,
    centerElementRole: centerElement?.getAttribute('role') ?? null,
    centerElementClass: centerElement?.getAttribute('class')?.slice(0, 200) ?? null,
    suspendedViewportVisible,
    placeholderVisible,
    heroFallbackVisible,
    scrollerHeight: scroller?.clientHeight ?? 0,
    scrollerScrollHeight: scroller?.scrollHeight ?? 0,
    scrollerScrollTop: scroller?.scrollTop ?? 0,
    panelRect: panelMetric.rect,
    firstRow: rowMetrics[0],
    firstBot: botMetrics[0],
    reason,
    blankDetected: reason !== null,
  };
}

function shouldThrottle(sessionId: string | null | undefined, source: string): boolean {
  const key = `${sessionId || 'no-session'}:${source}`;
  const now = Date.now();
  const last = recentReports.get(key) ?? 0;
  if (now - last < REPORT_THROTTLE_MS) return true;
  recentReports.set(key, now);
  return false;
}

export function reportBlankPanelIfDetected(input: BlankPanelInput): BlankPanelSnapshot | null {
  const snapshot = collectBlankPanelSnapshot(input);
  if (!snapshot?.blankDetected) return snapshot;
  if (shouldThrottle(input.sessionId, input.source)) return snapshot;

  scoutDiag.warn('BlankPanel', 'blank-panel-detected', snapshot as unknown as Record<string, unknown>);

  Sentry.withScope(scope => {
    scope.setLevel('warning');
    scope.setTag('area', 'blank-panel');
    scope.setTag('source', input.source);
    scope.setTag('reason', snapshot.reason || 'unknown');
    if (input.sessionId) scope.setTag('session_id', input.sessionId);
    scope.setContext('blank_panel', snapshot as unknown as Record<string, unknown>);
    Sentry.captureMessage('Scout360 blank panel detected');
  });

  flushDiagnosticsNow('blank-panel-detected', true);
  return snapshot;
}

export function resetBlankPanelTelemetryForTests(): void {
  recentReports.clear();
}

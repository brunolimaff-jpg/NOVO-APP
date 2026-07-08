// utils/layoutTraceTelemetry.ts
// Instrumentação temporária para diagnosticar painel branco/invisível pós-waterfall.
// REMOVER após identificar root cause (PR #342 + PR #347).
//
// Uso:
//   import { traceLayout, findFirstZeroDimensionAncestor, traceFullAncestorChain,
//            debugStaticFallbackDisplay, LayoutTrace } from '../../utils/layoutTraceTelemetry';

export interface LayoutRect {
  tagName: string;
  id: string;
  className: string;
  testid: string;
  scoutData: string;
  width: number;
  height: number;
  x: number;
  y: number;
  clientWidth: number;
  clientHeight: number;
  scrollWidth: number;
  scrollHeight: number;
  offsetWidth: number;
  offsetHeight: number;
  display: string;
  visibility: string;
  opacity: string;
  position: string;
  overflow: string;
  overflowX: string;
  overflowY: string;
  flexDirection: string;
  flexGrow: string;
  flexShrink: string;
  flexBasis: string;
  minWidth: string;
  minHeight: string;
  maxWidth: string;
  maxHeight: string;
  zIndex: string;
  transform: string;
  contain: string;
  contentVisibility: string;
}

export interface LayoutAncestorTrace {
  culpritElement: string;
  culpritClassName: string;
  culpritRect: { width: number; height: number };
  culpritComputedStyle: Record<string, string>;
  ancestorPath: string[];
  renderBranch: string;
  recommendedFix: string;
}

function readElementRect(el: Element): LayoutRect {
  const rect = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const testid = el.getAttribute('data-testid') || '';
  const scoutData = Array.from(el.attributes)
    .filter(a => a.name.startsWith('data-scout-'))
    .map(a => `${a.name}=${a.value}`)
    .join(';');

  return {
    tagName: el.tagName,
    id: el.id,
    className: el.className?.toString?.()?.slice(0, 200) || '',
    testid,
    scoutData,
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    clientWidth: (el as HTMLElement).clientWidth ?? 0,
    clientHeight: (el as HTMLElement).clientHeight ?? 0,
    scrollWidth: (el as HTMLElement).scrollWidth ?? 0,
    scrollHeight: (el as HTMLElement).scrollHeight ?? 0,
    offsetWidth: (el as HTMLElement).offsetWidth ?? 0,
    offsetHeight: (el as HTMLElement).offsetHeight ?? 0,
    display: cs.display,
    visibility: cs.visibility,
    opacity: cs.opacity,
    position: cs.position,
    overflow: cs.overflow,
    overflowX: cs.overflowX,
    overflowY: cs.overflowY,
    flexDirection: cs.flexDirection,
    flexGrow: cs.flexGrow,
    flexShrink: cs.flexShrink,
    flexBasis: cs.flexBasis,
    minWidth: cs.minWidth,
    minHeight: cs.minHeight,
    maxWidth: cs.maxWidth,
    maxHeight: cs.maxHeight,
    zIndex: cs.zIndex,
    transform: cs.transform,
    contain: cs.contain,
    contentVisibility: (cs as unknown as Record<string, string>).contentVisibility || 'visible',
  };
}

export function traceLayout(
  log: (area: string, event: string, payload: Record<string, unknown>) => void,
  checkpoint: string,
  extra: Record<string, unknown> = {},
): void {
  if (typeof document === 'undefined') return;

  const roots: Record<string, LayoutRect | null> = {};
  const selectors = [
    '[data-testid="chat-main-panel"]',
    '[data-testid="messages-static-fallback"]',
    '[data-testid="messages-viewport-suspended"]',
    '[data-scout-virtuoso="static-fallback"]',
    '[data-scout-virtuoso="timeline"]',
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    roots[sel] = el ? readElementRect(el) : null;
  }

  // Bot message content check
  const botContent = document.querySelector('[data-testid="bot-message-content"]');
  const botContentRect = botContent ? readElementRect(botContent) : null;

  // Count visible bot nodes
  const allBotNodes = document.querySelectorAll('[data-testid="bot-message-content"]');
  const visibleBotNodes = Array.from(allBotNodes).filter(el => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });

  log('LayoutTrace', checkpoint, {
    ...extra,
    roots,
    botContentRect,
    allBotNodesCount: allBotNodes.length,
    visibleBotNodesCount: visibleBotNodes.length,
    bodyTextLen: document.body?.textContent?.length ?? 0,
    bodyInnerTextLen: (document.body as HTMLElement)?.innerText?.length ?? 0,
  });
}

export function findFirstZeroDimensionAncestor(
  el: HTMLElement | null,
  stopAtSelector = '[data-testid="chat-main-panel"]',
): LayoutAncestorTrace | null {
  if (!el) return null;

  const stopEl = document.querySelector(stopAtSelector);
  const ancestorPath: string[] = [];
  let culprit: Element | null = null;
  let current: Element | null = el;

  while (current && current !== stopEl && current !== document.body) {
    const r = current.getBoundingClientRect();
    const tag = current.tagName;
    const cls = current.className?.toString?.()?.slice(0, 60) || '';
    const id = current.id || '';
    ancestorPath.push(`${tag}${id ? '#' + id : ''}${cls ? '.' + cls.replace(/\s+/g, '.') : ''}`);

    if (r.width === 0 || r.height === 0) {
      culprit = current;
    }
    current = current.parentElement;
  }

  if (!culprit) {
    // Check the stop element itself
    if (stopEl) {
      const r = stopEl.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) {
        culprit = stopEl;
        ancestorPath.push('STOP_ELEMENT_ITSELF');
      }
    }
    if (!culprit) return null;
  }

  const cs = culprit ? getComputedStyle(culprit) : ({} as CSSStyleDeclaration);
  const r = culprit ? culprit.getBoundingClientRect() : { width: -1, height: -1 };

  return {
    culpritElement: culprit ? `${culprit.tagName}${culprit.id ? '#' + culprit.id : ''}` : 'unknown',
    culpritClassName: culprit ? culprit.className?.toString?.()?.slice(0, 200) || '' : '',
    culpritRect: { width: Math.round(r.width), height: Math.round(r.height) },
    culpritComputedStyle: culprit
      ? {
          display: cs.display,
          visibility: cs.visibility,
          position: cs.position,
          overflow: cs.overflow,
          width: cs.width,
          height: cs.height,
          minWidth: cs.minWidth,
          minHeight: cs.minHeight,
          flex: cs.flex,
        }
      : {},
    ancestorPath,
    renderBranch: 'unknown',
    recommendedFix: culprit
      ? `Elemento ${culprit.tagName} com rect (${Math.round(r.width)}x${Math.round(r.height)}). CSS: display=${cs.display}, position=${cs.position}, overflow=${cs.overflow}, width=${cs.width}, height=${cs.height}`
      : 'Nenhum ancestral com dimensão zero encontrado — verificar display/visibility/opacity nos ancestrais',
  };
}

// ── PR #347: Instrumentação expandida para rastrear display:none ──

export interface AncestorChainNode {
  depth: number;
  tagName: string;
  id: string;
  className: string;
  testid: string;
  scoutData: string;
  rect: { w: number; h: number; x: number; y: number };
  clientW: number;
  clientH: number;
  scrollW: number;
  scrollH: number;
  offsetW: number;
  offsetH: number;
  computed: {
    display: string;
    visibility: string;
    opacity: string;
    position: string;
    overflow: string;
    overflowX: string;
    overflowY: string;
    width: string;
    height: string;
    minWidth: string;
    minHeight: string;
    maxWidth: string;
    maxHeight: string;
    flex: string;
    flexGrow: string;
    flexShrink: string;
    flexBasis: string;
    flexDirection: string;
    zIndex: string;
    contain: string;
    contentVisibility: string;
    transform: string;
  };
  hasDisplayNone: boolean;
  hasZeroWidth: boolean;
  hasZeroHeight: boolean;
  isSuspicious: boolean;
}

/**
 * Caminha do elemento alvo até <body>, capturando computedStyle e
 * getBoundingClientRect de CADA ancestral. Identifica o primeiro nó
 * com display:none, width=0, ou height=0.
 */
export function traceFullAncestorChain(
  startSelector: string,
  stopAtSelector = 'body',
): {
  chain: AncestorChainNode[];
  firstDisplayNone: number | null;
  firstZeroWidth: number | null;
  firstZeroHeight: number | null;
} | null {
  if (typeof document === 'undefined') return null;

  const startEl = document.querySelector(startSelector);
  if (!startEl) return null;

  const stopEl = document.querySelector(stopAtSelector) || document.body;
  const chain: AncestorChainNode[] = [];

  let current: Element | null = startEl;
  let depth = 0;
  let firstDisplayNone: number | null = null;
  let firstZeroWidth: number | null = null;
  let firstZeroHeight: number | null = null;

  while (current && depth < 30) {
    const el = current as HTMLElement;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const testid = el.getAttribute('data-testid') || '';
    const scoutData = Array.from(el.attributes)
      .filter(a => a.name.startsWith('data-scout-'))
      .map(a => `${a.name}=${a.value}`)
      .join(';');

    const displayNone = cs.display === 'none';
    const zeroW = Math.round(r.width) <= 0 && el.offsetWidth <= 0;
    const zeroH = Math.round(r.height) <= 0 && el.offsetHeight <= 0;
    const suspicious = displayNone || zeroW || zeroH;

    const node: AncestorChainNode = {
      depth,
      tagName: el.tagName,
      id: el.id || '',
      className: el.className?.toString?.()?.slice(0, 200) || '',
      testid,
      scoutData,
      rect: { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) },
      clientW: el.clientWidth ?? 0,
      clientH: el.clientHeight ?? 0,
      scrollW: el.scrollWidth ?? 0,
      scrollH: el.scrollHeight ?? 0,
      offsetW: el.offsetWidth ?? 0,
      offsetH: el.offsetHeight ?? 0,
      computed: {
        display: cs.display,
        visibility: cs.visibility,
        opacity: cs.opacity,
        position: cs.position,
        overflow: cs.overflow,
        overflowX: cs.overflowX,
        overflowY: cs.overflowY,
        width: cs.width,
        height: cs.height,
        minWidth: cs.minWidth,
        minHeight: cs.minHeight,
        maxWidth: cs.maxWidth,
        maxHeight: cs.maxHeight,
        flex: cs.flex,
        flexGrow: cs.flexGrow,
        flexShrink: cs.flexShrink,
        flexBasis: cs.flexBasis,
        flexDirection: cs.flexDirection,
        zIndex: cs.zIndex,
        contain: cs.contain,
        contentVisibility: (cs as unknown as Record<string, string>).contentVisibility || 'visible',
        transform: cs.transform,
      },
      hasDisplayNone: displayNone,
      hasZeroWidth: zeroW,
      hasZeroHeight: zeroH,
      isSuspicious: suspicious,
    };

    chain.push(node);

    if (firstDisplayNone === null && displayNone) firstDisplayNone = depth;
    if (firstZeroWidth === null && zeroW) firstZeroWidth = depth;
    if (firstZeroHeight === null && zeroH) firstZeroHeight = depth;

    if (current === stopEl || current === document.body || current === document.documentElement) break;
    current = current.parentElement;
    depth++;
  }

  return { chain, firstDisplayNone, firstZeroWidth, firstZeroHeight };
}

/**
 * Debug específico para o caso da PR #347: captura a cadeia completa
 * de messages-static-fallback até <body> em múltiplos timings para
 * identificar exatamente quando e onde display:none aparece.
 */
export function debugStaticFallbackDisplay(
  log: (area: string, event: string, payload: Record<string, unknown>) => void,
  extra: Record<string, unknown> = {},
): void {
  if (typeof document === 'undefined') return;

  const probe = (label: string) => {
    if (typeof document === 'undefined' || typeof getComputedStyle === 'undefined') return;

    const fallbackEl = document.querySelector('[data-testid="messages-static-fallback"]');
    const panelEl = document.querySelector('[data-testid="chat-main-panel"]');
    const mainEl = document.querySelector('[data-testid="chat-shell"]');
    const scrollerEl = document.querySelector('[data-testid="messages-scroller"]');

    // Quick check nos elementos-chave
    const quickCheck = {
      fallback: fallbackEl
        ? {
            rectW: Math.round(fallbackEl.getBoundingClientRect().width),
            rectH: Math.round(fallbackEl.getBoundingClientRect().height),
            display: getComputedStyle(fallbackEl).display,
            visibility: getComputedStyle(fallbackEl).visibility,
            offsetW: (fallbackEl as HTMLElement).offsetWidth,
            offsetH: (fallbackEl as HTMLElement).offsetHeight,
            scrollW: (fallbackEl as HTMLElement).scrollWidth,
            scrollH: (fallbackEl as HTMLElement).scrollHeight,
            childCount: fallbackEl.children.length,
            innerHTML_len: fallbackEl.innerHTML.length,
          }
        : null,
      panel: panelEl
        ? {
            rectW: Math.round(panelEl.getBoundingClientRect().width),
            rectH: Math.round(panelEl.getBoundingClientRect().height),
            display: getComputedStyle(panelEl).display,
            visibility: getComputedStyle(panelEl).visibility,
          }
        : null,
      main: mainEl
        ? {
            rectW: Math.round(mainEl.getBoundingClientRect().width),
            rectH: Math.round(mainEl.getBoundingClientRect().height),
            display: getComputedStyle(mainEl).display,
          }
        : null,
      scroller: scrollerEl
        ? {
            rectW: Math.round(scrollerEl.getBoundingClientRect().width),
            rectH: Math.round(scrollerEl.getBoundingClientRect().height),
            display: getComputedStyle(scrollerEl).display,
          }
        : null,
    };

    // Cadeia completa a partir do static fallback
    const fullChain = fallbackEl ? traceFullAncestorChain('[data-testid="messages-static-fallback"]', 'body') : null;

    // Cadeia a partir do chat-main-panel (para comparar com o fallback)
    const panelChain = panelEl ? traceFullAncestorChain('[data-testid="chat-main-panel"]', 'body') : null;

    log('BlankPanelDebug', `probe:${label}`, {
      ...extra,
      timing: label,
      quickCheck,
      fullChain: fullChain
        ? {
            chainLength: fullChain.chain.length,
            firstDisplayNone: fullChain.firstDisplayNone,
            firstZeroWidth: fullChain.firstZeroWidth,
            firstZeroHeight: fullChain.firstZeroHeight,
            suspiciousNodes: fullChain.chain
              .filter(n => n.isSuspicious)
              .map(n => ({
                depth: n.depth,
                element: n.tagName + (n.id ? '#' + n.id : '') + (n.testid ? `[data-testid="${n.testid}"]` : ''),
                display: n.computed.display,
                rectW: n.rect.w,
                rectH: n.rect.h,
                offsetW: n.offsetW,
                overflow: n.computed.overflow,
                width: n.computed.width,
                height: n.computed.height,
                minWidth: n.computed.minWidth,
                minHeight: n.computed.minHeight,
                flex: n.computed.flex,
                visibility: n.computed.visibility,
                contentVisibility: n.computed.contentVisibility,
                contain: n.computed.contain,
              })),
          }
        : null,
      panelChainSummary: panelChain
        ? {
            firstDisplayNone: panelChain.firstDisplayNone,
            firstZeroWidth: panelChain.firstZeroWidth,
            firstZeroHeight: panelChain.firstZeroHeight,
          }
        : null,
    } as unknown as Record<string, unknown>);
  };

  // Timing 0: imediato (síncrono no momento da chamada)
  probe('sync');

  // Timing 1: requestAnimationFrame (após o paint)
  requestAnimationFrame(() => {
    probe('raf1');
    // Timing 2: segundo RAF
    requestAnimationFrame(() => probe('raf2'));
  });

  // Timing 3: setTimeout 50ms
  setTimeout(() => probe('timeout50ms'), 50);

  // Timing 4: setTimeout 500ms
  setTimeout(() => probe('timeout500ms'), 500);
}

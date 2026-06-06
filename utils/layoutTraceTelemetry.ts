// utils/layoutTraceTelemetry.ts
// Instrumentação temporária para diagnosticar painel branco/invisível pós-waterfall.
// REMOVER após identificar root cause (PR #342).
//
// Uso:
//   import { traceLayout, findFirstZeroDimensionAncestor, LayoutTrace } from '../../utils/layoutTraceTelemetry';

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

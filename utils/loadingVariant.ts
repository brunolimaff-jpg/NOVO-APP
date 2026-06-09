export type RequestKind = 'default' | 'deep_dive';
export type LoadingVariant = 'hero' | 'inline';

import { getFlag } from './featureFlags';

interface ResolveLoadingVariantOptions {
  requestKind: RequestKind;
  isFollowUp?: boolean;
}

type ResolvePlaceholderLoadingVariantOptions = ResolveLoadingVariantOptions;

export function resolveLoadingVariant({
  requestKind,
  isFollowUp = false,
}: ResolveLoadingVariantOptions): LoadingVariant {
  if (isFollowUp) return 'inline';
  if (requestKind === 'deep_dive') return 'hero';
  return 'hero';
}

export const resolvePlaceholderLoadingVariant = resolveEffectiveLoadingVariant;

export function resolveDeepDiveRequestKind(hasCompletedBotResponse: boolean): RequestKind {
  return hasCompletedBotResponse ? 'deep_dive' : 'default';
}

/** Hero overlay: permanece até `isLoading` false; inline é a única exceção.
 *  Invariante: se já existe conteúdo de bot renderizado (hasRenderableBotMessage),
 *  o overlay NUNCA deve bloquear — mesmo que isLoading ainda esteja true. */
export function shouldShowHeroLoadingOverlay(
  isLoading: boolean,
  loadingVariant: LoadingVariant | undefined,
  hasRenderableBotMessage = false,
): boolean {
  if (!isLoading) return false;
  if (hasRenderableBotMessage) return false;
  return loadingVariant !== 'inline';
}

export function resolveEffectiveLoadingVariant(opts: ResolveLoadingVariantOptions): LoadingVariant {
  const base = resolveLoadingVariant(opts);
  if (base === 'hero' && getFlag('inlineLoading')) return 'inline';
  return base;
}

export function shouldSuspendHeroMessageTimeline(
  isLoading: boolean,
  loadingVariant: LoadingVariant | undefined,
  hasRenderableBotMessage = false,
): boolean {
  if (!isLoading) return false;
  if (hasRenderableBotMessage) return false;
  // Cobre hero explícito e janela pós-completeLoadingProgress (variant undefined, isLoading ainda true).
  return loadingVariant !== 'inline';
}

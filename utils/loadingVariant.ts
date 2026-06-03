export type RequestKind = 'default' | 'deep_dive';
export type LoadingVariant = 'hero' | 'inline';

interface ResolveLoadingVariantOptions {
  requestKind: RequestKind;
  isFollowUp?: boolean;
}

interface ResolvePlaceholderLoadingVariantOptions extends ResolveLoadingVariantOptions {
  hasConsolidatedBotResponse: boolean;
}

export function resolveLoadingVariant({
  requestKind,
  isFollowUp = false,
}: ResolveLoadingVariantOptions): LoadingVariant {
  if (requestKind === 'deep_dive') return 'hero';
  return isFollowUp ? 'inline' : 'hero';
}

export function resolvePlaceholderLoadingVariant({
  requestKind,
  isFollowUp = false,
  hasConsolidatedBotResponse: _hasConsolidatedBotResponse,
}: ResolvePlaceholderLoadingVariantOptions): LoadingVariant {
  void _hasConsolidatedBotResponse;
  return resolveLoadingVariant({ requestKind, isFollowUp });
}

export function resolveDeepDiveRequestKind(hasCompletedBotResponse: boolean): RequestKind {
  return hasCompletedBotResponse ? 'deep_dive' : 'default';
}

/** Hero overlay: permanece até `isLoading` false; inline é a única exceção. */
export function shouldShowHeroLoadingOverlay(isLoading: boolean, loadingVariant: LoadingVariant | undefined): boolean {
  if (!isLoading) return false;
  return loadingVariant !== 'inline';
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

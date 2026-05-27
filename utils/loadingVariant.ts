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

/** Hero overlay: permanece até `isLoading` false, mesmo com preview parcial do waterfall. */
export function shouldShowHeroLoadingOverlay(
  isLoading: boolean,
  loadingVariant: LoadingVariant | undefined,
): boolean {
  return isLoading && loadingVariant === 'hero';
}

export function shouldSuspendHeroMessageTimeline(
  isLoading: boolean,
  loadingVariant: LoadingVariant | undefined,
  hasRenderableBotMessage: boolean,
): boolean {
  // Se não está carregando, NUNCA suspender o timeline — a timeline é o conteúdo real.
  // Isso evita tela branca quando loadingVariant fica residual ('hero') após o waterfall.
  if (!isLoading) return false;
  return loadingVariant === 'hero' && !hasRenderableBotMessage;
}

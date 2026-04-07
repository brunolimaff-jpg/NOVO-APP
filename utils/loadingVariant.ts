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
  hasConsolidatedBotResponse,
}: ResolvePlaceholderLoadingVariantOptions): LoadingVariant {
  const resolvedVariant = resolveLoadingVariant({ requestKind, isFollowUp });
  if (requestKind === 'deep_dive') return 'hero';
  return resolvedVariant === 'inline' || hasConsolidatedBotResponse ? 'inline' : 'hero';
}

export function resolveDeepDiveRequestKind(hasCompletedBotResponse: boolean): RequestKind {
  return hasCompletedBotResponse ? 'deep_dive' : 'default';
}

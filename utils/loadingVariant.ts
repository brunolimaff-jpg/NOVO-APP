export type RequestKind = 'default' | 'deep_dive';
export type LoadingVariant = 'hero' | 'inline' | 'hero-override';

import { getFlag } from './featureFlags';

interface ResolveLoadingVariantOptions {
  requestKind: RequestKind;
  isFollowUp?: boolean;
  /** BRU-81: nova execução explícita na MESMA thread — força o overlay hero
   * mesmo quando já existe conteúdo de bot renderizado (override de duplicata). */
  forceHero?: boolean;
}

type ResolvePlaceholderLoadingVariantOptions = ResolveLoadingVariantOptions;

export function resolveLoadingVariant({
  requestKind,
  isFollowUp = false,
  forceHero = false,
}: ResolveLoadingVariantOptions): LoadingVariant {
  if (forceHero) return 'hero-override';
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
  // BRU-81: hero-override é o único caminho que pode cobrir conteúdo existente
  // (nova execução na mesma thread precisa de representação inequívoca).
  if (hasRenderableBotMessage) return loadingVariant === 'hero-override';
  return loadingVariant !== 'inline';
}

export function resolveEffectiveLoadingVariant(opts: ResolveLoadingVariantOptions): LoadingVariant {
  const base = resolveLoadingVariant(opts);
  if (base === 'hero-override') return 'hero-override';
  if (base === 'hero' && getFlag('inlineLoading')) return 'inline';
  return base;
}

export function shouldSuspendHeroMessageTimeline(
  isLoading: boolean,
  loadingVariant: LoadingVariant | undefined,
  hasRenderableBotMessage = false,
): boolean {
  if (!isLoading) return false;
  if (hasRenderableBotMessage) return loadingVariant === 'hero-override';
  // Cobre hero explícito e janela pós-completeLoadingProgress (variant undefined, isLoading ainda true).
  return loadingVariant !== 'inline';
}

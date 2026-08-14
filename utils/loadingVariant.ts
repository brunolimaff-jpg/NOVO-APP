export type RequestKind = 'default' | 'deep_dive';
export type LoadingVariant = 'hero' | 'inline';

import { getFlag } from './featureFlags';

interface ResolveLoadingVariantOptions {
  requestKind: RequestKind;
  isFollowUp?: boolean;
  /** BRU-81: nova execução explícita na MESMA thread — força o loading INLINE
   * (bubble) mesmo quando já existe conteúdo de bot renderizado (override de
   * duplicata). NUNCA o LoadingSmart fullscreen antigo. */
  forceInline?: boolean;
}

type ResolvePlaceholderLoadingVariantOptions = ResolveLoadingVariantOptions;

export function resolveLoadingVariant({
  requestKind,
  isFollowUp = false,
  forceInline = false,
}: ResolveLoadingVariantOptions): LoadingVariant {
  if (forceInline) return 'inline';
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

/**
 * BRU-81 (regressão de scroll): auto-follow do Virtuoso durante a geração.
 * O follow acompanha a thread quando há atividade ativa — loading inline com
 * o bot da geração presente (wayfindingKey) OU deep-dive com label fixo.
 * Sem chave ativa (fim da geração ou acesso a dossiê existente), o usuário
 * navega livremente (espírito do F1.2: sem auto-follow permanente).
 */
export function shouldFollowGenerationOutput(
  loadingVariant: LoadingVariant | undefined,
  loadingPinnedLabel: string | null | undefined,
  wayfindingKey: string | null | undefined,
): boolean {
  if (loadingVariant !== 'inline') return false;
  return Boolean(loadingPinnedLabel || wayfindingKey);
}

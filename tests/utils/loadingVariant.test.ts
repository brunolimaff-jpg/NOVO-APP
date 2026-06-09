import { describe, expect, it } from 'vitest';
import {
  resolveDeepDiveRequestKind,
  resolveLoadingVariant,
  resolvePlaceholderLoadingVariant,
  shouldShowHeroLoadingOverlay,
  shouldSuspendHeroMessageTimeline,
} from '../../utils/loadingVariant';

describe('loadingVariant flow rules', () => {
  it('keeps the first investigation in hero mode', () => {
    expect(
      resolveLoadingVariant({
        requestKind: 'default',
        isFollowUp: false,
      }),
    ).toBe('hero');
  });

  it('keeps regular follow-ups inline', () => {
    expect(
      resolveLoadingVariant({
        requestKind: 'default',
        isFollowUp: true,
      }),
    ).toBe('inline');
  });

  it('follow-up sempre usa inline, mesmo para deep_dive', () => {
    expect(resolveDeepDiveRequestKind(true)).toBe('deep_dive');
    expect(
      resolveLoadingVariant({
        requestKind: 'deep_dive',
        isFollowUp: true,
      }),
    ).toBe('inline');
    expect(
      resolvePlaceholderLoadingVariant({
        requestKind: 'deep_dive',
        isFollowUp: true,
        hasConsolidatedBotResponse: true,
      }),
    ).toBe('inline');
  });

  it('routes the first home investigation back to the hero flow', () => {
    expect(resolveDeepDiveRequestKind(false)).toBe('default');
  });

  it('keeps regular follow-up placeholders inline when the session already has a bot answer', () => {
    expect(
      resolvePlaceholderLoadingVariant({
        requestKind: 'default',
        isFollowUp: true,
        hasConsolidatedBotResponse: true,
      }),
    ).toBe('inline');
  });

  it('keeps placeholder aligned with inline for first investigation when flag is active', () => {
    expect(
      resolvePlaceholderLoadingVariant({
        requestKind: 'default',
        isFollowUp: false,
        hasConsolidatedBotResponse: true,
      }),
    ).toBe('inline');
  });
});

describe('shouldShowHeroLoadingOverlay', () => {
  it('mostra overlay hero enquanto isLoading e variant hero', () => {
    expect(shouldShowHeroLoadingOverlay(true, 'hero')).toBe(true);
  });

  it('esconde overlay quando loading terminou', () => {
    expect(shouldShowHeroLoadingOverlay(false, 'hero')).toBe(false);
  });

  it('esconde overlay em follow-up inline', () => {
    expect(shouldShowHeroLoadingOverlay(true, 'inline')).toBe(false);
  });
  it('mantém overlay na janela pós-completeLoadingProgress (variant undefined, isLoading true)', () => {
    expect(shouldShowHeroLoadingOverlay(true, undefined)).toBe(true);
  });

  it('mantém overlay mesmo com preview parcial do waterfall (>200 chars)', () => {
    // Regressão PR #301: gate antigo escondia hero ao flushWaterfallPreview.
    // Sem hasRenderableBotMessage explícito, comportamento padrão permanece.
    expect(shouldShowHeroLoadingOverlay(true, 'hero')).toBe(true);
  });

  it('esconde overlay hero quando já existe conteúdo de bot renderizável', () => {
    // Regressão: hero overlay preso após waterfall completar com conteúdo visível.
    // Invariante: se botMsgTextLen > 0, overlay NUNCA deve bloquear.
    expect(shouldShowHeroLoadingOverlay(true, 'hero', true)).toBe(false);
    expect(shouldShowHeroLoadingOverlay(false, 'hero', true)).toBe(false);
  });

  it('mantém overlay hero sem conteúdo de bot (loading ainda em progresso)', () => {
    expect(shouldShowHeroLoadingOverlay(true, 'hero', false)).toBe(true);
    expect(shouldShowHeroLoadingOverlay(true, undefined, false)).toBe(true);
  });
});

describe('shouldSuspendHeroMessageTimeline', () => {
  it('não suspende quando não está carregando', () => {
    expect(shouldSuspendHeroMessageTimeline(false, 'hero', false)).toBe(false);
  });

  it('não suspende em follow-up inline', () => {
    expect(shouldSuspendHeroMessageTimeline(true, 'inline', false)).toBe(false);
  });

  it('suspende a timeline enquanto o hero está carregando sem resposta renderizável', () => {
    expect(shouldSuspendHeroMessageTimeline(true, 'hero', false)).toBe(true);
    expect(shouldSuspendHeroMessageTimeline(true, undefined, true)).toBe(false);
  });

  it('mantém overlay hero mas não suspende timeline quando há preview renderizável (sem hasRenderableBotMessage)', () => {
    expect(shouldShowHeroLoadingOverlay(true, 'hero')).toBe(true);
    expect(shouldSuspendHeroMessageTimeline(true, 'hero', true)).toBe(false);
    expect(shouldSuspendHeroMessageTimeline(true, 'hero', false)).toBe(true);
    expect(shouldSuspendHeroMessageTimeline(true, undefined, true)).toBe(false);
  });

  it('invariante: com conteúdo de bot renderizável, nenhum estado de loading persiste', () => {
    // Cenário: waterfall completou, botMsgTextLen > 0, mas isLoading ainda true (gap)
    const isLoading = true;
    const hasContent = true;
    // Overlay NÃO deve mostrar
    expect(shouldShowHeroLoadingOverlay(isLoading, 'hero', hasContent)).toBe(false);
    // Timeline NÃO deve suspender
    expect(shouldSuspendHeroMessageTimeline(isLoading, 'hero', hasContent)).toBe(false);
    // Mesmo com loadingVariant undefined (pós-completeLoadingProgress)
    expect(shouldShowHeroLoadingOverlay(isLoading, undefined, hasContent)).toBe(false);
    expect(shouldSuspendHeroMessageTimeline(isLoading, undefined, hasContent)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { normalizeCitationArtifacts } from '../../components/MarkdownRenderer';
import { stripMarkdown } from '../../utils/textCleaners';
import { rewriteMarkdownLinksToGoogle } from '../../utils/markdownLinks';
import { fixFakeLinks, cleanFakeSourcesBlock, extractValidLinks } from '../../utils/linkFixer';
import { extractPromotableInlineSources } from '../../utils/webVerification';
import { applyDossierLinkIntegrity } from '../../utils/dossierLinkIntegrity';
import { convertMarkdownToHTML } from '../../utils/markdownToHtml';

/**
 * Regressão de freeze (reportado 2026-08-15): o padrão
 * `(?:[^\s()]+|\([^\s()]*\))+` nos matchers de link markdown causava
 * RETROCESSO CATASTRÓFICO quando uma citação `[N](url-muito-longa)` era
 * seguida de texto que não casa `\s+[N]` — a thread principal do navegador
 * travava ao abrir um dossiê legado com essas citações (URLs de 200+ chars do
 * grounding). O fix substitui por `[^\s()]+` (linear).
 */
const LONG_URL = `https://vertexaisearch.cloud.google.com/grounding-api-redirect/${'a'.repeat(300)}==`;
const PATHOLOGICAL = `texto antes [1](${LONG_URL}). seguido de texto que não é citação.`;

describe('regressão: regex de citação/link sem retrocesso catastrófico', () => {
  it('normalizeCitationArtifacts completa rápido em citação com URL longa + texto não-citação', () => {
    const start = Date.now();
    const out = normalizeCitationArtifacts(PATHOLOGICAL);
    expect(Date.now() - start).toBeLessThan(5000);
    expect(out).toContain(LONG_URL);
  });

  it('colapso de citações repetidas continua funcionando (comportamento preservado)', () => {
    const out = normalizeCitationArtifacts('[1](https://a.com/x) [4] [5]');
    expect(out).toBe('[1](https://a.com/x)');
  });

  it('demais matchers de link completam rápido no mesmo input patológico', () => {
    const start = Date.now();
    stripMarkdown(PATHOLOGICAL);
    rewriteMarkdownLinksToGoogle(PATHOLOGICAL);
    fixFakeLinks(PATHOLOGICAL);
    cleanFakeSourcesBlock(PATHOLOGICAL);
    extractValidLinks(PATHOLOGICAL);
    extractPromotableInlineSources(PATHOLOGICAL, []);
    applyDossierLinkIntegrity(PATHOLOGICAL, { allowedPool: [] });
    convertMarkdownToHTML(PATHOLOGICAL, false);
    expect(Date.now() - start).toBeLessThan(10000);
  });
});

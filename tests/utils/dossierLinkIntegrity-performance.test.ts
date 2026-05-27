import { describe, expect, it } from 'vitest';
import { applyDossierLinkIntegrity } from '../../utils/dossierLinkIntegrity';
import { buildAuditableSources } from '../../utils/textCleaners';

describe('dossier link integrity performance', () => {
  it('processa dossiê grande com rodapé ## 📚 Fontes sem travar', () => {
    const linkLine = '[Fonte](https://example.com/path) ';
    const body = linkLine.repeat(800);
    const footer =
      '\n## 📚 Fontes\n' +
      Array.from({ length: 120 }, (_, i) => `${i + 1}. Fonte ${i} — https://example.com/f${i}`).join('\n');
    const text = `# Dossiê\n\n${body}\n${footer}`;

    const pool = Array.from({ length: 80 }, (_, i) => ({
      title: `Fonte ${i}`,
      url: `https://example.com/f${i}`,
      verification: 'grounding' as const,
    }));

    const start = performance.now();
    const cleaned = applyDossierLinkIntegrity(text, { allowedPool: pool });
    const sources = buildAuditableSources(cleaned, pool);
    const elapsed = performance.now() - start;

    expect(cleaned.length).toBeGreaterThan(0);
    expect(sources.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(3000);
  });

  it('não explode com parênteses abertos em URLs malformadas', () => {
    const malformed = `[x](https://test.com/${'('.repeat(40)}`;
    const text = malformed.repeat(200) + '\n## 📚 Fontes\n1. a';

    const start = performance.now();
    const cleaned = applyDossierLinkIntegrity(text, { allowedPool: [] });
    const elapsed = performance.now() - start;

    expect(cleaned).toBeTruthy();
    expect(elapsed).toBeLessThan(3000);
  });
});

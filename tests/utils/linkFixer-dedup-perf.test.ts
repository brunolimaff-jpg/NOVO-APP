import { describe, expect, it } from 'vitest';
import { applyDossierLinkIntegrity } from '../../utils/dossierLinkIntegrity';
import { cleanFakeSourcesBlock } from '../../utils/linkFixer';

describe('linkFixer dedup após strip do rodapé 📚 Fontes', () => {
  it('cleanFakeSourcesBlock não deve travar em dossiê grande sem o rodapé canônico', () => {
    const linkLine = '[Fonte](https://example.com/path) parágrafo.\n\n';
    const body = `# Dossiê\n\n${linkLine.repeat(1500)}`;
    const withFooter = `${body}\n## 📚 Fontes\n1. Exemplo — https://example.com/f1`;

    const integrityBase = applyDossierLinkIntegrity(withFooter, { allowedPool: [] });
    expect(integrityBase).not.toMatch(/##\s*📚\s*Fontes/i);

    const start = performance.now();
    const afterDedup = cleanFakeSourcesBlock(integrityBase);
    const elapsed = performance.now() - start;

    expect(afterDedup.length).toBeGreaterThan(1000);
    expect(elapsed).toBeLessThan(2000);
  });
});

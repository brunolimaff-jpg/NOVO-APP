import { describe, expect, it } from 'vitest';
import { isMermaidRenderErrorOutput, sanitizeMermaidCode } from '../../utils/mermaid';

describe('mermaid helpers', () => {
  it('separa statements colapsados na mesma linha e codifica labels com parênteses', () => {
    const result = sanitizeMermaidCode(
      'graph TD\nC ==> D[Armazenagem (Silos)]    D ==> E[Expedição]',
    );

    // quoteNodeLabels wraps labels with () in double-quotes to avoid PS/PE token errors
    expect(result).toContain('C ==> D["Armazenagem (Silos)"]');
    expect(result).toContain('D ==> E[Expedição]');
  });

  it('materializa targets textuais em nós válidos', () => {
    const result = sanitizeMermaidCode(
      'graph TD\nFrotaRast -.-> "Integração manual/visão parcial"',
    );

    expect(result).toContain('FrotaRast -.-> mermaid_note_1["Integração manual/visão parcial"]');
  });

  it('detecta svg de erro sintático devolvido pela lib', () => {
    expect(
      isMermaidRenderErrorOutput('<svg><text>Syntax error in text</text><text>mermaid version 10.9.5</text></svg>'),
    ).toBe(true);
    expect(isMermaidRenderErrorOutput('<svg><text>graph TD</text><text>A --> B</text></svg>')).toBe(false);
  });
});

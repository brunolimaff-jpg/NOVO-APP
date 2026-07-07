import { describe, expect, it } from 'vitest';
import { validateDossierGolden, type DossierGoldenCase } from './dossierGolden';

const expected = `# Resumo
Conteúdo de referência suficientemente longo.

# Próximos passos
Plano comercial.
`;

const baseCase: DossierGoldenCase = {
  cnpj: '00.000.000/0001-00',
  companyName: 'Empresa Exemplo',
  requiredHeadings: ['# Resumo', '# Próximos passos'],
  requiredPhrases: ['Empresa Exemplo'],
  forbiddenPhrases: ['Falha técnica'],
  minimumMermaidBlocks: 1,
};

const valid = `# Resumo
> **CNPJ analisado:** 00.000.000/0001-00

Empresa Exemplo com dados reais.

\`\`\`mermaid
graph LR
  A --> B
\`\`\`

# Próximos passos
Plano comercial acionável.
`;

describe('dossierGolden rubric', () => {
  it('aprova markdown válido', () => {
    expect(validateDossierGolden(valid, expected, baseCase)).toEqual([]);
  });

  it('reprova trecho proibido', () => {
    const result = validateDossierGolden(
      valid.replace('Empresa Exemplo', 'Empresa Exemplo (Falha técnica)'),
      expected,
      baseCase,
    );
    expect(result).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Falha técnica'),
      ]),
    );
  });

  it('reprova frase obrigatória ausente', () => {
    const result = validateDossierGolden(
      valid.replace('Empresa Exemplo', 'Outra Empresa'),
      expected,
      baseCase,
    );
    expect(result).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Empresa Exemplo'),
      ]),
    );
  });

  it('reprova seção obrigatória faltando', () => {
    const result = validateDossierGolden(
      valid.replace('# Resumo', ''),
      expected,
      baseCase,
    );
    expect(result).toEqual(
      expect.arrayContaining([
        expect.stringContaining('# Resumo'),
      ]),
    );
  });
});

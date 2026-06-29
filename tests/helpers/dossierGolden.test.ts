import { describe, expect, it } from 'vitest';
import { evaluateDossierGolden, type DossierGoldenCase } from './dossierGolden';

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
  minimumSources: 1,
  minimumSourceDomains: 1,
  primarySourceDomains: ['empresa.example'],
  requiredEvidenceLabels: [
    { label: 'fato', aliases: ['confirmado'] },
    { label: 'inferência', aliases: ['provável'] },
    { label: 'estimativa', aliases: ['estimativa'] },
  ],
  semanticFacts: [{ label: 'entidade', aliases: ['Empresa Exemplo'] }],
};

const valid = `# Resumo
> **CNPJ analisado:** 00.000.000/0001-00

Empresa Exemplo: fato confirmado. É provável que haja expansão; a estimativa é conservadora.
[Fonte primária](https://empresa.example/fato)

\`\`\`mermaid
graph LR
  A --> B
\`\`\`

# Próximos passos
Plano comercial acionável.
`;

describe('dossierGolden rubric', () => {
  it('aprova aliases de evidência e fonte primária sem exigir redação literal', async () => {
    expect((await evaluateDossierGolden(valid, expected, baseCase)).errors).toEqual([]);
  });

  it('reprova placeholder, mermaid inválido e ausência de fonte', async () => {
    const rubric = await evaluateDossierGolden(
      valid
        .replace('[Fonte primária](https://empresa.example/fato)', '[preencher fonte]')
        .replace('graph LR', 'A --> B'),
      expected,
      baseCase,
    );
    expect(rubric.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('fontes insuficientes'),
        expect.stringContaining('fonte primária'),
        expect.stringContaining('placeholder encontrado'),
        expect.stringContaining('mermaid inválidos'),
      ]),
    );
  });

  it('reprova afirmações mutuamente exclusivas presentes no mesmo relatório', async () => {
    const rubric = await evaluateDossierGolden(
      `${valid}\nA empresa possui 10 unidades e também possui 20 unidades.`,
      expected,
      {
        ...baseCase,
        mutuallyExclusiveClaims: [
          {
            label: 'quantidade de unidades',
            claims: [
              { value: '10', aliases: ['possui 10 unidades'] },
              { value: '20', aliases: ['possui 20 unidades'] },
            ],
          },
        ],
      },
    );
    expect(rubric.errors).toContain('contradição em quantidade de unidades: 10 versus 20');
  });

  it('reprova identidade incorreta, CNPJ canônico inválido e seção vazia', async () => {
    const rubric = await evaluateDossierGolden(
      valid.replace('Empresa Exemplo', 'Outra Empresa').replace('Plano comercial acionável.', ''),
      expected,
      {
        ...baseCase,
        cnpj: '123',
      },
    );
    expect(rubric.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('identidade da empresa incorreta'),
        expect.stringContaining('CNPJ canônico ausente ou inválido'),
        expect.stringContaining('seções obrigatórias vazias'),
      ]),
    );
  });

  it('reprova fato crítico sem link associado no mesmo parágrafo', async () => {
    const markdown = `${valid.replace('[Fonte primária](https://empresa.example/fato)', '')}\n\n[Outra fonte](https://empresa.example/fato)`;
    const rubric = await evaluateDossierGolden(markdown, expected, {
      ...baseCase,
      semanticFacts: [{ label: 'empresa', aliases: ['Empresa Exemplo'], requiresSource: true }],
    });
    expect(rubric.errors).toContain('fato crítico sem fonte associada no mesmo parágrafo: empresa');
  });

  it('usa o parser real do Mermaid para reprovar sintaxe inválida', async () => {
    const invalid = valid.replace('A --> B', 'A -->');
    const rubric = await evaluateDossierGolden(invalid, expected, baseCase);
    expect(rubric.errors).toContain('blocos mermaid inválidos: 1');
  });
});

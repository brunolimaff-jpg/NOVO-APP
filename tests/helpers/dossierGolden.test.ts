import { describe, expect, it } from 'vitest';
import { validateDossierGolden, type DossierGoldenCase } from './dossierGolden';

// Contrato atual (main 5a984148): validateDossierGolden(actual, expected, case)
// retorna string[] de erros (vazio = aprovado). O contrato histórico
// evaluateDossierGolden (rubric com errors/identidade/fontes/evidências e parsing
// Mermaid avançado) foi substituído no Patch A do Golden (8ed72230) e não tem
// produtor/consumidor atual — funcionalidades históricas não foram restauradas
// (decisão do cartão MAIN-TYPECHECK-11-LOCAL-01). Este teste cobre as regras que
// o helper realmente implementa.

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

Empresa Exemplo: fato confirmado. É provável que haja expansão; a estimativa é conservadora.

\`\`\`mermaid
graph LR
  A --> B
\`\`\`

# Próximos passos
Plano comercial acionável.
`;

describe('validateDossierGolden', () => {
  it('aprova markdown válido com todas as regras satisfeitas', () => {
    expect(validateDossierGolden(valid, expected, baseCase)).toEqual([]);
  });

  it('reprova markdown vazio', () => {
    const errors = validateDossierGolden('', expected, baseCase);
    expect(errors).toEqual(expect.arrayContaining([expect.stringContaining('vazio')]));
  });

  it('reprova seção obrigatória ausente', () => {
    const errors = validateDossierGolden(valid.replace('# Próximos passos', '# Outra seção'), expected, baseCase);
    expect(errors).toEqual(expect.arrayContaining([expect.stringContaining('faltou seção obrigatória')]));
  });

  it('reprova trecho obrigatório ausente', () => {
    const errors = validateDossierGolden(valid.replace('Empresa Exemplo', 'Outra Empresa'), expected, baseCase);
    expect(errors).toEqual(expect.arrayContaining([expect.stringContaining('faltou trecho obrigatório')]));
  });

  it('reprova trecho proibido presente', () => {
    const errors = validateDossierGolden(`${valid}\nFalha técnica registrada.`, expected, baseCase);
    expect(errors).toEqual(expect.arrayContaining([expect.stringContaining('trecho proibido')]));
  });

  it('reprova blocos mermaid insuficientes', () => {
    const semMermaid = valid.replace(/```mermaid[\s\S]*?```/g, '');
    const errors = validateDossierGolden(semMermaid, expected, baseCase);
    expect(errors).toEqual(expect.arrayContaining([expect.stringContaining('mermaid insuficientes')]));
  });

  it('reprova markdown curto demais quando há ratio mínimo', () => {
    const curto = '# Resumo\nApenas um trecho curto.';
    const errors = validateDossierGolden(curto, expected, { ...baseCase, minimumExpectedLengthRatio: 1 });
    expect(errors).toEqual(expect.arrayContaining([expect.stringContaining('curto demais')]));
  });
});

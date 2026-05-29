import { describe, expect, it } from 'vitest';
import { isMermaidRenderErrorOutput, sanitizeMermaidCode } from '../../utils/mermaid';

describe('mermaid helpers', () => {
  it('separa statements colapsados na mesma linha e codifica labels com parênteses', () => {
    const result = sanitizeMermaidCode('graph TD\nC ==> D[Armazenagem (Silos)]    D ==> E[Expedição]');

    // quoteNodeLabels wraps labels with () in double-quotes to avoid PS/PE token errors
    expect(result).toContain('C ==> D["Armazenagem (Silos)"]');
    expect(result).toContain('D ==> E[Expedição]');
  });

  it('materializa targets textuais em nós válidos', () => {
    const result = sanitizeMermaidCode('graph TD\nFrotaRast -.-> "Integração manual/visão parcial"');

    expect(result).toContain('FrotaRast -.-> mermaid_note_1["Integração manual/visão parcial"]');
  });

  it('detecta svg de erro sintático devolvido pela lib', () => {
    expect(
      isMermaidRenderErrorOutput('<svg><text>Syntax error in text</text><text>mermaid version 10.9.5</text></svg>'),
    ).toBe(true);
    expect(isMermaidRenderErrorOutput('<svg><text>graph TD</text><text>A --> B</text></svg>')).toBe(false);
  });
});

describe('inline class normalization', () => {
  it('normaliza classe inline legada com :: para evitar parse error', () => {
    const result = sanitizeMermaidCode('graph LR\nA["ALIMENTOS MASSON Ltda."]::companyA --> B["Dados"]');
    expect(result).toContain('A["ALIMENTOS MASSON Ltda."] --> B["Dados"]');
    expect(result).toContain('class A companyA;');
  });
});

describe('materializeBareEdgeTargets', () => {
  it('converte texto bare após -.-> em nó sintético', () => {
    const result = sanitizeMermaidCode('graph LR\nB -.-> Consolidação Manual / Integração');
    expect(result).toMatch(/B -.-> mermaid_bare_1\["Consolidação Manual \/ Integração"\]/);
  });

  it('converte texto bare após --> em nó sintético', () => {
    const result = sanitizeMermaidCode('graph LR\nA --> Gestão de Estoque Centralizada');
    expect(result).toMatch(/A --> mermaid_bare_1\["Gestão de Estoque Centralizada"\]/);
  });

  it('converte texto bare após ==> em nó sintético', () => {
    const result = sanitizeMermaidCode('graph LR\nX ==> Fluxo Principal de Dados');
    expect(result).toMatch(/X ==> mermaid_bare_1\["Fluxo Principal de Dados"\]/);
  });

  it('NÃO converte nodeIds válidos (palavra única)', () => {
    const result = sanitizeMermaidCode('graph LR\nA --> NodeB');
    expect(result).toContain('A --> NodeB');
    expect(result).not.toContain('mermaid_bare');
  });

  it('NÃO converte referências de nó com shape', () => {
    const result = sanitizeMermaidCode('graph LR\nA --> B["Already Quoted"]');
    expect(result).toContain('B["Already Quoted"]');
    expect(result).not.toContain('mermaid_bare');
  });

  it('lida com múltiplos bare targets em linhas separadas', () => {
    const result = sanitizeMermaidCode('graph LR\nA -.-> Integração Manual\nB ==> Consolidação Fiscal');
    expect(result).toContain('mermaid_bare_1["Integração Manual"]');
    expect(result).toContain('mermaid_bare_2["Consolidação Fiscal"]');
  });

  it('lida com caracteres acentuados em texto bare', () => {
    const result = sanitizeMermaidCode('graph LR\nA --> Operação / Manutenção');
    expect(result).toMatch(/mermaid_bare_1\["Operação \/ Manutenção"\]/);
  });
});

describe('quoteRoundAndCurlyLabels', () => {
  it('quota labels round-bracket contendo /', () => {
    const result = sanitizeMermaidCode('graph LR\nA(Entrada/Saída) --> B');
    expect(result).toContain('A("Entrada/Saída")');
  });

  it('quota labels curly-bracket contendo ()', () => {
    const result = sanitizeMermaidCode('graph LR\nA{Decisão (sim/não)} --> B');
    expect(result).toContain('A{"Decisão (sim/não)"}');
  });

  it('NÃO quota labels round-bracket limpos', () => {
    const result = sanitizeMermaidCode('graph LR\nA(Label Simples) --> B');
    expect(result).toContain('A(Label Simples)');
  });
});

describe('pipeline de sanitização integrado', () => {
  it('lida com collapsed statement + bare edge target', () => {
    const result = sanitizeMermaidCode('graph LR\nA[ERP] ==> B[Fiscal]    B -.-> Consolidação Manual');
    expect(result).toContain('A[ERP] ==> B[Fiscal]');
    expect(result).toContain('mermaid_bare_1["Consolidação Manual"]');
  });

  it('lida com colon edge label + bare target', () => {
    const result = sanitizeMermaidCode('graph LR\nA --> B: fluxo de dados\nC -.-> Integração Manual / Parcial');
    expect(result).toContain('A -- fluxo de dados --> B');
    expect(result).toContain('mermaid_bare_1["Integração Manual / Parcial"]');
  });

  it('fecha label quotado antes da aresta quando a IA omite colchete', () => {
    const result = sanitizeMermaidCode('graph LR\nA["Fiscal/Planilha" -.-> B["Armazenagem (Kepler Weber)"]');

    expect(result).toContain('A["Fiscal/Planilha"] -.-> B["Armazenagem (Kepler Weber)"]');
  });

  it('strip emojis do código mermaid', () => {
    const result = sanitizeMermaidCode('graph LR\n🏭 A --> B');
    expect(result).toContain('A --> B');
    expect(result).not.toMatch(/🏭/);
  });

  it('preserva subgraph com label entre aspas', () => {
    const result = sanitizeMermaidCode('graph LR\nsubgraph "Área Fiscal"\nA --> B\nend');
    expect(result).toContain('subgraph "Área Fiscal"');
  });

  it('quota subgraph labels contendo parênteses (fix parse error PS)', () => {
    const result = sanitizeMermaidCode('graph LR\nsubgraph Sistemas Senior (Existente)\nA --> B\nend');
    // O label contém espaços e parênteses, deve ser quotado para evitar "got 'PS'" error
    expect(result).toContain('subgraph "Sistemas Senior (Existente)"');
  });

  it('normaliza stroke-dasharray com espaço para vírgula', () => {
    const result = sanitizeMermaidCode(
      'graph LR\nclassDef neutral fill:#f8fafc,stroke:#94a3b8,stroke-dasharray:5 5\nA --> B',
    );
    expect(result).toContain('stroke-dasharray:5,5');
  });

  it('quota pipe edge label com parênteses', () => {
    const result = sanitizeMermaidCode('graph LR\nA -->|integração (manual)| B');
    expect(result).toContain('|"integração (manual)"|');
  });
});

describe('fixClassStatements', () => {
  it('corrige class statements com IDs começando com números', () => {
    const result = sanitizeMermaidCode('graph LR\nA --> B\nclass 1A danger;');
    expect(result).toContain('class _1A danger;');
  });

  it('preserva class statements com IDs válidos', () => {
    const result = sanitizeMermaidCode('graph LR\nA --> B\nclass A danger;');
    expect(result).toContain('class A danger;');
  });
});

describe('edge cases adversariais', () => {
  it('lida com aspas duplas em bare target (substitui por simples)', () => {
    const result = sanitizeMermaidCode('graph LR\nA -.-> Sistema "legado" manual');
    expect(result).toMatch(/mermaid_bare_1\["Sistema 'legado' manual"\]/);
  });

  it('retorna string vazia para input sem tipo de diagrama válido', () => {
    const result = sanitizeMermaidCode('apenas texto sem diagrama');
    expect(result).toBe('');
  });

  it('lida com diagrama completo combinando múltiplos padrões problemáticos', () => {
    const input = `graph LR
classDef core fill:#eff6ff,stroke:#3b82f6,stroke-width:2px,color:#1e3a8a;
classDef danger fill:#fff1f2,stroke:#f43f5e,stroke-width:2px,color:#881337;
classDef warning fill:#fffbeb,stroke:#f59e0b,stroke-width:2px,color:#78350f;
classDef neutral fill:#f8fafc,stroke:#94a3b8,stroke-dasharray:5 5,stroke-width:1px,color:#475569;
A[Senior ERP (Fiscal)] ==> B[Expedição]
B -.-> Consolidação Manual / Planilhas
C{Decisão (sim/não)} --> D
class A core;
class B core;
class C warning;`;

    const result = sanitizeMermaidCode(input);

    // stroke-dasharray normalizado
    expect(result).toContain('stroke-dasharray:5,5');
    // labels com () quotados
    expect(result).toContain('A["Senior ERP (Fiscal)"]');
    // bare target materializado
    expect(result).toContain('mermaid_bare_1["Consolidação Manual / Planilhas"]');
    // curly label com () quotado
    expect(result).toContain('C{"Decisão (sim/não)"}');
    // classes preservadas
    expect(result).toContain('class A core;');
  });
});

import { describe, it, expect } from 'vitest';
import { normalizeDiscoveryQuestion } from '../../../services/llm/gold/gold-policy';
import { downgradeUnsupportedCertainty } from '../../../services/llm/gold/gold-pipeline';
import { injectCanonicalGoldMermaids, buildDynamicValueChainTable } from '../../../services/llm/gold/mermaid/mermaid-deterministic';
import type { CanonicalAccount, SafeFindingPack } from '../../../services/llm/gold/gold-contracts';

const CANONICAL: CanonicalAccount = {
  inputCnpj: '04.733.767/0001-80',
  legalName: 'SCHEFFER & CIA LTDA',
  establishmentType: 'Filial',
  rootCnpj: '04.733.767',
  headOfficeCnpj: null,
  directPjPartners: [],
  qsaPeople: [],
};

/**
 * BRU-108 — GOLD OUTPUT QUALITY GATE: integridade textual determinística.
 * Cada defeito do run 2fe72ab3 tem mecanismo determinístico no pipeline;
 * estes testes fixam o comportamento corrigido.
 */
describe('BRU-108 — defeito 4: normalizeDiscoveryQuestion sem cascata', () => {
  it('"capacidade de produção" não vira "volume de volume" (single-pass)', () => {
    expect(normalizeDiscoveryQuestion('Qual é a capacidade de produção de algodão?')).toBe(
      'Qual é o volume de produção de algodão?',
    );
  });

  it('artigo feminino do original é corrigido: "a capacidade" → "o volume"', () => {
    expect(normalizeDiscoveryQuestion('Qual é a capacidade estática total de armazenagem?')).toBe(
      'Qual é o volume total de armazenagem?',
    );
    expect(normalizeDiscoveryQuestion('Qual é a capacidade de armazenagem?')).toBe(
      'Qual é o volume de armazenagem?',
    );
  });

  it('"capacidade anual/mensal de produção" preserva o período', () => {
    expect(normalizeDiscoveryQuestion('Qual é a capacidade anual de produção?')).toBe(
      'Qual é o volume anual de produção?',
    );
    expect(normalizeDiscoveryQuestion('Qual é a capacidade mensal de produção?')).toBe(
      'Qual é o volume mensal de produção?',
    );
  });

  it('remoção de "confirmado" não deixa espaço antes de pontuação', () => {
    expect(normalizeDiscoveryQuestion('A operação na Colômbia (Cumaribo) possui registro legal confirmado?')).toBe(
      'A operação na Colômbia (Cumaribo) possui registro legal?',
    );
  });

  it('não-interrogativa permanece intacta (régua RCA-03 preservada)', () => {
    expect(normalizeDiscoveryQuestion('Operação na Colômbia está confirmada.')).toBe(
      'Operação na Colômbia está confirmada.',
    );
  });
});

describe('BRU-108 — defeito 5: espaçamento pós-ponto no downgrade de certeza', () => {
  it('preserva espaço entre ponto e fragmento transformado', () => {
    expect(downgradeUnsupportedCertainty('O grupo é um player verticalizado. A operação confirmada na Colômbia é relevante.')).toBe(
      'O grupo é um player verticalizado. A operação mencionada na Colômbia é relevante.',
    );
  });

  it('preserva espaço com "A presença internacional confirmada"', () => {
    expect(downgradeUnsupportedCertainty('A governança é familiar. A presença internacional confirmada adiciona complexidade.')).toBe(
      'A governança é familiar. A presença internacional mencionada adiciona complexidade.',
    );
  });

  it('CNPJ protegido continua intacto após transformação', () => {
    expect(downgradeUnsupportedCertainty('CNPJ 04.733.767/0001-80 confirmado na Colômbia.')).toBe(
      'CNPJ 04.733.767/0001-80 mencionado na Colômbia.',
    );
  });
});

describe('BRU-108 — defeitos 2/3: tabela de elos (truncamento + duplicação)', () => {
  function makePack(openQuestions: string[]): SafeFindingPack {
    return {
      module: 'gold-compactor',
      accountIdentity: {
        inputCnpj: '04.733.767/0001-80',
        legalName: 'SCHEFFER & CIA LTDA',
        establishmentType: 'Filial',
        rootCnpj: '04.733.767',
        conflicts: [],
      },
      facts: [
        { id: 'f1', entity: 'SCHEFFER & CIA LTDA', kind: 'operation', claim: 'Cultivo de soja, milho e algodão em larga escala', status: 'Confirmado', source: 'x', process: null },
        { id: 'f2', entity: 'SCHEFFER & CIA LTDA', kind: 'operation', claim: 'Plantio próprio de 220 mil ha em duas safras', status: 'Confirmado', source: 'x', process: null },
        { id: 'f3', entity: 'SCHEFFER & CIA LTDA', kind: 'operation', claim: 'Beneficiamento de algodão em pluma (UBA)', status: 'Confirmado', source: 'x', process: null },
        { id: 'f4', entity: 'SCHEFFER & CIA LTDA', kind: 'operation', claim: 'Originação e trading da produção própria', status: 'Confirmado', source: 'x', process: null },
      ],
      relationships: [],
      technologySignals: [],
      people: [],
      metrics: [],
      conflicts: [],
      openQuestions,
      sanitizerEvents: [],
      sanitized: true,
    } as unknown as SafeFindingPack;
  }

  it('a mesma pergunta não é duplicada em várias linhas da dimensão', () => {
    const pack = makePack(['Qual é a capacidade de produção de algodão?']);
    const table = buildDynamicValueChainTable(pack, 'agroindustria') ?? '';
    const occurrences = table.split('Qual é o volume de produção de algodão?').length - 1;
    // a pergunta aparece no máximo 1x (a 1ª linha que casa); as demais ficam "—"
    expect(occurrences).toBeLessThanOrEqual(1);
    expect(table).toContain('| — |');
  });

  it('truncamento corta em limite de palavra (sem "certificações BC...")', () => {
    const longQuestion = 'Como é garantida a rastreabilidade do lote de algodão desde o talhão até a pluma expedida para atender às auditorias das certificações BCI e regenagri?';
    const pack = makePack([longQuestion]);
    const table = buildDynamicValueChainTable(pack, 'agroindustria') ?? '';
    // o truncado não parte palavra no meio
    expect(table).not.toMatch(/certificações\s+BC\.\.\./);
    expect(table).not.toMatch(/\w\.\.\.\w/);
  });

  it('perguntas distintas por dimensão são distribuídas', () => {
    const pack = makePack([
      'Qual é a capacidade de produção de algodão?',
      'Qual é a capacidade de armazenagem da unidade?',
      'Quem é o responsável pela área de TI?',
    ]);
    const table = buildDynamicValueChainTable(pack, 'agroindustria') ?? '';
    const rows = table.split('\n').filter((l) => l.startsWith('| '));
    const validateCells = rows.map((r) => r.split('|')[6]?.trim() ?? '');
    const nonEmpty = validateCells.filter((v) => v !== '—');
    // cada pergunta distinta aparece uma única vez
    expect(new Set(nonEmpty).size).toBe(nonEmpty.length);
  });
});

describe('BRU-108 — builder: Caminho da Venda com sintaxe canônica de aresta', () => {
  it('não emite "D -- Sim ==> E" (mistura -- com ==>)', () => {
    const pack: SafeFindingPack = {
      module: 'gold-compactor',
      accountIdentity: {
        inputCnpj: '04.733.767/0001-80',
        legalName: 'SCHEFFER & CIA LTDA',
        establishmentType: 'Filial',
        rootCnpj: '04.733.767',
        conflicts: [],
      },
      facts: [
        { id: 'f1', entity: 'SCHEFFER & CIA LTDA', kind: 'operation', claim: 'Cultivo de soja em larga escala', status: 'Confirmado', source: 'x', process: null },
        { id: 'f2', entity: 'SCHEFFER & CIA LTDA', kind: 'operation', claim: 'Beneficiamento de algodão (UBA)', status: 'Confirmado', source: 'x', process: null },
        { id: 'f3', entity: 'SCHEFFER & CIA LTDA', kind: 'technology', claim: 'ERP Senior com 74 módulos', status: 'Confirmado', source: 'x', process: null },
      ],
      relationships: [],
      technologySignals: [],
      people: [],
      metrics: [],
      conflicts: [],
      openQuestions: [],
      sanitizerEvents: [],
      sanitized: true,
    } as unknown as SafeFindingPack;
    const badGold = '### 1. SÍNTESE EXECUTIVA\n\n### 2. PERFIL\n\n### 3. ESTRUTURA SOCIETÁRIA\n\n### 4. TECNOLOGIA\n\n### 5. PESSOAS-CHAVE\n\n### 6. INDICADORES\n\n### 7. SINAIS\n\n### 8. RISCOS\n\n### 9. PRÓXIMOS PASSOS';
    const gold = injectCanonicalGoldMermaids(badGold, CANONICAL, pack);
    expect(gold).not.toMatch(/--\s*Sim\s*==>/);
    expect(gold).not.toMatch(/--\s*Não\s*==>/);
    expect(gold).toMatch(/==>\s*Sim\s*==>/);
    expect(gold).toMatch(/==>\s*Não\s*==>/);
  });
});

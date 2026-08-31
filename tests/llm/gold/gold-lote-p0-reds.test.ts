import { describe, it, expect } from 'vitest';
import { injectCanonicalGoldMermaids, buildGoldArtifact } from '../../../services/llm/gold/mermaid/mermaid-deterministic';
import {
  composerSemanticPreflight,
  downgradeUnsupportedCertainty,
} from '../../../services/llm/gold/gold-pipeline';
import { verifyGold } from '../../../services/llm/gold/entity-aware-gold-verifier';
import { matchesSensitiveTheme, matchesUnsupportedOperationalClaim } from '../../../services/llm/gold/gold-policy';
import type { CanonicalAccount, SafeFindingPack } from '../../../services/llm/gold/gold-contracts';

/**
 * LOTE GOLD P0 — REDs permanentes (despacho autorizado do Planejador,
 * 2026-08-13). Estes testes DEVEM falhar no baseline 4254dadd e ficar verdes
 * apenas com a correção na origem (mermaid-deterministic / gold-pipeline).
 * Verifier/sanitizer/prompts NÃO são tocados.
 */
const canonical: CanonicalAccount = {
  inputCnpj: '04.733.767/0001-80',
  legalName: 'SCHEFFER & CIA LTDA',
  establishmentType: 'Filial',
  rootCnpj: '04.733.767',
  headOfficeCnpj: '04.733.767/0014-03',
  headOfficeLegalName: 'SCHEFFER & CIA LTDA',
  directPjPartners: [{ legalName: 'SCHEFFER PARTICIPACOES S/A', cnpj: '11.021.773/0001-70' }],
  qsaPeople: [],
};

function makePack(facts: Array<Record<string, unknown>>, relationships: Array<Record<string, unknown>> = []): SafeFindingPack {
  return {
    module: 'gold-compactor',
    accountIdentity: {
      inputCnpj: '04.733.767/0001-80',
      legalName: 'SCHEFFER & CIA LTDA',
      establishmentType: 'Filial',
      rootCnpj: '04.733.767',
      conflicts: [],
    },
    facts: facts as SafeFindingPack['facts'],
    relationships: relationships as SafeFindingPack['relationships'],
    technologySignals: [],
    people: [],
    metrics: [],
    conflicts: [],
    openQuestions: [],
    sanitizerEvents: [],
    sanitized: true,
  } as unknown as SafeFindingPack;
}

const CLEAN_BRIEF = `# Gold Brief

### 1. SÍNTESE EXECUTIVA
Sem afirmações de capacidade ou produção.

### 2. PERFIL
Operação agrícola.
`;

describe('LOTE GOLD P0 — RED A: identidade da entidade no conteúdo determinístico', () => {
  it('fato Confirmado de ENTIDADE RELACIONADA mantém a identidade visível e NÃO vira UNSUPPORTED_PRODUCT_CLAIM', () => {
    const pack = makePack(
      [
        {
          id: 'f-hold',
          entity: 'EMPRESA B',
          claim: 'Capacidade de armazenagem de 120 mil sacas',
          status: 'Confirmado',
          source: 'Fonte externa',
          kind: 'operation',
          process: null,
        },
        {
          id: 'f-conta',
          entity: 'SCHEFFER & CIA LTDA',
          claim: 'Cultivo próprio de soja confirmado.',
          status: 'Confirmado',
          source: 'Fonte externa',
          kind: 'operation',
          process: null,
        },
      ],
      [{ id: 'r1', entity: 'SCHEFFER & CIA LTDA', relatedEntity: 'EMPRESA B', relationType: 'partner_other_cnpj', status: 'Confirmado', source: 'socio-search', evidence: null }],
    );

    const text = downgradeUnsupportedCertainty(
      injectCanonicalGoldMermaids(composerSemanticPreflight(CLEAN_BRIEF, canonical, pack), canonical, pack, 'agropecuaria'),
    );

    // entidade relacionada continua visível no conteúdo (não vale apagar o fato)
    expect(text).toContain('EMPRESA B');
    // verifier final não fabrica hard fail por entidade perdida
    const result = verifyGold(text, canonical, pack);
    const unsupported = result.hardFails.filter((h) => h.code === 'UNSUPPORTED_PRODUCT_CLAIM');
    expect(unsupported).toEqual([]);
  });
});

describe('LOTE GOLD P0 — RED B: truncamento semântico', () => {
  it('claim confirmada longa com medida no fim NÃO é truncada antes do verifier', () => {
    // prefixo ~150 chars empurra a MEDIDA para terminar além do limite de 180
    // da célula — o truncamento atual cortaria justamente dentro da medida
    const longClaim =
      'Operação consolidada de grãos com estrutura verticalizada de logística própria e integração entre as unidades produtivas do grupo, capacidade de armazenagem de 120 mil sacas por ano';
    const pack = makePack([
      {
        id: 'f-long',
        entity: 'SCHEFFER & CIA LTDA',
        claim: longClaim,
        status: 'Confirmado',
        source: 'Fonte externa',
        kind: 'operation',
        process: null,
      },
      {
        id: 'f-conta',
        entity: 'SCHEFFER & CIA LTDA',
        claim: 'Cultivo próprio de soja confirmado.',
        status: 'Confirmado',
        source: 'Fonte externa',
        kind: 'operation',
        process: null,
      },
    ]);

    const text = downgradeUnsupportedCertainty(
      injectCanonicalGoldMermaids(composerSemanticPreflight(CLEAN_BRIEF, canonical, pack), canonical, pack, 'agropecuaria'),
    );

    // a medida completa (quantidade + unidade) sobrevive no texto validado
    expect(text).toContain('120 mil sacas por ano');
    // nenhuma transformação cortou o claim no meio da medida
    expect(text).not.toContain('120 mil sacas por...');
    // verifier final reconcilia a medida e não reprova
    const result = verifyGold(text, canonical, pack);
    expect(result.hardFails.filter((h) => h.code === 'UNSUPPORTED_PRODUCT_CLAIM')).toEqual([]);
  });
});

describe('LOTE GOLD P0 — RED C: certainty guard não fabrica afirmação', () => {
  it('frase NEGATIVA permanece negativa após o downgrade e não vira UNSUPPORTED_PRODUCT_CLAIM', () => {
    const pack = makePack([
      {
        id: 'f-cuma',
        entity: 'SCHEFFER & CIA LTDA',
        claim: 'Operação agrícola em Cumaribo.',
        status: 'Confirmado',
        source: 'Fonte externa',
        kind: 'operation',
        process: null,
      },
    ]);

    const negativeSentence = 'Capacidade de 1 t não está confirmada em Cumaribo.';

    // PASS pré-transformação: a negação é reconhecida e não gera hard fail
    const pre = verifyGold(negativeSentence, canonical, pack);
    expect(pre.hardFails).toEqual([]);

    // a transformação de certeza NÃO pode reescrever a negação
    const downgraded = downgradeUnsupportedCertainty(negativeSentence);
    expect(downgraded).toContain('não está confirmada');

    // PASS pré-transformação não pode virar FAIL pós-transformação
    const post = verifyGold(downgraded, canonical, pack);
    expect(post.hardFails).toEqual([]);
  });
});

// ── Deltas Mermaid (despacho Planejador 2026-08-18, BRU-119) ──────────────

function makeDeltaPack(overrides: Partial<SafeFindingPack> = {}): SafeFindingPack {
  return {
    module: 'gold-compactor',
    accountIdentity: { inputCnpj: '04.733.767/0001-80', legalName: 'SCHEFFER & CIA LTDA', establishmentType: 'Filial', rootCnpj: '04.733.767', conflicts: [] },
    facts: [],
    relationships: [],
    technologySignals: [],
    people: [],
    metrics: [],
    conflicts: [],
    openQuestions: [],
    sanitizerEvents: [],
    sanitized: true,
    ...overrides,
  } as SafeFindingPack;
}

const DELTA_GOLD = `# Gold Brief
### 1. SÍNTESE EXECUTIVA 🎯
### 2. PERFIL 🏭
Operação verticalizada.
### 3. ESTRUTURA SOCIETÁRIA 🏛️
### 4. TECNOLOGIA 💻
### 5. PESSOAS-CHAVE 👥
### 6. INDICADORES 📊
### 7. SINAIS 🚨
### 8. RISCOS ⚠️
### 9. PRÓXIMOS PASSOS 🧭
`;

describe('Delta A — badge separado de claim (tema sensível)', () => {
  it('fact Confirmado com tema sensível não gera PROMOTED_CLAIM no Mermaid', () => {
    const pack = makeDeltaPack({
      facts: [{ id: 'f1', entity: 'SCHEFFER & CIA LTDA', claim: 'Operação internacional da holding em Cumaribo.', status: 'Confirmado', source: 'Fonte externa', kind: 'operation', process: null }],
    });
    const artifact = buildGoldArtifact(DELTA_GOLD, canonical, pack);
    const result = verifyGold(artifact.markdown, canonical, pack);
    expect(result.hardFails.some((h) => h.code === 'PROMOTED_CLAIM')).toBe(false);
  });
});

describe('Delta B — technologySignal não injeta observedFact como evidência', () => {
  it('technologySignal com observedFact protegido não gera UNSUPPORTED_PRODUCT_CLAIM', () => {
    const pack = makeDeltaPack({
      technologySignals: [
        { technology: 'WMS', observedFact: 'Capacidade estática de armazenagem de 1,2 milhão de sacas.', status: 'Confirmado', whatIsNotKnown: 'Qual solução suporta a armazenagem.', validationQuestion: 'Qual solução suporta hoje a armazenagem?' },
      ],
    });
    const artifact = buildGoldArtifact(DELTA_GOLD, canonical, pack);
    const result = verifyGold(artifact.markdown, canonical, pack);
    expect(result.hardFails.some((h) => h.code === 'UNSUPPORTED_PRODUCT_CLAIM')).toBe(false);
  });
});

describe('Delta C — governance regressão (verifier já correto)', () => {
  it('fact Confirmado externo não-QSA, mesma entidade → 0 GOVERNANCE_ROLE_PROMOTION', () => {
    const pack = makeDeltaPack({
      facts: [{ id: 'f1', entity: 'SCHEFFER & CIA LTDA', claim: 'SCHEFFER & CIA LTDA é uma holding controladora confirmada em registro oficial externo.', status: 'Confirmado', source: 'Registro oficial', kind: 'relationship', process: null }],
    });
    const artifact = buildGoldArtifact(DELTA_GOLD, canonical, pack);
    const result = verifyGold(artifact.markdown, canonical, pack);
    expect(result.hardFails.some((h) => h.code === 'GOVERNANCE_ROLE_PROMOTION')).toBe(false);
  });
});

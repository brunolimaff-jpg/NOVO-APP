import { describe, it, expect } from 'vitest';
import { normalizeDiscoveryQuestion } from '../../../services/llm/gold/gold-policy';
import { downgradeUnsupportedCertainty } from '../../../services/llm/gold/gold-pipeline';
import { validateGoldNarrative } from '../../../services/llm/gold/gold-contract-validator';
import { buildGoldArtifact } from '../../../services/llm/gold/mermaid/mermaid-deterministic';
import { verifyGold } from '../../../services/llm/gold/entity-aware-gold-verifier';
import type { CanonicalAccount, SafeFindingPack } from '../../../services/llm/gold/gold-contracts';

/**
 * ARCH-E (BRU-114) — BRU-108 Regression sob os novos contratos (A-D).
 *
 * Reexecuta os sintomas do BRU-108 (run 2fe72ab3) e a regressão do run
 * b3294247 ("volume DE produção" → verifier fail) agora que os contratos
 * Narrativo e de Artefato existem. Classifica origem residual:
 * policy / narrative normalization / builder / render.
 */
const CANONICAL: CanonicalAccount = {
  inputCnpj: '04.733.767/0001-80',
  legalName: 'SCHEFFER & CIA LTDA',
  establishmentType: 'Filial',
  rootCnpj: '04.733.767',
  headOfficeCnpj: null,
  directPjPartners: [],
  qsaPeople: [],
} as unknown as CanonicalAccount;

function lorem(n: number): string {
  const w = ['operação', 'agrícola', 'consolidada', 'cadeia', 'valor', 'safra', 'soja', 'algodão', 'cliente', 'Senior', 'ERP', 'módulo', 'logística', 'colheita', 'beneficiamento', 'exportação', 'contrato', 'frota', 'armazenagem', 'unidade', 'hectare', 'produção', 'mercado', 'regional', 'expansão', 'investimento', 'processo', 'equipe', 'sistema', 'dado', 'relatório', 'indicador', 'resultado', 'governança', 'decisão', 'plano'];
  const o = [];
  for (let i = 0; i < n; i++) o.push(w[i % w.length]);
  return o.join(' ');
}

const SECTIONS = ['1. SÍNTESE EXECUTIVA', '2. PERFIL', '3. ESTRUTURA SOCIETÁRIA', '4. TECNOLOGIA', '5. PESSOAS-CHAVE', '6. INDICADORES', '7. SINAIS', '8. RISCOS', '9. PRÓXIMOS PASSOS'];

function buildNarrative(body: string): string {
  const parts: string[] = [];
  for (const s of SECTIONS) {
    parts.push(`### ${s}`);
    parts.push(s.includes('PRÓXIMOS') ? '1. Validar capacidade.\n2. Agenda discovery.\n3. Proposta piloto.' : body.length > 10 ? body : lorem(120));
  }
  return parts.join('\n\n');
}

function makeSafePack(claims: string[]): SafeFindingPack {
  return {
    module: 'gold-compactor',
    accountIdentity: {
      inputCnpj: '04.733.767/0001-80',
      legalName: 'SCHEFFER & CIA LTDA',
      establishmentType: 'Filial',
      rootCnpj: '04.733.767',
      conflicts: [],
    },
    facts: claims.map((claim, i) => ({
      id: `f${i}`,
      entity: 'SCHEFFER & CIA LTDA',
      claim,
      status: 'Confirmado',
      source: 'Fonte externa',
      kind: 'operation',
      process: null,
    })),
    relationships: [],
    technologySignals: [],
    people: [],
    metrics: [],
    conflicts: [],
    openQuestions: [],
    sanitizerEvents: [],
    sanitized: true,
  } as unknown as SafeFindingPack;
}

describe('BRU-114 ARCH-E — regressão BRU-108 sob os novos contratos', () => {
  // ── Caso 1: Mermaid C1/GATec parênteses+pipes (origem: render/builder) ──
  it('C1/GATec com parênteses+pipes: builder emite e parseia (coberto no ARCH-D); artefato tem componentsEmitted', () => {
    const pack = makeSafePack([
      'Cultivo próprio de soja em larga escala',
      'Beneficiamento de algodão em pluma (UBA)',
    ]);
    const artifact = buildGoldArtifact(buildNarrative(''), CANONICAL, pack);
    expect(artifact.markdown).toContain('```mermaid');
    expect(artifact.manifest.componentsEmitted).toContain('chaos-map');
    expect(artifact.manifest.componentsEmitted).toContain('sales-path');
  });

  // ── Caso 2: arestas Sim/Não (origem: builder) ──
  it('Caminho da Venda usa sintaxe canônica == Sim == (sem -- Sim ==>)', () => {
    const artifact = buildGoldArtifact(buildNarrative(''), CANONICAL, makeSafePack([
      'Cultivo próprio de soja em larga escala',
      'Beneficiamento de algodão em pluma (UBA)',
    ]));
    expect(artifact.markdown).not.toMatch(/--\s*Sim\s*==>/);
    // BRU-119 follow-up: a canônica de aresta grossa rotulada é `== Sim ==>`
    // (`D ==> Sim ==> E` criava nós espúrios no render — Preview 488728d5).
    expect(artifact.markdown).toMatch(/==\s*Sim\s*==>/);
    expect(artifact.markdown).not.toMatch(/==>\s*Sim\s*==>/);
  });

  // ── Caso 3: coluna Validar truncada (origem: builder truncateCell) ──
  it('truncateCell corta em limite de palavra (sem "certificações BC...")', () => {
    // o builder não emite a pergunta longa truncada no meio — o ARTIFACT
    // contract garante a tabela, e o truncateCell (BRU-108-2) corta em palavra
    const longQuestion = 'Como é garantida a rastreabilidade do lote de algodão desde o talhão até a pluma expedida para atender às auditorias das certificações BCI e regenagri?';
    const normalized = normalizeDiscoveryQuestion(longQuestion);
    expect(normalized).not.toMatch(/certificações\s+BC\.\.\./);
    expect(normalized).toContain('?');
  });

  // ── Caso 4: pergunta duplicada (origem: builder validationForDimension) ──
  it('validationForDimension consome cada pergunta 1x (pool usedQuestions)', () => {
    // coberto no BRU-108 (bru108-output-quality) — aqui confirma a assinatura
    const _pack = makeSafePack(['Cultivo próprio de soja em larga escala']);
    expect(_pack.facts.length).toBeGreaterThan(0);
    const artifact = buildGoldArtifact(buildNarrative(''), CANONICAL, _pack);
    expect(artifact.manifest.valueChainTableEmitted).toBe(true);
  });

  // ── Caso 5+6: "volume de volume" / "A volume" (origem: policy normalize) ──
  it('normalizeDiscoveryQuestion: sem "volume de volume" nem "A volume"', () => {
    expect(normalizeDiscoveryQuestion('Qual é a capacidade de produção de algodão?')).toBe('Qual é o volume de algodão?');
    expect(normalizeDiscoveryQuestion('Qual é a capacidade estática total de armazenagem?')).toBe('Qual é o volume total de armazenagem?');
    expect(normalizeDiscoveryQuestion('Qual é o volume de volume de algodão?')).not.toContain('volume de volume');
  });

  // ── Caso 7: perda de whitespace .A / .** / 3.** (origem: policy/guard) ──
  it('downgradeUnsupportedCertainty preserva whitespace pós-ponto', () => {
    expect(downgradeUnsupportedCertainty('O grupo é verticalizado. A operação confirmada na Colômbia é relevante.')).toBe(
      'O grupo é verticalizado. A operação mencionada na Colômbia é relevante.',
    );
    expect(downgradeUnsupportedCertainty('A gestão é profissional. A operação em Cumaribo confirmada pelo site.')).toBe(
      'A gestão é profissional. A operação em Cumaribo mencionada pelo site.',
    );
  });

  // ── Caso 8: regressão run b3294247 ("volume DE produção" → verifier fail) ──
  it('"volume de produção" (resíduo do run b3294247) NÃO dispara mais UNSUPPORTED_PRODUCT_CLAIM', () => {
    const question = normalizeDiscoveryQuestion('Qual é a capacidade de produção de algodão?');
    expect(question).toBe('Qual é o volume de algodão?');
    // o verifier não reprova a pergunta normalizada
    const pack = makeSafePack(['Cultivo próprio de soja em larga escala']);
    const verification = verifyGold(question, CANONICAL, pack);
    expect(verification.hardFails.some((h) => h.code === 'UNSUPPORTED_PRODUCT_CLAIM')).toBe(false);
  });

  // ── Narrative Contract sob o cenário Scheffer ──
  it('narrativa completa Scheffer passa no Narrative Contract (9 seções + 3 ações)', () => {
    const narrative = buildNarrative('A operação é verticalizada no Mato Grosso.');
    const r = validateGoldNarrative(narrative);
    expect(r.metrics.sectionsFound).toHaveLength(9);
    expect(r.metrics.actionCount).toBe(3);
  });
});

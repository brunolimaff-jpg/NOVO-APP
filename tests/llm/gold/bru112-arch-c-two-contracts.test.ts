import { describe, it, expect } from 'vitest';
import { validateGoldNarrative, validateGoldContract } from '../../../services/llm/gold/gold-contract-validator';
import { buildGoldArtifact } from '../../../services/llm/gold/mermaid/mermaid-deterministic';
import type { CanonicalAccount, SafeFindingPack } from '../../../services/llm/gold/gold-contracts';

/**
 * ARCH-C (BRU-112) — Two Contracts: Narrative Contract (pré-builder) +
 * Artifact Contract/Manifest (pós-builder).
 *
 * Invariante: a narrativa humana é validável independentemente do builder; o
 * artefato determinístico prova presença/ausência justificada dos componentes
 * sem reconstrução regex da narrativa.
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

function buildNarrative(acoes = '1. Validar capacidade.\n2. Agenda discovery.\n3. Proposta piloto.'): string {
  const parts: string[] = [];
  for (const s of SECTIONS) {
    parts.push(`### ${s}`);
    if (s.includes('PRÓXIMOS')) parts.push(acoes);
    else parts.push(lorem(120));
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

describe('BRU-112 ARCH-C — Narrative Contract (pré-builder, independente do artifact)', () => {
  it('valida a narrativa SEM depender de strip do artefato final', () => {
    const r = validateGoldNarrative(buildNarrative());
    expect(r.passed).toBe(true);
    expect(r.metrics.wordCount).toBeGreaterThanOrEqual(900);
    expect(r.metrics.wordCount).toBeLessThanOrEqual(1500);
  });

  it('narrativa curta reprova (WORD_COUNT_OUT_OF_RANGE) sem artifact presente', () => {
    const r = validateGoldNarrative('texto curto sem seções');
    expect(r.passed).toBe(false);
    expect(r.violations.map((v) => v.code)).toContain('WORD_COUNT_OUT_OF_RANGE');
  });

  it('gramática canônica de ações: numeradas são a fonte única (sem Math.max ambíguo)', () => {
    const r = validateGoldNarrative(buildNarrative());
    expect(r.metrics.actionFormats).toEqual({ named: 0, tableRows: 0, numbered: 3 });
    expect(r.metrics.actionCount).toBe(3);
  });

  it('paridade: narrative contract e validateGoldContract concordam na narrativa pura', () => {
    const narrative = buildNarrative();
    // Na narrativa pura (sem mermaid/tabela), ambos devem dar o MESMO wordCount
    expect(validateGoldNarrative(narrative).metrics.wordCount).toBe(validateGoldContract(narrative).metrics.wordCount);
  });
});

describe('BRU-112 ARCH-C — Artifact Contract (manifest determinístico)', () => {
  it('builder devolve markdown + manifest com componentes esperados/emitidos', () => {
    const pack = makeSafePack([
      'Cultivo próprio de soja em larga escala',
      'Beneficiamento de algodão em pluma (UBA)',
    ]);
    const artifact = buildGoldArtifact(buildNarrative(), CANONICAL, pack);
    expect(artifact.markdown).toContain('```mermaid');
    expect(artifact.manifest.componentsEmitted).toContain('chaos-map');
    expect(artifact.manifest.componentsEmitted).toContain('teia-map');
    expect(artifact.manifest.componentsEmitted).toContain('sales-path');
    expect(artifact.manifest.componentsEmitted).toContain('value-chain-table');
    expect(artifact.manifest.valueChainTableEmitted).toBe(true);
    expect(artifact.manifest.mermaidByType['mermaid']).toBeGreaterThanOrEqual(3);
    // manifest só de metadados — sem conteúdo
    expect(JSON.stringify(artifact.manifest)).not.toContain('Cultivo próprio');
  });

  it('Mapa do Caos N/A com fatos insuficientes — expectativa respeita pré-condição', () => {
    const pack = makeSafePack(['Apenas um fato confirmado de operação.']);
    const artifact = buildGoldArtifact(buildNarrative(), CANONICAL, pack);
    const chaos = artifact.manifest.componentsExpected.find((c) => c.id === 'chaos-map');
    expect(chaos?.expected).toBe(false);
    expect(chaos?.reason).toBe('safe-pack-insufficient');
    expect(artifact.manifest.componentsEmitted).not.toContain('chaos-map');
  });

  it('componente esperado ausente = candidato a FAIL (artifact gate)', () => {
    const pack = makeSafePack([
      'Cultivo próprio de soja em larga escala',
      'Beneficiamento de algodão em pluma (UBA)',
    ]);
    const artifact = buildGoldArtifact(buildNarrative(), CANONICAL, pack);
    // Sales path é sempre esperado e sempre emitido → nenhum missing
    const missing = artifact.manifest.componentsExpected.filter(
      (c) => c.expected && !artifact.manifest.componentsEmitted.includes(c.id),
    );
    expect(missing).toEqual([]);
  });
});

import { describe, expect, it, vi } from 'vitest';
import type { CanonicalAccount, RawFindingPack } from '../../../services/llm/gold/gold-contracts';
import {
  runGuardedGoldPipeline,
  type CompactInput,
  type ComposeInput,
  type GoldPipelineDeps,
} from '../../../services/llm/gold/gold-pipeline';

/**
 * T5 — Gold pipeline/composer mínimo (TDD).
 * Orquestrador puro com compact/compose injetados. Não conhece LiteLLM,
 * HTTP, waterfall nem UI. Fronteira Raw→Safe→Frontier comprovada por spies.
 */

const canonical: CanonicalAccount = {
  inputCnpj: '04.733.767/0001-80',
  legalName: 'SCHEFFER & CIA LTDA',
  establishmentType: 'Filial',
  rootCnpj: '04.733.767',
  headOfficeCnpj: '04.733.767/0014-03',
  headOfficeLegalName: 'SCHEFFER & CIA LTDA',
  directPjPartners: [{ legalName: 'SCHEFFER PARTICIPACOES S/A', cnpj: '11.021.773/0001-70' }],
  qsaPeople: [{ name: 'ELIZEU ZULMAR MAGGI SCHEFFER', role: 'Sócio-Administrador' }],
};

function rawPack(overrides: Partial<RawFindingPack> = {}): RawFindingPack {
  return {
    module: 'gold-compact',
    accountIdentity: {
      inputCnpj: '04.733.767/0001-80',
      legalName: 'SCHEFFER & CIA LTDA',
      establishmentType: 'Filial',
      rootCnpj: '04.733.767',
      conflicts: [],
    },
    facts: [
      {
        id: 'f1',
        entity: 'SCHEFFER & CIA LTDA',
        claim: '74 módulos Senior ativos no CRM interno',
        status: 'Confirmado',
        source: 'CRM interno Senior',
        kind: 'operation',
      },
      {
        id: 'f2',
        entity: 'SCHEFFER & CIA LTDA',
        claim: 'A empresa não possui WMS',
        status: 'Confirmado',
        source: 'CRM interno Senior',
        kind: 'technology',
      },
    ],
    relationships: [
      {
        id: 'r1',
        entity: 'SCHEFFER & CIA LTDA',
        relatedEntity: '11.021.773/0001-70',
        relationType: 'partner_other_cnpj',
        status: 'Confirmado',
        source: 'socio-search',
      },
    ],
    technologySignals: [],
    people: [],
    metrics: [],
    conflicts: [],
    openQuestions: [],
    discardedClaims: [],
    ...overrides,
  };
}

const cleanGold = [
  '# Gold Brief',
  'SCHEFFER & CIA LTDA (04.733.767/0001-80) é filial em Sapezal/MT; a matriz é 04.733.767/0014-03 em Cuiabá.',
  'A sócia PJ direta é SCHEFFER PARTICIPACOES S/A (11.021.773/0001-70).',
].join('\n');

const trappedGold = ['# Gold Brief', 'Há um gap de WMS confirmado na operação logística.'].join('\n');

describe('GuardedGoldPipeline', () => {
  it('executa compact → sanitize → compose → verify e retorna o resultado', async () => {
    const compact = vi.fn(async (_input: CompactInput) => rawPack());
    const compose = vi.fn(async (_input: ComposeInput) => cleanGold);
    const deps: GoldPipelineDeps = { compact, compose };

    const result = await runGuardedGoldPipeline({ canonical, dossier: 'dossiê legado' }, deps);

    expect(compact).toHaveBeenCalledTimes(1);
    expect(compose).toHaveBeenCalledTimes(1);
    expect(result.goldBrief).toBe(cleanGold);
    expect(result.sanitizerEvents.some((e) => e.code === 'NEGATIVE_EVIDENCE_AS_ABSENCE')).toBe(true);
    expect(result.verification.passed).toBe(true);
  });

  it('comprova a fronteira: compact recebe canonical+dossier; frontier recebe apenas SafeFindingPack', async () => {
    const compact = vi.fn(async (_input: CompactInput) => rawPack());
    const compose = vi.fn(async (_input: ComposeInput) => cleanGold);
    const deps: GoldPipelineDeps = { compact, compose };

    await runGuardedGoldPipeline({ canonical, dossier: 'dossiê legado' }, deps);

    // compact recebeu canonical + dossier
    const compactInput = compact.mock.calls[0][0];
    expect(compactInput.canonical).toBe(canonical);
    expect(compactInput.dossier).toBe('dossiê legado');

    // frontier recebeu SafeFindingPack (sanitized: true) e NUNCA o Raw
    const frontierInput = compose.mock.calls[0][0];
    expect(frontierInput.safePack.sanitized).toBe(true);
    expect(frontierInput.safePack).not.toBe(rawPack());
    // o frontier NÃO recebe material bruto: sem originalPack, sem discardedClaims
    expect('originalPack' in frontierInput.safePack).toBe(false);
    expect('discardedClaims' in frontierInput.safePack).toBe(false);
    // claim removida pelo sanitizer não aparece em NENHUMA parte do payload
    expect(JSON.stringify(frontierInput)).not.toContain('não possui WMS');
  });

  it('não envia CPF ao frontier (guard do sanitizer)', async () => {
    const raw = rawPack();
    raw.facts.push({
      id: 'f-cpf',
      entity: 'PESSOA',
      claim: 'Sócio com CPF 123.456.789-00',
      status: 'Confirmado',
      source: 'QSA oficial',
      kind: 'person',
    });
    const compact = vi.fn(async (_input: CompactInput) => raw);
    const compose = vi.fn(async (_input: ComposeInput) => cleanGold);
    const deps: GoldPipelineDeps = { compact, compose };

    const result = await runGuardedGoldPipeline({ canonical, dossier: 'dossiê' }, deps);
    // asserção REAL: o CPF formatado (com pontuação) e sem pontuação
    // não podem existir em NENHUMA parte do payload do frontier
    const serializedFrontier = JSON.stringify(compose.mock.calls[0][0]);
    expect(serializedFrontier).not.toContain('123.456.789');
    expect(serializedFrontier).not.toContain('123456789');
    expect(result.sanitizerEvents.some((e) => e.code === 'CPF_LEAK')).toBe(true);
  });

  it('falha fechado quando o compactor devolve JSON fora do schema (fail-closed antes do sanitizer)', async () => {
    const compact = vi.fn(async (_input: CompactInput) => ({ module: "incompleto" } as unknown as RawFindingPack));
    const compose = vi.fn(async (_input: ComposeInput) => cleanGold);
    const deps: GoldPipelineDeps = { compact, compose };

    await expect(runGuardedGoldPipeline({ canonical, dossier: 'dossiê' }, deps)).rejects.toThrow();
    expect(compose).not.toHaveBeenCalled();
  });

  it('reprova Gold com trap (verifier captura o que escapar do sanitizer)', async () => {
    const compact = vi.fn(async (_input: CompactInput) => rawPack());
    const compose = vi.fn(async (_input: ComposeInput) => trappedGold);
    const deps: GoldPipelineDeps = { compact, compose };

    const result = await runGuardedGoldPipeline({ canonical, dossier: 'dossiê' }, deps);
    expect(result.verification.passed).toBe(false);
    expect(result.verification.hardFails.some((h) => h.code === 'NEGATIVE_EVIDENCE_AS_GAP')).toBe(true);
  });

  it('reclassifica relação lateral pela precedência canônica antes do sanitizer', async () => {
    const raw = rawPack();
    // PJ direta classificada errado como lateral pelo compactor
    raw.relationships = [
      {
        id: 'r1',
        entity: 'SCHEFFER & CIA LTDA',
        relatedEntity: '11.021.773/0001-70',
        relationType: 'partner_other_cnpj',
        status: 'Confirmado',
        source: 'socio-search',
      },
    ];
    const compact = vi.fn(async (_input: CompactInput) => raw);
    const compose = vi.fn(async (_input: ComposeInput) => cleanGold);
    const deps: GoldPipelineDeps = { compact, compose };

    await runGuardedGoldPipeline({ canonical, dossier: 'dossiê' }, deps);
    const frontierInput = compose.mock.calls[0][0];
    const direct = frontierInput.safePack.relationships.find((r) => r.relatedEntity.includes('11.021.773'));
    expect(direct?.relationType).toBe('direct_pj_relation');
  });
});

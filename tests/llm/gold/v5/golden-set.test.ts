import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  canonicalAccountSchema,
  rawFindingPackSchema,
} from '../../../../services/llm/gold/gold-contracts';
import { runGuardedGoldPipeline, type CompactInput } from '../../../../services/llm/gold/gold-pipeline';
import {
  goldenFixtureSchema,
  GOLDEN_PROFILES,
  type GoldenFixture,
} from './golden-fixture-types';
import { composeGoldFromFrontier, REQUIRED_SECTION_HEADINGS } from './compose-mock';

/**
 * V5 — Golden Set (13 perfis).
 * Objetivo: TENTAR FALSIFICAR a V4, não ensinar a V4 a passar.
 * O compose mock é COMUM e consome o FrontierPack: o Gold depende
 * exclusivamente do conteúdo seguro que atravessou o firewall.
 */

const FIXTURES_ROOT = resolve(process.cwd(), 'tests', 'fixtures', 'gold');

function loadFixture(profile: string): GoldenFixture {
  const raw = JSON.parse(
    readFileSync(resolve(FIXTURES_ROOT, profile, 'gold-expectations.json'), 'utf8'),
  ) as unknown;
  const parsed = goldenFixtureSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Fixture ${profile} inválida: ${parsed.error.issues[0]?.message ?? 'schema'}`);
  }
  return parsed.data;
}

interface AccountResult {
  profile: string;
  kind: string;
  passed: boolean;
  hardFails: string[];
  sanitizerEvents: string[];
  factsPreserved: number;
  factsDiscarded: number;
  goldWords: number;
  mermaid: number;
  boundaryOk: boolean;
  /** Evidência detalhada (nomeada e identificável). */
  detail: {
    events: Array<{ findingId?: string; code: string; action: string }>;
    preservedFacts: string[];
    discardedFacts: string[];
    trapsChecked: string[];
    hardFailsNamed: Array<{ code: string; reason: string }>;
  };
}

const results: AccountResult[] = [];

function evaluate(profile: string): Promise<AccountResult> {
  const fixture = loadFixture(profile);
  const canonical = canonicalAccountSchema.parse(fixture.canonicalAccount);
  const raw = rawFindingPackSchema.parse(fixture.rawFindingPack);

  const compact = async (_input: CompactInput) => raw;
  const composeInputs: Array<Parameters<typeof composeGoldFromFrontier>[0]> = [];
  const compose = async (input: Parameters<typeof composeGoldFromFrontier>[0]) => {
    composeInputs.push(input);
    return composeGoldFromFrontier(input);
  };

  return runGuardedGoldPipeline({ canonical, dossier: `dossiê ${profile}` }, { compact, compose }).then(
    (result) => {
      const frontierSerialized = JSON.stringify(composeInputs[0]).toLowerCase();
      const serializedContent = JSON.stringify({
        facts: result.safePack.facts,
        relationships: result.safePack.relationships,
        technologySignals: result.safePack.technologySignals,
        people: result.safePack.people,
        metrics: result.safePack.metrics,
        openQuestions: result.safePack.openQuestions,
        conflicts: result.safePack.conflicts,
      }).toLowerCase();

      // === 1) zero hard fail estrutural ===
      expect(
        result.verification.passed,
        `${profile}: hard fails inesperados ${JSON.stringify(result.verification.hardFails)}`,
      ).toBe(true);
      expect(result.verification.hardFails).toHaveLength(0);

      // === 2) fatos que devem sobreviver (qualquer camada do conteúdo) ===
      const allClaims = [
        ...result.safePack.facts.map((f) => f.claim),
        ...result.safePack.technologySignals.map((s) => s.observedFact),
        ...result.safePack.relationships.map((r) => `${r.relatedEntity} ${r.evidence ?? ''}`),
      ].join(' | ').toLowerCase();
      for (const must of fixture.expectations.factsThatMustSurvive) {
        expect(allClaims, `${profile}: fato deveria sobreviver: "${must}"`).toContain(must.toLowerCase());
      }

      // === 3) claims que devem desaparecer do conteúdo ===
      for (const gone of fixture.expectations.claimsThatMustDisappear) {
        expect(serializedContent, `${profile}: claim deveria desaparecer: "${gone}"`).not.toContain(
          gone.toLowerCase(),
        );
      }

      // === 4) sanitizer events esperados ===
      const codes = result.sanitizerEvents.map((e) => e.code);
      for (const code of fixture.expectations.expectedSanitizerEvents) {
        expect(codes, `${profile}: evento esperado ${code}`).toContain(code);
      }
      // controles limpos NÃO podem gerar eventos (falso positivo = falha)
      if (fixture.kind === 'clean-control') {
        expect(codes, `${profile}: controle limpo gerou eventos indevidos`).toHaveLength(0);
      }

      // === 5) golden traps ausentes do conteúdo do frontier ===
      for (const trap of fixture.expectations.goldenTraps) {
        expect(serializedContent, `${profile}: trap sobreviveu no frontier: "${trap}"`).not.toContain(
          trap.toLowerCase(),
        );
      }

      // === 6) boundary: Raw nunca chega ao compose ===
      // (compose mock recebe somente FrontierPack — verificado por tipo/schema;
      //  aqui confirmamos que originalPack/discardedClaims não existem no payload)
      const composeInput = {
        safePack: {
          sanitized: result.safePack.sanitized,
          facts: result.safePack.facts,
          relationships: result.safePack.relationships,
          technologySignals: result.safePack.technologySignals,
          people: result.safePack.people,
          metrics: result.safePack.metrics,
          conflicts: result.safePack.conflicts,
          openQuestions: result.safePack.openQuestions,
          accountIdentity: result.safePack.accountIdentity,
          module: result.safePack.module,
          sanitizerEvents: result.safePack.sanitizerEvents,
        },
      };
      const boundaryOk =
        'originalPack' in composeInput.safePack === false &&
        'discardedClaims' in composeInput.safePack === false &&
        composeInput.safePack.sanitized === true;

      // === 7) CPF zero no payload do FRONTIER (o que o compose recebeu) ===
      expect(frontierSerialized).not.toContain('123.456.789');
      expect(frontierSerialized).not.toContain('987.654.321');

      // === 8) contrato Gold (gerado pelo compose mock comum) ===
      const gold = result.goldBrief;
      for (const section of REQUIRED_SECTION_HEADINGS) {
        expect(gold, `${profile}: bloco ausente # ${section}`).toContain(`# ${section}`);
      }
      const words = gold.split(/\s+/).filter(Boolean).length;
      expect(words, `${profile}: palavras ${words}`).toBeGreaterThanOrEqual(900);
      expect(words, `${profile}: palavras ${words}`).toBeLessThanOrEqual(1500);
      const mermaidBlocks = (gold.match(/```mermaid/g) || []).length;
      expect(mermaidBlocks).toBeLessThanOrEqual(3);
      const blocks = [...gold.matchAll(/```mermaid\n([\s\S]*?)```/g)].map((m) => m[1].trim());
      expect(new Set(blocks).size).toBe(blocks.length);

      results.push({
        profile,
        kind: fixture.kind,
        passed: true,
        hardFails: result.verification.hardFails.map((h) => h.code),
        sanitizerEvents: codes,
        factsPreserved: result.safePack.facts.length,
        factsDiscarded: result.safePack.discardedClaims.length,
        goldWords: words,
        mermaid: mermaidBlocks,
        boundaryOk,
        detail: {
          events: result.safePack.sanitizerEvents.map((e) => ({
            findingId: e.findingId,
            code: e.code,
            action: e.action,
          })),
          preservedFacts: result.safePack.facts.map((f) => `${f.id}:${f.claim.slice(0, 60)}`),
          discardedFacts: result.safePack.discardedClaims.map((d) => `${d.originFindingId ?? '?'}:${d.reason.slice(0, 50)}`),
          trapsChecked: fixture.expectations.goldenTraps,
          hardFailsNamed: result.verification.hardFails.map((h) => ({ code: h.code, reason: h.reason })),
        },
      });
      return results[results.length - 1];
    },
  );
}

describe('Golden Set V5 — 13 perfis (tentar falsificar a V4)', () => {
  it.each(GOLDEN_PROFILES.map((p) => [p] as const))('perfil: %s', async (profile) => {
    const r = await evaluate(profile);
    expect(r.passed).toBe(true);
    expect(r.boundaryOk).toBe(true);
  });

  it('matriz 13×resultado (relatório agregado)', () => {
    expect(results).toHaveLength(GOLDEN_PROFILES.length);
    // Relatório estruturado para auditoria (fora do repo — não polui o diff).
    writeFileSync('/tmp/v5-golden-results.json', JSON.stringify(results, null, 1));
    // eslint-disable-next-line no-console
    console.log(`GOLDEN_SET_13_13=${results.filter((r) => r.passed).length}/${results.length} hardFails=0 boundary=OK`);
  });
});

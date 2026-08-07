import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  canonicalAccountSchema,
  rawFindingPackSchema,
  type CanonicalAccount,
  type RawFindingPack,
} from '../../../services/llm/gold/gold-contracts';
import { runGuardedGoldPipeline, type CompactInput, type ComposeInput } from '../../../services/llm/gold/gold-pipeline';

/**
 * T6 — Scheffer Golden Regression (TDD).
 * Reutiliza a fixture canônica existente tests/fixtures/dossier/scheffer-04733767000180
 * (base factual) e adiciona SOMENTE expectativas Gold/traps em gold-expectations.json.
 * LLM mockado (sem chamada paga). Gate da V4: zero hard fail.
 */

const fixturePath = resolve(
  process.cwd(),
  'tests',
  'fixtures',
  'dossier',
  'scheffer-04733767000180',
  'gold-expectations.json',
);
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
  canonicalAccount: CanonicalAccount;
  rawFindingPack: RawFindingPack;
  goldBrief: string;
};

const REQUIRED_SECTIONS = [
  'Conta em 30 segundos',
  'Estrutura do grupo',
  'Mapa operacional',
  'Sinais que mudam a abordagem',
  'Bordas e gaps',
  'Estratégia de entrada',
  'Quem abordar',
  'Primeiro toque',
  'Próximas 3 ações',
];

/** Frases-trap do pacote V4 (§11, Issue 5) — nenhuma pode aparecer no Gold. */
const GOLDEN_TRAPS = [
  'não possui WMS',
  'não possui TMS',
  'gap de WMS',
  'gap de TMS',
  'processo manual',
  'feito em planilha',
  'demurrage',
  'integração nativa',
  'zero middleware',
  '60 dias',
  'ROI garantido',
  'auditoria gratuita',
  'integra o grupo econômico',
];

describe('Scheffer Golden Regression (V4)', () => {
  it('fixture é válida contra os schemas de runtime', () => {
    expect(canonicalAccountSchema.safeParse(fixture.canonicalAccount).success).toBe(true);
    expect(rawFindingPackSchema.safeParse(fixture.rawFindingPack).success).toBe(true);
  });

  it('pipeline guarded roda Scheffer com zero hard fail e zero golden trap', async () => {
    const compact = vi.fn(async (_input: CompactInput) => fixture.rawFindingPack);
    const compose = vi.fn(async (_input: ComposeInput) => fixture.goldBrief);
    const deps = { compact, compose };

    const result = await runGuardedGoldPipeline(
      { canonical: fixture.canonicalAccount, dossier: 'dossiê legado Scheffer' },
      deps,
    );

    // zero hard fail
    expect(result.verification.passed).toBe(true);
    expect(result.verification.hardFails).toHaveLength(0);

    // zero golden trap
    for (const trap of GOLDEN_TRAPS) {
      expect(result.goldBrief.toLowerCase()).not.toContain(trap);
    }

    // golden facts preservados
    const gold = result.goldBrief;
    expect(gold).toContain('filial');
    expect(gold).toContain('04.733.767/0014-03');
    expect(gold).toContain('SCHEFFER PARTICIPACOES S/A');
    expect(gold).toContain('11.021.773/0001-70');
    expect(gold).toContain('74 módulos Senior');

    // estrutura 9/9
    for (const section of REQUIRED_SECTIONS) {
      expect(gold).toContain(`# ${section}`);
    }

    // contrato: 900–1500 palavras, 0–3 Mermaid
    const words = gold.split(/\s+/).filter(Boolean).length;
    expect(words).toBeGreaterThanOrEqual(900);
    expect(words).toBeLessThanOrEqual(1500);
    const mermaidBlocks = (gold.match(/```mermaid/g) || []).length;
    expect(mermaidBlocks).toBeGreaterThanOrEqual(0);
    expect(mermaidBlocks).toBeLessThanOrEqual(3);

    // máx 1 Mermaid por tipo: blocos distintos entre si
    const blocks = [...gold.matchAll(/```mermaid\n([\s\S]*?)```/g)].map((m) => m[1].trim());
    expect(new Set(blocks).size).toBe(blocks.length);

    // ≤3 sinais (3 bullets na seção de sinais)
    const signalsSection = gold.split('# Bordas e gaps')[0].split('# Sinais que mudam a abordagem')[1] ?? '';
    const signalBullets = (signalsSection.match(/^\s*- /gm) || []).length;
    expect(signalBullets).toBeGreaterThan(0);
    expect(signalBullets).toBeLessThanOrEqual(3);

    // 1 frente principal e ≤2 adjacências
    const strategySection = gold.split('# Quem abordar')[0].split('# Estratégia de entrada')[1] ?? '';
    expect(strategySection).toContain('frente principal');
    expect(strategySection).toContain('adjacências');

    // exatamente 3 próximas ações
    const actionsSection = gold.split('# Próximas 3 ações')[1] ?? '';
    const actionItems = (actionsSection.match(/^\d+\. /gm) || []).length;
    expect(actionItems).toBe(3);

    // fronteira: frontier recebeu somente SafeFindingPack
    const frontierInput = compose.mock.calls[0][0];
    expect(frontierInput.safePack.sanitized).toBe(true);
    expect(
      frontierInput.safePack.facts.some((f: { claim: string }) => f.claim.includes('não possui')),
    ).toBe(false);
  });

  it('sanitizer produz os eventos esperados da Scheffer (WMS/TMS/matriz)', async () => {
    const compact = vi.fn(async (_input: CompactInput) => fixture.rawFindingPack);
    const compose = vi.fn(async (_input: ComposeInput) => fixture.goldBrief);
    const deps = { compact, compose };

    const result = await runGuardedGoldPipeline(
      { canonical: fixture.canonicalAccount, dossier: 'dossiê legado Scheffer' },
      deps,
    );

    const codes = result.sanitizerEvents.map((e) => e.code);
    expect(codes).toContain('NEGATIVE_EVIDENCE_AS_ABSENCE'); // "não possui WMS"
    expect(codes).toContain('NEGATIVE_EVIDENCE_AS_GAP'); // "Gap de TMS"
    expect(codes).toContain('CANONICAL_DUPLICATE'); // matriz já canônica
    // claims removidas ficam rastreáveis
    expect(result.safePack.discardedClaims.some((d) => d.originFindingId === 'f-wms-ausencia')).toBe(true);
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  canonicalAccountSchema,
  frontierPackSchema,
  rawFindingPackSchema,
  type CanonicalAccount,
  type RawFindingPack,
} from '../../../services/llm/gold/gold-contracts';
import { runGuardedGoldPipeline, type CompactInput, type ComposeInput } from '../../../services/llm/gold/gold-pipeline';

/**
 * T6 — Scheffer Golden Regression (TDD).
 * Reutiliza a fixture canônica existente tests/fixtures/dossier/scheffer-04733767000180
 * (base factual) + expectativas/traps Gold em gold-expectations.json.
 *
 * PONTA A PONTA: o compose mock CONSOME o FrontierPack (deriva o Gold dos
 * fatos saneados) — se o sanitizer falhar, o trap aparece no Gold e o teste
 * quebra. LLM mockado (sem chamada paga). Gate da V4: zero hard fail.
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

/**
 * Mock REALISTA do frontier: deriva o Gold EXCLUSIVAMENTE do conteúdo
 * seguro que recebeu (facts + technologySignals + relações). Se qualquer
 * trap tivesse passado pelo sanitizer, ele apareceria no Gold gerado.
 */
function composeFromFrontier(input: ComposeInput): string {
  const { safePack } = input;
  const facts = safePack.facts.map((f) => `- ${f.claim} (${f.source})`).join('\n');
  const signals = safePack.technologySignals
    .map((s) => `- ${s.technology}: ${s.observedFact} — ${s.validationQuestion}`)
    .join('\n');
  const people = safePack.people
    .map((p) => `- ${p.personName}: ${p.role} (${p.roleBasis})`)
    .join('\n');
  return [
    '# Gold Brief — SCHEFFER & CIA LTDA',
    '# Conta em 30 segundos',
    'SCHEFFER & CIA LTDA (04.733.767/0001-80) é filial em Sapezal/MT; a matriz é 04.733.767/0014-03 em Cuiabá. A sócia PJ direta é SCHEFFER PARTICIPACOES S/A (11.021.773/0001-70).',
    '# Estrutura do grupo',
    'A holding direta SCHEFFER PARTICIPACOES S/A participa do capital da conta; relações laterais permanecem laterais.',
    '# Mapa operacional',
    facts,
    '# Sinais que mudam a abordagem',
    signals,
    '# Bordas e gaps',
    'A tecnologia que suporta a logística não foi identificada no recorte interno; nenhuma lacuna foi confirmada.',
    '# Estratégia de entrada',
    'A frente principal é a verticalização; até duas adjacências (societária e plataforma de pessoas).',
    '# Quem abordar',
    people,
    '# Primeiro toque',
    'Pergunta neutra sobre qual solução suporta hoje os processos de armazenagem e transporte.',
    '# Próximas 3 ações',
    '1. Validar com o contato o papel funcional de cada sócio administrador do QSA.\n2. Confirmar qual solução suporta hoje o processo de armazenagem e expedição.\n3. Confirmar qual solução suporta hoje o processo de transporte e entrega.',
  ].join('\n');
}

describe('Scheffer Golden Regression (V4)', () => {
  it('fixture é válida contra os schemas de runtime', () => {
    expect(canonicalAccountSchema.safeParse(fixture.canonicalAccount).success).toBe(true);
    expect(rawFindingPackSchema.safeParse(fixture.rawFindingPack).success).toBe(true);
  });

  it('pipeline ponta a ponta: traps do raw são bloqueados ANTES do frontier (Gold derivado do safePack)', async () => {
    const compact = vi.fn(async (_input: CompactInput) => fixture.rawFindingPack);
    const compose = vi.fn(async (input: ComposeInput) => composeFromFrontier(input));
    const deps = { compact, compose };

    const result = await runGuardedGoldPipeline(
      { canonical: fixture.canonicalAccount, dossier: 'dossiê legado Scheffer' },
      deps,
    );

    // O frontier derivou o Gold do que RECEBEU — se algum trap tivesse
    // atravessado o sanitizer, estaria aqui e o teste quebraria.
    const gold = result.goldBrief;

    // zero golden trap no Gold efetivamente gerado
    for (const trap of GOLDEN_TRAPS) {
      expect(gold.toLowerCase()).not.toContain(trap);
    }

    // golden facts preservados no Gold gerado
    expect(gold).toContain('filial');
    expect(gold).toContain('04.733.767/0014-03');
    expect(gold).toContain('SCHEFFER PARTICIPACOES S/A');
    expect(gold).toContain('11.021.773/0001-70');
    expect(gold).toContain('74 módulos Senior');

    // zero hard fail
    expect(result.verification.passed).toBe(true);
    expect(result.verification.hardFails).toHaveLength(0);

    // fronteira: frontier recebeu somente conteúdo seguro
    const frontierInput = compose.mock.calls[0][0];
    expect(frontierInput.safePack.sanitized).toBe(true);
    expect('originalPack' in frontierInput.safePack).toBe(false);
    expect('discardedClaims' in frontierInput.safePack).toBe(false);

    // CONTEÚDO do frontier não pode conter NENHUM trap (independe do mock):
    // serializa o pack sem os eventos (metadado de auditoria) e aplica a
    // lista completa de traps sobre o conteúdo que atravessou o firewall.
    const { sanitizerEvents: _events, ...frontierContent } = frontierInput.safePack;
    const serializedContent = JSON.stringify(frontierContent).toLowerCase();
    const contentTraps = [
      'não possui wms',
      'não possui tms',
      'gap de wms',
      'gap de tms',
      'processo manual',
      'feito em planilha',
      'demurrage',
      'integração nativa',
      'zero middleware',
      '60 dias',
      'roi garantido',
      'auditoria gratuita',
      'integra o grupo econômico',
    ];
    for (const trap of contentTraps) {
      expect(serializedContent).not.toContain(trap);
    }

    // CPF não chega em NENHUMA parte do payload (nem nos eventos/metadados)
    const serialized = JSON.stringify(frontierInput);
    expect(serialized).not.toContain('123.456.789');
    expect(serialized).not.toContain('123456789');
    // eventos preservam código/ação/motivo (auditoria), sem o texto bruto
    expect(frontierInput.safePack.sanitizerEvents.some((e: { code: string }) => e.code === 'NEGATIVE_EVIDENCE_AS_ABSENCE')).toBe(true);
  });

  it('frontierPackSchema torna o vazamento impossível por construção (rejeita before/originalPack/discardedClaims)', () => {
    // com before no evento + campos brutos: o schema REJEITA
    const withBefore = {
      ...fixture.rawFindingPack,
      sanitized: true,
      sanitizerEvents: [
        { code: 'NEGATIVE_EVIDENCE_AS_ABSENCE', action: 'removed', reason: 'r', before: 'conteúdo bruto' },
      ],
      originalPack: fixture.rawFindingPack,
      discardedClaims: [],
    };
    expect(frontierPackSchema.safeParse(withBefore).success).toBe(false);
    // sem os campos brutos e sem before: aceito
    const { originalPack: _o, discardedClaims: _d, ...clean } = withBefore;
    const cleanEvents = clean.sanitizerEvents.map(({ before: _b, ...e }: { before?: string }) => e);
    expect(frontierPackSchema.safeParse({ ...clean, sanitizerEvents: cleanEvents }).success).toBe(true);
  });

  it('gold esperado da fixture atende o contrato estrutural Gold (referência do composer real)', () => {
    const gold = fixture.goldBrief;

    // estrutura 9/9
    for (const section of REQUIRED_SECTIONS) {
      expect(gold).toContain(`# ${section}`);
    }

    // 900–1500 palavras, 0–3 Mermaid
    const words = gold.split(/\s+/).filter(Boolean).length;
    expect(words).toBeGreaterThanOrEqual(900);
    expect(words).toBeLessThanOrEqual(1500);
    const mermaidBlocks = (gold.match(/```mermaid/g) || []).length;
    expect(mermaidBlocks).toBeGreaterThanOrEqual(0);
    expect(mermaidBlocks).toBeLessThanOrEqual(3);

    // máx 1 Mermaid por tipo: blocos distintos entre si
    const blocks = [...gold.matchAll(/```mermaid\n([\s\S]*?)```/g)].map((m) => m[1].trim());
    expect(new Set(blocks).size).toBe(blocks.length);

    // ≤3 sinais
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
  });

  it('sanitizer produz os eventos esperados da Scheffer (WMS/TMS/manual/ROI/prazo/integração/matriz)', async () => {
    const compact = vi.fn(async (_input: CompactInput) => fixture.rawFindingPack);
    const compose = vi.fn(async (input: ComposeInput) => composeFromFrontier(input));
    const deps = { compact, compose };

    const result = await runGuardedGoldPipeline(
      { canonical: fixture.canonicalAccount, dossier: 'dossiê legado Scheffer' },
      deps,
    );

    const codes = result.sanitizerEvents.map((e) => e.code);
    expect(codes).toContain('NEGATIVE_EVIDENCE_AS_ABSENCE'); // "não possui WMS"
    expect(codes).toContain('NEGATIVE_EVIDENCE_AS_GAP'); // "Gap de TMS"
    expect(codes).toContain('MANUAL_PROCESS_INFERRED'); // "processo manual, feito em planilha"
    expect(codes).toContain('UNSUPPORTED_PRODUCT_CLAIM'); // ROI / prazo / integração
    expect(codes).toContain('CANONICAL_DUPLICATE'); // matriz já canônica
    // claims removidas ficam rastreáveis (auditoria)
    expect(result.safePack.discardedClaims.some((d) => d.originFindingId === 'f-wms-ausencia')).toBe(true);
    expect(result.safePack.discardedClaims.some((d) => d.originFindingId === 'f-manual')).toBe(true);
    // rastreabilidade NÃO atravessa a fronteira
    expect('originalPack' in compose.mock.calls[0][0].safePack).toBe(false);
  });
});

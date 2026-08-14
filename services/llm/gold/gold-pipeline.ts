/**
 * T5 — Gold pipeline/composer mínimo (V4 Pipeline Guarded).
 *
 * Orquestrador PURO e injetável: recebe `compact` e `compose` como
 * dependências — não conhece LiteLLM, HTTP, retry, waterfall nem UI.
 *
 * Fluxo (definição final): parse raw → resolve relations → sanitize →
 * compose → verify → return. A saída do compactor é trust boundary:
 * RawFindingPack só entra após validação zod (fail-closed).
 */
import {
  frontierPackSchema,
  rawFindingPackSchema,
  type CanonicalAccount,
  type FrontierPack,
  type RawFindingPack,
  type SafeFindingPack,
  type SanitizerEvent,
} from './gold-contracts';
import { normalizeCnpj, resolveCanonicalRelations } from './canonical-relation-resolver';
import { sanitizeFindingPack } from './finding-sanitizer';
import { verifyGold, type GoldVerificationResult } from './entity-aware-gold-verifier';
import { injectCanonicalGoldMermaids } from './mermaid/mermaid-deterministic';
import type { ScoutSegment } from '../query-planner';

export interface CompactInput {
  canonical: CanonicalAccount;
  dossier: string;
}

export interface ComposeInput {
  canonical: CanonicalAccount;
  /** Segmento operacional compartilhado pelo planner, quando disponível. */
  segment?: ScoutSegment;
  /** Somente conteúdo seguro — nunca contém originalPack nem discardedClaims. */
  safePack: FrontierPack;
}

export interface GoldPipelineDeps {
  compact: (input: CompactInput, signal?: AbortSignal) => Promise<RawFindingPack>;
  compose: (input: ComposeInput, signal?: AbortSignal) => Promise<string>;
}

export interface GuardedGoldPipelineResult {
  goldBrief: string;
  safePack: SafeFindingPack;
  sanitizerEvents: SanitizerEvent[];
  verification: GoldVerificationResult;
}

/**
 * BRU-48 — Guard estreito de vocabulário de certeza no Gold (correção na
 * fonte, verifier INTACTO). O Composer escapa do contrato e escreve
 * "confirmada/confirmado" para temas sensíveis (Colômbia/Cumaribo/
 * internacional/holding/controle). Decisão do Planejador 2026-08-11
 * (conservadora): NÃO autorizar "confirmada/o" por similaridade temática —
 * um fato Confirmado sobre exportação para a Colômbia NÃO autoriza
 * "Operação industrial confirmada em Cumaribo". Nos temas sensíveis, o
 * guard SEMPRE rebaixa o vocabulário para "mencionada/mencionado",
 * preservando a informação e removendo apenas a palavra de certeza.
 * Se o produto precisar preservar "confirmada/o", o caminho será matcher
 * estruturado (mesma entidade + categoria + direção) — não palavra
 * compartilhada.
 */
const SENSITIVE_THEME = /col[oó]mbia|cumaribo|internacional|holding|control/i;
const CONFIRMED_VOCABULARY = /\bconfirmad(a|o)s?\b/gi;
/**
 * LOTE GOLD P0 (RED C): sentenças com NEGAÇÃO explícita já são
 * epistemicamente seguras — reescrever "confirmada" nelas fabricaria uma
 * afirmação ("não está mencionada" deixa de ser negação reconhecida pelo
 * verifier). Negação nunca é tocada pelo downgrade de certeza.
 */
const NEGATION_PATTERN = /\b(n[aã]o|nunca|jamais|sem|aus[eê]ncia)\b/i;

/**
 * BRU44-GOLD-COMPOSER-PREFLIGHT-PRUNE-01 — preflight determinístico da saída
 * do Composer. Reusa o verifyGold como fonte ÚNICA da política semântica
 * (não duplica regex nem regras). Remove linhas cujos únicos hard fails
 * pertencem às três famílias-alvo do Patch B; linhas com qualquer outro hard
 * fail não são tocadas (anti-mascaramento). PROMOTED_CLAIM é tratado pelo
 * guard BRU-48 final e não causa remoção aqui.
 */
const PREFLIGHT_TARGET_CODES = new Set([
  'NEGATIVE_EVIDENCE_AS_ABSENCE',
  'NEGATIVE_EVIDENCE_AS_GAP',
  'ABSENCE_DERIVED_WEAKNESS',
  'UNSUPPORTED_PRODUCT_CLAIM',
]);

export function composerSemanticPreflight(
  gold: string,
  canonical: CanonicalAccount,
  safePack: SafeFindingPack,
): string {
  return gold
    .split('\n')
    .map((line) => {
      if (!line.trim()) return line;
      const codes = verifyGold(line, canonical, safePack).hardFails.map((h) => h.code);
      const hasTarget = codes.some((c) => PREFLIGHT_TARGET_CODES.has(c));
      if (!hasTarget) return line;
      const hasNonTarget = codes.some((c) => !PREFLIGHT_TARGET_CODES.has(c) && c !== 'PROMOTED_CLAIM');
      return hasNonTarget ? line : '';
    })
    .join('\n');
}

/** CNPJ formatado (mesma regex usada pelo verifier para proteger antes do split). */
const CNPJ_PATTERN = /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g;

/**
 * RCA-02 — representação TEXTUAL do Frontier para o probe pré-Composer.
 * O Composer consome o FrontierPack serializado; o probe reúne apenas os
 * VALORES textuais semanticamente avaliáveis (frases de claims, sinais,
 * perguntas abertas, evidências de relação, métricas, conflitos e claims
 * reescritas pelo sanitizer) — uma linha por item. Nomes de campos e
 * estrutura JSON ficam FORA (não fabricam semântica); people fica fora
 * (papel sem frase não carrega material das famílias-alvo e nomes de
 * pessoas não atravessam nem o probe).
 */
export function buildFrontierProbeText(frontier: FrontierPack): string {
  const lines: string[] = [];
  for (const fact of frontier.facts ?? []) {
    if (fact.claim?.trim()) lines.push(fact.claim);
  }
  for (const signal of frontier.technologySignals ?? []) {
    if (signal.observedFact?.trim()) lines.push(signal.observedFact);
    if (signal.validationQuestion?.trim()) lines.push(signal.validationQuestion);
    if (signal.whatIsNotKnown?.trim()) lines.push(signal.whatIsNotKnown);
  }
  for (const question of frontier.openQuestions ?? []) {
    if (question.trim()) lines.push(question);
  }
  for (const relationship of frontier.relationships ?? []) {
    if (relationship.evidence?.trim()) lines.push(relationship.evidence);
  }
  for (const metric of frontier.metrics ?? []) {
    const value = [metric.metric, metric.value].filter((part) => part?.trim()).join(': ');
    if (value.trim()) lines.push(value);
  }
  for (const conflict of frontier.conflicts ?? []) {
    if (conflict.trim()) lines.push(conflict);
  }
  for (const event of frontier.sanitizerEvents ?? []) {
    if (event.after?.trim()) lines.push(event.after);
  }
  return lines.join('\n');
}

export function downgradeUnsupportedCertainty(gold: string): string {
  // PATCH-C — protege CNPJs formatados (contêm pontos) ANTES de segmentar:
  // o ponto dentro de 04.733.767/0001-80 não pode separar tema sensível de
  // vocabulário de certeza (mesma semântica de sentença do verifier).
  const placeholders: string[] = [];
  const protectedGold = gold.replace(CNPJ_PATTERN, (m) => {
    placeholders.push(m);
    return `__CNPJ${placeholders.length - 1}__`;
  });
  const downgraded = protectedGold
    .split(/([.;!?\n]+)/)
    .map((part, index) => {
      // Partes ímpares são os separadores — preservados intactos.
      if (index % 2 === 1) return part;
      if (!SENSITIVE_THEME.test(part)) return part;
      if (NEGATION_PATTERN.test(part)) return part;
      return part.replace(CONFIRMED_VOCABULARY, (match) => {
        const feminine = /a$/i.test(match);
        const plural = /s$/i.test(match);
        const base = feminine ? (plural ? 'mencionadas' : 'mencionada') : (plural ? 'mencionados' : 'mencionado');
        return /^[A-Z]/.test(match) ? base.charAt(0).toUpperCase() + base.slice(1) : base;
      });
    })
    .join('');
  return downgraded.replace(/__CNPJ(\d+)__/g, (_, i) => placeholders[Number(i)]);
}

/**
 * BRU-33 — Telemetria por etapa do pipeline (sem conteúdo sensível).
 * Permite ao runtime remoto provar QUAL etapa falhou entre compact e compose
 * (veredito do Planejador 2026-08-09: o reason único "verifier_ou_contract_fail"
 * é enganoso). Cada evento carrega apenas métricas (chars/counts/path de issue)
 * e mensagens curtas — nunca o conteúdo do dossiê/Gold nem nomes de pessoas.
 */
export type GoldStage =
  | 'compact-start'
  | 'compact-response'
  | 'compact-error'
  | 'raw-schema-ok'
  | 'raw-schema-fail'
  | 'sanitize-done'
  | 'frontier-schema-ok'
  | 'frontier-schema-fail'
  | 'compose-start'
  | 'compose-done'
  | 'mermaid-inject'
  | 'verifier-done'
  // LOTE GOLD P0 R2-B — fronteiras estruturais de diagnóstico (telemetria
  // pura: hardFails/codes/codeCounts; nunca reason/claim/conteúdo).
  | 'diagnostics-pre-compose'
  | 'diagnostics-post-preflight'
  | 'diagnostics-post-mermaid'
  | 'diagnostics-post-certainty'
  // Emitidos pelo seam (fora do pipeline): cadastro canônico e contrato.
  | 'canonical-done'
  | 'contract-done'
  // BRU-69 (B+): tipo de saída final selecionada pelo seam.
  | 'output-selected';

export interface GoldStageDetail {
  chars?: number;
  issues?: number;
  firstIssuePath?: string;
  events?: number;
  hardFails?: number;
  /** Códigos dos hard fails do verifier (diagnóstico runtime, PACK_FORENSIC_REPLAY). */
  codes?: string[];
  /** Contagem por código, sem frases ou claims do Gold. */
  codeCounts?: Record<string, number>;
  resolved?: boolean;
  passed?: boolean;
  detail?: string;
  /** BRU-69 (B+): kind da saída final (gold_pass | factual_minimal | controlled_unavailable). */
  kind?: 'gold_pass' | 'factual_minimal' | 'controlled_unavailable';
  /** BRU-69 (B+): razão da rejeição quando a saída não é gold_pass. */
  reason?: string;
}

export type GoldStageHandler = (stage: GoldStage, detail?: GoldStageDetail) => void;

/**
 * LOTE GOLD P0 R2-B — resumo estrutural de uma fronteira do verifier para
 * TELEMETRIA: somente contagem e códigos, sem reason/claim/conteúdo.
 */
function frontierSummary(verification: GoldVerificationResult): GoldStageDetail {
  const codes = verification.hardFails.map((hardFail) => hardFail.code);
  const codeCounts = codes.reduce<Record<string, number>>((counts, code) => {
    counts[code] = (counts[code] ?? 0) + 1;
    return counts;
  }, {});
  return { hardFails: verification.hardFails.length, codes, codeCounts };
}

export async function runGuardedGoldPipeline(
  input: { canonical: CanonicalAccount; dossier: string; segment?: ScoutSegment },
  deps: GoldPipelineDeps,
  signal?: AbortSignal,
  onStage?: GoldStageHandler,
): Promise<GuardedGoldPipelineResult> {
  // 1) Compact → parse (fail-closed antes do sanitizer).
  onStage?.('compact-start', { chars: input.dossier.length });
  let compactOutput: RawFindingPack;
  try {
    compactOutput = await deps.compact(
      {
        canonical: input.canonical,
        dossier: input.dossier,
      },
      signal,
    );
  } catch (error) {
    // Inclui falha do parseJsonPayload do adapter (JSON inválido do LLM) e
    // erros de transporte — a mensagem curta identifica qual foi.
    onStage?.('compact-error', {
      detail: error instanceof Error ? error.message.slice(0, 200) : String(error),
    });
    throw error;
  }
  onStage?.('compact-response', { chars: JSON.stringify(compactOutput).length });

  const parsed = rawFindingPackSchema.safeParse(compactOutput);
  if (!parsed.success) {
    onStage?.('raw-schema-fail', {
      issues: parsed.error.issues.length,
      firstIssuePath: parsed.error.issues[0]?.path.join('.') ?? '?',
      detail: parsed.error.issues[0]?.message ?? 'JSON inválido',
    });
    const detail = parsed.error.issues[0]?.message ?? 'JSON inválido';
    throw new Error(`RawFindingPack fora do schema (fail-closed): ${detail}`);
  }
  onStage?.('raw-schema-ok');
  const raw: RawFindingPack = parsed.data;

  // 2) Resolve relations — precedência canônica reclassifica as relações do pack.
  const resolved = resolveCanonicalRelations(
    input.canonical,
    raw.relationships.map((r) => ({
      cnpj: r.relatedEntity,
      legalName: r.relatedEntity,
      source: r.source,
    })),
  );
  const relationships = raw.relationships.map((r) => {
    const digits = normalizeCnpj(r.relatedEntity);
    const canonicalRelation = digits ? resolved.find((x) => x.relatedCnpj === digits) : undefined;
    return canonicalRelation && canonicalRelation.relationType !== r.relationType
      ? { ...r, relationType: canonicalRelation.relationType }
      : r;
  });

  // 3) Sanitize — Raw → Safe (marca sanitized: true).
  const safePack = sanitizeFindingPack({ ...raw, relationships }, input.canonical);
  onStage?.('sanitize-done', { events: safePack.sanitizerEvents.length });

  // 4) Compose — o frontier recebe SOMENTE conteúdo seguro: SafeFindingPack
  //    SEM originalPack, SEM discardedClaims e SEM o texto bruto dos eventos
  //    (sanitizerEvents sem `before` — a claim removida não atravessa).
  const { originalPack: _originalPack, discardedClaims: _discardedClaims, sanitizerEvents, ...frontierRest } = safePack;
  const frontierEvents = sanitizerEvents.map(({ before: _before, ...event }) => event);
  let frontierInput: FrontierPack;
  try {
    frontierInput = frontierPackSchema.parse({ ...frontierRest, sanitizerEvents: frontierEvents });
  } catch (error) {
    const issues = (error as { issues?: Array<{ path?: PropertyKey[]; message?: string }> }).issues;
    onStage?.('frontier-schema-fail', {
      issues: issues?.length,
      firstIssuePath: issues?.[0]?.path?.join('.') ?? '?',
      detail: issues?.[0]?.message ?? 'FrontierPack fora do schema',
    });
    throw error;
  }
  onStage?.('frontier-schema-ok');
  // RCA-02 — fronteira discriminante PRÉ-COMPOSER (observabilidade pura):
  // mede o conteúdo TEXTUAL do Frontier (o mesmo material consumido pelo
  // Composer) com o verifyGold — fonte única da política semântica. Permite
  // atribuir PROMOTED_CLAIM/RELATIONSHIP_INVERTED a H1 (a entrada segura já
  // carrega o material) ou H2 (nasce no texto do Composer). Telemetria
  // estrutural apenas (frontierSummary); o probe não altera goldBrief,
  // safePack, verifier nem a decisão final.
  const preComposeVerification = verifyGold(buildFrontierProbeText(frontierInput), input.canonical, safePack);
  onStage?.('diagnostics-pre-compose', frontierSummary(preComposeVerification));
  onStage?.('compose-start', { chars: JSON.stringify(frontierInput).length });
  const goldBrief = await deps.compose({ canonical: input.canonical, safePack: frontierInput, segment: input.segment }, signal);
  onStage?.('compose-done', { chars: goldBrief.length });

  // 4b) Composer semantic preflight (BRU44-GOLD-COMPOSER-PREFLIGHT-PRUNE-01):
  // remove linhas do Composer cujos únicos hard fails são as três famílias
  // do Patch B (negação de posse, fraqueza sem proveniência, claim sem
  // suporte). Reusa o verifyGold — não replica política semântica.
  const goldPruned = composerSemanticPreflight(goldBrief, input.canonical, safePack);
  // LOTE GOLD P0 R2-B — diagnóstico estrutural de fronteira (SEM mudança
  // semântica): o verifyGold roda aqui apenas para TELEMETRIA — codes/counts
  // por fronteira, sem reason/claim/conteúdo. Permite localizar onde um hard
  // fail nasce/sobrevive sem nova rodada cega.
  const postPreflightVerification = verifyGold(goldPruned, input.canonical, safePack);
  onStage?.('diagnostics-post-preflight', frontierSummary(postPreflightVerification));

  // 4c) EXPERIENCE-01C — Mermaid determinístico (CANONICAL MERMAID):
  // o Composer NÃO escreve mais código Mermaid; os 3 mapas são montados
  // aqui com a gramática/paleta literal do Scout (graph LR + classDef
  // core/satellite/danger/warning/neutral). O Verifier roda sobre o Gold
  // JÁ com os mapas finais (contrato do Planejador 2026-08-10).
  const goldWithMermaids = injectCanonicalGoldMermaids(goldPruned, input.canonical, safePack, input.segment);
  onStage?.('mermaid-inject', { chars: goldWithMermaids.length });
  const postMermaidVerification = verifyGold(goldWithMermaids, input.canonical, safePack);
  onStage?.('diagnostics-post-mermaid', frontierSummary(postMermaidVerification));

  // 4c) BRU-48 — rebaixa vocabulário de certeza não sustentado na FRONTEIRA
  // FINAL (pós-Mermaid, pré-verifier). Uma única chamada protege o texto do
  // Composer E o conteúdo determinístico introduzido pelo builder
  // (POST-MERMAID-INVARIANT-01: PROMOTED_CLAIM pós-guard).
  const goldDowngraded = downgradeUnsupportedCertainty(goldWithMermaids);

  // 5) Verify — barreira final sobre o Gold (com os Mermaid determinísticos).
  const verification = verifyGold(goldDowngraded, input.canonical, safePack);
  const codeCounts = verification.hardFails.reduce<Record<string, number>>((counts, hardFail) => {
    counts[hardFail.code] = (counts[hardFail.code] ?? 0) + 1;
    return counts;
  }, {});
  // R2-B: post-certainty É a mesma fronteira do verifier final (mesmo input
  // goldDowngraded) — emitido do MESMO resultado, sem chamada extra.
  onStage?.('diagnostics-post-certainty', { hardFails: verification.hardFails.length, codes: verification.hardFails.map((hardFail) => hardFail.code), codeCounts });
  onStage?.('verifier-done', {
    hardFails: verification.hardFails.length,
    codes: verification.hardFails.map((hardFail) => hardFail.code),
    codeCounts,
  });

  return {
    goldBrief: goldDowngraded,
    safePack,
    sanitizerEvents: safePack.sanitizerEvents,
    verification,
  };
}

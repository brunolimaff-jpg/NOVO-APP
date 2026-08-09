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

export interface CompactInput {
  canonical: CanonicalAccount;
  dossier: string;
}

export interface ComposeInput {
  canonical: CanonicalAccount;
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
  | 'verifier-done'
  // Emitidos pelo seam (fora do pipeline): cadastro canônico e contrato.
  | 'canonical-done'
  | 'contract-done';

export interface GoldStageDetail {
  chars?: number;
  issues?: number;
  firstIssuePath?: string;
  events?: number;
  hardFails?: number;
  resolved?: boolean;
  passed?: boolean;
  detail?: string;
}

export type GoldStageHandler = (stage: GoldStage, detail?: GoldStageDetail) => void;

export async function runGuardedGoldPipeline(
  input: { canonical: CanonicalAccount; dossier: string },
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
  onStage?.('compose-start', { chars: JSON.stringify(frontierInput).length });
  const goldBrief = await deps.compose({ canonical: input.canonical, safePack: frontierInput }, signal);
  onStage?.('compose-done', { chars: goldBrief.length });

  // 5) Verify — barreira final sobre o Gold.
  const verification = verifyGold(goldBrief, input.canonical, safePack);
  onStage?.('verifier-done', { hardFails: verification.hardFails.length });

  return {
    goldBrief,
    safePack,
    sanitizerEvents: safePack.sanitizerEvents,
    verification,
  };
}

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
  compact: (input: CompactInput) => Promise<RawFindingPack>;
  compose: (input: ComposeInput) => Promise<string>;
}

export interface GuardedGoldPipelineResult {
  goldBrief: string;
  safePack: SafeFindingPack;
  sanitizerEvents: SanitizerEvent[];
  verification: GoldVerificationResult;
}

export async function runGuardedGoldPipeline(
  input: { canonical: CanonicalAccount; dossier: string },
  deps: GoldPipelineDeps,
): Promise<GuardedGoldPipelineResult> {
  // 1) Compact → parse (fail-closed antes do sanitizer).
  const compactOutput = await deps.compact({
    canonical: input.canonical,
    dossier: input.dossier,
  });
  const parsed = rawFindingPackSchema.safeParse(compactOutput);
  if (!parsed.success) {
    const detail = parsed.error.issues[0]?.message ?? 'JSON inválido';
    throw new Error(`RawFindingPack fora do schema (fail-closed): ${detail}`);
  }
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

  // 4) Compose — o frontier recebe SOMENTE conteúdo seguro: SafeFindingPack
  //    SEM originalPack, SEM discardedClaims e SEM o texto bruto dos eventos
  //    (sanitizerEvents sem `before` — a claim removida não atravessa).
  const { originalPack: _originalPack, discardedClaims: _discardedClaims, sanitizerEvents, ...frontierRest } = safePack;
  const frontierEvents = sanitizerEvents.map(({ before: _before, ...event }) => event);
  const frontierInput = frontierPackSchema.parse({ ...frontierRest, sanitizerEvents: frontierEvents });
  const goldBrief = await deps.compose({ canonical: input.canonical, safePack: frontierInput });

  // 5) Verify — barreira final sobre o Gold.
  const verification = verifyGold(goldBrief, input.canonical, safePack);

  return {
    goldBrief,
    safePack,
    sanitizerEvents: safePack.sanitizerEvents,
    verification,
  };
}

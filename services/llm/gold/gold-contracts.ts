/**
 * V4 — Pipeline Guarded: contratos Gold (schema zod + tipos inferidos).
 *
 * Fonte canônica: PACOTE_CANONICO_SCOUT_V4.md (2026-08-07) §§7–9 e
 * "Definição final V4" do Planejador (2026-08-07).
 *
 * Regra: UM arquivo — schema zod é a fonte; tipos saem via `z.infer`.
 * A saída JSON do compactor é trust boundary: RawFindingPack só entra
 * no pipeline após `rawFindingPackSchema.safeParse` (fail-closed).
 */
import { z } from 'zod';

export const FINDING_STATUSES = [
  'Confirmado',
  'Pista forte',
  'Pista inicial',
  'Fonte secundária',
  'Informação do usuário',
  'A validar',
] as const;
export const findingStatusSchema = z.enum(FINDING_STATUSES);
export type FindingStatus = z.infer<typeof findingStatusSchema>;

export const FINDING_KINDS = [
  'identity',
  'relationship',
  'operation',
  'technology',
  'metric',
  'person',
  'trigger',
  'financial',
] as const;
export const findingKindSchema = z.enum(FINDING_KINDS);
export type FindingKind = z.infer<typeof findingKindSchema>;

/** Precedência canônica: same_root > direct_pj_relation > partner_other_cnpj. */
export const RELATION_TYPES = ['same_root', 'direct_pj_relation', 'partner_other_cnpj'] as const;
export const relationTypeSchema = z.enum(RELATION_TYPES);
export type RelationType = z.infer<typeof relationTypeSchema>;

export const establishmentTypeSchema = z.enum(['Matriz', 'Filial']);
export type EstablishmentType = z.infer<typeof establishmentTypeSchema>;

export const findingSchema = z
  .object({
    id: z.string().min(1),
    entity: z.string().min(1),
    claim: z.string().min(1),
    status: findingStatusSchema,
    source: z.string().min(1),
    sourceDate: z.string().nullable().optional(),
    kind: findingKindSchema,
    process: z.string().nullable().optional(),
  })
  .strict();
export type Finding = z.infer<typeof findingSchema>;

export const technologySignalSchema = z
  .object({
    technology: z.string().min(1),
    observedFact: z.string().min(1),
    status: findingStatusSchema,
    whatIsNotKnown: z.string().min(1),
    validationQuestion: z.string().min(1),
  })
  .strict();
export type TechnologySignal = z.infer<typeof technologySignalSchema>;

export const relationshipFindingSchema = z
  .object({
    id: z.string().min(1),
    entity: z.string().min(1),
    relatedEntity: z.string().min(1),
    relationType: relationTypeSchema,
    status: findingStatusSchema,
    source: z.string().min(1),
    sourceDate: z.string().nullable().optional(),
    evidence: z.string().nullable().optional(),
  })
  .strict();
export type RelationshipFinding = z.infer<typeof relationshipFindingSchema>;

export const personFindingSchema = z
  .object({
    id: z.string().min(1),
    personName: z.string().min(1),
    role: z.string().min(1),
    /** QSA é mapa de acesso, não prova de cargo funcional. */
    roleBasis: z.enum(['qsa', 'official', 'report']),
    status: findingStatusSchema,
    source: z.string().min(1),
  })
  .strict();
export type PersonFinding = z.infer<typeof personFindingSchema>;

export const metricFindingSchema = z
  .object({
    id: z.string().min(1),
    entity: z.string().min(1),
    metric: z.string().min(1),
    value: z.string().nullable().optional(),
    status: findingStatusSchema,
    source: z.string().min(1),
  })
  .strict();
export type MetricFinding = z.infer<typeof metricFindingSchema>;

export const discardedClaimSchema = z
  .object({
    claim: z.string().min(1),
    reason: z.string().min(1),
    originFindingId: z.string().nullable().optional(),
  })
  .strict();
export type DiscardedClaim = z.infer<typeof discardedClaimSchema>;

export const accountIdentitySchema = z
  .object({
    inputCnpj: z.string().min(1),
    legalName: z.string().min(1),
    establishmentType: establishmentTypeSchema,
    rootCnpj: z.string().min(1),
    conflicts: z.array(z.string()),
  })
  .strict();
export type AccountIdentity = z.infer<typeof accountIdentitySchema>;

/** Pack do compactor (não confiável) — só entra validado por este schema. */
export const rawFindingPackSchema = z
  .object({
    module: z.string().min(1),
    accountIdentity: accountIdentitySchema,
    facts: z.array(findingSchema),
    relationships: z.array(relationshipFindingSchema),
    technologySignals: z.array(technologySignalSchema),
    people: z.array(personFindingSchema),
    metrics: z.array(metricFindingSchema),
    conflicts: z.array(z.string()),
    openQuestions: z.array(z.string()),
    discardedClaims: z.array(discardedClaimSchema),
  })
  .strict();
export type RawFindingPack = z.infer<typeof rawFindingPackSchema>;

export const SANITIZER_EVENT_CODES = [
  'NEGATIVE_EVIDENCE_AS_ABSENCE',
  'NEGATIVE_EVIDENCE_AS_GAP',
  'MANUAL_PROCESS_INFERRED',
  'LATERAL_PROMOTED',
  'QSA_AS_DECISOR',
  'MODULE_AS_PROCESS_PROOF',
  'UNSUPPORTED_PRODUCT_CLAIM',
  'CANONICAL_DUPLICATE',
  'ENTITY_CONFLICT',
  'CPF_LEAK',
] as const;
export const sanitizerEventCodeSchema = z.enum(SANITIZER_EVENT_CODES);
export type SanitizerEventCode = z.infer<typeof sanitizerEventCodeSchema>;

export const sanitizerActionSchema = z.enum(['removed', 'downgraded', 'rewritten', 'deduplicated']);
export type SanitizerAction = z.infer<typeof sanitizerActionSchema>;

export const sanitizerEventSchema = z
  .object({
    findingId: z.string().optional(),
    code: sanitizerEventCodeSchema,
    action: sanitizerActionSchema,
    before: z.string().optional(),
    after: z.string().optional(),
    reason: z.string().min(1),
  })
  .strict();
export type SanitizerEvent = z.infer<typeof sanitizerEventSchema>;

/**
 * Pack saneado. `sanitized` é literal true validado pelo schema — a marca
 * inequívoca de que o frontier nunca recebeu um Raw.
 */
export const safeFindingPackSchema = rawFindingPackSchema
  .omit({ discardedClaims: true })
  .extend({
    sanitized: z.literal(true),
    sanitizerEvents: z.array(sanitizerEventSchema),
    discardedClaims: z.array(discardedClaimSchema),
    originalPack: z.lazy(() => rawFindingPackSchema),
  })
  .strict();
export type SafeFindingPack = z.infer<typeof safeFindingPackSchema>;

/**
 * Payload que o frontier (compose) recebe: SafeFindingPack SEM o material
 * bruto (originalPack), SEM claims descartadas e com eventos cujo texto
 * bruto (`before`) é IMPOSSÍVEL por construção (o schema rejeita a chave).
 * Rastreabilidade completa (sanitized, sanitizerEvents code/action/reason,
 * fatos saneados) permanece; conteúdo que o sanitizer deveria impedir
 * NUNCA atravessa esta fronteira.
 */
export const frontierSanitizerEventSchema = sanitizerEventSchema.omit({ before: true });
export type FrontierSanitizerEvent = z.infer<typeof frontierSanitizerEventSchema>;

export const frontierPackSchema = safeFindingPackSchema
  .omit({ originalPack: true, discardedClaims: true })
  .extend({ sanitizerEvents: z.array(frontierSanitizerEventSchema) });
export type FrontierPack = z.infer<typeof frontierPackSchema>;

export const entityMentionSchema = z
  .object({
    cnpj: z.string().min(1),
    legalName: z.string().optional(),
    establishmentType: establishmentTypeSchema.optional(),
  })
  .strict();
export type EntityMention = z.infer<typeof entityMentionSchema>;

/** Identidade cadastral determinística (domínio genérico — Scheffer é fixture, não domínio). Nunca contém CPF. */
export const canonicalAccountSchema = z
  .object({
    inputCnpj: z.string().min(1),
    legalName: z.string().min(1),
    establishmentType: establishmentTypeSchema,
    rootCnpj: z.string().min(1),
    headOfficeCnpj: z.string().nullable().optional(),
    headOfficeLegalName: z.string().nullable().optional(),
    directPjPartners: z.array(z.object({ legalName: z.string(), cnpj: z.string() })),
    qsaPeople: z.array(z.object({ name: z.string(), role: z.string() })),
  })
  .strict();
export type CanonicalAccount = z.infer<typeof canonicalAccountSchema>;

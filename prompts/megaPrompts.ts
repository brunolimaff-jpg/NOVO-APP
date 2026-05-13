// Barrel assíncrono para lazy-loading dos prompts mega.
// foundation.ts (58KB) e specialist-prompts.ts (71KB) não entram mais no bundle inicial.

export type {
  InvestigationBuildOptions,
  InvestigationPayload,
} from './mega/contracts';

// Tipos exportados via dynamic import para os consumidores
export interface LoadedPromptBlocks {
  SHARED_FOUNDATION_BLOCK: string;
  SHARED_FOUNDATION_BLOCK_V5: string;
  SHARED_ABSENCE_SEMANTICS_BLOCK: string;
  SHARED_ANTI_R_INFLATION_RULES_BLOCK: string;
  SHARED_BUSINESS_TRANSLATION_ENGINE_BLOCK: string;
  SHARED_COST_OF_DELAY_ENGINE_BLOCK: string;
  SHARED_CROSS_PROMPT_ARBITRATION_BLOCK: string;
  SHARED_DISCREPANCY_HUNTER_BLOCK: string;
  SHARED_ENTITY_RESOLUTION_BLOCK: string;
  SHARED_EVIDENCE_HIERARCHY_BLOCK: string;
  SHARED_EXECUTIVE_PRESSURE_ENGINE_BLOCK: string;
  SHARED_FINAL_RECONCILIATION_BLOCK: string;
  SHARED_INCUMBENT_WEAKNESS_ENGINE_BLOCK: string;
  SHARED_PARSER_GUARD_BLOCK: string;
  SHARED_RECENCY_POLICY_BLOCK: string;
}

export interface LoadedSpecialistPrompts {
  PROMPT_RAIO_X_OPERACIONAL_ATAQUE: string;
  PROMPT_TECH_STACK_GOD_MODE_ATAQUE: string;
  PROMPT_RISCOS_COMPLIANCE_GOD_MODE: string;
  PROMPT_RADAR_EXPANSAO_GOD_MODE: string;
  PROMPT_RH_SINDICATOS_GOD_MODE: string;
  PROMPT_MAPEAMENTO_DECISORES_GOD_MODE: string;
  PROMPT_ORCAMENTO_JANELA_GOD_MODE: string;
}

export interface LoadedBuilders {
  SHARED_FOUNDATION_BLOCK: string;
  PROMPT_VERSION: string;
  buildInvestigationHiddenPrompt: typeof import('./mega/builders').buildInvestigationHiddenPrompt;
  buildLegacyCompatibleHiddenPrompt: typeof import('./mega/builders').buildLegacyCompatibleHiddenPrompt;
}

let blocksCache: LoadedPromptBlocks | null = null;
let specialistCache: LoadedSpecialistPrompts | null = null;
let buildersCache: LoadedBuilders | null = null;

export async function loadFoundationBlocks(): Promise<LoadedPromptBlocks> {
  if (blocksCache) return blocksCache;
  const mod = await import('./mega/foundation');
  blocksCache = {
    SHARED_FOUNDATION_BLOCK_V5: mod.SHARED_FOUNDATION_BLOCK_V5,
    SHARED_ABSENCE_SEMANTICS_BLOCK: mod.SHARED_ABSENCE_SEMANTICS_BLOCK,
    SHARED_ANTI_R_INFLATION_RULES_BLOCK: mod.SHARED_ANTI_R_INFLATION_RULES_BLOCK,
    SHARED_BUSINESS_TRANSLATION_ENGINE_BLOCK: mod.SHARED_BUSINESS_TRANSLATION_ENGINE_BLOCK,
    SHARED_COST_OF_DELAY_ENGINE_BLOCK: mod.SHARED_COST_OF_DELAY_ENGINE_BLOCK,
    SHARED_CROSS_PROMPT_ARBITRATION_BLOCK: mod.SHARED_CROSS_PROMPT_ARBITRATION_BLOCK,
    SHARED_DISCREPANCY_HUNTER_BLOCK: mod.SHARED_DISCREPANCY_HUNTER_BLOCK,
    SHARED_ENTITY_RESOLUTION_BLOCK: mod.SHARED_ENTITY_RESOLUTION_BLOCK,
    SHARED_EVIDENCE_HIERARCHY_BLOCK: mod.SHARED_EVIDENCE_HIERARCHY_BLOCK,
    SHARED_EXECUTIVE_PRESSURE_ENGINE_BLOCK: mod.SHARED_EXECUTIVE_PRESSURE_ENGINE_BLOCK,
    SHARED_FINAL_RECONCILIATION_BLOCK: mod.SHARED_FINAL_RECONCILIATION_BLOCK,
    SHARED_INCUMBENT_WEAKNESS_ENGINE_BLOCK: mod.SHARED_INCUMBENT_WEAKNESS_ENGINE_BLOCK,
    SHARED_PARSER_GUARD_BLOCK: mod.SHARED_PARSER_GUARD_BLOCK,
    SHARED_RECENCY_POLICY_BLOCK: mod.SHARED_RECENCY_POLICY_BLOCK,
    // Maintain backward-compatible alias
    SHARED_FOUNDATION_BLOCK: mod.SHARED_FOUNDATION_BLOCK_V5,
  };
  return blocksCache;
}

export async function loadSpecialistPrompts(): Promise<LoadedSpecialistPrompts> {
  if (specialistCache) return specialistCache;
  const mod = await import('./mega/specialist-prompts');
  specialistCache = {
    PROMPT_RAIO_X_OPERACIONAL_ATAQUE: mod.PROMPT_RAIO_X_OPERACIONAL_ATAQUE,
    PROMPT_TECH_STACK_GOD_MODE_ATAQUE: mod.PROMPT_TECH_STACK_GOD_MODE_ATAQUE,
    PROMPT_RISCOS_COMPLIANCE_GOD_MODE: mod.PROMPT_RISCOS_COMPLIANCE_GOD_MODE,
    PROMPT_RADAR_EXPANSAO_GOD_MODE: mod.PROMPT_RADAR_EXPANSAO_GOD_MODE,
    PROMPT_RH_SINDICATOS_GOD_MODE: mod.PROMPT_RH_SINDICATOS_GOD_MODE,
    PROMPT_MAPEAMENTO_DECISORES_GOD_MODE: mod.PROMPT_MAPEAMENTO_DECISORES_GOD_MODE,
    PROMPT_ORCAMENTO_JANELA_GOD_MODE: mod.PROMPT_ORCAMENTO_JANELA_GOD_MODE,
  };
  return specialistCache;
}

export async function loadBuilders(): Promise<LoadedBuilders> {
  if (buildersCache) return buildersCache;
  const mod = await import('./mega/builders');
  buildersCache = {
    SHARED_FOUNDATION_BLOCK: mod.SHARED_FOUNDATION_BLOCK,
    PROMPT_VERSION: mod.PROMPT_VERSION,
    buildInvestigationHiddenPrompt: mod.buildInvestigationHiddenPrompt,
    buildLegacyCompatibleHiddenPrompt: mod.buildLegacyCompatibleHiddenPrompt,
  };
  return buildersCache;
}

export function invalidatePromptCaches(): void {
  blocksCache = null;
  specialistCache = null;
  buildersCache = null;
}


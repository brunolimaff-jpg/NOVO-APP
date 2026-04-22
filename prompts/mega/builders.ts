import type {
  InvestigationBuildOptions,
  InvestigationPayload,
} from './contracts';
import {
  MASTER_INVESTIGATION_ORCHESTRATOR_V5,
  SHARED_ABSENCE_SEMANTICS_BLOCK,
  SHARED_ANTI_R_INFLATION_RULES_BLOCK,
  SHARED_BUSINESS_TRANSLATION_ENGINE_BLOCK,
  SHARED_COST_OF_DELAY_ENGINE_BLOCK,
  SHARED_CROSS_PROMPT_ARBITRATION_BLOCK,
  SHARED_DISCREPANCY_HUNTER_BLOCK,
  SHARED_ENTITY_RESOLUTION_BLOCK,
  SHARED_EVIDENCE_HIERARCHY_BLOCK,
  SHARED_EXECUTIVE_PRESSURE_ENGINE_BLOCK,
  SHARED_FINAL_RECONCILIATION_BLOCK,
  SHARED_FOUNDATION_BLOCK_V5,
  SHARED_INCUMBENT_WEAKNESS_ENGINE_BLOCK,
  SHARED_PARSER_GUARD_BLOCK,
  SHARED_RECENCY_POLICY_BLOCK,
} from './foundation';
import {
  PROMPT_MAPEAMENTO_DECISORES_GOD_MODE,
  PROMPT_ORCAMENTO_JANELA_GOD_MODE,
  PROMPT_RADAR_EXPANSAO_GOD_MODE,
  PROMPT_RAIO_X_OPERACIONAL_ATAQUE,
  PROMPT_RH_SINDICATOS_GOD_MODE,
  PROMPT_RISCOS_COMPLIANCE_GOD_MODE,
  PROMPT_TECH_STACK_GOD_MODE_ATAQUE,
} from './specialist-prompts';

const safe = (value?: string) => (value && value.trim() ? value.trim() : 'N/D');

const normalizeAliases = (aliases?: string[]) =>
  (aliases || []).map(a => a.trim()).filter(Boolean);

const buildContextLine = (payload: InvestigationPayload) => {
  const aliases = normalizeAliases(payload.aliases);
  return [
    `Empresa=${safe(payload.companyName)}`,
    `CNPJ=${safe(payload.cnpj)}`,
    `Cidade=${safe(payload.city)}`,
    `UF=${safe(payload.state)}`,
    `SegmentHint=${safe(payload.segmentHint)}`,
    `Aliases=${aliases.length ? aliases.join(' | ') : 'N/D'}`,
  ].join('; ');
};

export const INVESTIGATION_MODE_BLOCKS = {
  standard: `
<investigation_mode>
Modo STANDARD:
- foco em profundidade alta com disciplina
- evitar exagero narrativo
- priorizar clareza e utilidade prática
</investigation_mode>
`,
  executive: `
<investigation_mode>
Modo EXECUTIVE:
- priorizar linguagem de EBITDA, caixa, governança e risco
- privilegiar contraste entre discurso e realidade
- output deve ser denso e vendável para liderança
</investigation_mode>
`,
  ultraDepth: `
<investigation_mode>
Modo ULTRA DEPTH:
- máxima profundidade investigativa
- explorar sinais fracos, discrepâncias, massa oculta, sabotagem, custo da demora
- preferir densidade a brevidade
</investigation_mode>
`,
  warMode: `
<investigation_mode>
Modo WAR MODE:
- máxima agressividade comercial dentro do legal e auditável
- priorizar vulnerabilidade do incumbent
- priorizar discrepâncias estratégicas
- priorizar urgência de decisão e neutralização de resistência
</investigation_mode>
`,
};

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORT DE COMPATIBILIDADE — SHARED_FOUNDATION_BLOCK
// Mantém ChatInterface atual funcionando sem precisar trocar imports agora
// ═══════════════════════════════════════════════════════════════════════════════

export const SHARED_FOUNDATION_BLOCK = [
  SHARED_FOUNDATION_BLOCK_V5,
  SHARED_ENTITY_RESOLUTION_BLOCK,
  SHARED_EVIDENCE_HIERARCHY_BLOCK,
  SHARED_ABSENCE_SEMANTICS_BLOCK,
  SHARED_RECENCY_POLICY_BLOCK,
  SHARED_CROSS_PROMPT_ARBITRATION_BLOCK,
  SHARED_BUSINESS_TRANSLATION_ENGINE_BLOCK,
  SHARED_COST_OF_DELAY_ENGINE_BLOCK,
  SHARED_DISCREPANCY_HUNTER_BLOCK,
  SHARED_INCUMBENT_WEAKNESS_ENGINE_BLOCK,
  SHARED_EXECUTIVE_PRESSURE_ENGINE_BLOCK,
  SHARED_ANTI_R_INFLATION_RULES_BLOCK,
  SHARED_PARSER_GUARD_BLOCK,
  SHARED_FINAL_RECONCILIATION_BLOCK,
  MASTER_INVESTIGATION_ORCHESTRATOR_V5,
].join('\n\n');

// ═══════════════════════════════════════════════════════════════════════════════
// BUILDER OPCIONAL — para uso futuro
// Não quebra seu fluxo atual, mas já deixa o arquivo pronto
// ═══════════════════════════════════════════════════════════════════════════════

export function buildInvestigationHiddenPrompt(
  payload: InvestigationPayload,
  options: InvestigationBuildOptions = {},
): string {
  const {
    includeBudget = false,
    mode = 'executive',
    strictAudit = true,
    enableDiscrepancyHunter = true,
    enableCostOfDelay = true,
    promptVersion = 'Scout360_v5.0_ExecutiveCommitteeGrade',
  } = options;

  const contextLine = buildContextLine(payload);
  const modeBlock = INVESTIGATION_MODE_BLOCKS[mode] || INVESTIGATION_MODE_BLOCKS.executive;

  const featureFlags = `
<feature_flags>
PromptVersion=${promptVersion}
StrictAudit=${strictAudit ? 'ON' : 'OFF'}
DiscrepancyHunter=${enableDiscrepancyHunter ? 'ON' : 'OFF'}
CostOfDelay=${enableCostOfDelay ? 'ON' : 'OFF'}
IncludeBudget=${includeBudget ? 'ON' : 'OFF'}
</feature_flags>
`;

  const blocks = [
    'INVESTIGACAO_COMPLETA_INTEGRADA (v5.0):',
    'Execute um dossiê completo combinando os protocolos abaixo sem repetir seções desnecessariamente.',
    'Priorize objetividade, fontes auditáveis, agressividade comercial controlada e síntese executiva final.',
    `Contexto cadastral obrigatório: ${contextLine}.`,
    modeBlock,
    featureFlags,
    SHARED_FOUNDATION_BLOCK,
    '---',
    PROMPT_RAIO_X_OPERACIONAL_ATAQUE,
    '---',
    PROMPT_TECH_STACK_GOD_MODE_ATAQUE,
    '---',
    PROMPT_RISCOS_COMPLIANCE_GOD_MODE,
    '---',
    PROMPT_RADAR_EXPANSAO_GOD_MODE,
    '---',
    PROMPT_RH_SINDICATOS_GOD_MODE,
    '---',
    PROMPT_MAPEAMENTO_DECISORES_GOD_MODE,
  ];

  if (includeBudget) {
    blocks.push('---', PROMPT_ORCAMENTO_JANELA_GOD_MODE);
  }

  return blocks.join('\n\n');
}

// ═══════════════════════════════════════════════════════════════════════════════
// BUILDER ESPECÍFICO PARA CHATINTERFACE ATUAL
// Espelha o fluxo atual, mas com cérebro novo
// ═══════════════════════════════════════════════════════════════════════════════

export function buildLegacyCompatibleHiddenPrompt(payload: {
  companyName: string;
  cnpj: string | null;
  city: string;
  state: string;
}): string {
  return [
    'INVESTIGACAO_COMPLETA_INTEGRADA (MVP+):',
    'Execute um dossiê completo combinando os protocolos abaixo sem repetir seções.',
    'Priorize objetividade, fontes auditáveis, profundidade forense e síntese executiva final.',
    `Contexto cadastral obrigatório: Empresa=${payload.companyName}; CNPJ=${payload.cnpj || 'N/D'}; Cidade=${payload.city}; UF=${payload.state}.`,
    SHARED_FOUNDATION_BLOCK,
    '---',
    PROMPT_RAIO_X_OPERACIONAL_ATAQUE,
    '---',
    PROMPT_TECH_STACK_GOD_MODE_ATAQUE,
    '---',
    PROMPT_RISCOS_COMPLIANCE_GOD_MODE,
    '---',
    PROMPT_RADAR_EXPANSAO_GOD_MODE,
    '---',
    PROMPT_RH_SINDICATOS_GOD_MODE,
    '---',
    PROMPT_MAPEAMENTO_DECISORES_GOD_MODE,
    // orçamento opcional — ativar quando quiser:
    // '---',
    // PROMPT_ORCAMENTO_JANELA_GOD_MODE,
  ].join('\n\n');
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS AUXILIARES
// ═══════════════════════════════════════════════════════════════════════════════

export const PROMPT_VERSION = 'Scout360_v5.0_ExecutiveCommitteeGrade';

export const ALL_SPECIALIST_PROMPTS = [
  PROMPT_RAIO_X_OPERACIONAL_ATAQUE,
  PROMPT_TECH_STACK_GOD_MODE_ATAQUE,
  PROMPT_RISCOS_COMPLIANCE_GOD_MODE,
  PROMPT_RADAR_EXPANSAO_GOD_MODE,
  PROMPT_RH_SINDICATOS_GOD_MODE,
  PROMPT_MAPEAMENTO_DECISORES_GOD_MODE,
  PROMPT_ORCAMENTO_JANELA_GOD_MODE,
];

export default {
  SHARED_FOUNDATION_BLOCK,
  SHARED_FOUNDATION_BLOCK_V5,
  SHARED_ENTITY_RESOLUTION_BLOCK,
  SHARED_EVIDENCE_HIERARCHY_BLOCK,
  SHARED_ABSENCE_SEMANTICS_BLOCK,
  SHARED_RECENCY_POLICY_BLOCK,
  SHARED_CROSS_PROMPT_ARBITRATION_BLOCK,
  SHARED_BUSINESS_TRANSLATION_ENGINE_BLOCK,
  SHARED_COST_OF_DELAY_ENGINE_BLOCK,
  SHARED_DISCREPANCY_HUNTER_BLOCK,
  SHARED_INCUMBENT_WEAKNESS_ENGINE_BLOCK,
  SHARED_EXECUTIVE_PRESSURE_ENGINE_BLOCK,
  SHARED_ANTI_R_INFLATION_RULES_BLOCK,
  SHARED_PARSER_GUARD_BLOCK,
  SHARED_FINAL_RECONCILIATION_BLOCK,
  MASTER_INVESTIGATION_ORCHESTRATOR_V5,
  PROMPT_RAIO_X_OPERACIONAL_ATAQUE,
  PROMPT_TECH_STACK_GOD_MODE_ATAQUE,
  PROMPT_RISCOS_COMPLIANCE_GOD_MODE,
  PROMPT_RADAR_EXPANSAO_GOD_MODE,
  PROMPT_RH_SINDICATOS_GOD_MODE,
  PROMPT_MAPEAMENTO_DECISORES_GOD_MODE,
  PROMPT_ORCAMENTO_JANELA_GOD_MODE,
  buildInvestigationHiddenPrompt,
  buildLegacyCompatibleHiddenPrompt,
  PROMPT_VERSION,
};

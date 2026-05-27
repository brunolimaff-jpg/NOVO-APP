import type {
  InvestigationBuildOptions,
  InvestigationPayload,
} from './contracts';
import {
  SHARED_ABSENCE_SEMANTICS_BLOCK,
  SHARED_ANTI_R_INFLATION_RULES_BLOCK,
  SHARED_COMMERCIAL_INTELLIGENCE_ENGINE,
  SHARED_CROSS_PROMPT_ARBITRATION_BLOCK,
  SHARED_ENTITY_RESOLUTION_BLOCK,
  SHARED_EVIDENCE_HIERARCHY_BLOCK,
  SHARED_FINAL_RECONCILIATION_BLOCK,
  SHARED_FOUNDATION_BLOCK_V5,
  SHARED_PARSER_GUARD_BLOCK,
  SHARED_RECENCY_POLICY_BLOCK,
  MASTER_INVESTIGATION_ORCHESTRATOR_V5,
} from './foundation';
import {
  PROMPT_MAPEAMENTO_DECISORES_GOD_MODE,
  PROMPT_ORCAMENTO_JANELA_GOD_MODE,
  PROMPT_RADAR_EXPANSAO_GOD_MODE,
  PROMPT_RAIO_X_OPERACIONAL_ATAQUE,
  PROMPT_RH_SINDICATOS_GOD_MODE,
  PROMPT_RISCOS_COMPLIANCE_GOD_MODE,
  PROMPT_TECH_STACK_GOD_MODE_ATAQUE,
  PROMPT_CAMINHO_DE_VENDA,
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

export const SELLER_BRIEF_MODULE_OUTPUT_CONTRACT = `
<seller_brief_module_output_contract>
CONTRATO VISÍVEL V2 — MAPAS + CARDS + ARMA DE VENDA UNIFICADA

Este contrato prevalece sobre templates antigos de subdossiê longo.
Não gere relatório enciclopédico. Não gere seções longas de "dossiê completo".
Não gere seção "Brief de Reunião".

CADA MÓDULO (análise, sem gatilhos):

# [Nome comercial curto do módulo]

## Mapas Visuais
- No máximo 1 Mermaid com dados reais. Se dados fracos: "Sem mapa visual confiável."
- Nunca Mermaid genérico, placeholder ou nó não identificado.

## Cards de Auditoria (1 a 3 cards)

### Card: [título comercial]
- **Fato:** [1 frase objetiva com evidência]
- **Evidência:** [fonte com URL inline obrigatória; use formato [texto](url); toda evidência DEVE ter URL auditável]
- **Implicação comercial:** [como isso muda a conversa de venda]
- **Pergunta de reunião:** [pergunta natural para o vendedor usar]
- **Confiança:** [Alta/Média/Baixa + motivo curto]

⚠️ IMPORTANTE: Módulos comuns (Operacional, Tech Stack, Compliance, Expansão, Decisores) NÃO geram "Gatilhos de Abordagem", "Leitura Estratégica" nem "Implicação Comercial". Isso é responsabilidade EXCLUSIVA do módulo CAMINHO DE VENDA.

O ÚNICO módulo que consolida a abordagem comercial é o CAMINHO DE VENDA (último módulo). Ele DEVE usar este formato:

# 🎯 CAMINHO DE VENDA: [NOME DA EMPRESA]

## 📊 Força de Trabalho
- **Headcount estimado:** [X funcionários]
- **Pulverização:** [X em CNPJs / X CAEPF / X temporários safristas]
- **Maturidade de RH:** [BAIXA/MÉDIA/ALTA — artesanal ou industrial?]
- **Fase sazonal atual:** [Plantio/Colheita/Entressafra/Pico contratação]
- **Capacidade de absorver projeto:** [BAIXA/MÉDIA/ALTA]
- **Riscos:** [SST/FAP, passivo trabalhista, sindicatos, terceirização]

## Alvo Prioritário
[1 linha — a principal dor que vai fazer o prospect marcar reunião]

## 🔄 Mapa da Estratégia de Entrada
${'```'}mermaid
graph LR
    classDef core fill:#eff6ff,stroke:#3b82f6,stroke-width:2px,color:#1e3a8a;
    classDef satellite fill:#f0fdf4,stroke:#10b981,stroke-width:2px,color:#064e3b;
    classDef warning fill:#fffbeb,stroke:#f59e0b,stroke-width:2px,color:#78350f;

    A["Dor: Dor Principal"] ==> B["Wedge: Módulo Porta"]
    B ==> C["CFO: Ângulo Financeiro"]
    B ==> D["COO: Ângulo Operacional"]
    B ==> E["TI: Ângulo Tecnológico"]
    C ==> F["ROI Financeiro"]
    D ==> G["ROI Operacional"]
    E ==> H["ROI Stack"]

    class A core;
    class B core;
    class C,D,E warning;
    class F,G,H satellite;
${'```'}

## Scripts por Persona

| Persona | Ângulo | Frase de Abertura | Objeção Provável | Resposta |
|---------|--------|-------------------|------------------|----------|
| CFO | [métrica financeira da dor] | "[frase pronta]" | "[objeção]" | "[contorno]" |
| COO | [impacto operacional] | "[frase pronta]" | "[objeção]" | "[contorno]" |
| TI | [impacto no stack] | "[frase pronta]" | "[objeção]" | "[contorno]" |

## Wedge Recomendado
- **Porta de entrada:** [módulo específico — não "a solução completa"]
- **Escopo:** [unidade piloto, 1-2 meses, escopo enxuto]
- **ROI estimado:** [referência de mercado conservadora]
- **Próximo passo:** [ação concreta]

## ⏰ Sinais de Urgência
- Ate 3 bullets; cada um com [[n]](URL_REAL_DO_BLOCO_FONTES_DISPONIVEIS) ao final.
- Se nao houver URL verificavel para o sinal, texto sem link (nao inventar href).
- Se nenhum sinal forte: "Sem sinal de urgência — abordagem consultiva."

[[PORTA_FEED_P_PROXY:FUNC:[TOTAL_FUNCIONARIOS]]]
[[PORTA_FEED_R_TRAB:[NOTA]:PASSIVOS:[LISTA]]]
[[PORTA_FEED_A2:[NOTA]:TIMING:[BOM/NEUTRO/RUIM]:FASE:[FASE_ATUAL]]]

⚠️ O CAMINHO DE VENDA é o ÚNICO módulo com gatilhos e scripts. Os outros módulos只 fazem análise (Mapas Visuais + Cards de Auditoria).
</seller_brief_module_output_contract>
`;

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
  SHARED_COMMERCIAL_INTELLIGENCE_ENGINE,
  SHARED_ANTI_R_INFLATION_RULES_BLOCK,
  SHARED_PARSER_GUARD_BLOCK,
  SHARED_FINAL_RECONCILIATION_BLOCK,
  MASTER_INVESTIGATION_ORCHESTRATOR_V5,
  SELLER_BRIEF_MODULE_OUTPUT_CONTRACT,
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
    'INVESTIGACAO_COMPLETA_INTEGRADA (v6.0):',
    'Execute um dossiê completo combinando os protocolos abaixo sem repetir seções desnecessariamente.',
    'Priorize objetividade, fontes auditáveis, agressividade comercial controlada e síntese executiva final.',
    'ANTES DE TUDO: valide a identidade da empresa-alvo (entity_resolution). Se CNPJ e nome não baterem, INTERROMPA e reporte o conflito.',
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

  // CAMINHO DE VENDA é o ÚLTIMO módulo — síntese comercial de todos os anteriores
  blocks.push('---', PROMPT_CAMINHO_DE_VENDA);

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
    'INVESTIGACAO_COMPLETA_INTEGRADA (MVP+ v6):',
    'Execute um dossiê completo combinando os protocolos abaixo sem repetir seções.',
    'Priorize objetividade, fontes auditáveis, profundidade forense e síntese executiva final.',
    'ANTES DE TUDO: valide a identidade da empresa-alvo (entity_resolution). Se CNPJ e nome não baterem, INTERROMPA e reporte o conflito.',
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
    '---',
    PROMPT_CAMINHO_DE_VENDA,  // ÚLTIMO: síntese comercial de todos os anteriores
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
  PROMPT_CAMINHO_DE_VENDA,
];

export default {
  SHARED_FOUNDATION_BLOCK,
  SHARED_FOUNDATION_BLOCK_V5,
  SHARED_ENTITY_RESOLUTION_BLOCK,
  SHARED_EVIDENCE_HIERARCHY_BLOCK,
  SHARED_ABSENCE_SEMANTICS_BLOCK,
  SHARED_RECENCY_POLICY_BLOCK,
  SHARED_CROSS_PROMPT_ARBITRATION_BLOCK,
  SHARED_COMMERCIAL_INTELLIGENCE_ENGINE,
  SHARED_ANTI_R_INFLATION_RULES_BLOCK,
  SHARED_PARSER_GUARD_BLOCK,
  SHARED_FINAL_RECONCILIATION_BLOCK,
  SELLER_BRIEF_MODULE_OUTPUT_CONTRACT,
  PROMPT_RAIO_X_OPERACIONAL_ATAQUE,
  PROMPT_TECH_STACK_GOD_MODE_ATAQUE,
  PROMPT_RISCOS_COMPLIANCE_GOD_MODE,
  PROMPT_RADAR_EXPANSAO_GOD_MODE,
  PROMPT_RH_SINDICATOS_GOD_MODE,
  PROMPT_MAPEAMENTO_DECISORES_GOD_MODE,
  PROMPT_ORCAMENTO_JANELA_GOD_MODE,
  PROMPT_CAMINHO_DE_VENDA,
  buildInvestigationHiddenPrompt,
  buildLegacyCompatibleHiddenPrompt,
  PROMPT_VERSION,
};

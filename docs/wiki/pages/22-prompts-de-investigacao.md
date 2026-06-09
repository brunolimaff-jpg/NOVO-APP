---
grok_wiki: true
page_id: "page-prompts-reference"
title: "Prompts de investigação"
description: "Builders, payloads, modos, blocos compartilhados, módulos especialistas, prompts de teia, contrato de saída e gate `validate:prompts`."
repository: "local/NOVO-APP"
branch: "default"
generated_at: "2026-06-08T23:39:43.629Z"
source_files:
  - "prompts/mega/contracts.ts"
  - "prompts/mega/builders.ts"
  - "prompts/mega/foundation.ts"
  - "prompts/mega/specialist-prompts.ts"
  - "prompts/mega/teia-identity.ts"
  - "prompts/mega/teia-deep.ts"
  - "prompts/systemPrompts.ts"
  - "scripts/validate-prompts.sh"
---

A superfície de prompts de investigação fica concentrada em `prompts/mega/*`, exposta pela fachada `prompts/megaPrompts.ts` e consumida pela tela principal, deep dives e waterfall modular de dossiê. O contrato combina builders TypeScript, blocos compartilhados, prompts especialistas, markers internos `[[PORTA_*]]`, prompts específicos de teia societária e o gate `npm run validate:prompts`.

## Superfície pública

| Área | Arquivo | Responsabilidade |
|---|---|---|
| Contratos de entrada | `prompts/mega/contracts.ts` | Tipos `InvestigationPayload` e `InvestigationBuildOptions`. |
| Builder principal | `prompts/mega/builders.ts` | Monta o prompt oculto completo, modos, flags, módulos e versão. |
| Blocos compartilhados | `prompts/mega/foundation.ts` | Governança, evidência, entidade, recência, parser guard, reconciliação e orquestração mestre. |
| Módulos especialistas | `prompts/mega/specialist-prompts.ts` | Prompts por domínio e emissão de feeds PORTA. |
| Teia societária | `prompts/mega/teia-identity.ts`, `prompts/mega/teia-deep.ts` | Módulo 1a de identidade e módulo 1b de profundidade. |
| Fachada estável | `prompts/megaPrompts.ts` | Reexporta tipos, blocos, builders e prompts para consumidores. |
| Prompt legado | `prompts/systemPrompts.ts` | Ponte temporária que reexporta `OPERACAO_PROMPT` de `constants.ts`. |
| Gate local | `scripts/validate-prompts.sh` | Roda testes de prompts, prompt base, parser de teia e grafo societário. |

<Note>
`prompts/systemPrompts.ts` ainda não é o dono do prompt base: ele existe para isolar a futura migração e hoje apenas reexporta `OPERACAO_PROMPT` de `constants.ts`.
</Note>

## Payload e opções

O builder trabalha com um payload cadastral compacto e opções explícitas de execução.

```ts title="prompts/mega/contracts.ts"
export interface InvestigationPayload {
  companyName: string;
  cnpj?: string;
  city?: string;
  state?: string;
  aliases?: string[];
  segmentHint?: string;
}

export interface InvestigationBuildOptions {
  includeBudget?: boolean;
  mode?: 'standard' | 'executive' | 'ultraDepth' | 'warMode';
  strictAudit?: boolean;
  enableDiscrepancyHunter?: boolean;
  enableCostOfDelay?: boolean;
  promptVersion?: string;
}
```

<ParamField body="companyName" type="string" required>
Nome da empresa-alvo usado no contexto cadastral obrigatório.
</ParamField>

<ParamField body="cnpj" type="string">
CNPJ opcional; quando disponível, a UI também tenta buscar CNAE para preencher `segmentHint`.
</ParamField>

<ParamField body="aliases" type="string[]">
Nomes alternativos normalizados e unidos como `Aliases=...` no contexto cadastral.
</ParamField>

<ParamField body="mode" type="'standard' | 'executive' | 'ultraDepth' | 'warMode'">
Seleciona o bloco `<investigation_mode>`. O default interno do builder é `executive`.
</ParamField>

<ParamField body="includeBudget" type="boolean">
Inclui `PROMPT_ORCAMENTO_JANELA_GOD_MODE` antes de `PROMPT_CAMINHO_DE_VENDA`. O default interno é `false`.
</ParamField>

<ParamField body="promptVersion" type="string">
Default atual: `Scout360_v5.0_ExecutiveCommitteeGrade`.
</ParamField>

## Montagem do prompt oculto

`buildInvestigationHiddenPrompt(payload, options)` gera uma string única com cabeçalho de investigação, contexto cadastral, bloco de modo, `<feature_flags>`, fundação compartilhada e módulos especialistas.

```text
InvestigationPayload
  -> Contexto cadastral obrigatório
  -> INVESTIGATION_MODE_BLOCKS[mode]
  -> <feature_flags>
  -> SHARED_FOUNDATION_BLOCK
  -> Raio-X Operacional
  -> Tech Stack
  -> Riscos & Compliance
  -> Radar Expansão
  -> RH & Sindicatos
  -> Mapeamento Decisores
  -> Orçamento e Janela, se includeBudget=true
  -> Caminho de Venda sempre por último
```

Na tela principal, `ChatInterface` resolve o modo a partir do `mode` visual: valores com `war` viram `warMode`, valores com `ultra` ou `deep` viram `ultraDepth`, valores com `exec` viram `executive`, e o fallback também é `executive`. O orçamento é ligado para `warMode`, `ultraDepth`, investigações com CNPJ, radar com `metaInsight` ou radar com alertas.

Depois do builder, a tela anexa `<radar_context>` quando há radar disponível. Esse bloco inclui configuração, contagem de não lidos, estado de varredura, insight, último aviso, último erro e até três alertas principais.

## Blocos compartilhados

`SHARED_FOUNDATION_BLOCK` é uma composição ordenada de blocos de `foundation.ts` mais `SELLER_BRIEF_MODULE_OUTPUT_CONTRACT`. Ele existe para manter todos os módulos sob o mesmo contrato de governança.

| Bloco | Função prática |
|---|---|
| `SHARED_FOUNDATION_BLOCK_V5` | Define missão, anti-alucinação, protocolo de recusa, escopo de evidência, citações, amplitude de pesquisa e defesa contra prompt injection. |
| `SHARED_ENTITY_RESOLUTION_BLOCK` | Exige validação por CNPJ, razão social, cidade/UF e setor antes de atribuir fatos à empresa. |
| `SHARED_EVIDENCE_HIERARCHY_BLOCK` | Classifica fontes em tiers A/B/C/D e limita nota alta sem evidência forte. |
| `SHARED_ABSENCE_SEMANTICS_BLOCK` | Diferencia evidência positiva, evidência de ausência e inconclusivo. |
| `SHARED_RECENCY_POLICY_BLOCK` | Prioriza dados recentes e exige ressalva para dados antigos. |
| `SHARED_CROSS_PROMPT_ARBITRATION_BLOCK` | Define dono de cada dimensão PORTA e de cada flag. |
| `SHARED_COMMERCIAL_INTELLIGENCE_ENGINE` | Traduz fatos em dor de negócio, custo da demora, discrepância e vulnerabilidade do incumbente. |
| `SHARED_ANTI_R_INFLATION_RULES_BLOCK` | Evita somar o mesmo risco múltiplas vezes na dimensão R. |
| `SHARED_PARSER_GUARD_BLOCK` | Especifica a sintaxe exata dos markers `[[PORTA_*]]`. |
| `SHARED_FINAL_RECONCILIATION_BLOCK` | Força checagem silenciosa de coerência, flags, score, utilidade comercial e Mermaid. |
| `MASTER_INVESTIGATION_ORCHESTRATOR_V5` | Define fases globais de entidade, coleta, tradução, scoring, renderização e reconciliação. |

## Módulos especialistas

`ALL_SPECIALIST_PROMPTS` mantém oito prompts em ordem estável. Os testes garantem que a coleção tenha oito itens únicos e que a ordem não mude sem atualizar snapshots.

| Módulo | Export | Ownership principal | Markers esperados |
|---|---|---|---|
| Raio-X Operacional | `PROMPT_RAIO_X_OPERACIONAL_ATAQUE` | `O`, componente operacional de `R`, flag `NOFIT` | `PORTA_FEED_O`, `PORTA_FEED_R`, `PORTA_FLAG:NOFIT` |
| Tech Stack | `PROMPT_TECH_STACK_GOD_MODE_ATAQUE` | `T` | `PORTA_FEED_T` |
| Riscos & Compliance | `PROMPT_RISCOS_COMPLIANCE_GOD_MODE` | componente fiscal/compliance de `R`, flag `TRAD` | `PORTA_FEED_R`, `PORTA_FLAG:TRAD` |
| Radar Expansão | `PROMPT_RADAR_EXPANSAO_GOD_MODE` | `P`, segmento | `PORTA_FEED_P`, `PORTA_SEG` |
| RH & Sindicatos | `PROMPT_RH_SINDICATOS_GOD_MODE` | proxy de `P`, componente trabalhista de `R`, timing `A2` | `PORTA_FEED_P_PROXY`, `PORTA_FEED_R_TRAB`, `PORTA_FEED_A2` |
| Mapeamento Decisores | `PROMPT_MAPEAMENTO_DECISORES_GOD_MODE` | `A` | `PORTA_FEED_A` |
| Orçamento e Janela | `PROMPT_ORCAMENTO_JANELA_GOD_MODE` | pressão financeira e timing | `PORTA_FEED_R`, `PORTA_FEED_A2` |
| Caminho de Venda | `PROMPT_CAMINHO_DE_VENDA` | Síntese comercial final | Não é dono de nova dimensão PORTA. |

<Warning>
`LOCK` ainda aparece como flag legada em alguns parsers, mas é tratada como deprecated: `normalizePortaFlags` remove `LOCK` da lista efetiva.
</Warning>

## Teia societária no waterfall

A teia usa prompts separados do conjunto principal de especialistas.

### Módulo 1a: identidade

`PROMPT_TEIA_IDENTITY_MODULE` reconstrói visão geral do grupo econômico, classifica segmento `PRD/AGI/COP`, emite `PORTA_FEED_P`, emite `PORTA_SEG` e deve finalizar com exatamente um marker de complexidade:

```text
[[TEIA_COMPLEXIDADE:BAIXA]]
[[TEIA_COMPLEXIDADE:MEDIA]]
[[TEIA_COMPLEXIDADE:ALTA]]
```

O prompt proíbe Mermaid porque o grafo visual é responsabilidade do componente `SocietaryMap`.

### Módulo 1b: profundidade

`PROMPT_TEIA_DEEP_MODULE` só aprofunda quando a complexidade é `MEDIA` ou `ALTA`, ou quando a evidência objetiva da teia corrige uma saída ausente/baixa. Ele lista CNPJs válidos encontrados, separa `Empresas do Grupo Economico` de `Outros CNPJs`, limita a exaustão a dois níveis e não emite `PORTA_FEED_P`, `PORTA_SEG` nem `PORTA_COMPLEXIDADE`.

O waterfall remove o marker `[[TEIA_COMPLEXIDADE:*]]` antes de anexar a identidade ao texto final, valida CNPJs da saída e registra warnings em `scoutDiag` sem anexar uma seção artificial de alertas ao Markdown do dossiê.

## Contrato de saída

O contrato visível atual é `SELLER_BRIEF_MODULE_OUTPUT_CONTRACT`, incluído dentro de `SHARED_FOUNDATION_BLOCK`. Ele substitui subdossiês longos por um formato compacto:

- `# [Nome comercial curto do módulo]`
- `## Mapas Visuais` com no máximo um Mermaid confiável, ou declaração de ausência de mapa seguro
- `## Cards de Auditoria` com 1 a 3 cards
- cada card contém `Fato`, `Evidência`, `Implicação comercial`, `Pergunta de reunião` e `Confiança`
- `CAMINHO DE VENDA` é o único módulo responsável por gatilhos, scripts e wedge consolidado

Os markers PORTA são metadados internos. O prompt ordena que eles fiquem no fim e não apareçam em seção visível chamada “MARKERS” ou “BLOCO DE FEEDS PORTA”. No runtime, `stripPortaMarkers` e `stripVisiblePortaFeedSections` removem esses tokens do texto exibido.

## Markers e parser PORTA

O parser aceita marcador final v2, marcador v1 legado e feeds modulares. Quando não há marcador final, `resolvePortaScore` tenta consolidar os feeds; se alguma dimensão `P/O/R/T/A` faltar, a resolução informa `missingDimensions`.

```text
[[PORTA_FEED_O:7:ELOS:Plantio,Armazenagem,Beneficiamento]]
[[PORTA_FEED_T:6:T1:7:T2:8:T3:4:STACK:TOTVS Protheus]]
[[PORTA_FEED_R:7:PRESSOES:Autuação SEFAZ,MPT ativo]]
[[PORTA_FEED_P:8:HA:25000:CNPJS:12:FAT:R$ 300M estimado]]
[[PORTA_FEED_A:6:A1:5:A2:7:GERACAO:G1.5]]
[[PORTA_FEED_P_PROXY:FUNC:850]]
[[PORTA_FEED_R_TRAB:5:PASSIVOS:3 processos TRT,FAP elevado]]
[[PORTA_FEED_A2:7:TIMING:BOM:FASE:Entressafra]]
[[PORTA_FLAG:NOFIT:NAO]]
[[PORTA_FLAG:TRAD:SIM:NATUREZA:TRADING]]
[[PORTA_SEG:AGI]]
```

Regras operacionais:

- notas devem ser inteiras de `0` a `10`
- segmento aceita apenas `PRD`, `AGI` ou `COP`
- flags aceitam `SIM`, `NAO` e alguns parsers toleram `NÃO`, mas o prompt manda emitir `NAO`
- `PORTA_FEED_P_PROXY` ajusta `P` por headcount quando existe
- múltiplos feeds de `R` são consolidados por média arredondada
- `A` combina `A1` e `A2`; `A2` pode receber complemento de RH ou orçamento
- `TRAD` e `NOFIT` aplicam multiplicadores; `LOCK` é ignorado na normalização

## Execução de módulos

`generateDossierModule` recebe `moduleName`, `empresaAlvo`, `foundationBlock`, `specialistPrompt`, `extraContext` e opções. Sem cache de fundação, o prompt final usa `foundationBlock + specialistPrompt + socioRuralContext + extraContext` como `systemInstruction`. Com `foundationCacheName`, o bloco de fundação fica no cache e o conteúdo dinâmico vai em `contents`.

O módulo usa `STABLE_RESEARCH_MODEL_ID`, `temperature` default `0.2`, `maxOutputTokens: 8192` e `googleSearch` quando `useGrounding` está ativo. A saída passa por `applyPromptLeakShield`, sanitização de dados pessoais, normalização de fontes e status de verificação.

<Info>
A implementação atual usa o proxy Gemini, mas o contrato de prompts é portável: os builders geram strings, os markers são texto parseável e o gate valida comportamento no repositório. Uma integração BYOC/BYOK deve preservar payload, ordem de módulos, markers e sanitização, sem depender de uma skill ou provedor específico.
</Info>

## Fontes disponíveis para citação

O waterfall mantém um pool de fontes verificadas por módulo e injeta no `extraContext` um bloco `[FONTES DISPONIVEIS PARA CITACAO]`. Quando o pool está vazio, o bloco instrui o modelo a não inventar links e a declarar `sem fonte URL verificavel`. Quando há fontes, o bloco lista URLs normalizadas e orienta o modelo a citar somente aquelas URLs no formato `[[n]](url)`.

Esse contrato conversa diretamente com as regras de citação da fundação: cards de auditoria exigem URL inline quando houver evidência auditável.

## Gate validate:prompts

Use o script sempre que alterar prompts, parser de markers, parser de teia ou grafo societário.

```bash
npm run validate:prompts
# ou
bash scripts/validate-prompts.sh
```

O script executa:

```bash
npm exec vitest run \
  tests/prompts/megaPrompts.test.ts \
  tests/prompts/constantsPromptRules.test.ts \
  tests/features/dossier/teiaTextParser.test.ts \
  tests/features/dossier/societaryGraph.test.ts
```

O gate protege:

- presença dos markers obrigatórios por módulo
- ausência de seções visíveis antigas de score PORTA
- contrato compacto de cards e mapas
- `PROMPT_VERSION`
- ordem e unicidade de `ALL_SPECIALIST_PROMPTS`
- snapshots determinísticos de blocos e builders
- regras críticas de `BASE_SYSTEM_PROMPT`
- parsing de tabela mestre de CNPJs
- rejeição de CNPJ inválido e homônimo fraco
- separação entre `group_link`, `partner_other_cnpj` e vínculos não confirmados

## Checklist de mudança segura

<Steps>
<Step title="Identifique o contrato afetado">
Se a mudança altera payload, edite `contracts.ts`. Se altera composição, edite `builders.ts`. Se altera regras globais, edite `foundation.ts`. Se altera domínio especialista, edite `specialist-prompts.ts` ou os módulos de teia.
</Step>

<Step title="Preserve ownership PORTA">
Não mova emissão de `PORTA_FEED_T`, `PORTA_FEED_A`, `PORTA_SEG`, `NOFIT` ou `TRAD` para outro módulo sem atualizar arbitragem, parser e testes.
</Step>

<Step title="Valide a sintaxe dos markers">
Copie os formatos de `SHARED_PARSER_GUARD_BLOCK`. Evite espaços extras, decimais, segmentos descritivos e flags fora de `SIM/NAO`.
</Step>

<Step title="Rode o gate focado">
Execute `npm run validate:prompts`. Para mudanças que afetam score renderizado ou dossiê completo, combine com testes de PORTA, waterfall e gates de fluxo.
</Step>
</Steps>

## Falhas comuns

| Sintoma | Causa provável | Verificação |
|---|---|---|
| Score PORTA ausente | Alguma dimensão `P/O/R/T/A` não emitiu feed ou marcador final | Checar `missingDimensions` em `resolvePortaScore` e logs do reconciliador PORTA. |
| Teia não aprofunda | Módulo 1a emitiu `BAIXA` e não houve evidência objetiva elevando complexidade | Verificar marker `TEIA_COMPLEXIDADE` e `teiaResearchContext.objectiveComplexity`. |
| Grafo mostra vínculo indevido | Texto promoveu CNPJ lateral de sócio para grupo econômico | Rodar `teiaTextParser.test.ts` e `societaryGraph.test.ts`; separar `CNPJ_LATERAL_SOCIO` de `GRUPO_CONFIRMADO`. |
| Links falsos ou genéricos | Modelo citou URL fora de `[FONTES DISPONIVEIS PARA CITACAO]` | Conferir pool de fontes e instruções inline de citação. |
| Saída bloqueada | `applyPromptLeakShield` detectou vazamento de prompt | Verificar logs `PromptLeakShield` e remover exposição de instruções internas. |

## Related pages

<CardGroup>
<Card title="Waterfall de dossiê" href="/dossie-waterfall">
Pipeline modular que executa os prompts especialistas e consolida o dossiê.
</Card>
<Card title="Score PORTA" href="/score-porta">
Dimensões, pesos, markers, flags e consolidação do score comercial.
</Card>
<Card title="Teia societária" href="/teia-societaria">
Modelo societário, escopos de vínculo e validação de empresas laterais.
</Card>
<Card title="Proxy Gemini" href="/gemini-proxy-reference">
Fachada de geração, grounding, cache foundation e chamadas serverless.
</Card>
<Card title="Testes e gates" href="/testes-gates">
Comandos de validação, Vitest, Playwright e critérios por tipo de mudança.
</Card>
</CardGroup>

## Source files

- `prompts/mega/contracts.ts`
- `prompts/mega/builders.ts`
- `prompts/mega/foundation.ts`
- `prompts/mega/specialist-prompts.ts`
- `prompts/mega/teia-identity.ts`
- `prompts/mega/teia-deep.ts`
- `prompts/systemPrompts.ts`
- `scripts/validate-prompts.sh`

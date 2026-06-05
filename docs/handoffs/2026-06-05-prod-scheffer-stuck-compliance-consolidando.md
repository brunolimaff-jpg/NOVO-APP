# Handoff — Prod Scheffer travou pós-#332 (2026-06-05)

**Escopo deste doc:** relato + evidências do Bruno. **Sem fix aplicado nesta sessão.**

## Goal próxima sessão

Entender como o módulo **Riscos & Compliance** / etapa UI **"Verificando pressões e compliance..."** funciona no waterfall modular e se faz sentido **dividir** (prompt, timeout, paralelismo). Investigar por que a sessão abaixo repetiu padrão de desync pós-`finally` (**PostCompletion ausente**) apesar do merge #332.

## State of play

| Item | Status |
|------|--------|
| `main` | `83414a81` (#332 mergeada ~15:51 UTC) |
| Ambiente | **Produção** `scoutagro.vercel.app` |
| Empresa | SCHEFFER & CIA LTDA (CNPJ `04733767000180`) |
| Sessão | `6ad684da-0323-4a4a-8b5c-43b03511f69b` |
| Sintoma relatado | Parece travar em **compliance** (~50%, ~1m24s) e depois em **Consolidando** (~93%, ~2m12s) |
| Servidor | Waterfall **completou**; `processMessage:finally` executou |
| Telemetria | **PostCompletion=0**; health-check com `overlay=true`, `domBodyLen=841`, `botMsgTextLen=27256` |
| Sentry (2h) | Sem erros |

## Relato visual (screenshots)

Assets locais (Cursor):
- `assets/Captura_de_Tela_2026-06-05_a_s_12.03.50-*.png` — ~50%, etapa **Verificando pressões e compliance...**, timer ~1m24s, Network com request **gemini (pendente)**
- `assets/Captura_de_Tela_2026-06-05_a_s_12.04.05-*.png` — mesma fase, ~1m38s, gemini pendente
- `assets/image-6cdf20ad-*.png` — ~93%, **Consolidando informações...**, timer ~2m12s; etapas anteriores (incl. compliance 16s) marcadas OK; gemini pendente

**Percepção vs servidor:** compliance **não travou no backend** (~16,5s). UI pode ficar na label da etapa enquanto `/api/gemini` pendente (16–24s+ em outros módulos).

## Console (trecho fornecido pelo Bruno)

Ordem resumida:
1. `processMessage:start` / `waterfall:start`
2. Módulos concluídos com durações: Identidade 10,4s; Profundidade 24,3s; Operação 20,9s; Bordas 18,4s; **Riscos & Compliance 16,5s**; Caminho de Venda 15,7s
3. Warnings: Teia CNPJ (7/7 não confirmados); prompt elevado em Bordas/Compliance/Caminho (~80k chars)
4. Benchmark + PORTA reconciliation OK
5. ContinuityQuestion: JSON truncado 2x → fallback premium (4 sugestões)
6. `waterfall:end` completed; `waterfallFinalTextLen: 27256`
7. `health-check-final`; `processMessage:finally`

## Supabase (`vmqfcaoirjcfucvlnpig`)

**session_id:** `6ad684da-0323-4a4a-8b5c-43b03511f69b`

| Evento | Achado |
|--------|--------|
| `waterfall:end` | completed |
| `processMessage:finally` | OK (`isAbort: false`) |
| `health-check-final` | `isLoading=false`, `domHasLoadingOverlay=true`, `domBodyLen=841`, `botMsgTextLen=27256`, `botMsgFound=true` |
| `PostCompletion` | **ausente (0 eventos)** |
| `overlay-persisted` | ausente |

**Comparação:** sessão validada pós-#332 (`1c786d20`) tinha PostCompletion=6. Esta sessão **repete padrão pré-fix** no health-check.

## Como a etapa "compliance" funciona (mapa para investigação)

| Camada | Valor |
|--------|-------|
| Label UI | `MODULAR_DOSSIER_STAGES[3]` → `Verificando pressões e compliance...` (`constants/loadingStages.ts`) |
| Módulo waterfall | `Riscos & Compliance` (`features/dossier/waterfall-orchestrator.ts`) |
| Prompt | `PROMPT_RISCOS_COMPLIANCE_GOD_MODE` (`prompts/mega/specialist-prompts.ts`) |
| Execução | `generateDossierModule` → `services/gemini/investigation-orchestration.ts` → `geminiProxy` → `/api/gemini` |
| Timeout módulo | `MODULAR_OPTIONAL_STEP_TIMEOUT_MS` = **60s** |
| optional | `true` (falha não aborta waterfall) |
| Contexto acumulado | `foundationChars` ~43k + `extraContextChars` ~27k → `promptChars` ~80k (warn elevado) |

Etapas **após** compliance no mesmo waterfall: Caminho de Venda → benchmark → PORTA → continuity → consolidação UI (`Consolidando informações...`).

## Hipóteses para próxima sessão (não validadas aqui)

1. **Percepção de trava em compliance** = latência Gemini longa + label de etapa não avança até `module:complete` (não é hang infinito nesta sessão).
2. **Trava real ~93%** = handoff UI pós-`finally` (overlay + DOM não renderizou 27k chars) — mesmo eixo #332, mas **PostCompletion não chegou ao Supabase** nesta sessão.
3. **Deploy:** confirmar bundle prod inclui `83414a81` (asset `index-BWhOuPjb.js` no console).
4. **Diagnostics concorrentes:** Network mostra vários `gemini` (incl. `diagnosticLog.ts`) — possível competição percebida (H-C3 backlog).
5. **Dividir compliance:** candidato por `promptChars` ~80k e duração moderada; decisão depende de profiling, não só UX.

## Open decisions

- Prioridade: reabrir incidente #332 vs investigar modularização compliance vs blank panel WIP?
- Critério de regressão: PostCompletion obrigatório em **toda** sessão Scheffer prod pós-merge?
- Dividir módulo (sub-prompts) ou reduzir contexto acumulado antes de Compliance?

## Skills próxima sessão

- `debugger` — cruzar PostCompletion ausente com deploy + flush
- `implementer` — só após decisão explícita (fora deste handoff)
- `doc-handoff` — fechar investigação

## Artifacts

- Findings overlay: `docs/investigation/2026-06-04-hero-stuck-findings.md`
- Contrato loading: `docs/ai-context/refactor/loading-panel-contract.md`
- Handoff merge #332: `docs/handoffs/2026-06-05-pr332-merge-prod-validation.md`
- Waterfall: `features/dossier/waterfall-orchestrator.ts`
- Prompt compliance: `prompts/mega/specialist-prompts.ts` (módulo fiscal/compliance)
- PR #332: https://github.com/brunolimaff-jpg/NOVO-APP/pull/332

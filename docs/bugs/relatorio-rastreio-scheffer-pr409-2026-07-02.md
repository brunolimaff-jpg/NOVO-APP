# Relatório de rastreio — Pipeline V2 / Grupo Scheffer

**Data do run principal:** 2026-07-02  
**Audiência:** gestão + engenharia  
**Branch:** `feat/pipeline-v2-pr409-prompts-v2-output-mode`  
**PR:** https://github.com/brunolimaff-jpg/NOVO-APP/pull/409  
**Deploy Vercel:** `dpl_8r7actvbtdVJr5PTMN5fzy37qF2x` (commit `b9c0e04e` — fix Bug Freeze parcial)  
**Preview:** `https://scoutagro-git-feat-pipeline-v-ed3ef1-brunolimaff-3629s-projects.vercel.app`  
**Modo de coleta:** rastreio passivo (Tabbit) + telemetria Supabase + logs Vercel — sem cliques do agente após início pelo usuário

---

## Resumo executivo

A **primeira execução visual completa 7/7** do Pipeline V2 para **Grupo Scheffer** foi confirmada (~7 min). O backend (Gemini/LiteLLM, radar, módulos) respondeu com sucesso. Porém a aplicação **travou no render final** do dossiê: snapshot/screenshot do browser passaram a dar timeout, botões (`Interromper`) deixaram de responder e **nenhum dossiê foi persistido** (`dossier_completed` ausente).

| Área                         | Resultado                                      |
| ---------------------------- | ---------------------------------------------- |
| Pipeline V2 planner/collector| ✅ OK — `FULL_DOSSIER`                         |
| Waterfall / módulos backend  | ✅ Completou (com retry PORTA dim. T)          |
| Progresso UI                 | ✅ 7/7 visível                                 |
| Bugs A/B/C (lógica PR)       | ✅ Parcialmente validados (ver seção abaixo)  |
| Persistência + UX final      | ❌ **Freeze — dossiê perdido**                 |
| Merge PR #409                | ❌ **Não recomendado**                         |

**Recomendação para gestão:** aprovar continuidade do trabalho na PR #409 apenas após **fix v2** do freeze (persistir antes do render + handoff estático). Os demais bugs (BUG-1 a BUG-6) são rastreabilidade ou qualidade de fontes — não bloqueiam merge sozinhos, mas devem entrar no backlog.

---

## Sessão de referência (run documentado)

| Campo        | Valor |
| ------------ | ----- |
| sessionId    | `fb6f93d6-f77b-42cc-accf-115e78ca1eb2` |
| runId        | `fb6f93d6-f77b-42cc-accf-115e78ca1eb2-gen1-mr3hm2rm` |
| CNPJ         | `04733767000180` (04.733.767/0001-80) |
| Empresa      | Grupo Scheffer |
| Início (UTC) | 2026-07-02 12:35:15 (`dossier_started`) |
| Último evento Supabase | 2026-07-02 12:42:14 (heartbeat) — **silêncio após ~7 min de run** |
| Eventos `scout_diagnostics` | 102 |
| `dossier_completed` | ❌ Ausente |
| Linha em `dossies` (hoje) | ❌ Ausente |

### Outras tentativas Scheffer no mesmo dia (contexto)

| sessionId | Desfecho |
| --------- | -------- |
| `94f55d66-…` | Freeze pós-finalize (~52k chars console) |
| `3fadfc80-…` | Freeze em 3/7 — UI morta, Interromper inativo |
| `90e3fe7a-…` | Documentado em `docs/relatorio-validacao-scheffer-pr409-2026-07-02.md` |

---

## Linha do tempo — UI (rastreio Tabbit)

| Momento relativo | Progresso UI | Observação |
| ---------------- | ------------ | ---------- |
| ~56s             | 1/7          | "Realizando pesquisa..." |
| ~2m 43s          | 5/7          | Operação/cadeia ~1m 32s |
| ~4m 41s          | 5/7          | Step extra "Refinando sinais para alta precisão..." (duplicado na lista) |
| ~6m 35s          | **7/7**      | "Consolidando informações..." |
| ~7m 22s          | 7/7          | Console: `post-finalize-markdown`, `waterfallFinalTextLen` ~39.984 |
| Pós-7/7          | Travado      | Snapshot/screenshot **timeout** — DOM excessiva; Interromper não clica |

### Steps com tempo registrado na UI

| # | Step | Tempo |
| - | ---- | ----- |
| 1 | Mapeando conta real e teia societária | 8s |
| 2 | Mapeando operação e cadeia de valor | 1m 7s |
| 3 | Identificando bordas de controle | 8s (após render final; durante run chegou a mostrar 0s — ver BUG-1) |
| 4–7 | Compliance, Venda, Referências, Cards | `—` na UI (backend executou — ver nota abaixo) |
| — | Consolidando informações | Em foco no fim; travou no render |

**Nota:** a checklist 7/7 é **cosmética** e não mapeia 1:1 aos módulos reais. No Supabase constam, entre outros: Caminho de Venda concluído (~55s), benchmark (`pre/pos-benchmark`), módulo opcional falhou e foi ignorado, retry PORTA (dimensão **T** ausente).

---

## Linha do tempo — Supabase (telemetria)

| Horário (UTC) | Evento relevante |
| ------------- | ---------------- |
| 12:35:15 | `dossier_started` |
| 12:35:20 | `waterfall:start`, overlay inline |
| 12:36:21 | `planner+collector concluído` — 62 items, **FULL_DOSSIER** |
| 12:36:32 | 1º `module:complete` (Teia) |
| 12:41:50 | Caminho de Venda complete; `pre-benchmark` → `pos-benchmark`; retry PORTA dim. **T**; início "Consolidando informações" |
| 12:42:14 | **Último heartbeat** (`bufferLen: 0`) |
| — | ❌ Sem `ui-finalized`, `pre-save-dossier`, `post-render-fired`, `PostCompletion` |

**Discrepância:** console do browser avançou além do último flush Supabase — padrão repetido em todas as sessões com freeze.

---

## Logs Vercel — highlights

| Métrica | Valor |
| ------- | ----- |
| Chamadas `/api/gemini` | ~60+ no período do run — **HTTP 200** |
| `/api/radar-scan` | ~223 itens (Google News cobriu falhas RSS 403/404) |
| `/api/link-status` | Chamado no pós-waterfall (Bug A — validação inline) |
| `/api/open-web-search` | Brave 0 results em algumas queries → fallback Grounding |
| Teia societária | 14 CNPJs — BrasilAPI **403**, CNPJ.ws **429** → fallback Receita (200) |
| Erros fatais Vercel | Nenhum no período |

Deploy: `feat/pipeline-v2-pr409-prompts-v2-output-mode` · `dpl_8r7actvbtdVJr5PTMN5fzy37qF2x`.

---

## Catálogo de bugs

### BUG-7 — Freeze no render do dossiê final 🔴 **BLOQUEANTE**

| Campo | Detalhe |
| ----- | ------- |
| **Severidade** | Crítica — UX / perda de dados |
| **Sintoma** | 7/7 na UI; timer para; `Interromper` não responde; snapshot Playwright/Tabbit timeout; F5 não recupera sessão |
| **Evidência** | Sem `dossier_completed`; sem linha em `dossies`; telemetria para em heartbeat com `bufferLen: 0` enquanto console mostra `post-finalize-markdown` |
| **Causa provável** | `finalizeDossierMarkdown()` + render React síncrono de markdown grande (Scheffer: teia 14 CNPJs + radar 223 itens → ~40k+ chars) bloqueia main thread antes de `saveDossier` completar |
| **Fix tentado** | `b9c0e04e` — `await saveDossier` + `startTransition` em `SectionalBotMessage` — **insuficiente** para Scheffer (detalhes: [cadeia causal](./bug-7-freeze-render-cadeia-causal.md)) |
| **Fix proposto (v2)** | Persistir sessão **antes** do primeiro paint do markdown pesado; handoff estático / lazy chunks; liberar overlay só após confirmação de save — ver **fix v2 modificado** no doc causal |
| **Bloqueia merge?** | **Sim** |

---

### BUG-4 — Gemini Search timeout sistemático → fallback DuckDuckGo 🔴

| Campo | Detalhe |
| ----- | ------- |
| **Severidade** | Alta — qualidade de fontes |
| **Sintoma** | Timeouts em Search Grounding; fallback para DuckDuckGo Lite |
| **Impacto** | Evidências menos confiáveis no Evidence Pack |
| **Bloqueia merge?** | Não (gate Scheffer é BUG-7) |

---

### BUG-5 — BrasilAPI 403 + CNPJ.ws 429 na teia societária 🔴

| Campo | Detalhe |
| ----- | ------- |
| **Severidade** | Alta — qualidade teia |
| **Sintoma** | 14 lookups na teia: BrasilAPI HTTP 403, CNPJ.ws HTTP 429 em todos |
| **Mitigação observada** | Fallback via Receita Federal — lookups completaram com 200 |
| **Bloqueia merge?** | Não |

---

### BUG-1 — Timer exibe `0s` durante execução do step 🟡

| Campo | Detalhe |
| ----- | ------- |
| **Severidade** | Cosmética |
| **Sintoma** | Step recém-concluído mostra `0s` até próximo render; depois exibe tempo real (ex.: 8s) |
| **Interpretação** | Snapshot no instante do complete — **não** bug permanente de display |
| **Bloqueia merge?** | Não |

---

### BUG-2 — Steps 4–7 sem tempo na checklist (`—`) 🟡

| Campo | Detalhe |
| ----- | ------- |
| **Severidade** | Rastreabilidade |
| **Sintoma** | Progress 7/7 mas itens 4–7 sem duração na lista |
| **Causa provável** | Desync entre módulos backend e labels da checklist 7 steps |
| **Bloqueia merge?** | Não |

---

### BUG-3 — "Refinando sinais para alta precisão..." duplicado 🟡

| Campo | Detalhe |
| ----- | ------- |
| **Severidade** | Display |
| **Sintoma** | Mesmo label em "EM FOCO AGORA" e no fim da lista com spinner |
| **Causa provável** | Step interno Pipeline V2 (planner/refino) fora do mapa 1–7 |
| **Bloqueia merge?** | Não |

---

### BUG-6 — `url.parse()` DeprecationWarning 🟡

| Campo | Detalhe |
| ----- | ------- |
| **Severidade** | Segurança / manutenção |
| **Sintoma** | Warning Node DEP0169 nos logs `/api/cnpj` |
| **Ação** | Migrar para WHATWG URL API |
| **Bloqueia merge?** | Não |

---

## Validação dos bugs originais da PR #409

| Bug PR | Descrição | Status neste run |
| ------ | --------- | ---------------- |
| **A** | Inline validation deferred (`/api/link-status`) | ✅ Fluxo observado (chamadas link-status pós-módulos) |
| **B** | Log `PipelineV2 \| OutputMode selecionado` | ✅ `FULL_DOSSIER` confirmado Supabase |
| **C** | `maskPortaMarkers()` / PromptLeakShield | ⚠️ Não inspecionado no output (freeze impediu leitura do dossiê) |
| **Freeze** | UX pós-waterfall | ❌ **Reprovado** — BUG-7 |

---

## Dados alvo não capturados

A pipeline chegou a **7/7**, mas o travamento impediu inspeção manual dos cinco pontos de aceite do dossiê:

1. `OutputMode` no texto final (log Supabase OK; UI não acessível)
2. Presença de `"Buscar:"` no Evidence Pack
3. URLs do Evidence Pack
4. Score / cards de auditoria
5. Logs `PipelineV2` correlacionados ao output renderizado

---

## Conclusão e próximos passos

| Decisão | Recomendação |
| ------- | ------------ |
| Merge PR #409 | **Não** — até Scheffer completar com dossiê visível + `dossier_completed` |
| Prioridade engenharia | **BUG-7 fix v2** na branch da PR |
| Validação pós-fix | 1 run Scheffer manual como gate; Nutri Torta (~48k) como smoke |
| Backlog | BUG-4, BUG-5, BUG-6 em sprint seguinte; BUG-1–3 cosméticos |

---

## Documentação técnica derivada

A análise de reviewer sobre a falha do fix `b9c0e04e` e o estado real de storage foi documentada em notas dedicadas: [BUG-7 — cadeia causal e fix v2 modificado](./bug-7-freeze-render-cadeia-causal.md) descreve a sequência `post-finalize` → `updateSessionById` → parse síncrono → freeze, por que `startTransition` não resolve `useMemo`, e os cinco passos do fix recomendado; [dívida de storage IDB/Supabase](./storage-debt-indexeddb-supabase.md) esclarece que `extractCache` em IndexedDB **não** causa o BUG-7 e fica fora do escopo da PR #409 (ação futura Fase 8/9).

## Anexos e referências

- Índice de bugs: [docs/bugs/README.md](./README.md)
- BUG-7 cadeia causal: [bug-7-freeze-render-cadeia-causal.md](./bug-7-freeze-render-cadeia-causal.md)
- Storage debt IDB: [storage-debt-indexeddb-supabase.md](./storage-debt-indexeddb-supabase.md)
- Validação complementar sessão `90e3fe7a`: [docs/relatorio-validacao-scheffer-pr409-2026-07-02.md](../relatorio-validacao-scheffer-pr409-2026-07-02.md)
- Contrato loading/overlay: `docs/ai-context/refactor/loading-panel-contract.md`
- Supabase project: `vmqfcaoirjcfucvlnpig` — tabelas `scout_diagnostics`, `operator_events`, `dossies`

---

*Relatório gerado em 2026-07-02. Modo report-only — sem alteração de código neste documento.*

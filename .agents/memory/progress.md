# Progress

## 2026-09-01 (madrugada) — FECHAMENTO: instrumentação entregue, banner inline, doc-handoff compact-pr

- **Instrumentação BRU-162 entregue** @ `0a396975` (CI verde): `utils/longTaskObserver.ts` (7/7) + `markPhase()` 8 marcadores (orchestrator 42/42, full 1789/1789).
- **Run supervisionado #2 (`c2b3cb56`)**: travou de novo (freeze 2/2), mas rodou no deploy ANTIGO (build-info prova SHA `287358ff`; nenhum marcador veio). Morte entre `inline-validation:json:parsed` e `post-validate-inline`.
- **DuplicateDossierModal → banner inline** @ `0d336442` (pedido do Bruno): overlay não bloqueia mais; data-testid nos botões. Deploy novo: `scoutagro-pcgupdbon` (Ready 22:34) — run #3 deve ser disparado aqui.
- **Reports ao Planejador enviados e confirmados** (REPORT instrumentação; RUN #2 + banner). Aguardando run #3 do Bruno.
- **doc-handoff compact-pr feito**: Vault [[2026-09-01T22-45-00-bru162-instrumentacao-freeze]] + 2 lições (build-info prova SHA; modal bloqueante vs banner inline) + _INDEX-ALL 859 + INDEX-2026-09 criado + HANDOFF_AI reescrito (40 linhas).
- **Pendências**: run #3 no deploy novo (pina o freeze); cleanup dos 2 órfãos (agora são 2 candidatos — pedir autorização ao Planejador); BRU-156/161 bloqueados por BRU-162.

## 2026-09-01 (madrugada) — BRU-162: Planejador desenhou instrumentação e AGUARDA "vai" DO BRUNO

- **Desenho do Planejador (registrado no BRU-162)**: (1) marcadores de fase no waterfall — somente benchmark, finalize, save e mark-completed start/completed; (2) Long Task Observer >100ms — somente timestamp + duration + fase, sem texto/PII/attribution; (3) usar o flush imediato do scoutDiag (localStorage) já existente antes das regiões suspeitas — o flush remoto batch de 5s pode enganar ("último evento no Supabase"), sem criar beacon/worker/segundo transporte.
- **Gates determinísticos primeiro**: testes dos markers, supported/unsupported do Observer, full suite, typecheck, lint, build, CI no SHA. Locks: REAL_PROVIDER_CALLS=0 · REAL_SEARCH_CALLS=0 · sem Preview real · sem Golden · sem Prod/schema · sem merge. O run Preview supervisionado ÚNICO exige autorização separada depois.
- **BOLA COM O BRUNO**: "se esse desenho está aprovado, me dá um 'vai' e eu despacho o GLM principal + 1 subagente para implementar" (Planejador, chat 6a957742).

## 2026-09-01 (madrugada) — BRU-162 B1: NÃO REPRODUZI o freeze (STOP + proposta de instrumentação)

- **B1 concluído (read-only/local, REAL_PROVIDER_CALLS=0)**: pipeline real pós-retorno do módulo é LINEAR — `applyPromptLeakShield` 1.4ms @200k chars; `sanitizeSensitivePersonalData`/`normalizeGroundingSources`/`deriveVerificationStatus`/concat ~0ms. `stripMarkdown`/`cleanTitle` (regex de link com padrão de retrocesso, `textCleaners.ts:16/31`, ficou fora do fix 3d0af44f) tem caso patológico lento (~17ms) mas **satura mesmo @500k chars** — risco latente, não é a causa. `llmProxy` só JSON.parse; `appendWaterfallChunk` é concat; módulo não recebe `onText` (sem re-render por módulo).
- **CONCLUSÃO**: o pós-processamento auditado NÃO trava; freeze do run `e8c1ad56` não reproduzível offline.
- **PROPOSTA de instrumentação mínima (1 preview run supervisionado)** postada ao Planejador: (a) marcadores de fase no client no fechamento (`entering_benchmark→benchmark_done→entering_finalize→finalize_done→entering_save→save_done→entering_completed→completed_done` via scoutDiag) e (b) Long Task Observer (>100ms) ativo só durante o run. Nada muda contrato de dados. **Aguardando despacho**.
- **Retorno B1 postado e confirmado** (composer 0, msg no histórico, Thinking).

## 2026-09-01 (madrugada) — BRU-158 MICRODELTA @ 287358ff + BRU-162 Fase A RCA (run órfão e8c1ad56)

- **BRU-158 MICRODELTA FECHADO** (commit `287358ff`, PR #492 Draft, CI verde no SHA; Golden Live = falha credencial pré-existente BRU-160). Gate 1: teste de caracterização do wiring EvidencePack→extraContext (`waterfall-orchestrator.test.ts`, 41/41) + **negative control provado** (sem `connectEvidencePackToPool`, teste FALHA — mutação temporária não commitada). Gate 2: RED→GREEN — `formatAvailableSourcesForPrompt` expõe `[match=…]`+`[origin=…]` (pool 4/4). **Bônus**: removido teste órfão `identityWindowRaceCondition.contract.test.ts` (importa funções inexistentes, nunca commitado) → full suite **1781/1781**, typecheck/lint(meus arquivos)/build OK.
- **Run real do Bruno QUEBROU** (preview `scoutagro-2c8mvf9t0`, build `287358ff`): run `e8c1ad56` no xlvs concluiu 6/6 módulos (zen/deepseek-v4-flash) até 00:18:06Z, depois ZERO eventos; heartbeat parou 00:18:04Z; lease expirou; **órfão RUNNING**. UI travou — Bruno encerrou a aba.
- **Planejador** (chat 6a957742): criou **BRU-162 (Terminalização órfã, P0, In Progress)** antes do BRU-156; BRU-161 pausado. **NÃO autoriza** reduzir janela de cleanup nem UPDATE manual; **limpeza condicional** após 21:18:43 BRT (1h pós-lease) se único candidato stale → `close_stale_dossier_runs()` + READ-BACK. Despacho: **BRU-162 Fase A = RCA read-only agora**.
- **RCA Fase A (read-only)**: **fronteira de falha = main thread do browser congelou processando o retorno do último módulo** ("Caminho de Venda", o maior, prompt 92k chars). `module:end` chegou ao servidor (`/api/llm` 00:18:06Z) mas o cliente nunca emitiu `module:complete` — nem benchmark/save/completed/stop heartbeat. Pós-retorno roda na main thread: `sanitizeStreamText`→`enforceSeniorEvidenceConstraints`→`applyPromptLeakShield`→`normalizeGroundingSources` (`investigation-orchestration.ts:410-490`). `bd14faa3` não está no xlvs (outro ambiente) — não declarei mesma causa. Medida G (`close_stale_dossier_runs`) existe mas inativa (`dossier-ownership-contract.md:45`).
- **Retorno do RCA postado ao Planejador e confirmado** (composer 0, msg no histórico, Thinking). Hipótese Fase B: freeze no pós-processamento do maior módulo (candidatos: regex de link com retrocesso catastrófico — já ocorreu 2026-08-15 — ou custo sanitize/leakShield em texto 92k). Aguardo despacho.

## 2026-08-31 (noite) — BRU-158 Q1 GREEN @ f256b840: EvidencePack atravessa a fronteira para o source pool

- **Q1 RED→GREEN** (`f256b840`, PR #492): `connectEvidencePackToPool()` em `utils/dossierSourcePool.ts` + conexão no `waterfall-orchestrator.ts` logo após `executeQueryPlan` (antes o pack só virava telemetria e era descartado — achado da auditoria Q0 do Planejador: a busca roda 15 chamadas mas o resultado não ia a lugar nenhum). `mergeDossierSourceRefs` agora preserva campos extras via spread; `formatAvailableSourcesForPrompt` inclui `[tier=X]` + claim. 4 testes em `tests/utils/dossierSourcePool.test.ts`.
- **CI no head**: Tests/Typecheck/Lint/Build/Smoke + todos os gates ✅; Golden Dossier Live = FAILURE pré-existente de credencial (fora do gate por decisão, BRU-160).
- **Pendência**: post do checkpoint Q1 ao Planejador (chat 6a957742) montado no composer mas clique no Send NÃO CONFIRMADO (aba em background). Na próxima sessão: confirmar/reenviar (fallback computer-use) e colher a re-auditoria → BRU-158 Done → destrava BRU-161.
- **Fechamento da sessão**: doc-handoff compact-pr feito — Vault [[2026-08-31T19-30-30-bru158-q1-evidence-pool-fechamento]] + 3 lições (budget fonte única; service key×URL mismatch 401 silencioso; Planejador texto-first) + _INDEX-ALL 780 lições.

## 2026-08-31 (noite) — BRU-158 Q0 EXECUTADO: WEB_SEARCH_NOT_YET_REQUIRED (aguarda auditoria)

- **Doc**: `docs/auditorias/bru158-q0-fronteira-evidencia-scheffer.md` — mapa causal por arquivo/função, inventário de proveniência, matriz disponível→entregue→reconhecida→publicada, 3 exemplos, conclusão.
- **Fronteiras encontradas (3)**: (1) **Falso warning CNPJ** — `validateTeiaCnpjsOutput` (waterfall-orchestrator:449) emite "não confirmado" para o CNPJ que o próprio input fornece (knownContext não o inclui) → VERIFIER DEFEITUOSO, warn não bloqueia; (2) **CRM/gaps → "processo manual"** — gap entregue corretamente, composição fabrica planilha/sistema paralelo; (3) **QSA/nome → cargo/pessoa** — nomes entregues, composição atribui controladora/decisão sem gate. Em nenhuma delas web search resolve — todas são alvo do BRU-161 (epistemic guard).
- **Contexto entregue trunca em 12k chars** (`WATERFALL_CONTEXT_WINDOW_CHARS`, waterfall-orchestrator:76) — margem para investigar depois (não foi fronteira dos runs).
- **Run #3 (Bruno Lima)**: COMPLETED 2min46s, 6/6 zen, PORTA 61/100, 39k chars, vmqf 0 writes; abas recuperadas via IAB; falso "interrompido" na UI (BRU-156).
- **Canal com o Planejador (decisão do Bruno)**: texto estruturado/tabelas = principal; PNG anexado no Linear = suplemento para humanos (Planejador acessa Linear por API — imagem incerta); computer-use nativo = fallback de envio (clique no Send). Gráfico de latência anexado no BRU-158.
- **Despacho vigente**: BRU-158 Q0 continua, não implemente ainda; run #3 entra na matriz (falso warning CNPJ = validator defeituoso, não hallucination); REAL_PROVIDER_CALLS=0 até retorno do BRU-158. Retorno do Q0 postado — aguardando auditoria do Planejador para destravar BRU-161.

## 2026-08-31 (noite) — Despacho final: BRU-157 DONE; BRU-159 inconclusivo; BRU-158 Q0 read-only

- **BRU-157: DONE** (auditoria formal Planejador = PASS operacional). PR #492 @ `d8b7027f`: CI Tests/Typecheck/Lint/Build/Smoke ✅; Golden Live FORA do gate por decisão (falha de auth = credencial rotacionada). PR segue Draft + Merge Lock.
- **Credencial**: Planejador escolheu (c) estrito — não resetar senha agora (BRU-158/161 exigem REAL_PROVIDER_CALLS=0; credencial válida dispararia rodadas reais no CI). **BRU-160** criado: rotacionar credencial preview + GitHub secret, atômico, antes do próximo Golden, sem senha no chat.
- **BRU-159: Canceled/inconclusivo** — Luna desabilitada + payload não replayável = evidência secundária. Decisão: não trocar DeepSeek sem evidência.
- **BRU-158: In Progress (Q0 read-only)** — mapear dados→collector/planner→contexto→módulos→composição (Scheffer). PASS = mapa causal + proveniência + matriz disponível→entregue→usado→publicado + 3 exemplos + conclusão WEB_SEARCH_NOT_YET_REQUIRED / REQUIRED / NOT_PROVEN. Zero provider/busca/writes. **Despacho: começar agora; nada de senha/Golden/Brave/mutação/código até a fronteira causal.**
- **BRU-161 (epistemic guard)** criado, bloqueado pelo 158: gate determinístico (CNPJ não contradito; ausência ≠ "processo manual"; QSA sem cargo ≠ CFO; ausência ≠ ROI; hipótese rotulada; insuficiência = "não sabemos + discovery"). Depois: V3 da #491.
- **Delivery-loop**: F7 = 0 threads na PR. F8 = HANDOFF_AI reescrito (33 linhas) + memória. REPORT_READY emitido com Merge Lock.
- **Regra nova do Bruno (memória persistente)**: decisões de credencial/secret/segurança nunca sozinhas.

## 2026-08-31 (noite) — BRU-159 SPIKE A/B executado: DeepSeek mantido; extrapolação é contrato+entrada, não modelo

- **Spike local (Planejador criou BRU-159, filho do BRU-155; BRU-158 bloqueado pelo 159)**: A/B com prompt único (SHA-256 `b07330cc88d891ed…`), EvidencePack determinístico dos fatos canônicos Scheffer (teia 18+1, QSA, CRM 74 módulos, PORTA 50/100, ausentes explícitos), WEB OFF, temp 0.2. Endpoints Zen testados localmente: `/chat/completions` (DeepSeek) e `/responses` (GPT-5.6).
- **Desvios declarados**: `gpt-5.6-luna` desabilitada na conta (401 Model is disabled) → Rodada B = `gpt-5.6-terra` HIGH; payload real não persistido → EvidencePack determinístico; LiteLLM homolog 404 no endpoint que o app usava + 401 com a key atual nos 3 ambientes (dev/homolog/prod) — baseline LiteLLM inexecutável.
- **Resultado (avaliação cega X/Y)**: DeepSeek V4 Flash = 0 fabricações, mural completo, 8/8 V3, 21s · GPT-5.6 Terra HIGH = 1 fabricação MATERIAL (razão social + todas as CNAEs consolidadas no CNPJ consultado — classe exata do bug de reconciliação que o verifier apanha), 34s.
- **Adjudicação congelada aplicada**: "DeepSeek equivalente/melhor → mantemos DeepSeek e atacamos epistemologia/composição". Rodada C desnecessária.
- **Descoberta dupla**: (1) com contrato epistemológico explícito, as fabricações do dossiê real (CFO, "processo manual", demurrage) não aparecem em NENHUM modelo → extrapolação do runtime é problema de composição/contrato (etapa 2) + entrada (etapa 1); (2) com entrada curta, qualquer modelo só entrega mural de "não encontrado" — utilidade comercial depende de evidência de entrada.
- Artefatos: `.tmp/spike/` (prompt+SHA, bodies, OUT-X/Y, key.txt). Zen: chave `opencode` do auth.json funciona (`opencode-go` não); 12 modelos visíveis na chave (gpt-5.6-sol/terra, deepseek-v4-pro/flash, gemini, kimi, qwen…); `luna` desabilitada; sem rate limits por plano (só gasto mensal + auto-recarga $20 <$5); DeepSeek off-peak mais barato (peak 01-04h e 06-10h UTC).

## 2026-08-31 (noite) — RUN REAL #2 com fix 225s: COMPLETED, 6/6 módulos, zero falhas

- **Run c03a60c5** (Scheffer, sessão nova 6f75430d, preview `fzqop7zg1` @ `563f6f52`): **COMPLETED em 4min35s** (19:49:52→19:54:27Z), sem erro, lease limpa. Dossiê 37.133 chars, isError=false, UI saudável. Rastreado ao vivo pelo banco (sem CDP — protocolo BRU-98).
- **6/6 módulos provider=zen · served_model=deepseek-v4-flash · fallback_used=false**: Teia Identidade **40,4s** (antes abortava em 180s) · Teia Profundidade 35,2s (novo módulo que nem rodava antes) · Operação/Cadeia 27,0s · Bordas 47,8s · Riscos 41,5s · Caminho de Venda 54,6s. Benchmark + PORTA reconciliation OK. grounding-unavailable (pool vazio) como esperado.
- vmqf 0 writes durante todo o run. Zero LiteLLM.
- Veredito postado ao Planejador (auditoria pendente dele + perguntas: grounding vazio esperado? divergência UI×banco p/ BRU-156).
- **Estado BRU-157**: Zen-only FUNCIONAL ponta a ponta no preview — 2 runs reais consecutivos limpos.

## 2026-08-31 (noite) — Fix do gargalo de request (225s): módulo societário não aborta mais

- **Achado 1 FECHADO** (commit `563f6f52`, PR #492): `api/_llm-client` deixa de ter `MAX_REQUEST_BUDGET_MS = 180_000` hardcoded e deriva de `budgets.ts` — `LLM_REQUEST_BUDGET_MS = proxy(210s) + headroom(15s) = 225s` (erro canônico continua sendo o do proxy; maxDuration 300s comporta). Env branch-scoped `LITELLM_REQUEST_TIMEOUT_MS=225000` na #492 (project-level 180000 venceria pelo Math.min). RED→GREEN: budgets 6/6, focused 17/17, typecheck/lint/build OK.
- **Preview novo**: `scoutagro-fzqop7zg1` (código `563f6f52`). Smoke pós-deploy: HTTP 200 `_model=deepseek-v4-flash`; module:end no xlvs `provider=zen`; vmqf 0 writes.
- **Achados 2/3 esclarecidos no código (não são defeitos)**: `module:deadline` = telemetria apenas (warn se módulo >60s, `waterfall-orchestrator.ts:1070`); `grounding-unavailable` = pool de fontes vazio (estado do preview sem busca). Achado 4 (recovery `useInterruptedDossierRunRecovery`) NÃO bloqueia novo run — Bruno pode disparar de novo; divergência UI×banco segue no BRU-156.
- Diagnóstico do "não roda" do Bruno: banco sem run preso (94ae20c4 COMPLETED, sem lease); nenhum run novo criado após 19:29:47Z.
- Atualização postada ao Planejador (chat 6a957742); ele estava auditando o retorno anterior (skill auditoria-de-retorno-do-executor).

## 2026-08-31 (noite) — RUN REAL forced-Zen do Bruno no preview: COMPLETED, Zen provado no banco

- **Run 94ae20c4** (Grupo Scheffer, preview `scoutagro-1kncemvhu` @ `3c965091`): **COMPLETED** (19:23:01→19:29:47Z, ~6min40s), lease limpa, sem órfão. PORTA 50/100, cliente Senior confirmado (74 módulos), dossiê renderizado (3 módulos + 2 seções).
- **Prova de provider NO BANCO (5 module:end)**: `provider=zen · served_model=deepseek-v4-flash · fallback_used=false` em todos — Porte/Teia (37s), **Operação/Cadeia de Valor (21s — o módulo do run e29ab677)**, Bordas (30s), Riscos (25s), Caminho de Venda (84s). Zero LiteLLM (nenhum 429; único erro assinado `[Zen]` nos runtime logs). vmqf 0 writes durante todo o run.
- **Achado material 1 — gargalo novo**: "Teia Societaria — Identidade" abortou aos **180s exatos** = cap `MAX_REQUEST_BUDGET_MS` (api/_llm-client.ts) → 504 GATEWAY_TIMEOUT → degradação do módulo ("busca societária degradada"). Step 225s e proxy 210s coerentes, mas o REQUEST cap (180s) ficou atrás — decisão do Planejador: subir cap (~225s) ou aceitar degradação.
- **Achados 2-4**: `module:deadline` do waterfall client atingido (~6min); `grounding-unavailable` (sem URLs — esperado no preview?); divergência UI×banco no fechamento pós-reload (UI disse "não concluído", banco COMPLETED) — candidato ao BRU-156.
- Nota: models `bedrock/*` nos payloads = resolvedModel do modelRouter (input); Zen ignora e serve deepseek-v4-flash. `module:end` (fire-and-forget) persistiu nos 5 módulos — perda no smoke foi intermitente.
- Tudo consolidado e disparado ao Planejador (chat 6a957742): smoke 4/5 + run real + 4 achados; aguardando despacho (budget de request; habilitar auditoria da Fase B).

## 2026-08-31 (noite) — BRU-157 Fase B executada (envs Zen + xlvs + microdelta) + smoke Zen-only

- **Microdelta da ressalva FECHADO**: `llmProxy` consome `LLM_PROXY_TIMEOUT_DEFAULT_MS` de `budgets.ts`; override `VITE_LLM_PROXY_TIMEOUT_MS` removido (código + `.env.example`); teste de contrato novo (RED→GREEN) impede regressão. Commit `3c965091` na PR #492. Gates: focused 58/58, budgets 4/4, typecheck 0 novos (só `identityWindowRaceCondition` untracked pré-existente), lint 0 erros, build OK.
- **9 envs branch-scoped no preview #492**: `LLM_PROVIDER=zen`, `OPENCODE_ZEN_MODEL=deepseek-v4-flash`, `OPENCODE_ZEN_BASE_URL/API_KEY`, `SUPABASE_URL/ANON_KEY` + `VITE_*` (xlvs) e `SUPABASE_SERVICE_ROLE_KEY` (xlvs, via supabase CLI). **ACHADO**: a SERVICE_ROLE_KEY project-level do preview apontava para `vmqf` (produção) — mismatch URL xlvs × role vmqf fazia o insert server-side falhar silenciosamente.
- **Redeploys**: `scoutagro-5u6vy7zii` (envs zen) → **`scoutagro-1kncemvhu` / `dpl_3hE35mFvUFAUsjXCJ8N3xVfzt2qd`** (final, código `3c965091`; redeploys CLI não expõem git meta — proveniência pela cadeia).
- **Smoke Zen-only (19:17:38Z)**: HTTP 200 `{"text":"OK","_model":"deepseek-v4-flash","finishReason":"stop"}`; telemetria server-side `module:start` (`srv-mthmeoie-j2pm`) gravada no **xlvs**; **vmqf 0 writes** (scout_diagnostics/dossier_runs/operator_events). **LiteLLM requests=0: NÃO VERIFICADO via API admin** (404 em /spend/logs, /global/activity, /spend/calculate no litellm.homolog) — compensado por fail-closed (spec cb9c25bf, 75/75) + servedModel=Zen.
- **Limitação pré-existente**: `module:end` (insert fire-and-forget pós-resposta em `api/llm.ts`) não chegou ao banco no smoke — `module:start` chega; gap conhecido, não introduzido nesta rodada.
- **Planejador (chat 6a957742, navegador interno/Browser Use IAB)**: 3 posts — confirmação de estado; aviso de execução da Fase B (recado do Bruno verbatim: "use superpowers e ponytail" + pedido de registro da Fase B no Linear BRU-157); retorno do smoke.

## 2026-08-31 (tarde) — BRU-157 Zen-only Fase A (PR #492) + preview 429

- **BRU-157 criado pelo Planejador** (decisão do Bruno: "vamos continuar somente com o Zen primeiro, vamos fazer rodar"). Frente isolada, NÃO é o Golden BRU-153. Bloqueia temporariamente o resto do BRU-155.
- **Fase A CONCLUÍDA** — PR #492 `feat/bru-157-zen-only-stabilization` @ `6db80b16` (base #490 `1bcf31b1`). Causa provada: step interno 90s/60s hardcoded (waterfall-orchestrator) + 60s (porta-reconciliation) + PORTA 120s local < proxy 210s → step abortava chamada válida (run `e29ab677`: `timeout after 90000ms`, Vercel HTTP 200 após abort). Fix: `services/llm/budgets.ts` fonte única (proxy 210s + headroom 15s = 225s step), integrado nos dois módulos; removidos números mágicos. RED→GREEN, `REAL_PROVIDER_CALLS=0`.
- **Gates Fase A**: focused 64/64 + budgets 3/3 + ownership 4/4 (`tests/contracts/bru157-budget-ownership.test.ts`) · contracts 148/148 · full suite 1773/1793 (única falha = `identityWindowRaceCondition.contract.test.ts`, untracked pré-existente) · typecheck 0 erros novos · lint 0 erros novos · build OK · diff --check OK. CI success + Preview Smoke success.
- **Preview #492 testado pelo Bruno → 429 em todas as chamadas `/api/llm`**: LiteLLM sem orçamento (P0 original); **envs do preview ainda NÃO em modo Zen — Fase B pendente**.
- **Segurança**: console colado pelo Bruno continha senha de teste em claro (`Bruno!100696`) — Bruno confirmou "chave de teste real somente, não é pra uso real"; recomendar troca; não registrar credencial.
- **Vault**: checkpoint `2026-08-31T13-38-41-bru157-zen-only-fase-a-checkpoint.md` + índice mensal.

## 2026-08-31 (tarde) — Fallback V1 + BRU-155 Gold Quality V3

- **PR #490** `feat/llm-fallback-v1` @ `1bcf31b1` (Draft): Fallback V1 canônico — fail-closed `LLM_PROVIDER` litellm|zen; allowlist BRU-147; orçamento único; `servedModel` observado; gatewayBody removido dos logs; spec `cb9c25bf` restaurada; 75/75 testes. Empilhada como base.
- **PR #491** `feat/bru-155-gold-quality-v3` @ `c54e88f9` (Draft, base #490): BRU-155 — compositor V3 (8 seções, máx. 1 Mermaid, CNPJ macro único, ausência explícita), fonte única de budgets, integração waterfall/porta-reconciliation; focused 199/199, contracts 144/144, full suite 1782/21 (falha pré-existente em `identityWindowRaceCondition.contract.test.ts`); typecheck 0 erros novos; lint 0; build OK.
- **Supabase Preview `xlvs`**: schema canônico reconstruído (BRU-145 Done de verdade); produção `vmqf` intacta.
- **Qualidade**: subagente avaliou copy real em 59/100; causa dominante = dados de entrada (busca degradada + benchmark indisponível); oracle canônico = `EXECUTIVE_LEAN_DOSSIER_OUTPUT_CONTRACT_V3`; `expected-dossier.md`/`case.json` stale.
- **Linear**: BRU-149/150/151/152/145 Done (auditados); BRU-155 e BRU-156 abertos; BRU-153 (Golden) BLOCKED; BRU-143/144 aguardam chave; BRU-81 In Progress (não misturar com BRU-155).
- **Handoff**: Vault `2026-08-31T11-58-57-fallback-v1-bru155-gold-quality.md` + índice mensal + lição ui/browser-iab-planner-tab-protocol + HANDOFF_AI reescrito.
- Vault sessão: [[2026-08-31T11-58-57-fallback-v1-bru155-gold-quality|Fallback V1 + BRU-155 Gold Quality]].

## 2026-08-31 — Link do Copilot no banner + handoff completo + Linear reconciliado

- **#489 MERGE**: link do Copilot (Senior) adicionado ao banner de contingência (antes era texto sem link). URL limpa do agente M365 (sem login_hint). Main: `b6fa24c5`. Deploy produção automático READY (`scoutagro-cq69jw0s3`), verificado HTTP 200.
- **Baseline produção gravado**: docs/deployments/2026-08-31-ultimo-prod-promovido.md (dpl_9jjAoSXRNMKGDrmic9mUVxBZiJiT, SHA 78035eff → +#489).
- **doc-handoff (modo full)**: Vault Sessões/2026-08/2026-08-31T07-48-07-contingencia-zen-merges-banner.md + índice mensal + 3 lições (ui/banner temas+clicabilidade, llm/200-OK≠qualidade, ci/rebase--skip) + _INDEX-ALL + ADR decisões/2026-08-31-adr-contingencia-opencode-zen.md + CALIBER_LEARNINGS (lição contingência) + HANDOFF_AI.md reescrito (37 linhas) + activeContext atualizado.
- **Linear**: BRU-137 a 142 Done (confirmado via CLI) · 143/144 Backlog (dependem de decisão do Bruno). Pedido de fechamento entregue ao Planejador (chat 6a8851e1).

## 2026-08-30 — Banner sem a frase de abertura (ajuste do Bruno)

- Bruno pediu: manter o banner, **remover só a frase** "O problema não é você. Nem eu." (não o banner inteiro — eu havia revertido o banner por engano na #487 e depois restaurei).
- **#488 MERGE**: restaura banner v2 (estático, compacto, tema claro/escuro) SEM a frase. Texto final: "O fornecedor de IA que alimenta os dossiês está fora do ar. Use só o GPT Senior Scout 360 ou o Copilot (Senior). Avisamos aqui quando o fornecedor voltar."
- Main final: `78035eff` (commit `c079137b`). Deploy produção automático (GitHub integration), verificado com screenshot real logado (banner 1 linha, link clicável, header livre).

## 2026-08-28 (noite) — MERGE EXECUTADO (palavra MERGE do Bruno): #484 + #485 + #486 em produção

- **#484** (instrumentação 429): ready → **MERGE**. Read-back main: `faa12bd9`.
- **#485** (SC-429 + SC-429B): **rebase** sobre a nova main (conflito em `api/_llm-client.ts` resolvido combinando instrumentação #484 + budget terminal; 75/75 testes), push `d21ac30a`, **CI verde** → **MERGE**. Read-back main: `6e56d292`.
- **#486** (banner de contingência no app): CI verde → **MERGE**. Read-back main: **`bfdf6eea`** = #484 + #485 + banner.
- **PRODUÇÃO**: deploy automático da main (GitHub integration) `scoutagro-pbhmngyk4` **READY** — produção serve `bfdf6eea` (instrumentação + SC-429 amigável + banner). Verificado com screenshot real (logado com teste@senior.com.br).
- **fix/llm-zen-temporary**: rebased (`b74a7d27`, b339c05a pulado — já contido; wiring zen limpo, 49/49 testes), pushado, CI rodando. **NÃO mergeada** — aguarda BRU-143 (Golden) + `DATA_BOUNDARY_APPROVED=YES`.
- **BRU-137 Done** no Linear + read-back completo reportado ao Planejador (chat 6a8851e1).
- Contingência OpenCode Zen (BRU-137-144): wiring `b74a7d27`/`0ddcc1ec`, sonda 200, envs branch-specific, preview scoutagro-1069icq26 funcional, isolamento xlvs provado (sentinela), levantamento data-boundary no BRU-142.
- Banner no app: "O problema não é você. Nem eu." + GPT Senior Scout 360 + Copilot (Senior). Rollback = re-deploy da main sem o banner.
- Login no preview: `blimaf@senior.com.br` (hash produção) e `teste@senior.com.br`/`Teste!123` confirmados; `user_context` criada no preview.

## 2026-07-28 — PR #464 baseline nativo PG 17 & least privilege hardening

- Reconstruída a cadeia canônica de migrações em `fix/canonical-supabase-migration-baseline` (PR #464, HEAD: `a8a07919a606969fc34c7daee4ec41ca72f48b57`).
- Dump nativo via `pg_dump` 17.10 contra PostgreSQL 17.6 remoto de Produção gerou `20260501000000_production_schema_baseline.sql` sem contaminar objetos do schema `auth`.
- Mantidos 18 marcadores no-op de Produção (preservando timestamps canônicos).
- Adicionadas migrações de hardening: `20260728173731_harden_dossier_grants.sql` e `20260728180000_harden_legacy_operator_linking.sql`.
- Paridade de catálogo em 15 categorias contra Produção aprovada com `PRODUCTION_BASELINE_CATALOG_DIFF: ZERO` (37/37 constraints com `pg_get_constraintdef`).
- Replay PSQL (`-v ON_ERROR_STOP=1`) e `npx supabase db push` local em PG 17 aprovados com 21 migrações registradas.
- Testes runtime PostgreSQL (`test_harden_dossier_grants.sql` e `test_harden_identity.sql`) e 61/61 asserções vitest de contrato aprovados.
- Lint (0 erros) e `git diff --check` aprovados.
- Vault: [[2026-07-28T17-25-00-fix-canonical-supabase-migration-baseline|Baseline nativo PG17 + Hardening]].

## 2026-07-24 — PR4 code gate e Preview Supabase isolado

- PR3 `#450` permanece com code gate aprovado e release gate bloqueado; head `3b929f7b`.
- PR4 `#451` permanece draft, base `codex/dossie-pr3-lifecycle`, mergeável e com code gate aprovado; head funcional `5807e630`.
- Preview Git ficou READY no head esperado e comprovou 10 Functions.
- Criado o Supabase `scoutagro-preview` em `sa-east-1`, ref mascarada `xlvs…owec`, status `ACTIVE_HEALTHY` e custo registrado de 0 por mês.
- Preview e Produção agora têm refs distintos; isolamento documentado como confirmado. Produção `vmqf…npig` não foi alterada.
- Cinco envs Supabase foram configurados somente no Preview; LiteLLM base URL, API key e alias geral estão presentes; alias de chat é opcional e está ausente.
- Envs exigem novo deployment Preview. Migration, SQL, RPC/RLS, usuário/run controlados e smoke ainda não foram executados.
- Code gate PR4 registra 65 testes focados, build passando e zero erro novo de typecheck nos arquivos da PR4.
- Decisões preservadas: alias lógico obrigatório, retry da aplicação igual a zero, tools/Brave/EvidencePack na PR5 e cutover na PR6.
- Bloqueador PR6: definir proprietário único da lease entre geração, persistência, conclusão, falha e cancelamento.
- Checkpoint: `docs/checkpoints/2026-07-24-pr4-code-gate-e-preview-isolado.md`.
- Nesta atualização documental não foram executados testes, build, deploy, migration, SQL ou smoke.

## 2026-07-23 — PR4 gateway LiteLLM local

- Branch `codex/dossie-pr4-gateway` sobre a base exata `3b929f7b`; commit funcional `2f132aa1`.
- Criado `api/dossier.ts` com auth Supabase, ownership por `runId`, generate/chat contextual e correlação.
- Gateway interno encadeia `AbortSignal` até o LiteLLM e limita o budget a 50 s.
- Compatibilidade do caminho legado `/api/gemini` preservada após revisão adversarial.
- 32 testes focados, ESLint focado, diff check e build passaram.
- Typecheck e suíte ampla permanecem bloqueados por falhas preexistentes; detalhes em `HANDOFF_AI.md`.
- Uma consulta Vercel aos envs retornou 403; isolamento segue `NÃO_VERIFICADO`.
- Sem push, deploy, PR, migration, alteração remota ou merge.
- Vault: [[2026-07-23T13-54-30-novo-app-pr4-local-gateway]].

## 2026-07-20 — PR 2: contenção de Radar e War Room

- Baseline `e0e3d8b2468fdf4e1afe3159c2a5b8320e395845`; branch `codex/dossie-pr2-contencao`.
- Radar, auto-scan, War Room, benchmark independente, docs-RAG, health generativo e ping LiteLLM foram removidos da aplicação ativa.
- `api/gemini`, `api/rag`, Pinecone, dados históricos e o benchmark interno do waterfall foram preservados.
- Preview deverá comprovar nove Functions Node; não houve LLM real, migration, deploy manual ou merge.

## 2026-07-14 — Fase 3B.3C.1 (live readiness macOS)

- Branch `fix/fase-3b3c1-live-readiness-macos` @ `636c3d4e`
- Separa `asset_checksums_esperados` × `binary_checksums_esperados` (arm64 binário com proveniência)
- Verificador live de hook + atestação humana fora do repo
- `check-pilot-readiness.rb` somente leitura
- Sem instalar DCG / sem alterar hooks / sem Codex ou piloto real

## 2026-07-14 — PR #430 MERGED (Fase 3B.3C)

- Squash `636c3d4e6fe2b369f7e7644242e79b7edb8781d1`

## 2026-07-17 — Encerramento da prova final supervisionada

- PRs #442, #443 e #444 concluídas e preservadas.
- Preparação bloqueada antes da reserva por `RUNNER_HEAD_NOT_FROZEN`.
- Encerramento formal documentado; nenhum runtime, piloto, state, evidência,
  entrega ou Run Report foi criado.
- Prioridade devolvida ao backlog do Scout 360; próxima triagem: #409–#418 e
  #435.

# 2026-07-20 — PR 1: baseline, CI e Vercel

- Baseline remota confirmada em `a55113e525d31c5a0de82f5b01208ac82ae1eb29`.
- Worktree principal estava suja; PR 1 segue em worktree isolada.
- Plano consolidado: `docs/planos/estabilizacao-dossie-litellm-v1.md`.
- Escopo: Node 24, npm 11.11.0, `npm ci`, CI, Vercel, sourcemaps Sentry opt-in e documentação operacional.
- Node `24.14.1`, npm `11.11.0`, `npm ci`, build e docs check passaram.
- Preview final `dpl_AMQkRove9o47UHrVwt1pB8okXE9d` ficou READY, comprovou Build Output e 13 Functions Node; sem deploy manual ou produção.
- Sentry runtime não mudou; o plugin de build só envia sourcemaps com opt-in explícito e token.
- Typecheck, Tests, Golden e E2E continuam com falhas preexistentes comparadas à baseline.

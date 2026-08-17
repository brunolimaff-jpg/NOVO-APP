# Progress

## 2026-08-17 (noite 2) — Veredito d6e48a0f = PASS COM RESSALVAS (Planejador auditoria 9d4958ca)

- **PASS COM RESSALVAS:** 4 deltas confirmados (não contratado→🟠, R10 centralizada em gold-policy, prompt Caminho da Venda, BLOQUEIO DE GOVERNANÇA DERIVADA) + teste A' cross-surface provado (mesmo SafePack, claim na Tabela/ausente no Mapa; dedup continua dimension|evidence).
- **CI SUCCESS** (run principal). Fails de CodeQL/Analyze = REMOTE_ENVIRONMENT (GitHub 429 no download de codeql-action), não código. Preview same-SHA READY (dpl_ANLst74UuDivQTpeZ2YZayq8L1R8, SHA d6e48a0f).
- **RESSALVA ABERTA:** holding/governança NÃO tem barreira determinística final (só o prompt). Planejador: "se a próxima rodada voltar a fabricar holding/governança e passar do verifier, é defeito aberto — não aceitaremos só porque o prompt diz".
- **NEXT GATE = RODADA REAL ⏸️ (autorização do Bruno):** nova Scheffer com objetivo fechado — provar na mesma saída: (1) TMS/WMS 🟠, (2) ausência não vira dor/Sinal/Risco, (3) Caminho não recontado em prosa, (4) sócia PJ não vira holding/governança. Rodada/provider paga exige autorização do Bruno.
- **Estado:** IMPLEMENTADO ✅ → CI ✅ → PREVIEW SAME-SHA ✅ → RODADA REAL ⏸️ autorização Bruno → READY FOR MERGE ❌ → MERGE 🔒.
- **Atenção validação:** identificar por deployment+SHA, não pelo alias da branch (já apontou de volta para f927da00 antes).


## 2026-08-17 (noite) — Veredito visual do Planejador (run d06cf268): GOLD técnico ✅ produto ❌ → 4 deltas pushados (d6e48a0f)

- **Veredito do Planejador com prints + runtime + código:** Gold tecnicamente passou (gold_pass, 943 palavras, 3 ações, 0 violações, CI SUCCESS) mas o BRU-119 como contrato de produto NÃO passou. 4 problemas que o contrato automático não vê:
  1. "Não contratado" escapava do matcher de ausência → Tabela de Elos com "TMS/WMS → ✅ Confirmado → Não contratado" (epistemologia divergente da Tabela de Tecnologia 🟠).
  2. Ausência ainda fabricava tese comercial: Sinal 3 ("criam uma desconexão") + Riscos ("gestão da frota pode estar limitada") — verifier não cobria as novas formas.
  3. Caminho da Venda duplicado em prosa (Composer reconta Evidência→Hipótese→Discovery embaixo do Mermaid) — quebra single-owner.
  4. "Holding" promovida além da superfície (Síntese "holding de capital aberto", Pessoas-Chave "governança é indicada pela estrutura de holding") — tabela prova sócia PJ direta, não governança.
- **A' tratado como fallback transitório seguro** — o Mapa do Caos rico é preservado para o futuro (Company First / OperationalCompanyGraph: grafo primeiro, mapa depois). Não misturar missões: #483 = estabilizar; nova saída = mapa operacional rico.
- **Autorização explícita (BRU-119 comentário 665d8863): corrigir os deltas sem nova decisão.**
- **Fix (d6e48a0f):** 1) ABSENCE_EVIDENCE_PATTERN + "contratad[oa]s?"; 2) ABSENCE_DERIVED_WEAKNESS movida p/ gold-policy (RCA-05) + expandida (desconexão/não integrados/pode estar limitada/impactando eficiência); 3) prompt Caminho da Venda: prosa não reconta fluxo; 4) prompt BLOQUEIO DE GOVERNANÇA DERIVADA. + teste A' cross-surface.
- **Gates:** gold 428/428 · full 2230/2230 · typecheck 0 · lint 0 · build OK · no-gemini PASS. Push 6a53338c → d6e48a0f, CI rodando.
- **Detalhe operacional do Planejador:** o alias genérico da branch foi apontado de volta para redeploy do f927da00 — próxima validação deve exigir URL/deployment SAME-SHA, não confiar no alias.
- **Estados:** RUNTIME GOLD_PASS ✅ · CI ✅ · VISUAL/BRU-119 ❌ → corrigido (aguardando revalidação) · MAPA FUTURO PRESERVADO ✅ · READY FOR MERGE ❌ · MERGE 🔒.


## 2026-08-17 (fim de tarde) — GOLD_PASS em runtime: primeira rodada com fixes do veredito visual (d06cf268)

- Bruno rodou a Scheffer no Preview da branch (scoutagro-git-feat-v6-shadow-prep). **GOLD_PASS confirmado no Supabase:**
  - diagnostics-pre-compose: 0 hardFails · diagnostics-post-preflight: 0 hardFails, codes [] · contract-done: passed=true, wordCount 943, 3 ações, 0 violações · output-selected: gold_pass.
- Rodada anterior (7ef6d394) caiu por PROMOTED_CLAIM ("estrutura de holding de participações" na narrativa societária — tema sensível + vocabulário). O fix P1-parcial (Teia↔narrativa) + EPISTEMOLOGIA DA AUSÊNCIA funcionaram em runtime: Teia só com conta alvo, sem holding na narrativa, TMS/WMS 🟠 A validar, Mapa topology-first (Produção/Operação), Caminho da Venda == Sim == limpo, sem coluna Leitura comercial.
- Pontos não-bloqueadores enviados ao Planejador (chat 6a81fda2): Sinal 3 deriva "desconexão logística" de ausência (hipótese+validação, não fato) · seção 5 cita "estrutura de holding" na prosa · seção 9 "Problema mencionado?" vs mapa "confirmado?". Bruno vai mandar prints ao Planejador.
- PR #483: mergeStateStatus UNSTABLE (Golden Live do SHA antigo); merge continua 🔒. Aguardando veredito visual final do Planejador com os prints.


## 2026-08-17 (tarde 4) — Reviewer independente PASS COM RESSALVAS, dead code removido (f927da00)

- **Reviewer independente (agent):** SOLICITAR MUDANCA. Achado P0: isFallback era dead code (sempre false — valueChainDimension retorna Operacao como fallback, nao claim cru). Branch Processo era dead code + comentario incorreto.
- **Fix (f927da00):** removido isFallback + branch Processo; label = valueChainDimension() direto; comentario atualizado. 1 arquivo, +6/-8.
- **Gates:** gold 420/420 · full 2221/2222 · typecheck 0 · lint 0 · build OK · no-gemini PASS.
- **CI f927da00:** rodando. Failures do c3db9abd (ChatInterface test + CodeQL) sao preexistentes/nao-relacionados.
- **Retorno postado:** Planejador (chat 6a81fda2) + Linear BRU-119.
- **Estado final:** f927da00 tecnico pronto; Preview same-SHA + validacao visual do Bruno = proximo passo; merge continua locked.


## 2026-08-17 (tarde 3) — Microdelta A' commitado (c3db9abd): reviewer independente rodando

- **Microdelta A' GREEN e pushado (c3db9abd):** buildChaosMap topology-first (dimensão curta + fallback Processo + agrupamento por dimensão + 1 warning Tecnologia); teste A' GREEN; GREEN 7/7b atualizados.
- **Diagnóstico worktree resolvido:** vitest agora resolve do worktree (provado com log temporário removido). Causa: cache Vite do repo principal + resolução de módulos. Solução: .vite/deps/ isolado no worktree.
- **Gates:** gold 420/420 · full 2221/2222 (flake waterfall) · typecheck 0 · lint 0 · build OK · no-gemini PASS (.DS_Store removido).
- **Reviewer independente lançado em background** (agent explorer/audit). Aguardando resultado.
- **Retorno A' GREEN postado no Planejador** (chat 6a81fda2). CI do c3db9abd rodando.
- **Pendente:** resultado do reviewer → se PASS, informar Bruno/Planejador; se FAIL, corrigir.

## 2026-08-17 (tarde 2) — Bloqueio de rebase: worktree incompleto + microdelta A' não validado

- **Bloqueio crítico identificado:** repo principal `/Users/brunolima/Documents/NOVO-APP` (branch `fix/remove-auth-migration-gate`) NÃO tem os arquivos gold (`services/llm/gold/`). Worktree `NOVO-APP-bru62` (branch `feat/v6-shadow-prep`) tem TODOS os commits e arquivos gold (18 arquivos). O vitest do worktree resolve imports do repo principal → testes locais não validam edições do worktree. CI pode estar rodando no repo principal sem os arquivos gold (explica failures intermitentes do Golden Live).
- **Microdelta A' (topology-first) implementado mas NÃO VALIDADO localmente:** `buildChaosMap` alterado para label=dimensão curta (valueChainDimension) com fallback "Processo" para facts sem padrão; agrupamento por dimensão distinta; 1 nó warning "Tecnologia" agrupado. Testes GREEN 7/7b atualizados. Teste A' escrito mas vitest não valida por causa do bloqueio de resolution.
- **Despacho de rebase enviado ao Planejador** (chat 6a81fda2, via CDP 9333): relato da situação técnica + pergunta sobre rebase da feat/v6-shadow-prep sobre a main. Aguardando resposta.
- **Estado do chat do Planejador:** 3 respostas do assistente (última: veredito P1 A' autorizado), 5 do usuário. A resposta ao rebase está sendo gerada.

## 2026-08-17 (tarde) — Veredito visual do Preview 488728d5 → P0 visual + P0 semântico + P2 + P1 parcial (c80651cf)

- Bruno mandou 7 telas do Preview `488728d5` ao Planejador (chat 6a81fda2, lido via CDP **9333** — o Bruno citou 9222, que recusa). Veredito: melhorou, mas 4 problemas — P0 semântico ("✅ Confirmado (ausência)" / "Ausência confirmada" de WMS/TMS), P0 visual (Caminho da Venda renderizando `Sim ==> E['...']` + nó E isolado), P1 ownership (mesmo fato em Mapa→Elos→prosa; Teia só Scheffer vs. texto "sócia PJ direta"/"holding"), P2 (coluna "Leitura comercial" boilerplate).
- **Correlação técnica (Supabase read-only):** run `d2b1fc59` (SHA 488728d5, COMPLETED 12:31Z) = **GOLD_PASS** — contract-done passed=true, wordCount 1012, 3 ações, 0 violações → fix wordCount 198d1b04 confirmado em runtime; o contract_fail anterior (5c2c084b, 868) era do 54a2ddc3.
- **P0 visual — causa raiz DUPLA:** builder emitia `D ==> Sim ==> E` (comentário do BRU-108 descrevia `== texto ==>` mas o código escreveu outra) E `materializeBareEdgeTargets` (utils/mermaid.ts) materializava nó sintético `mermaid_bare_N["Sim ==> E[...]"]` — **parseava** (gate BRU-108/113 verde por isso) mas renderizava source como conteúdo. Fix: `D == Sim ==> E["..."]` + guard LABELED_EDGE_TARGET_RE. Parse REAL 10/10.
- **P0 semântico:** builder rebaixa badge para 🟠 quando evidência do signal é ausência (ABSENCE_EVIDENCE_PATTERN estreito) + prompt ganha bloco EPISTEMOLOGIA DA AUSÊNCIA ("ausência confirmada" PROIBIDA; ausência não gera Sinal/hipótese; Sinal exige evidência POSITIVA). O "✅ Confirmado (ausência)" vinha de 2 fontes: Composer E builder de elos.
- **P2:** coluna "Leitura comercial" (template fixo) removida. **P1 parcial:** prompt Teia↔narrativa (relação só Canonical/Confirmado; sem relação → "sem relações societárias confirmadas"; "estrutura de holding" proibida). **P1 estrutural (Mapa×Elos): pergunta A/B/C enviada ao Planejador — despacho pendente** (última resposta dele, sobre visão Gold→nova saída, diz "estabilizar sem redesenhar" — valida A como default; seam será congelado pelo BRU-121).
- 3 suítes legadas (bru108/bru114/mermaid-parse-gate) codificavam `==> Sim ==>` como canônica — atualizadas. Gates: gold 419/419 · full 2221/2221 · parse gate 10/10 · typecheck 0 · lint 0 · build OK · no-gemini PASS. Commit `c80651cf` push FF; CI 21/21 aplicáveis PASS (Golden Live pending no fechamento). Retorno postado no chat + Linear BRU-119.
- Pendente: validação visual do Bruno no preview do `c80651cf` (Caminho da Venda limpo, sem "✅ (ausência)", sem coluna Leitura comercial, Teia↔texto coerentes) + despacho A/B/C.

## 2026-08-16 (noite 2) — contract_fail wordCount corrigido: leitura executiva na seção 2 (198d1b04)

- Validação manual do Bruno no Preview do `54a2ddc3` (BRU-119) revelou `contract_fail`: factual_minimal com `narrative-contract passed=false`. Console+HAR mostraram wordCount abaixo de 900 — a instrução BRU-119 "SOMENTE uma leitura comercial curta (2-3 frases)" encolheu a seção 2 e derrubou a narrativa total abaixo do piso. Golden Dossier Live também FAIL (~2min, mesmo perfil).
- Bruno aprovou a recomendação ("otimo"): manter o single-owner do BRU-119 e trocar a instrução para "leitura executiva em 2-3 parágrafos curtos (6-8 frases)" — sem reverter o lote.
- Commit `198d1b04` push FF (`54a2ddc3..198d1b04`): prompt (`gold-contract-prompts.ts` L147) + teste C atualizado (`leitura executiva`).
- Gates: gold 416/416 (395 dir + 21 externos) · full 2217/2218 (flake waterfall timeout; isolado 53/53 PASS) · typecheck 0 · lint 0 erros · build OK 8,75s · no-gemini PASS exit 0 · diff-check 4 linhas de código.
- CI do `198d1b04`/`c1aeb9c1`: Tests PASS (2m20s) · 21/21 aplicáveis SUCCESS · **Golden Dossier Live FAIL em 9m37s = timeout de render do E2E** (`golden-dossier-live.spec.ts:182` toBeVisible "element(s) not found", retry2, teste "duas execuções consecutivas") — MESMA classe de limitação de harness registrada no BRU-117 (relatório não renderiza no limite do Playwright), **não** contract_fail: nenhuma violação wordCount/contrato no log. Decisão prévia do Bruno segue válida: gate Golden pulado, validação manual no Preview. O fix wordCount em si permanece NÃO VERIFICADO em runtime até a rodada manual.

## 2026-08-16 (noite) — BRU-119 entregue: visual ownership + scaffolding bold + dedupe narrow (54a2ddc3)

- Planejador despachou BRU-119 (lote A+B+C) com 3 contratos: A (prompt single-owner), B (scaffold bold), C (dedupe elos). Planejador corrigiu: RED de variante ambígua bold obrigatório (não remoção silenciosa); lint obrigatório; contagens reais antes/depois.
- Implementado: prompt `gold-contract-prompts.ts` ~L147 (instrução de leitura curta em vez de lista); `gold-scaffolding-sanitizer.ts` com INLINE_SCAFFOLD_PATTERNS (5 padrões bold + detecção + remoção); `mermaid-deterministic.ts` com dedupe por dim+evidência normalizada antes do sort.
- Testes: 19/19 GREEN (sanitizador). Gold 410/410 (+9 novos). Full 2218/2218. Testes prompt C/E/F atualizados para refletir instrução nova. Review independente PASS COM RESSALVAS.
- Gates: typecheck 0 · lint 0 erros (73 warnings preexistentes) · build OK · no-gemini PASS · diff-check 0. CI 21/21 SUCCESS. Preview same-SHA deployado. Smoke PASS.
- Commit `54a2ddc3` push FF (`f115a860..54a2ddc3`). #456 e #452 fechadas como superseded.
- Retorno postado no chat do Planejador (6a81fda2). Resultado: PR #483 OPEN/DRAFT, CI verde, Preview validado, aguardando validação visual do Bruno.
- Planejador criou BRU-120 (controle geral convergência) e BRU-121 (leitura integral arquitetural). Leitura integral concluída por 2 subagentes Explore. Relatório em `docs/BRU-121-RELATORIO-LEITURA-INTEGRAL.md` (212 linhas).

## 2026-08-16 (tarde 2) — BRU-118 entregue: P1 scaffolding leak fail-closed (f115a860)

- Bruno confirmou frente: **fluxo atual do produto (Gold/PR #483)**, não o lab BRU-77. Mapa de chats: `6a80b20a`/`6a7f2983` = lab; `6a7d1209` = produto (bateu no limite de duração); chat novo do produto = `6a81fda2`.
- Planejador criou **BRU-118** (P1 scaffolding leak) no Linear e despachou o microdelta fail-closed. Postado no chat do produto.
- Implementado: `services/llm/gold/gold-scaffolding-sanitizer.ts` (detector+sanitizador estrito determinístico, idempotente, residual reprova fechado); prompt Composer sem enums crus na narrativa (relação em linguagem humana; proibição de meta-rótulos); pipeline emite `scaffold-done`; seam ganhou reason `scaffold_fail` + `scaffold-gate` no artefato final EXATO → factual_minimal.
- Testes: bru118-scaffolding-sanitizer (10) + sequência pipeline (scaffold-done) + teste D do prompt (ausência de enums crus). Gold 401/401 · full 2209/2209 · typecheck 0 · lint 0 · build OK · no-gemini PASS (após limpar 4 .DS_Store locais) · diff-check OK.
- Commit `f115a860` push FF (`53268f7c..f115a860`). CI: 21/21 checks aplicáveis SUCCESS (Tests/Typecheck/Lint/Build/No-Gemini/CodeQL/Smoke/Vercel). **Golden Dossier Live in_progress** (timeout de job 20 min conhecido — não é critério).
- Retorno registrado no BRU-118 (Linear, comentário acf9caca) e no chat do produto. Resultado máximo: `STACKED / PREVIEW VALIDATED / DRAFT — aguardando validação visual do Bruno`.

## 2026-08-16 (tarde) — Handoff do fluxo atual (Gold/PR #483); P1 scaffolding em aberto

- Bruno corrigiu a frente: ZCode = **fluxo atual (Gold/PR #483)**, não o lab BRU-77 (que fica com o executor paralelo).
- Estado real levantado: HEAD `53268f7c` (docs), CI 11/11 + Preview Smoke SUCCESS + CodeQL/PASS; **Golden Dossier Live FAIL = teto de 20 min do job** (precondição passou; Bruno pula o gate e valida manualmente); mergeStateStatus UNSTABLE.
- **P1 scaffolding** (validação manual): Gold exibiu `Conteúdo para o Builder`, `Mapa do Caos (Operações Confirmadas)`, enums `same_root/direct_pj_relation/partner_other_cnpj`. Causa = prompt `gold-contract-prompts.ts:147` + ausência de gate pós-Composer; renderer só exibe texto aprovado. Relatório `docs/handoffs/2026-08-15-gold-scaffolding-leak-supervision.md`; aguardando despacho do Planejador para microdelta fail-closed.
- Handoff gravado: Vault sessão `2026-08-16T13-03-10-fluxo-atual-gold-handoff.md` + HANDOFF_AI + activeContext + CALIBER (lição scaffolding).

## 2026-08-15 (manhã) — BRU-103: ACTION_COUNT_MISMATCH (numbered=7) diagnosticado e corrigido

- Bruno rodou a Scheffer no preview `819974d3` (run `20573b42`, COMPLETED 14:36 UTC, session a00dca0b): **verifier 0/0/0/0**, preflight/certainty 0, **wordCount=1265** (acima do piso 900 — o fix do prompt 819974d3 funcionou, antes era 862), mas `contract-done passed=false` com **ACTION_COUNT_MISMATCH (actionFormats {named:0, numbered:7, tableRows:0})** → output factual_minimal. Lifecycle OK (sem freeze; PostCompletion 0–10000ms limpos).
- Causa raiz reproduzida em teste: o Composer descreve o fluxo conceitual do Caminho da Venda como lista numerada ("1. Evidência → 2. Hipótese → 3. Discovery → 4. Decisão") e o oracle somava o fluxo como ação (4 fluxo + 3 movimentos = 7).
- Fix `238f543f` (CI 11/11 verde; Preview Smoke passou): (1) validator exclui linhas numeradas com `→` (FLUXO ≠ ação — assinatura estrutural, sem regex cega); (2) prompt Composer seção 9: fluxo em UMA linha com setas, nunca numerado; os 3 movimentos são os únicos itens numerados. Guarda: 7 movimentos reais sem seta continuam reprovando. Teste de regressão novo (3 casos). Suíte full 2106/2106, typecheck 0, lint 0.
- Golden Dossier Live segue falhando por pré-condição pré-existente (`GOLDEN_OPERATOR_PRECONDITION_FAILED`: sessão real/Greeting — não relacionada ao fix).
- PRÓXIMO: Bruno rodar a Scheffer mais uma vez no preview `238f543f` → esperado `contract-done passed=true` + `output-selected gold_pass` → fechar BRU-103 (Done), liberar BRU-104.

## 2026-08-15 (tarde) — GOLD PASS no runtime real → BRU-100/103/104 DONE → READY FOR MERGE

- Bruno rodou a Scheffer no preview `238f543f` (run `2fe72ab3-7589-4cc7-9206-660cf1c01241`, session 7ef6d394, COMPLETED 15:10:10 UTC, app_version `238f543f`): **contract-done passed=true (wordCount=1177, violations=[])**, **actionFormats {named:0, numbered:3, tableRows:0}** (fix do fluxo numerado confirmado), **output-selected kind=gold_pass**, **diagnostics-post-certainty 0** (guard I7 neutralizou os 6 PROMOTED pós-mermaid; R2-B — mesma fonte do verifier-done), preflight 0. **UI finalizou com botMsgTextLen=21300 = goldChars** (o Gold chegou à UI, não factual_minimal). Run terminal COMPLETED, health-check final isLoading=false.
- Linear fechado: **BRU-103 Done** (comentário com matriz completa), **BRU-100 Done** (resumo canônico: baseline final, matriz, trilha, desvios, riscos), **BRU-104 Done** (reconciliação cross-system executada), **BRU-44 comentado** (fechamento do track Gold; status preservado por filhos P1 abertos).
- Reconciliação: repo/branch/PR #483 (OPEN/DRAFT/NOT MERGED) head `238f543f` = local = remoto = app_version do run; CI 11/11 + CodeQL + GitGuardian + Vercel + Smoke pass; Preview deploy `5921508606` success; único check não-verde = **Golden Dossier Live (falha pré-existente de pré-condição GOLDEN_OPERATOR_PRECONDITION_FAILED**, idêntica no SHA anterior — não relacionada ao fix) → mergeStateStatus UNSTABLE.
- Estado máximo autorizado alcançado: **READY FOR MERGE**. Merge permanece LOCKED (aguarda token `MERGE` explícito do Bruno). Riscos residuais registrados: Golden Dossier Live (pré-existente), BRU-105 (I8) DEFERRED, BRU-71/75 (P1) em aberto.
- HEAD final: `238f543f`. Suíte full 2106/2106 no commit do fix.

## 2026-08-15 (tarde 2) — BRU-108 GOLD OUTPUT QUALITY GATE: 5 defeitos corrigidos (2ba3091f)

- Bruno viu o Gold entregue no run 2fe72ab3 e reportou "não veio um texto bom, além de erro nos mermaids" → **chamou o Planejador** (chat 6a7f2983). Veredito: **READY FOR MERGE REVOGADO → QUALITY BLOCKED** (a prova mecânica BRU-100/101/102/103/104 permanece válida; BRU-108 criado sob BRU-44).
- O Planejador mapeou TODOS os defeitos para código determinístico (não prompt): 1a parênteses no label Mermaid, 1b aresta `D -- Sim ==> E`, 2 truncateCell, 3 validationForDimension find(), 4 normalizeDiscoveryQuestion cascata, 5 trim pós-downgrade.
- **Reproduzidos com o parser Mermaid REAL (10.9.6 + jsdom)**: o bloco C1 do run parseia direto mas QUEBRA após sanitizeMermaidCode (quotePipeEdgeLabelSpecialChars trata pipes de label como rótulo de aresta → `got 'PS'`); `D -- Sim ==> E` é sintaxe inválida (`got 'STR'`; canônica = `== texto ==>`).
- **Fix `2ba3091f`** (6 arquivos, 16 testes novos): (1a) quotePipeEdgeLabelSpecialChars preserva labels `["..."]` (placeholder PUA \uE000), transforma só `|...|` reais; (1b) builder usa `D ==> Sim ==>`; (2) truncateCell word-boundary; (3) validationForDimension com pool usedQuestions (pergunta consumida 1x); (4) normalizeDiscoveryQuestion single-pass com alternância + artigo ("a volume"→"o volume") + espaço antes de pontuação; (5) downgradeUnsupportedCertainty preserva whitespace de borda.
- **Gate de parse REAL**: novo `tests/utils/mermaid-parse-gate.test.ts` roda `mermaid.parse()` (mesma lib do runtime) sobre blocos sanitizados — o teste antigo só validava sanitizeMermaidCode (por isso CI verde com parse errors no browser). Bloco real do run agora parseia.
- Gates: suíte 2122/2122, tsc/lint/build OK, CI 11/11 verde, CodeQL/GitGuardian/Vercel/Smoke pass. Preview do `2ba3091f` no ar (`scoutagro-b51quy9rv...`).
- PRÓXIMO: Bruno roda a Scheffer no preview `2ba3091f` → conferir zero parse errors Mermaid + texto limpo (sem volume de volume / espaços) → fechar BRU-108 → restaurar READY FOR MERGE.

## 2026-08-15 (madrugada) — RCA zero-call do P03 FAIL (V4 Pro bf4ad4eb): PACKAGING GAP, não MODEL_EXECUTION

- Bruno redirecionou: esquecer V4 Pro, seguir com DeepSeek V4 Flash (sessão já roda como Flash; roteamento desativado). Mensagem de redirecionamento + aprovação postadas no chat 6a80b20a.
- Smoke V4 Pro (único autorizado, dispatch bf4ad4eb) rodou e falhou em P03: `P03_CANONICAL_GROUNDING_INVALID:units_assets:p03-ua-certification:P03_CANONICAL_GROUNDING_FAIL`.
- Exploração zero-call (autorizada: "deepseek ilimitado, pode explorar mais") com os artefatos reais do smoke em `~/Documents/Codex/2026-08-11/referenced-chatgpt-conversation-this-is-an-3/SCOUT_BRU77_R2B6_DSV4PRO_C2_FRESH_FULL_PIPELINE_SMOKE_213101b1...`:
  - Gate `p03_canonical_grounding_v1.mjs:321-327` exige overlap lexical > 0 entre tokens do item e tokens do `text` do LEDGER (facts), não do excerpt.
  - Item "Certificação de agricultura regenerativa" (ev-regenagri-r2) → overlap 0 com o fact text "A Regenagri certificou fazendas..." (que perdeu "certificação de agricultura regenerativa" vs excerpt original "receberam certificação de agricultura regenerativa").
  - Prompt efetivo P03 (016/017) não tem regra lexical; R01 tem node "Certificação Regenagri" mas o gate não consulta o graph.
  - Flash de referência (f601e79d) não criou unit de certificação (falhou antes em PROCESS_GRANULARITY).
- CLASSIFICAÇÃO reportada: SHARED CONTRACT/PACKAGING GAP (perda de vocabulário na fronteira Research→Ledger + regra lexical do evaluator não comunicada + gate compara com text do fact em vez de excerpt). Recomendação mínima: preservar excerpt no ledger e/ou gate usar excerpt.
- Retorno postado no chat 6a80b20a (RCA ZERO-CALL DO P03 FAIL), confirmado como última mensagem do usuário. Aguardando adjudicação.

## 2026-08-15 (madrugada 2) — Exploração A1→A2 (a270a303) zero-call: A2 = guarda de conteúdo vazio

- Despacho do Planejador (a270a303): revisar linhagem A1→A2→NOT_PORTABLE com DeepSeek Flash max; provar por que A2 nasceu, comparar before/after, falsificar benefício, decidir se A2 se justifica.
- VERIFICADO nos artefatos do lab (`~/Documents/Codex/2026-08-11/referenced-chatgpt-conversation-this-is-an-3`):
  - A1 = FLASH_P03_CROSS_GROUNDING_A1 (instrução de cross-grounding via graph_refs literais).
  - A2 = `p03_reasoning_effort: 'low'` nas rotas Flash (bru77_portability_battery_v1.mjs).
  - Origem do A2: controle A1 OFF/ON 37dff89e — P03 com high retornou MODEL_CONTENT_EMPTY nos 2 braços (reasoning_tokens = completion_tokens, content 0). Veredito BOTH_EMPTY.
  - Before/after: com A2 (2715d75e) o P03 voltou CONTENT (5008 chars); gate avaliado (4 PROCESS_GRANULARITY).
  - Falsificação: A2 sozinho (2ab4927c) falhou PROCESS_GRANULARITY — A2 não resolve gate; só evita conteúdo vazio.
- Decisão técnica reportada: NÃO superseder A2 no escuro (evidência do mesmo dia de EMPTY com high; gateway sem metadata de release). Recomendado: 1 teste controlado P03 high/max na release atual para adjudicar.
- Postado no chat 6a80b20a (EXPLORAÇÃO A1→A2), confirmado. Aguardando adjudicação (RCA P03 + A1/A2).

## 2026-08-15 (madrugada 3) — Counterfactual 12ad8418 (offline): opção (a) lossless excerpt corrige sem bypass novo

- Planejador aceitou RCA P03 com correção de precisão (modelo PODERIA ecoar Regenagri; defeito = ensinar mecanismo lexical oculto). Classificação: CONTEXT_PACKAGING + GATE_CONTRACT_MISMATCH; V4 Pro não sustenta NOT_PORTABLE. Despachou comparação counterfactual offline 12ad8418.
- Replay offline no P03 real do run bf4ad4eb (11 itens): baseline 10/11 (único FAIL = p03-ua-certification); (a) lossless excerpt 11/11 (overlap [agricultura, certificacao, regenerativa]); (b) ledger+R01 11/11 ([certificacao, certification]); (c) prompt lexical simulável (eco); (d) remover hard fail abre barreira.
- Adversarial: bypass por eco-de-token JÁ existe na baseline (item fabricado com "Regenagri"/"auditoria" passa nas 3 variantes) — (a)/(b) não introduzem vetor novo.
- Recomendação postada (híbrido mínimo): usar excerpt como supportText do gate (a) + MANTER hard fail + NÃO prompt lexical + avaliar threshold de overlap em decisão separada. Postado no chat 6a80b20a (confirmado como última mensagem do usuário).
- Aguardando adjudicação do Planejador (RCA P03 + A1/A2 + counterfactual).

## 2026-08-15 (madrugada 4) — Diagnóstico 34ef558c executado: MAX → CONTENT (falsifica necessidade do A2)

- Planejador adjudicou A1/A2: A2 permanece workaround parcial; autorizou o menor experimento — 1 provider send P03 com reasoning=MAX (mesmo prompt+A1+temp+budget+modelo do braço ON do par 37dff89e), sem smoke/battery/allowance/route.
- Executado: HTTP 200 · content_state=CONTENT · 7382 chars · finish stop · JSON VÁLIDO (p03_day_of_operation.v1, 4 chain, 6 units, 2 events, 2 unknowns) · reasoning_tokens 2167/4335 (49%).
- Contraste: high (par 37dff89e) → EMPTY (reasoning 100% do completion); max → CONTENT. Falsifica a reprodução de MODEL_CONTENT_EMPTY com max nesta release; A2 perde justificativa causal (1 amostra; recomendada 1 confirmação antes de superseder).
- Artefatos: `~/Documents/Codex/2026-08-11/referenced-chatgpt-conversation-this-is-an-3/SCOUT_BRU77_A2MAX_PROBE_34ef558c/` (descartável, fora da baseline).
- Postado no chat 6a80b20a (RESULTADO DO DIAGNÓSTICO 34ef558c), confirmado. Aguardando adjudicação (A2 × max-all + counterfactual lexical 12ad8418).

## 2026-08-15 (madrugada 5) — Reconciliação forense fefe5dbf: 1 send meu provado; de6483df sem artefato local

- Planejador não autorizou os 3 sends (teste contaminado: reasoning × A1). Pediu reconciliação forense zero-call fefe5dbf: quantos POSTs, casar request/response por SHA/timestamp, houve 2º send?
- VERIFICADO: 1 único POST meu (curl 19:59:09→19:59:29, HTTP 200, 20.37s); request SHA f23ca026 (43.748 bytes, braço ON do par 37dff89e = A1 PRESENTE, reasoning=max); response SHA 2402dd89 (8.640 bytes; content 7.382; reasoning 2.167/4.335). Cópias no lab com SHAs idênticos.
- NÃO ENCONTRADO: artefato local do de6483df (A1 OFF, MAX→EMPTY 2.259/2.259) — só no Linear (MCP de comentários quebrado nesta sessão). Addendum local do 96fdaf38 é LOW→CONTENT 6.449.
- INFERÊNCIA: 2 execuções sob o rótulo 34ef558c com controles diferentes (A1 OFF × A1 ON) — resultado confundido por 2 variáveis; impossível adjudicar sem o texto do dispatch. Pergunta material ao Planejador: qual controle o dispatch autorizava?
- Postado no chat 6a80b20a (RECONCILIAÇÃO FORENSE fefe5dbf), confirmado. A2 intocado, max-all não liberado, nenhum send adicional.

## 2026-08-15 (madrugada 6) — Reconciliação fechada: A2=low vigente; decisão material pendente = R1U redesign

- Planejador fechou a reconciliação: o controle autorizado pelo 34ef558c era o 96fdaf38 (A1 OFF, max → EMPTY); meu probe (37dff89e braço ON, A1 ON, max → CONTENT) foi controle errado = segundo send fora do envelope. Registro acb9bc5c no Linear. Ocorrências preservadas.
- Estado final BRU-77 rodada 2: A2=LOW permanece vigente (workaround parcial p/ MODEL_CONTENT_EMPTY); max-all NÃO liberado; Mimo/battery/segunda conta/BRU-57 bloqueados; zero novos sends.
- Lacuna principal = R1U: Hybrid E provou que NÃO há threshold lexical simples seguro (HYBRID_E_NO_SAFE_LEXICAL_RULE_FOUND). Decisão material pendente (Bruno/Planejador): autorizar redesign de grounding SEMÂNTICO do R1U (separar provenance/identity de semantic support) ou não.
- Postado e confirmado no chat 6a80b20a; memória atualizada. Aguardando decisão do Bruno sobre R1U.

## 2026-08-15 (madrugada 7) — Etapa 2 do R1U redesign ENTREGUE (d7aec84b): candidate baseline revision

- Planejador aprovou o contrato Semantic Support com 3 correções (entidade/R01/token não bastam isoladamente; UNSUPPORTED/NOT_PROVABLE = hard fail, sem rebaixamento; support lossless simétrico sem alterar P01.text; R01 não é autoridade raiz) e despachou Etapa 2 (MAP→RED→GREEN→adversarial→regressão), zero sends.
- Implementado no lab (`~/Documents/Codex/2026-08-11/referenced-chatgpt-conversation-this-is-an-3`):
  - `p03_canonical_grounding_v1.mjs`: SEMANTIC SUPPORT 3 estados por campo material; cobertura estrutural = nome canônico + contexto canônico R1U (R01/business_model/relações); vocabulário de moldura removido; ativação por support_text (packaging delta), retrocompatível (ledgers antigos mantêm P03_CANONICAL_GROUNDING_FAIL).
  - `evidence_ledger_adapter_v1.mjs`: facts ganham support_text (excerpt/extracted_fact) sem alterar text.
  - `p03_semantic_support_contract.test.mjs` (novo, 5 cenários) + SHAs congelados atualizados + artefatos esperados regenerados (backups .backup-r1u).
- VERIFICAÇÃO: P03 real V4 Pro valid=true 11/11 SUPPORTED (certification corrigido); ADV-1/2/3 UNSUPPORTED; suíte determinística 26/26 PASS.
- Entregue no chat 6a80b20a (CANDIDATE BASELINE REVISION ENTREGUE), confirmado. Aguardando auditoria do Planejador.

## 2026-08-15 (madrugada 8) — Candidate baseline ajustada à decisão 58d18596 (NOT_PROVABLE→downgrade)

- Planejador adjudicou a entrega com a decisão governante 58d18596 (dispatch 5e93d9ec): SUPPORTED→CONFIRMED; NOT_PROVABLE→DOWNGRADE (não hard fail); UNSUPPORTED→HARD FAIL; entidade canônica (CNPJ/valor+unidade/data) como sinal FORTE no próprio slot (predicado adicional exige sustentação); freeze novo autorizado após auditoria.
- Ajustes no lab: sanitizeP03Deterministically rebaixa CONFIRMED→INFERENCE (SEMANTIC_SUPPORT_NOT_PROVABLE_DOWNGRADE) com ledger fluindo pelo pipeline (operational_projection passa evidence_ledger); CANONICAL_ENTITY_PATTERNS para slots de entidade.
- VERIFICAÇÃO: suíte 25/25 PASS; contrato 6/6 PASS (inclui downgrade); P03 real 11/11 SUPPORTED com 0 downgrades; ADV-1/2/3 UNSUPPORTED.
- Postado no chat 6a80b20a (ADENDO: CANDIDATE BASELINE AJUSTADA À DECISÃO 58d18596), confirmado. Aguardando auditoria final do Planejador (se passar, freeze promovível sem nova decisão).

## 2026-08-15 (madrugada 9) — Corretivo R2-C1 (8a237b16) entregue: blockers resolvidos

- Planejador: PASS COM BLOCKERS na candidate (auditoria 1b361149) — corretivo autorizado 8a237b16: regra INFERENCE/HYPOTHESIS canônica; 14 itens por identidade; strong signals local/pessoa; boundary completo; R01 não-circular; simetria model↔gate; freeze anterior preservado.
- Resolvido no lab: regra canônica citada (proposta Etapa 1 §4: CONFIRMED+NOT_PROVABLE→INFERENCE); entidade local/pessoa via tokens de R01 location/person/facility no support (estrutural); boundary 7 negativos por categoria + distinção NOT_PROVABLE vs UNSUPPORTED; teste R01-não-circular (só-R01 sem overlap → NOT_PROVABLE downgrade, nunca SUPPORTED); teste de simetria (support_text = excerpt do Research, effective P03 serializa o mesmo, gate lê o mesmo); backups .backup-r1u dos artefatos; nenhum freeze novo.
- VERIFICAÇÃO: contrato 12 cenários PASS; suíte determinística 25/25 PASS; matriz 14 (11 SUPPORTED + 3 UNKNOWN R1AC); ADV 3/3 UNSUPPORTED; R2B2 compatível.
- SHAs candidate: gate ca67c318; projection 2bd97f9d; adapter ed105d97; contrato 77b7f341; downstream test 733cd4f8.
- Postado no chat 6a80b20a (CORRETIVO R2-C1), confirmado. Aguardando reauditoria → novo freeze promovível.

## 2026-08-15 (madrugada 10) — C2 entregue: NOT_PROVABLE→HYPOTHESIS + negativo R01-válido (BRU77_R1U_SEMANTIC_SUPPORT_R2_CORRECTIVE_C2)

- Planejador adjudicou a política final (Linear 61301371): NOT_PROVABLE → HYPOTHESIS sempre; SUPPORTED→CONFIRMED; UNSUPPORTED→hard fail; INFERENCE reservado ao Research. Regularizou o incidente pós-STOP (delta reutilizável somente onde passar nos gates do contrato novo).
- Executado no lab: sanitize rebaixa CONFIRMED→HYPOTHESIS (SEMANTIC_SUPPORT_NOT_PROVABLE_DOWNGRADE); negativo explícito C2 (R01 válido + predicado sem suporte → UNSUPPORTED, sanitize NÃO rebaixa — fabricação nunca vira HYPOTHESIS).
- VERIFICAÇÃO: contrato 13 cenários PASS; suíte determinística 25/25 PASS; matriz 14 (11 SUPPORTED + 3 UNKNOWN); ADV 3/3 UNSUPPORTED; R2B2 compatível.
- SHAs candidate final: gate 9aa22272; projection 2bd97f9d; adapter ed105d97; contrato 68a3fbc2; downstream test 00e5d48a.
- Postado no chat 6a7f2983 (RETORNO C2), confirmado. Aguardando auditoria integral do Planejador → PASS promove freeze sob delegação (Bruno não precisa decidir mais).

## 2026-08-16 (madrugada) — C2 FREEZE PROMOTION PASS (Evidence Gate 11900063 aprovado)

- Planejador: Evidence Gate = PASS (Linear 482739a8) — freeze autorizado; executor deve executar Fases 1–4 autonomamente.
- Executado: artifact SCOUT_BRU77_R2B6_SEMANTIC_SUPPORT_FREEZE_C2_2026-08-16T01-16-50-605Z/ com manifest (5 arquivos congelados + rollback_shas + battery + locks), readback OK (shasum ao vivo == manifest), gates exit 0 (contrato 13/13, suíte 25/25), rollback preservado (backups .backup-r1u). Receipt b20bbc862f3c26913b42c00eb49c15758735c39325727e8996c0ac437b66ee14.
- Postado no chat 6a7f2983 (C2_FREEZE_PROMOTION_PASS), confirmado. Aguardando auditoria para próximo lote.
- Observação: outro executor posta em paralelo na mesma conversa (retorno do Evidence Gate 11900063 duplicado) — sem conflito material até agora.

## 2026-08-16 (madrugada 2) — SMOKE S1 = PASS (patch output namespace + 1 smoke real)

- Divergência S1: IMMUTABLE_OUTPUT_ALREADY_EXISTS (rota a1a2r2b6ev ocupada pelo run f601e79d; 8/8 rotas Flash ocupadas). Planejador: opção (c) — namespace fresh de output no smoke (BRU77_S1_OUTPUT_NAMESPACE_PATCH_P1, Linear 8cf1a890).
- Implementado: --output-suffix <token> (estrito ^[A-Za-z0-9_-]{1,32}$) apenas no smoke; default sem suffix mantém fail-closed; TDD battery 13/13 (2 asserts novos + 2 de manutenção R2B3→R2B6); runner novo SHA 7eac743a (rollback 881f427b); 5 hashes semânticos C2 INTACTOS.
- SMOKE REAL: deepseek/deepseek-v4-flash@a1a2r2b6ev na Scheffer congelada (output scheffer-s1) → STATUS PASS · 3 provider calls (RESEARCH+P02+P03) · zero retry · P08 passed · downstream PASS · routing verificado (fallback false) · tokens 61.836 · latência ~5m17s · manifest 109469b2.
- Postado no chat 6a7f2983 (SMOKE S1 = PASS), confirmado. 1 smoke não autoriza PORTABLE/bateria. STOP após o run (autorizado). Aguardando auditoria → próximo lote.

## 2026-08-16 (madrugada 3) — Battery B1 5× EM EXECUÇÃO (BRU77_FLASH_SCHEFFER_BATTERY_B1_5X, e76f14d3)

- Planejador: P1+S1 = PASS (freeze C2 exercitado em fluxo real sem regressão; Linear 1f583765). Liberou battery B1: 5 runs completos Scheffer, mesma rota a1a2r2b6ev, runner 7eac743a, zero tuning/retry, máx 15 provider sends, fail-fast se 5/5 impossível, dispersão >15pp só reportada. Custo NOT_VERIFIED aceito p/ este lote. Estado máximo: STABILITY_ON_SCHEFFER_SUPPORTED.
- Output do modo run verificado FRESH (runs/ não existe) → sem novo patch, execução autorizada.
- Battery em background (exec_8b0c2eea): 5 runs sequenciais com fail-fast; resumo em /tmp/scout/b1-battery-summary.jsonl; artefatos /tmp/scout/b1-run-<A>.json.
- Após conclusão: reportar matriz (status/passed/model_calls/tokens/latência por run + dispersão de coverage se disponível).

## 2026-08-16 (madrugada 4) — Battery B1 attempt 1 = BLOCKED (MODEL_CONTENT_EMPTY:P03) — fail-fast

- Executado attempt 1 (dispatch 45bed03c): BLOCKED, first_fail=MODEL_CONTENT_EMPTY:P03, 3 model calls, 60.575 tokens, ~5m35s. Rota a1a2r2b6ev (A1+A2 low) — o P03 veio vazio MESMO com A2 low → estocasticidade do EMPTY confirmada; smoke S1 passou com a mesma rota.
- Fail-fast aplicado (5/5 impossível): runs 2-5 NÃO executados; provider sends 3/15; nada corrigido.
- Reportado ao Planejador (BATTERY B1: ATTEMPT 1 = BLOCKED), confirmado. Aguardando adjudicação (política p/ MODEL_CONTENT_EMPTY × A2).

## 2026-08-16 (madrugada 5) — Forense G1: PROVIDER_RETURNED_EMPTY (B1-R1 P03)

- Planejador: B1 = FAIL contratual no R1; fail-fast correto; não aceita "estocasticidade" como causa raiz sem forense. Despachou BRU77_B1_R1_P03_EMPTY_FORENSIC_G1 (9677fe55), read-only, zero sends.
- Executado: classificação PROVIDER_RETURNED_EMPTY — HTTP 200, content=null, finish=stop, reasoning_tokens=completion_tokens (1.892/1.892, 100%), latência 9,8s; o provider devolveu content null DIRETO (sem drop de gateway/parser). S1 (PASS) teve content=JSON completo (reasoning 75%, latência 55s).
- INPUTS NÃO IDÊNTICOS (secundário): S1 vs B1 diferem no CONTEÚDO dos facts (Research regenerou paráfrases diferentes; estrutura/keys idênticas; support_text presente nos dois) — variabilidade upstream.
- A2=low não impediu EMPTY (B1 rodou com A2) — necessidade causal do A2 SUSPENSA. B1 R2–R5 STOPPED; R1 conta.
- Postado no chat 6a7f2983 (FORENSE G1), confirmado. Aguardando adjudicação.

## 2026-08-16 (madrugada 6) — E1 = CONTENT: execução intermitente sustentada

- Planejador: G1 passa materialmente (MODEL_EXECUTION; exclui gateway/parser); A2_CAUSAL_NECESSITY=SUSPENDED. Despachou E1 (2d10de00): 1 provider send com request efetivo IDÊNTICO do B1-R1.
- Executado: sha body de819d2b (model flash, temp 0.2, reasoning low); resultado CONTENT (4.853 chars, finish stop, completion 7.932, reasoning 6.466/81%, prompt_tokens 10.978 idêntico ao B1-R1).
- Discriminação: MESMO input produziu EMPTY (B1-R1: content null, 100% reasoning) e CONTENT (E1) → EXECUÇÃO INTERMITENTE FORTEMENTE SUSTENTADA; retry bounded candidato de contenção (não implementado).
- B1 permanece FAIL (R1 conta); R2–R5 cancelados; zero sends além do E1.
- Postado no chat 6a7f2983 (E1), confirmado. Aguardando adjudicação (política de retry bounded).

## 2026-08-16 (madrugada 7) — P2 PASS (retry bounded) + B2 STOP pré-send

- Planejador: E1 = PASS (intermitência confirmada; receipt e48a64b3). Aprovou EMPTY_RETRY_POLICY = ONE_EXACT_P03_REPLAY_ON_PROVIDER_EMPTY_ONLY (a91d0082) + despacho P2→B2.
- P2 implementado no downstream (invokeFlowStage + stageOutput): retry bounded no P03 (shape HTTP 2xx+finish stop+content vazio; 1 replay idêntico; 2º vazio hard fail; zero retry p/ CONTENT inicial e falhas de routing). TDD 4 cenários (p03_empty_bounded_retry.test.mjs): EMPTY→CONTENT (2 sends, request idêntico, contagem 2), EMPTY→EMPTY (hard fail, sem 3ª), CONTENT (0 retry), routing (0 retry). Regressão 40/40 PASS. SHAs: evaluator eab027f8 (rollback 9bdcd48e); C2 intactos.
- B2: STOP pré-send (attempt 01 ocupado pelo B1-R1; 4/5 dirs livres; suffix é só smoke por decisão 8cf1a890; sem patch p/ run). Zero sends na B2. Postado no chat 6a7f2983 (B2: STOP PRÉ-SEND), confirmado. Aguardando adjudicação (a: suffix no run / b: limpeza com backup / c: outra rota).
- Provider sends totais até aqui: 7 (S1 3 + E1 1 + B1-R1 3).

## 2026-08-16 (madrugada 8) — Auditoria C1 do P2 entregue (offline, zero sends)

- Planejador: STOP pré-send B2 correto; opção (a) decidida (estender --output-suffix ao full-run) MAS só após C1 do P2 (contrato db91c357/b1ddbd4). Auditoria 67ad5423.
- Entregue: diff 3 arquivos; SHAs before→after (evaluator 9bdcd48e→eab027f8; teste novo 1e6043a9; source_freeze 7d991903); pins (frozenHashes 10 inalterados; source_freeze atualizado; eab027f8 = CANDIDATE, rollback 9bdcd48e); 12 critérios do C1 por identidade; C2 intactos (5 SHAs); comandos exit 0; PROVIDER_SENDS_C1=0; contagem 7 sustentada.
- Postado no chat 6a7f2983 (AUDITORIA C1 DO P2), confirmado. Aguardando C1 PASS → patch namespace full-run → B2.

## 2026-08-16 (madrugada 9) — G2: 14 pins intactos MAS P2 REVERTIDO (STOP)

- Planejador: C1/P2 = PASS parcial; faltam provas (schema-invalid, semantic, HTTP error, replay P03 sem regenerar Research/P02, first-shot EMPTY observável, 14 FROZEN_FILES). Despachou G2 (33fd2e88) offline.
- G2 executado: 14 FROZEN_FILES do battery — TODOS IGUAIS ao pin (avaliador = 9bdcd48e). PORÉM: grep do retry no evaluator = 0 → o patch do P2 (eab027f8) FOI REVERTIDO/sobrescrito por outro ator (executor paralelo ou restauração de pin). Testes do P2 ficaram órfãos (p03_empty_bounded_retry falha; source_freeze com expectativa eab027f8 desatualizada).
- STOP conforme contrato (não reapliquei/não corri silenciosamente). Reportado (G2: P2 REVERTIDO), confirmado. Aguardando adjudicação (reaplicar / aceitar revertido / investigar quem reverteu).
- ATENÇÃO: outro executor atua no mesmo workspace/conversa — risco de sobrescrita de arquivos; verificar antes de cada entrega.

## 2026-08-16 (madrugada 10) — H1: SECOND_WRITER_OR_PARALLEL_EXECUTOR (reversão do P2)

- Planejador: opção (c) — investigar reversão (H1 read-only, 2d3bf1cf).
- H1 fechado: não é git; timeline (evaluator revertido 22:19:48; bru77_p2_empty_retry_policy.test.mjs criado 22:20:36 — NÃO é meu; battery reescrita 22:25:12 p/ 8afd072a; DOC_HANDOFF_5_ROUNDS 21:26 do paralelo; backup battery pre-p2 22:07).
- CONFIRMADO: executor paralelo no workspace implementou o P2 NA BATTERY (EMPTY_RETRY_POLICY_ID, isP03EmptyFailureShape, mergeP2Counters) e reverteu o evaluator para o pin 9bdcd48e — abordagem diferente da minha (retry no evaluator, eab027f8, revertida). DOIS P2 coexistem.
- Postado (H1), confirmado. Aguardando decisão: abordagem canônica do P2 + single-writer.

## 2026-08-15 (noite) — Gold PASS manual com P1 de scaffolding/meta-instrução

- Bruno validou manualmente a saída Scheffer no preview e confirmou que o Gold foi produzido.
- Revisão supervisora visual + análise técnica delegada identificaram scaffolding interno na saída: `Teia Societária (Conteúdo para o Builder)`, `Mapa do Caos (Operações Confirmadas)` e enums técnicos `same_root/direct_pj_relation/partner_other_cnpj`.
- Causa verificada: prompt Composer (`services/llm/gold/prompts/gold-contract-prompts.ts:147`) ensina os nomes; pipeline/seam não têm gate de scaffolding; renderer Gold exibe fielmente o texto aprovado. Não há evidência de prompt completo, token ou chain-of-thought na tela.
- Testes direcionados no checkout validado: 56/56 PASS; não cobrem scaffolding.
- Relatório curado: `docs/handoffs/2026-08-15-gold-scaffolding-leak-supervision.md`.
- Recomendação ao Planejador: microdelta fail-closed (prompt sem enums crus + detector/sanitizador pré-Narrative/builder + residual detector final `scaffold_fail` → factual minimal + RED/GREEN). PR #483 continua DRAFT; sem mudança de provider/modelo do produto, retry, banco, merge, deploy ou rodada paga.
- Envio externo ao Linear/Planejador ficou NÃO VERIFICADO: MCP rejeitou `statusUpdateType` sem `statusUpdateId`.

## 2026-08-15 (tarde 3) — AUDITORIA DE ARQUITETURA completa (pedido do Bruno: parar fixinhos)

- Run b3294247 (preview 2ba3091f) revelou regressão do fix 4 (single-pass): a coluna Validar saía com "volume **de produção**" e `produção de` é vocabulário que o verifier reprova → verifier_fail → factual_minimal. **Fix loop+colapso APLICADO LOCAL (gold-policy.ts: normalizeDiscoveryQuestion volta ao loop + colapso "volume de volume" + artigo + pontuação), testes 26/26 — NÃO COMMITADO** (Bruno pediu parar fixinhos).
- **Bruno pediu: "vamos parar de ficar fazendo fixutes assim, mapeia todo código, dou permissão completa de leitura"** → auditoria completa de leitura (3 agentes Explore + leitura direta, ~200 arquivos).
- **Entregas**: `docs/arquitetura/auditoria-arquitetura-2026-08-15.md` (6 mapas, **35 riscos estruturais**, dívidas técnicas) + `docs/arquitetura/mapa-completo-arquitetura.md` (mapa por camada com arquivo:linha, ~44 transformações de texto).
- **Achados-chave**: pipeline Gold de 19 estágios roda NO BROWSER; ~44 transformações determinísticas de texto em 6 camadas; 3 renderizadores markdown independentes; ~25 regex de links em 7 arquivos; política semântica duplicada (verifier × sanitizer × policy) com divergências reais; gate I7 só reage a PROMOTED_CLAIM; contrato Gold sem mínimo estrutural de mermaid; double-write do dossiê (server-owned × cliente debounced); recovery não cancela run remoto; guard sem TTL; código morto (loading-watchdog, postWaterfallHandoff, dossier:completed); stubs no-op de link rewriters em produção.
- PRÓXIMO: Bruno decide a abordagem estruturada a partir do mapa (o fix do run b3294247 fica pendente de commit até a decisão).





- Mudança de missão (Bruno+Planejador): pausar patch loop → auditoria estrutural do Gold. Hipótese central do Planejador CONFIRMADA por leitura integral: o Frontier carrega representação rica (entity/status/source/relationType) que o Composer desestrutura em texto livre; o verifier re-infere com regras de texto (os 2 dias de bugs = re-inferência imperfeita). 3 mecanismos causais: desestruturação precoce, política fragmentada, barreiras tardias.
- I7 (POST-COMPOSER CLEAN BOUNDARY, efdbfdf1): guard de certeza na saída do Composer (pré-mermaid) + neutralizeConfirmedVocabularyInText (cobre confirmadamente — gap do RCA-05). CI verde; preview scoutagro-b0pbvoudk. **Planejador: VEREDITO FINAL KEEP_AS_IS** (contrato congelado).
- RCA-06 (despacho deepseek_route_probe_v2, READ-ONLY): frontier real do run 67c8806b extraído do HAR; replay no candidate d28a4ea9 reproduz a matriz (0/3/3/1 + "confirmadamente" escapa — candidate NÃO elimina); MESMO replay no I7 = 0/0/0/0 (I7 elimina). Matriz do run 100% explicada pela fabricação do Composer.
- I8 (proveniência) fica como arquitetura pendente (PREPARE); captura do literal do compose: local/efêmera, sem telemetria textual remota.
- HEAD: efdbfdf1 (I7) — PR #483 DRAFT; merge/Produção/Supabase write bloqueados; nenhuma rodada paga após o I7 (aguarda decisão Bruno/Planejador).

## 2026-08-14 (tarde 2) — RCA-03: QUESTION MODALITY (falso positivo da pergunta de discovery) entregue

- Bruno rodou a Scheffer única autorizada (run dc932b75, SHA 1744a0c0): matriz real = PROMOTED pre-compose 1 / post-preflight 1 / post-mermaid 2 / final 1. Planejador REVOGOU "H1 confirmado": a pergunta real "A operação na Colômbia (Cumaribo) possui registro legal confirmado?..." (openQuestions) perdia o "?" na segmentação do verifier → PROMOTED_CLAIM falso positivo; a tabela de elos reinjetava a mesma pergunta na coluna Validar (o +1 do post-mermaid).
- FASE 1 provada com o Frontier REAL extraído do request scout-gold-compose do run (15023B, salvo em /tmp/scout/frontier-dc932b75.json + canonical-dc932b75.json): verifyGold linha a linha → a pergunta da Colômbia é o ÚNICO fail; buildDynamicValueChainTable reproduz o +1.
- FASE 2 entregue no commit **daeddf29**: normalizeDiscoveryQuestion exportada e estendida (neutraliza "confirmad(a/o)s?" SÓ em interrogativas, guard existente) + probe aplica a normalização às linhas. Verifier/sanitizer intocados. TDD 5 REDs com a frase real (A pre-compose 0; B Validar 0; C afirmação continua acusando; D não-regressão H1; E só interrogativas). Replay com o artefato real: probe 1→0, tabela 1→0.
- Gates: Gold 277/277, full 2044/2044, typecheck 0, lint 0, build OK, no-gemini PASS, REAL_PROVIDER_CALLS=0, diff-check OK. Push confirmado (daeddf290dbce...); CI em acompanhamento; PARAR antes de nova rodada paga.

## 2026-08-14 (tarde) — RCA-02: fronteira diagnostics-pre-compose (probe semântico pré-Composer)

- Planejador deu PASS COM RESSALVA à RCA-01 e despachou BRU-99/RCA-02: atribuir PROMOTED_CLAIM/RELATIONSHIP_INVERTED a H1 (o Frontier já carrega o material) ou H2 (nasce no texto do Composer) — observabilidade pura, sem tocar verifier/prompts/sanitizer; autonomia para implementar/commit/push.
- Implementado: `buildFrontierProbeText` (gold-pipeline.ts) reúne apenas os valores TEXTUAIS semanticamente avaliáveis do Frontier (claims, observedFact/validationQuestion/whatIsNotKnown, openQuestions, evidence de relações, métricas, conflitos, after do sanitizer) — sem nomes de campos/JSON, sem people; estágio `diagnostics-pre-compose` com frontierSummary + persistência garantida (goldCriticalDiagnostics.ts). Probe não altera goldBrief/safePack/verifier/decisão final.
- TDD: 4 REDs novos (H2 composer-introduz; H1 PROMOTED com fonte fora da lista fraca do sanitizer; H1 INVERTED + contra-prova; adversarial sem fabricação) + sequência de estágios do gold-pipeline.test.ts atualizada.
- Gates locais: Gold 272/272, full 2039/2039, typecheck 0, lint 0, build OK, no-gemini PASS.
- Commit 1744a0c0 pushado (read-back remoto confirmado); CI run 31813778546 em acompanhamento. Rodada Scheffer única fica autorizada pelo despacho após CI verde + Preview no SHA — Bruno dispara ao acordar.

## 2026-08-14 (manhã) — RCA READ-ONLY run 03447df2 (despacho do Planejador, novo chat)

- Chat do Planejador atingiu limite → novo chat aberto via CDP (`/c/6a7f2983`, handoff enviado). Despacho recebido: BRU-99/GOLD RCA READ-ONLY run 03447df2 (SHA 6c39ddf5) — atribuir os 6 hard fails às claims/etapas; sem correções, sem nova rodada paga.
- Run 03447df2 reconstruído via Supabase read-only (run_id curto do cliente no scout_diagnostics: `mst0u31b-j5gcse`): post-preflight = RELATIONSHIP_INVERTED ×1 + PROMOTED_CLAIM ×2; post-mermaid = +UNSUPPORTED_PRODUCT_CLAIM ×3; verifier final 6 → factual B+ 737 (messageId cf6aa41d) publicado 14:16:49 UTC.
- Busca exaustiva do goldBrief real: HAR do DevTools capturou SÓ recordDiagnostics/chat (compose NÃO foi capturado); Supabase não persiste texto (política); console só nomes de eventos; heap do app sem retenção (seam não guarda goldBrief); logs Vercel só erros; LiteLLM externo sem acesso. → o response do compose NÃO existe em fonte alcançável (ponto cego de observabilidade).
- Replay offline no código EXATO do run: worktree `/tmp/scout/replay-6c39ddf5` (git worktree add --detach 6c39ddf5 + node_modules symlink; package-lock idêntico ao HEAD). Harness `replay-harness.ts` (descartável) com as 3 perguntas abertas REAIS do dossiê 7ef6d394.
- Resultado do replay: (1) tabela de elos determinística com coluna Validar crua + verifyGold → UNSUPPORTED_PRODUCT_CLAIM com claim exato ("O grupo tem planos de expandir a produção de sementes próprias...") — reproduz o mecanismo dos 3 pós-mermaid (defeito BRU-100 v3, corrigido em e4f9c0f2 posterior ao SHA do run); (2) preflight removeu 0 linhas de RELATIONSHIP_INVERTED/PROMOTED_CLAIM (famílias fora do prune) — os 3 fails pós-preflight são 100% do texto LLM do Composer (variável entre runs; 59d210b0 teve 0).
- Retorno enviado ao Planejador (tabela causal + critério de fechamento); aguardando despacho (ex.: ramificação (b) estreita). Zero alterações no SHA do run; zero commits novos.

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

## 2026-08-10 — Gold EXPERIENCE-01C CANONICAL MERMAID (sessão 18:30)
- 01C implementado (builder Mermaid determinístico + leak QSA + R10), 4 revisões do Planejador, push `cc1bfb4a`, CI success, Preview `scoutagro-5xhliiq2x` (bundle index-CtBCnw6g.js), smoke zero erros.
- GO do Planejador para rodada Scheffer paga (1 controlada, sem retry) — PENDENTE.
- Vault: [[2026-08-10T18-30-00-gold-experience-01c-canonical-mermaid]] · lição nova em Lições/gold/.
- Revertido experimental "números de mercado" no specialist-prompts.ts (a pedido do Bruno).

## 2026-08-10 — Gold 01C.1 observability + 01D visual-first
- Evidência local do Preview consultada em `scout_diag_fallback_*`; eventos `GoldSeam` não foram persistidos. Dois códigos/claims reais da rodada Scheffer permanecem **NÃO VERIFICADOS**; nenhuma correção causal foi inferida.
- Implementada observabilidade segura: `verifier-done`, `verifier-summary` e `gold-rejeitado-fallback` passam `hardFails`, `codes` e `codeCounts`, sem reasons/claims; fallback fail-closed preservado.
- Implementada tabela dinâmica `buildDynamicValueChainTable` no builder canônico, com vocabulário dos seis `ScoutSegment` existentes, linhas derivadas apenas do SafeFindingPack e inserção abaixo do Mapa do Caos.
- Gates: 128 Gold focados PASS, typecheck PASS, build PASS, lint PASS com 0 erros/69 warnings preexistentes, diff-check PASS. Suítes `node:`/React.act permanecem bloqueadas por baseline ambiental.
- Próximo: enviar checkpoint ao Planejador quando a aba Web estiver disponível; não fazer nova rodada paga, push, merge ou produção sem decisão dele.

## 2026-08-13 — BRU-81 F1.3 entregue + duplicate-run provado + B' despachado (PR #483)
- F1.3 ACTIVITY_IDENTITY_SAFE_WAYFINDING: chave do scroll = botMessageId (uuidv4), não lastUserQuery. `activeGenerationRef.current[sessionId]` gravado ANTES do placeholder entrar na timeline (message-orchestrator.ts:480); App.tsx passa `wayfindingKey` ao ChatInterface; MessageTimeline consome one-shot só quando o item existe (findIndex por id) + cancelAnimationFrame no cleanup. Commit `d4759d83`, push FF `6a9d0f0d..d4759d83`.
- Gates: MessageTimeline 14/14 (3 REDs novos), full suite 1990/1990 (192 arquivos), typecheck 0, lint 0 erros (69 warnings preexistentes), build ok, no-gemini PASS, diff-check OK. CI do SHA: 17 checks pass + Smoke preview PASS + Vercel READY; 2 fails PRÉ-EXISTENTES (CodeQL fantasma 404 — já falhava no 6a9d0f0d; Golden Dossier Live blocking — GOLDEN_OPERATOR_PRECONDITION_FAILED em todos os SHAs desde 65523a05).
- Duplicate-run PROVADO (sessão 4dfeee30, preview): run 7d1934e1 RUNNING criado 17:38:42 e abandonado por RELOAD às 17:38:55 (telemetria recovery:mount nav=reload); run 08b2fcfb criado 17:39:11 (16s ANTES do lease expirar 17:39:27) e COMPLETED — 2 runs coexistindo server-side.
- Causa raiz: create_or_get_dossier_run deduplica SÓ por (owner, idempotency_key); floodgate F2 é só cliente; recovery BRU-45 não terminaliza o remoto; cron api/cron-dossier-run-cleanup pronto mas NÃO agendado no vercel.json (deliberado). 25 órfãos RUNNING (19 Preview + 6 Production; mais antigo 04/08). Hobby Vercel limita cron a 1/dia.
- Veredito do Planejador: B' SINGLE_ACTIVE_RUN no lease (P0 blocker, separado do F1.3) — endurecer acquire_dossier_run_lease: dentro do advisory lock de sessão, RUNNING vivo da mesma owner/session bloqueia o novo; lease expirado terminaliza o morto e permite; rejeitado termina determinístico (nunca PENDING órfão); terminais anteriores preservados. A (cron) vira higiene diária posterior; C descartada.
- 5 hard fails do run a300a9a5: Gold 50k gerado e reprovado pelo verifier → factual B+ 737 publicado; texto Gold e códigos NÃO persistidos (scout_diagnostics descartou verifier-summary; documento colado 18:25 tem só execuções anteriores). Reconstrução bloqueada aguardando a lista de códigos do Planejador (console ao vivo do preview).
- AGUARDANDO: despacho explícito de execução do B' + OK do Bruno para Supabase mutation/migration (freio de governança).

## 2026-08-13 (cont.) — Triagem read-only dos gates remotos do PR #483
- CodeQL #75 js/incomplete-multi-character-sanitization (utils/mermaid.ts:91): VALID teórico, sem sink explorável (input→mermaid.js escape→sanitizeSvgHtml→dangerouslySetInnerHTML). Introduzido DENTRO do PR por cc1bfb4a (01C). Delta: regex cobrir `<!--` sem fechamento (1 linha).
- CodeQL #76 js/bad-tag-filter (teste:279): FALSE POSITIVE — regex de assertion de teste, commit 5413cf3c NA main. Delta opcional: toContain.
- Golden Dossier Live: 100/100 runs FAILURE (determinístico). Precondição (greetingCount===0 + nome real no menu) endurecida em 93f46330 (na main, 08-05). Conta e2e.golden@senior.com.br tem profiles.name=NULL → Greeting sempre visível → precondição impossível. CONTRACT/FIXTURE (secret não legível — correspondência é hipótese). Branch protection sem required checks — bloqueio é de governança.

## 2026-08-13 (cont.) — Fix CodeQL #75+#76 despachado e entregue (bb3f6517)
- #75: regex `<!--[\s\S]*?(?:-->|$)` em normalizeMermaidText (utils/mermaid.ts) — abertura sem fechamento removida até `-->` ou fim do input. RED+GREEN novos no mermaid-deterministic (47/47).
- #76: assertion do GREEN 8 com `-->` isolado em not.toContain (scanner não interpreta regex de teste como sanitizer).
- Gates: full suite 1992/1992, typecheck 0, lint 0 erros, build ok, no-gemini PASS, diff-check OK. CI bb3f6517: CodeQL PASS (2 findings saíram do head) + todos os demais PASS + Vercel READY. Único fail: Golden Live (BRU-6 fixture — do Bruno).
- Ordem congelada pelo Planejador: (1) CodeQL ✅ feito; (2) Golden fixture BRU-6 (Bruno/secrets); (3) B' preparar migration+REDs LOCAL, sem apply (aguarda Bruno); (4) B' aplicar (gate remoto); (5) auditoria PR-wide → só então READY FOR MERGE.

## 2026-08-13 (cont.) — B' SINGLE_ACTIVE_RUN preparado LOCAL (5ed1562e, sem push, sem apply)
- Bruno autorizou: "pode executar P0 single-active-run local, com migration e testes, sem apply Supabase".
- Migration 20260813190000_bru81_single_active_run.sql: reescreve SÓ acquire_dossier_run_lease — resolve session_id (FOR UPDATE) → advisory lock dossier_session:<id> (mesmo do autosave) → outro RUNNING da mesma owner/session: lease VIVO → alvo FAILED SINGLE_ACTIVE_RUN_BLOCKED + RETURN da linha (cliente já aborta, zero mudança de cliente); lease EXPIRADO → morto FAILED SUPERSEDED_STALE_RUN e prossegue. Sem RAISE no bloqueio (evita rollback do FAILED). Ordem de locks consistente (row própria → advisory → alheias).
- REDs: bru81SingleActiveRun.contract.test.ts (9) + cadeia supabaseMigrationChain/supabaseMigrations 29→30.
- Gates: contratos 153/153, full 2001/2001 (193 arquivos), tsc 0, lint 0 erros, build ok, no-gemini PASS, diff-check OK.
- Commit LOCAL; retorno enviado ao Planejador; aguardando auditoria da migration + OK de push. Apply no Supabase = gate remoto separado.

## 2026-08-13 (cont.) — B' R3: lifecycle ativo completo (4b67da4f local, sem push)
- R2 (7f36d22a) auditado pelo Planejador: corrigiu ordem de locks + sem LIMIT 1 + harness real 16/16. Última borda apontada: CANCEL_REQUESTED também é ocupação ativa (renew/autosave tratam como ativo).
- R3 aplicado: PASSO 3 avalia IN ('RUNNING','CANCEL_REQUESTED') com lease vivo → bloqueia; PASSO 4 terminal semântico (RUNNING→FAILED SUPERSEDED_STALE_RUN; CANCEL_REQUESTED→CANCELLED com cancelled_at); fail-closed 'Run session_id is required' antes de qualquer lock (IF NOT FOUND distingue run inexistente).
- Harness ampliado 22/22 (S7 cancelamento vivo bloqueia; S8 expirado→CANCELLED+novo inicia; S9 sem session_id não inicia). Contratos 157/157 (13 REDs B'), full 2005/2005, tsc/lint/build/no-gemini verdes.
- Commit local 4b67da4f (amend, não publicado). Aguardando OK de push do Planejador → depois auditoria do SQL no GitHub → só então gate remoto de apply.

## 2026-08-13 (fim do dia) — Root cause Gold FECHADA + estados do PR #483
- Review independente (executor, read-only) com reprodutor offline (tsx + funções puras, nada no repo): UNSUPPORTED_PRODUCT_CLAIM sobrevive ao preflight porque composerSemanticPreflight roda ANTES de injectCanonicalGoldMermaids. Dois pontos de injeção: label do Mapa do Caos (buildChaosMap usa fact.claim sem entidade) e tabela de elos (buildDynamicValueChainTable). Gatilho: isSupportedBySafePack atribui frase sem menção à CONTA (referredEntity = mentionedEntity ?? accountName); fato Confirmado de OUTRA entidade (holding) não reconcilia → hard fail.
- Prova discriminante: V1 holding→2 fails; V2 conta→0; V3 preflight pós-inject→0. Runs reais: 383e365f = 1 fail, bf2431b9 = 2 fails — MESMO mecanismo (varia com quantos fatos de outra entidade com padrão produção/capacidade entram).
- Planejador validou e congelou: correção = preservar identidade da entidade no conteúdo determinístico (não descartar fatos; não novo preflight runtime; sem tocar verifier/sanitizer/prompts; sem heurística Scheffer). Lote Gold = (1) identidade no determinístico, (2) escape B+ externo (catch publica pré-Gold), (3) observabilidade verifier-summary (persistência garantida + dossierRunId, sem info→warn). Depois B' R5 isolado (clock_timestamp pós-wait + harness >TTL + watchdog). Fora: scoreOportunidade, PipelineV2 (18 queries→85 itens descartados), timestamp visual, Golden Live manual/legacy.
- Bruno SEGUROU o despacho do Lote Gold ("aguarda mais um pouco"). Head 4254dadd intocado; B' NOT READY FOR APPLY (defeito de relógio now() pós-wait); apply Supabase bloqueado.

## 2026-08-13 (noite) — LOTE GOLD P0 ENTREGUE (f7b37c00, push FF)
- Despacho autorizado (Bruno) + comentário canônico Linear f0c3fec9. Baseline 4254dadd verificado.
- TDD: 3 REDs novos (gold-lote-p0-reds.test.ts) falharam no baseline pelos motivos certos; GREENs: (A) withEntityIdentity no chaos map + tabela de elos (fatos de outra entidade carregam identidade; conta permanece como antes); (B) evidence sem truncateCell (claim integral — compactação visual fica no renderer); (C) NEGATION_PATTERN no downgradeUnsupportedCertainty (negação nunca vira afirmação).
- Escape B+ externo fechado: catch externo do Gold agora aplica buildControlledUnavailableOutput + goldOutputKind='controlled_unavailable' (abort/run-control continuam propagando). RED provou o pré-Gold vazando antes.
- Observabilidade: shouldBufferDiagnostic com exceção explícita GoldSeam/verifier-summary (sem info→warn; sampling 10% intacto — teste determinístico bucket 93 vs 57); GoldRejectionDetail.reasons = prefixo sanitizado (split ':'); payload com dossierRunId + stage final-verifier.
- Gates: 591/591 direcionados, 2011/2011 full (194 arquivos), tsc/lint/build/no-gemini/diff-check verdes. CI do SHA: CodeQL/Tests/Typecheck/Lint/Build/Smoke/Vercel READY verdes; Golden Live vermelho conhecido (BRU-6); flake de timer layoutTraceTelemetry no teardown do ChatInterface.test (fora do lote) passou no re-run.
- Próximo: veredito do Planejador + B' R5 isolado (clock_timestamp pós-wait). Apply Supabase continua bloqueado.

## 2026-08-13 (encerramento parcial) — estado de prontidão
- Lote Gold P0 + delta R1: ENTREGUE e auditado (37093f7b, CI verde). Prompt E2E do Sol pronto no chat do Planejador; validação real AINDA NÃO executada (zero runs novos).
- PENDÊNCIAS (aguardando): (1) Bruno disparar o Sol e sinalizar "rodou" → executor rastreia a rodada; (2) despacho do Planejador para B' R5 (clock_timestamp pós-wait + harness >TTL + watchdog); (3) apply da migration B' no Supabase — gate do Bruno.
- Sessão pausada pelo Bruno ("nao precisa, pode deixar").

## 2026-08-13 (madrugada) — P0-RUNTIME corrigido: ERR_MODULE_NOT_FOUND do R2-B (6f1d6b8b)
- Sintoma: /api/llm 500 FUNCTION_INVOCATION_FAILED no Preview (runs do Bruno às 17:51/18:25/20:56/21:32/22:26 falharam no runtime).
- Causa (logs Vercel): ERR_MODULE_NOT_FOUND '/var/task/utils/goldCriticalDiagnostics' imported from serverDiagnostics.js — R2-B criou o módulo e o importou SEM extensão .js em utils/serverDiagnostics.ts e utils/diagnosticLog.ts (ambos no grafo serverless: api/llm, socio-search, extract-content, open-web-search). Gap LOCAL→REMOTE: moduleResolution bundler aceita; Node ESM do Vercel não resolve.
- TDD: tests/utils/goldCriticalDiagnostics.esmLoad.test.ts — transpila TS→JS (esbuild) e carrega com Node ESM puro em processo separado; RED com ERR_MODULE_NOT_FOUND idêntico, GREEN após correção.
- Correção mínima: './goldCriticalDiagnostics' → './goldCriticalDiagnostics.js' nos 2 módulos (convenção server-side do repo).
- Smoke novo tests-e2e/smoke.serverless-load.spec.ts: GET 405 nos 4 endpoints do grafo sem chamar provider — RED no preview quebrado (4 falhas 500), GREEN 4/4 no corrigido. O smoke antigo não cobria /api/llm (só páginas/link-status/cnpj) — gate revelado.
- Evidência runtime: POST recordDiagnostics → 400 (handler executa); GET → 405; read-back logs Vercel 0 ERR_MODULE_NOT_FOUND (antes: 500).
- Gates: full 2019/2019 (195 arquivos), typecheck 0, lint 0 erros, build ok, no-gemini PASS (11 .DS_Store locais deletados — lixo Finder não rastreado que quebrava o scan), diff-check OK. CI 6f1d6b8b: CodeQL PASS, Smoke (preview) PASS, Tests PASS, Vercel deployed. Único pendente: Golden Dossier Live (BRU-6, do Bruno).
- Envelope autorizado pelo Planejador (fim do dia): estabilizar Scout no Preview até novo dossiê completo persistido e reconciliado UI↔Supabase; autonomia investigar→corrigir→testar→push→CI→Preview→validar runtime→rodar Scheffer→auditar→corrigir delta até fechar; máx 1 run pago por SHA validado; Supabase permitido com canônico+read-back+rollback; fora: B', PipelineV2, verifier, Produção, merge.
- Próximo: 1 Scheffer real no SHA 6f1d6b8b validado → rastrear 4 fronteiras + lifecycle → auditoria → delta até dossiê completo.

## 2026-08-14 (madrugada) — P0-RUNTIME 2 corrigido: deadlock LockManager do supabase-auth (6c39ddf5)
- Sintoma pós-P0-ESM: run Scheffer dispara (processMessage:waterfall:start) mas NADA acontece — sem fetch do create_or_get_dossier_run, main thread para (~600ms), nenhum registro em dossier_runs. Reproduzido no preview E no dev local (localhost:3100, código não-minificado).
- Diagnóstico com instrumentação (fetch wrapper + watchdog ALIVE + LockManager trace + logs DIAG temporários): último evento = LOCKS.REQUEST 'lock:sb-vmqfcaoirjcfucvlnpig-auth-token' sem CALLBACK-IN → getSession() pendura → fetchWithAuth nunca dispara o fetch → create_or_get_dossier_run nunca chega ao Supabase.
- Causa: supabase-js 2.106.1 (auth-js 2.106.1) usa navigator.locks (LockManager) para sincronizar refresh de sessão entre abas; o request do lock nunca entra no callback (deadlock) → o pipeline todo pendura. Debugger.pause não responde (operação nativa do lock), watchdog para (main thread bloqueado).
- Correção mínima: createClient(..., { auth: { lock: supabaseMemoryLock } }) — lock em memória single-tab (executa fn direto; comportamento pré-LockManager). PROVA: com o lock em memória o FETCH do RPC sai e o run é criado (cb33cf92 PENDING, depois FAILED diag_probe e limpo).
- TDD: tests/lib/supabaseClient.lock.test.ts (3 testes do contrato do lock: executa fn, propaga rejeição, não depende de navigator).
- Gates: full 2022/2022, tsc 0, lint 0, build ok, no-gemini PASS, diff-check OK. CI 6c39ddf5 verde (CodeQL/Smoke/Tests/Typecheck/Vercel deployed). Probe GET /api/llm 405.
- Evidência completa em /tmp/run-scheffer-evidence (por run) e logs da sessão.
- PRÓXIMO: rodada Scheffer REAL no preview 6c39ddf5 (em execução) → auditar 4 fronteiras + lifecycle → delta até dossiê completo reconciliado.

## 2026-08-14 (madrugada/amanhecer) — BLOQUEIO NOVO do run (ABERTO, reportado ao Planejador)
- Após P0-ESM e P0-Lock: o run Scheffer ainda NÃO completa. O 2º fetch do fluxo (CNAE do executeInvestigation OU create/acquire) PENDURA no cliente: o request SAI (o servidor cria o run — 13 runs PENDING criados pela QA; o acquire via curl com token QA FUNCIONA — RUNNING), mas a resposta NÃO chega ao JS → o timeout de 15s (DOSSIER_RUN_RPC_TIMEOUT_MS) aborta → run PENDING (started_at null).
- Reproduzível: preview E dev local, Chrome do Bruno E browser isolado (headless 147), com/sem observador, com/sem extensões (--disable-extensions), com/sem cache:no-store. O 1º fetch (lookup CNPJ do formulário) SEMPRE funciona; o MESMO fetch isolado (evaluate no browser) funciona 3x (169ms/3ms/2ms).
- DESCARTADO: observador/CDP (o v11b desconecta e o run continua PENDING), extensões (AdBlock r.flush era o ChatGPT em loop, não o scoutagro), Sentry (disabled no dev), React Compiler (só no dev; preview também trava), memória (dossiês 83KB), build (o build antigo gd3p8dcnn [do Bruno] também pendura HOJE), servidor (curl create+acquire OK).
- FATO NOVO: o CHATGPT (chat do Planejador) ficou em LOOP de CPU 100% (mermaid) — o 100% de CPU observado nos samples era o ChatGPT, NÃO o scoutagro (o scoutagro fica idle/mach_msg — o JS vivo esperando a resposta do fetch que nunca chega).
- Suspeitas abertas: (a) socket/keep-alive/QUIC reusado morto no 2º fetch ~30-60s após o 1º (cache:no-store não resolveu — o no-store não afeta o socket); (b) estado do app (supabase client/buffer de diagnóstico); (c) Chrome 151.0.7922.138 atualizado HOJE ~03:40 (o headless 147 também afetado — ambiente mudou).
- Evidências em: /tmp/run-scheffer-evidence (por run), /tmp/renderer-sample*.txt, /tmp/chrome-debug.log (V8 log), logs da sessão.
- REPORTADO ao Planejador (chat 6a7d1209, 06:20): relatório completo + pedido de decisão ((a) netlog no pendurar; (b) retry/Connection no fetch; (c) testar em outra máquina/Chrome).
- ESTADO DO CÓDIGO: 6c39ddf5 no remoto (memoryLock — create sai — manutenção mais provável), CI verde (só Golden Live BRU-6 do Bruno). Runs de teste QA → FAILED (diag_test_cleanup).

## 2026-08-14 (manhã) — BRU-98 CONCLUÍDO: fronteira do bloqueio + auditoria memoryLock + run manual COMPLETED
- RUN MANUAL DO BRUNO 86850904 COMPLETED (7,5 min, dossier_id 7ef6d394, factual_minimal 737 chars publicado — Gold reprovado 1 UNSUPPORTED_PRODUCT_CLAIM). O FLUXO COMPLETO funcionou (create+acquire+heartbeat+waterfall 6 módulos+benchmark+PORTA+Gold+verifier+terminal+ui_publish; loading não ficou preso). O bloqueio da noite (2º fetch pendurando) NÃO afetou o run manual — era do ambiente automatizado.
- As 4 fronteiras do run (observabilidade R2-B PERSISTIU — codes exatos): post-preflight 0 | post-mermaid 2 [PROMOTED_CLAIM, UNSUPPORTED_PRODUCT_CLAIM] | post-certainty 1 [UNSUPPORTED_PRODUCT_CLAIM] | verifier final 1 [UNSUPPORTED_PRODUCT_CLAIM] → factual_minimal. O mermaid-inject ainda introduz o UNSUPPORTED_PRODUCT_CLAIM (Lote Gold reduziu 2→1, não fechou 100%).
- Avisos do run: module:deadline (Teia Profundidade 76s, Operação 71s — deadline 70s); PORTA dimensão T ausente → retry Bordas → Reconciliação PORTA BLOQUEADA pelo PromptLeakShield (fingerprint 8bd44e4a) → score PORTA sem consolidação; grounding-unavailable (3 fontes timeout 5s na validação inline); dossier-enxuto (2 mermaid removidos, 10 linhas dup); foreign-source-preserved-on-new-research. Reportado ao Planejador (09:20).
- BRU-98 (despacho do Planejador): trace ponta a ponta do fetch do create (CDP Network + wrapper) — FRONTEIRA QUE DIVERGE: fetch:start → requestWillBeSent → responseReceived 200 → loadingFinished → fetch Promise resolve NUNCA (30s; timer 15s nunca disparou) — a resposta chega ao network service mas nunca é entregue ao JS do renderer (main thread bloqueado). CONTRASTE: run manual (sem CDP) COMPLETA; runs automatizados (Playwright/CDP conectado no disparo) travam — O OBSERVADOR TRAVA O RENDERER (Chrome 151.138/headless 147 + CDP + app no run). App real OK.
- Auditoria memoryLock (subagente read-only): memoryLock = lockNoOp da lib (correto single-instance); lacunas: (a) acquireTimeout ignorado (sem LockAcquireTimeoutError); (b) sem exclusão cross-instance (risco HMR); (c) deadlock potencial: holder pendura → lockAcquired true para sempre → getSession encadeia eternamente. Sugestão: revalidar navigatorLock (2.106.1 já tem steal supabase#42505) OU usar processLock da lib.
- REPORTADO ao Planejador (09:37). Aguardando despacho (como o executor valida runs reais; o UNSUPPORTED_PRODUCT_CLAIM pós-mermaid; o PromptLeakShield da PORTA).

## 2026-08-14 (manhã) — Despacho "Fechar Gold + BRU-99" CONCLUÍDO (7656ea34 + 49ad138c)
- BRU-99 (7656ea34): Reconciliação PORTA × PromptLeakShield — allowlist estrita `PORTA_FEED_*` no applyPromptLeakShield (internalMarkerAllowlist {prefix, dimensions}). O marker-only legítimo não bloqueia; qualquer outro conteúdo continua sujeito ao shield. Fluxo: DossierModuleOptions → generateDossierModule → shield; a PORTA passa {prefix 'PORTA_FEED', dimensions missingDimensions}. TDD 5 testes (RED 1 falhava). Full 2028/2028.
- GOLD (49ad138c — despacho do auditor no BRU-44): o UNSUPPORTED_PRODUCT_CLAIM do run 86850904 — o verifier (isSupportedBySafePack) resolvia mentionedEntity só via safePack.relationships; a entidade CANONICAL.directPjPartners com identidade explícita era assumida como a conta → UNSUPPORTED. Correção na resolução de identidade (regex/códigos/política INTACTOS): mentionedEntity reconhece também as entidades canônicas (directPjPartners + matriz). Adversariais verdes: valor divergente FAIL, arbitrária FAIL, conta não empresta evidência FAIL, parceira canônica permanece com identidade. O v1 (filtro no determinístico, 4b1e2fcc) foi revertido no v2. Full 2031/2031.
- Próximo: CI do 49ad138c → Preview probe → UM Scheffer real (aguardar OK do Bruno/Planejador para a rodada paga) → revalidar 4 fronteiras (esperado 0 fails).

## 2026-08-14 (manhã cont.) — CI verde do Gold v2.1 (beb01dbb)
- O CI do 49ad138c falhou o teste BRU-100 (o mapa sem a holding): o commit v2 não incluiu a reversão do filtro do mermaid-deterministic (o working tree tinha a reversão, mas o git add só pegou o verifier + o teste — o HEAD manteve o filtro do v1). Commit beb01dbb aplica a reversão que faltava. CI verde: Tests PASS, CodeQL PASS, Smoke PASS, Vercel deployed (único pendente: Golden Live/BRU-6).
- Despacho "Fechar Gold + BRU-99" CONCLUÍDO com CI verde. Próximo: OK do Bruno/Planejador para o Scheffer real (revalidar as 4 fronteiras — esperado 0 fails) → depois AUTH-LOCK isolado (memoryLock → navigatorLock).

## 2026-08-14 (dia) — BRU-99 + Gold BRU-100 fechados (7656ea34, 49ad138c, beb01dbb, e4f9c0f2) + FLAKYNESS descoberta
- BRU-99 (7656ea34): allowlist PORTA_FEED_* no PromptLeakShield — o marker-only legítimo da PORTA não bloqueia (falso positivo 8bd44e4a do run 86850904). TDD 5 testes. CI verde.
- Gold BRU-100: (a) v1 (filtro no determinístico — 4b1e2fcc) REVERTIDO pelo despacho do auditor (o directPjPartners é canônico — não remover fatos); (b) v2 (49ad138c + beb01dbb): verifier resolve mentionedEntity também pelas entidades canônicas (directPjPartners + matriz) — regex/códigos/política intactos; (c) v3 (e4f9c0f2): coluna Validar da tabela de elos injetava a pergunta crua (o verifier perde o "?" e a avalia como claim) — normalização só para interrogativas (remove valores, vocabulário neutro). Adversariais: afirmação continua FAIL; valor divergente FAIL; arbitrária FAIL.
- RUNS REAIS: 59d210b0 (SHA beb01dbb) COMPLETED — preflight 0, pós-mermaid 1 UNSUPPORTED (a pergunta aberta — causa do v3). 03447df2 (SHA e4f9c0f2) COMPLETED — 6 fails (preflight 3: RELATIONSHIP_INVERTED + PROMOTED×2 — TEXTO variável dos módulos; + 3 UNSUPPORTED pós-mermaid) — FLAKYNESS: o mesmo SHA com resultados diferentes (o texto LLM varia).
- O observador CDP travava o renderer (lição canônica — Vault Lições/debug/). O memoryLock: dívida temporária (AUTH-LOCK isolado depois do Gold).
- PRÓXIMO: replay offline com o HAR (compose request/response — o goldBrief real) — pedido exato ao Planejador (o Bruno extrai do DevTools — as entradas ~8KB/~12KB do api/llm). Fechar a flakyness + os UNSUPPORTED restantes → 1 Scheffer manual final.

## 2026-08-14 (fim, noite) — Control plane → Linear: BRU-100→103

- Planejador migrou o fechamento Gold para o LINEAR: BRU-100 (control plane P0) → BRU-101 (RCA-07 observabilidade) → BRU-102 (I7 hardening) → BRU-103 (runtime final) → BRU-104 (reconciliação → READY FOR MERGE).
- BRU-101 Done (27dd4f4e): output-selected/contract-done com persistência garantida. BRU-102 Done (ca14726c): ASSERT fail-closed pré-Mermaid.
- BRU-103: 3 validações reais (a8e48dde, 1ccd90f0, d3ebe647): verifier 0/0/0/0 (I7 + alinhamento guard↔verifier via matchesSafeKnowledgeNegation); contract_fail com MEDIDA EXATA (d3ebe647): wordCount=2321 >1500, violations [WORD_COUNT_OUT_OF_RANGE, ACTION_COUNT_MISMATCH]. Corrigidos: guard↔verifier (3ab5dd09) + oracle bold **N.** + violations no contract-done (3610ea2d).
- DECISÃO MATERIAL PENDENTE (do Bruno): 900-1500 = narrativa (excluir Mermaid+tabela determinística)? Recomendação do Planejador: SIM. BRU-103 BLOCKED até lá.
- HEAD: 3610ea2d. Preview scoutagro-n5bp9bqv9. Merge LOCKED. Narrativa: vault Sessões/2026-08/2026-08-14T21-30-00-gold-closure-linear-bru100-103.md.

## 2026-08-15 (madrugada) — BRU-103 implementado (31fc84d0) + diagnóstico do gate Golden E2E

- BRUNO CONFIRMOU SIM ao design do wordCount narrativo. Implementado no SHA `31fc84d0` (push a648a3bd..31fc84d0): `validateGoldContract` calcula wordCount sobre a NARRATIVA (exclui SOMENTE Mermaid fence+legenda e a tabela determinística de elos — heading + linhas `|`); tabelas do Composer continuam contando. ACTION_COUNT fica separado: contract-done agora carrega `actionFormats` {named, tableRows, numbered} (somente contagens). 7 testes RED→GREEN novos (paridade narrativa, strip isolado, tabela Composer conta, actionFormats). Local: gold 325/325, full 2100/2100 (1 flaky LiteLLM 500/429 passou na re-execução), typecheck/lint/build/contracts/no-gemini verdes. CI do 31fc84d0 verde (todos os gates; único vermelho: Golden Dossier Live — pré-existente, 25+ commits).
- GATE E2E GOLDEN (pré-existente, 50+ runs vermelhos): diagnóstico com Playwright no preview — (1) login real OK (todas sub-condições passam, nome "Bruno Teste"); (2) causa raiz do onboarding: pós-login o app mostra o formulário, mas o reload do completeOnboarding RESTAURA a última sessão da conta QA (dossiê antigo "Fixture Bru81 Validação") em vez do formulário; fix verificado `goto: !USE_REAL_AUTH` em prepareSchefferInvestigationForm (E2E passou do onboarding); (3) pós-fix o E2E fica preso antes de criar run (llm_experiment_runs vazio, ~20 min; possível waitForEvent('download') sem timeout); (4) CI: artefato do run aponta SHA antigo d4759d83 (deployment_status defasado); secrets GOLDEN_E2E_* de 06/ago vs credencial local 12/ago (senha possivelmente rotacionada). Fix revertido (meio-fix não verdeia o gate; PR #483 limpo). Diagnóstico completo no Linear BRU-103.
- PENDENTE BRU-103: validação runtime final (verifier 0 + contract PASS + gold_pass) — precisa de disparo humano no preview do 31fc84d0 (ou despacho do Planejador para consertar o E2E). Depois BRU-104 (reconciliação) → READY FOR MERGE (merge LOCKED).

## 2026-08-15 (tarde) — Planejador: BRU-109 (substitui BRU-108) + cadeia ARCH-A→E + ARCH-F

- Veredito do Planejador (chat 6a7f2983): parar fixutes; BRU-109 P0 "Gold Architecture Stabilization" bloqueia BRU-108; cadeia ARCH-A (policy canônica) → B (trust boundary) → C (two contracts) → D (canonical render) → E (regressão) + ARCH-F (release safety triage). Resultado máximo: STACKED/DRAFT.
- ARCH-A (e6b4e7e2), ARCH-B (b92bc9e5), ARCH-C (1ee449a7+94f08904), ARCH-D (7bfe8c00), ARCH-E (0200e9b3): todos CI verdes. Full 2152/2152. Testes: bru110..bru114 + mermaid-parse-gate.
- Run real 817d3bd0 (head 0200e9b3): factual_minimal por compact-error — MODO NOVO (o DeepSeek retornou texto não-JSON no compact; serverless 200, canonical OK, leak shield não bloqueou; hipótese líder, causa não fechada por falta de metadados). Gap: compact-error não era evento crítico → detail não persistiu (só console).

## 2026-08-15 (fim) — BRU-109 A+C entregues (4a497126) — telemetria do compact + leak shield canônico

- Despacho final do Planejador: A) telemetria estruturada do compact (errorClass/responseChars/finishReason/hasObjectBoundary, sem texto livre; compact-response mede a resposta crua; eventos compact-* + raw-schema-fail críticos); B) retry CONGELADO; C) leak shield P0 (política canônica compartilhada; serverless passa a bloquear os 3 patterns que faltavam; JSON-safe preservado).
- Commit 4a497126: `services/llm/gold/compact-error.ts` (taxonomia CompactErrorClass + CompactPayloadError + tryParseCompactPayload), `GoldPipelineDeps.compact` → CompactOutcome (union RawFindingPack|CompactOutcome, `toCompactOutcome` normaliza), `LlmChatResponse.finishReason`, `utils/leakShieldPolicy.ts` (10 hard + 4 soft canônicos), api/llm + textCleaners convergem no canônico, GOLD_CRITICAL_DIAGNOSTIC_EVENTS 7→11.
- Testes: bru109-compact-telemetry (8), leak-shield-parity (7), triage GREEN 17/17 (release-safety-triage.test.ts commitado — antes era evidência local, o Planejador notou). Full 2184, Gold 923/923, typecheck/lint/build/no-gemini OK.
- CI 4a497126: 11/11 SUCCESS. Preview Smoke SUCCESS (scoutagro-2rm3pu0mo). Golden Dossier Live: FAIL pré-existente (GOLDEN_OPERATOR_PRECONDITION_FAILED — Greeting ausente na conta QA; mesmo erro no 0200e9b3).
- Retorno ao Planejador enviado (chat 6a7f2983) + comentário no BRU-109. PR #483 OPEN/DRAFT/NOT MERGED. Merge LOCKED.
- PRÓXIMO: aguardar veredito do Planejador sobre fechamento do BRU-109/BRU-108; despacho do próximo run real (quando conta QA tiver greeting) para medir a nova taxonomia compact em runtime.

## 2026-08-15 (noite) — BRU-117 fechamento PR #483: BRU-76 + precondição Golden discriminante (443433e8 + b075a025)

- Planejador: virou a operação de "empilhar" para "fechar a #483". Criou BRU-117 (Golden Live Closure Gate). Corrigiu o diagnóstico: "Greeting ausente" NÃO era a causa (o gate exige greetingCount === 0 = PASS); a falha antiga mascara qual condição falhou.
- LOTE 1 (BRU-76): 504 → TIMEOUT; TimeoutError externo → TIMEOUT (antes do abort-like); AbortError distinto. Commit 443433e8. Testes bru109-compact-telemetry 12/12.
- LOTE 2: utils/goldenPrecondition.ts (avaliador puro 6 flags, greetingCount===0 é PASS) + auth.ts discriminante PII-safe. Commit 443433e8 + fix b075a025 (avaliação final pós-loop para o timeout nunca cair na mensagem genérica). golden-precondition.test.ts 8/8.
- Full 2197/2197. CI do b075a025: Tests 2197 passou, mas o run marcado failure por unhandled error INTERMITENTE de layoutTraceTelemetry.ts (setTimeout pós-teardown no ChatInterface.test.tsx; mesmo código passou no run anterior — não é regressão).
- RERUN GOLDEN (b075a025) → DISCRIMINANTE: faltou greetingAbsent + operatorNameReady. sessionReady/shellReady/headerReady/menuReady PASSAM.
- CAUSA RAIZ: showOperatorGate = !operatorLoading && !hasOperatorName (usePanelState.ts:48) → conta QA autentica mas sem operatorName → app fica na tela de onboarding (GreetingWelcomeScreen) e menu sem nome real.
- CONDIÇÃO DE PARADA acionada: resolver exige (A) mutação de dados/conta QA (preencher nome do operador da conta teste@senior.com.br) ou (B) completar onboarding no E2E pós-login. Aguardando despacho Planejador/Bruno. PR #483 OPEN/DRAFT, merge LOCKED.

## 2026-08-15 (fim) — BRU-117: opção B implementada; gate Golden PULADO por decisão do Bruno (validação manual)

- Fix de vínculo (cc93e876): trace do run 29492403 revelou que o email do secret (e2e.golden@senior.com.br) JÁ existe no user_context (display_name vazio) — o app troca o form pelo card "Vincular este dispositivo". completeOperatorOnboarding agora roda em loop (15s) e clica no vínculo quando o checkEmailExists troca form→link.
- CI cc93e876: 11/11 SUCCESS; Preview Smoke SUCCESS.
- Rerun Golden (31910272670): NÃO falhou em ~2 min por precondição — EXCEDEU o tempo máximo do job (20 min). Ou seja: onboarding funcionou, precondição passou e as 2 rodadas Gold reais começaram (cada uma ~5-6 min). Blocker agora é LIMITE DE JOB do GitHub Actions, não código.
- DECISÃO DO BRUNO (2026-08-15): "quero pular esse se nao for agora, eu deixo a validacao comigo manual mesmo meu prazo esta curto" → gate Golden Dossier Live fica documentado como limitação de job; validação final do runtime (Gold pass no preview, contrato/verifier/artifact/render) fica com o Bruno, manual, no preview do SHA cc93e876.
- Registrado no BRU-117 (Linear). PR #483: OPEN/DRAFT/NOT MERGED, head cc93e876, merge LOCKED.
- PRÓXIMO: Bruno valida manualmente no preview; depois revisão formal da PR (dependências → conflito → baseline → CI → Preview → regressões → READY FOR MERGE, sem merge automático).

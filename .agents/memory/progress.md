# Progress

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

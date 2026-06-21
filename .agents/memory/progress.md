# Progress

### 2026-06-20 — LiteLLM chave nova + modelos econômicos

- Causa raiz fechada: chave/auth estavam corretas; V4 Flash falhava por timeout e o proxy removia markers `[[PORTA_*]]`, forçando `quality_failure`.
- Catálogo v2: `huawei/deepseek-v4-flash`, `huawei/deepseek-v3.2`, `oracle/xai.grok-4-1-fast-non-reasoning`; preços do Bruno registrados no cálculo.
- Leak shields server/client preservam apenas markers PORTA/TEIA seguros; texto visível continua sem metadados internos.
- Gate de qualidade passou a auditar o bruto reconciliado antes da limpeza visual.
- Prova Preview Scheffer: run `14a73cd2-ef62-4fc3-9708-bac8d5d3c840`, `status=success`, Grok 4.1 Fast, sem fallback, Score PORTA 63, custo US$ 0.019998.
- Gates: 1.609 testes, typecheck, build e validate-prompts verdes.
- Produção e merge não alterados.

Last updated: 2026-06-20 — doc-handoff compact-pr PR #386 (HEAD `0351441c`, Opção B, implementer bloqueado)

## Timeline

### 2026-06-20 (doc-handoff — Scheffer E2E + Opção B causa raiz — PR #386)

- **Entregas:** spec E2E `scheffer-research-validation` + helper; ship-loop CI 14/14 + PR Gate 16/16; continual-learning AGENTS.md (transcripts 159→174).
- **Scheffer live** (`300000ms`): R1/R2 fail (CRM + mapa); R3 pass; `/api/cnpj` OK — **H1 refutada** (pesquisa OK, gargalo UI).
- **Bruno:** Opção B — fix B1/B2 sem workaround E2E; critério B Supabase pendente.
- **Implementer:** rate limit — **zero código** de fix commitado.
- Handoff: `Bruno Vault/20-SESSOES/2026-06/2026-06-20T22-45-00-pr386-scheffer-e2e-root-cause.md`.

### 2026-06-20 (ship-loop Fase 6 — PR #386 preview `cad2dc`)

- **CI:** 14/14 ✅ (SHA `0351441c`).
- **PR Gate IA:** Playwright **16/16** ✅ no preview `scoutagro-git-feat-litellm-ex-cad2dc-…vercel.app` (~5,5 min).
- **Scheffer live** (`LITELLM_WATERFALL_TIMEOUT_MS=300000`, ~16,8 min):
  - **R1 fail:** `CLIENTE SENIOR CONFIRMADO` ausente em 300s.
  - **R2 fail:** `societary-map-shell` ausente em 300s.
  - **R3 pass:** waterfall completo, dossiê 3907 chars, expand `panelEmpty=false`.
- **Veredito ship-loop:** **BLOCKED** — MERGE_READY não (R1/R2 + critério HANDOFF P1 bug painel 26k).
- **Loop:** não armado (CI/deploy verdes; sem pendência assíncrona).

### 2026-06-20 (spec validação pesquisa Scheffer — PR #386)

- **Novo:** `tests-e2e/scheffer-research-validation.spec.ts` + `tests-e2e/helpers/scheffer-research.ts` — live no preview, sem stubs CNPJ/Gemini.
- **Gates locais:** typecheck, 1609 testes, build ✅.
- **Preview** `scoutagro-2wcoh4w5m-…vercel.app` (R1/R2/R3 @ 180–240s):
  - **R1 parcial:** GET `/api/cnpj` live ✅ (`qsa≥2`, Scheffer); UI **CLIENTE SENIOR 74 módulos** ❌ (180s).
  - **R2 fail:** `societary-map-shell` ❌ (240s).
  - **R3 fail:** `inline-loading-bubble` ainda visível (waterfall incompleto em 180s).
- **Veredito:** **BLOCKED** — pesquisa QSA OK; waterfall/UI societário+CRM não fecharam no budget; candidato **H2/H4** + timeout Grok.
- **MERGE_READY:** não — aguardar rerun com `LITELLM_WATERFALL_TIMEOUT_MS=300000` ou preview SHA com waterfall estável.

### 2026-06-20 (Scheffer waterfall + bug UI — PR #386)

- **Waterfall Scheffer** (sessão `1f143b11…`, CNPJ `04733767000180`, preview feat/litellm): LiteLLM confirmado (`/api/llm-experiment` OK); módulos sem foundation cache; waterfall `completed`, consolidação ~1.9s, 26424 chars, PostCompletion OK.
- **BUG P1:** pós-geração, scroll + clique "ver relatório completo" → painel principal vazio, área branca; console `dossier_accesses` 403 RLS, `raf-safety-net-fired`, Cofre `dissolve safety-timeout`.
- **Ship-loop:** CI 14/14, PR Gate 16/16, Playwright 16/16, threads 0 — **BLOCKED** até row `completed` em `llm_experiment_runs` (confirmar Supabase).
- **Código (não commitado):** log console `🦅 [Scout360][LLM]` por módulo em `investigation-orchestration.ts`.
- Handoff: `Bruno Vault/20-SESSOES/2026-06/2026-06-20T21-30-00-scheffer-litellm-ui-break.md`.

### 2026-06-20 (ship-loop PR #386 + prova LLM manual — PR #386)

- **Ship-loop VERDICT:** BLOCKED (não MERGE_READY) — CI 14/14, gates locais, PR Gate IA **16/16**, Playwright **16/16** no preview SHA `a5d97516`.
- **Review:** 7 threads re-resolvidas pós-ship-loop → **0 abertas**.
- **Waterfall Bruno** (~15:43 BRT, sessão `1f143b11…`, Scheffer): `operator_events` `dossier_completed`; `scout_diagnostics` `waterfall:end` completed.
- **Supabase `llm_experiment_runs`:** row mais recente `quality_failure`, `provider=litellm`, `fallback_used=true`, `fallback_model=gemini-3-flash-preview` — **0 rows `status=completed`**.
- **NÃO VALIDADO:** causa do fallback V4 Flash; E2E `litellm-live-parallel` live; row `completed` sem fallback.
- Handoff: `Bruno Vault/20-SESSOES/2026-06/2026-06-20T19-00-00-pr386-ship-loop-llm-proof.md`.

### 2026-06-20 (PR #386 LiteLLM Fase 1 + resolve threads — PR #386)

- **Fase 1 LiteLLM** commit `0d72a84f`: `utils/llm/experimentGate.ts`, gate client Supabase Auth + allowlist, fallback Gemini 401/403, ReDoS Bearer, hard-cap clearTimeout, `agentDebugLog` removido.
- **Validator APROVADO:** typecheck, 1603 testes, build, contracts, golden, budget.
- **CI** SHA `a5d97516`: 13 checks SUCCESS; `mergeStateStatus` BLOCKED.
- **Push** `0d72a84f`, `a5d97516`; 68 review threads resolvidas (#385+#386), 0 unresolved.
- **Token `gh`:** renovado device flow; `scripts/resolve-pr-threads.py` → GraphQL `addPullRequestReviewThreadReply`.
- **NÃO VALIDADO:** preview waterfall real, `llm_experiment_runs`, PR Gate IA 16/16, E2E litellm-live-parallel.
- Handoff: `Bruno Vault/20-SESSOES/2026-06/2026-06-20T16-45-00-pr386-litellm-fase1-threads.md`.

### 2026-06-19 (LiteLLM env Preview + debug freeze consolidação — PR #386)

- **Env Vercel Preview:** 18 vars scoped `feat/litellm-experiment`; allowlist corrigida para `bruno.ferreira@senior.com.br`; V4 Flash only (`TRAFFIC_SPLIT=100`); R1/Kimi 404 no LiteLLM.
- **Debug freeze** sessão `c352f8` / `scout_diagnostics` `0ea8ed46`: H3 confirmada — `/api/link-status` ~6.7s vs timeout cliente 5s em inline-validation (6 URLs).
- **Fix:** `link-status` timeout 2.5s, `vercel.json` maxDuration 15s, `VALIDATE_INLINE_TOTAL_TIMEOUT_MS` 12s + hard-cap 14s → `[]`; `utils/agentDebugLog.ts` + instrumentação (manter até Bruno confirmar).
- Preview fix: https://scoutagro-d47bkguue-brunolimaff-3629s-projects.vercel.app — link-status ~3.5s (antes 6.7s).
- Testes `validate-inline-sources-freeze-diag`: 15/15. E2E `litellm-live-parallel` CNPJ falhou no preview; Scheffer stub ~27s OK.
- Decisões: DI-2026-06-19-03 (V4-only preview), DI-2026-06-19-04 (budget link-status vs hard-cap).
- Handoff: `Bruno Vault/20-SESSOES/2026-06/2026-06-19T23-45-00-litellm-env-freeze-link-status.md`.

### 2026-06-19 (Ship-loop encerrado — gh-resolve + review fixes #386)

- **gh-resolve:** threads PR #385 e #386 respondidas/resolvidas.
- Commit **`67ff465c`:** auth allowlist, `VITE_LLM_*` no browser, gate server-side LiteLLM, leak shield fallback, finalize fire-and-forget, status enum.
- **PR #386 MERGE_READY:** CI verde, Playwright **16/16** preview pós-fixes.
- **Pendente pré-merge:** migration `20260620_llm_experiment.sql`, env Vercel Preview (`LLM_*` + `VITE_LLM_*`), token **MERGE**.
- Handoff: `Bruno Vault/20-SESSOES/2026-06/2026-06-19T20-06-00-ship-loop-pr385-litellm.md`.

### 2026-06-19 (Ship-loop — PR #385 merge + LiteLLM #386)

- Backup: tag `backup/pre-ship-loop-20260619-200620` + stash.
- **PR #385 MERGEADA** 2026-06-19T23:55:42Z — Ondas 0–3; PR Gate IA **16/16**; MERGE_READY.
- **PR #386 aberta** (`feat/litellm-experiment`): LiteLLM PR1+PR2, 4 commits experimento; CI/Vercel verdes; Playwright 16/16 preview.
- Fixes deploy: `.npmrc` legacy-peer-deps, fetch nativo (sem openai SDK), consolidar endpoint (limite 12 functions Vercel).

### 2026-06-19 (Plano estabilização — Ondas 1–3 na PR #385)

- **Onda 3** commit `78646b43`: loading reducer, loading-watchdog (probes 6→3), cache socio-search v8 operator-scoped.
- Gates: typecheck, 1518 testes, build, coverage, bundle budget — verdes.
- **PR Gate IA preview SHA `78646b43`:** critical-ux 11/11 + Onda 1 specs 5/5.
- Safety nets DOM adiados (critério 7 dias Cofre estável em produção).

### 2026-06-19 (Auditoria 50 PRs + plano estabilização — Onda 2.5)

- Auditoria externa 50 PRs (#316–#382) validada contra repo atual + delta pós-auditoria.
- Plano de estabilização em 4 ondas documentado: `.cursor/plans/avaliação_auditoria_50_prs_f7ced8ea.plan.md`.
- **Reconciliação #383/#384:** #383 mergeada (Fase D + auth sem lockout + E2E); #384 closed — escopo absorvido.
- Achados válidos remanescentes: RAF #349, persist silent #358, loading fragmentado (10 useState).
- Achados resolvidos/imprecisos: lockout auth (#383), layoutTraceTelemetry removido (#381), #377 superestimado.
- **Onda 1 declarada prioridade:** RAF + persist flush + E2E 2ª investigação/stop.
- **ADR Onda 2.4 (DI-2026-06-19-02):** cache read-only vs toast/retry — recomenda Opção B.
- Doc-handoff: HANDOFF_AI.md, CALIBER_LEARNINGS.md, activeContext, progress, decisions atualizados.
- **Próximo:** implementer executa Onda 0 sync + Onda 1 na branch `fix/onda-1-raf-persist-e2e`.

### 2026-06-19 (PR #383 — Fase D CI + PR Gate IA — MERGE)

- PR #383 **mergeada** em 2026-06-19T21:18:35Z.
- Fase D entregue: coverage gate 69%, bundle budget, timeout edge cases, higiene P1/P2.
- Lockout auth pós-deadline removido (conteúdo ex-#384 consolidado).
- PR Gate IA APROVADO 11/11 preview — evidência na PR.

### 2026-06-19 (PR #383 — Fase D CI + PR Gate IA — FECHAMENTO)

- Fase D entregue: coverage gate 69%, bundle budget, timeout edge cases (`runWithStepTimeout`), higiene P1/P2.
- E2E expandido → enxugado para 11 specs `critical-ux` (`loading-smart-recovery` fora por duplicata cofre).
- Auth: lockout pós-deadline removido intencionalmente (#384).
- E2E blocking removido do CI (`e6f256d8`); CI GitHub verde sem E2E required.
- **Decisão DI-2026-06-19-01 TRAVA FINAL:** PR Gate IA substitui E2E blocking.
- **PR Gate IA APROVADO:** 11/11 preview SHA `63f1c85e` ~2,7 min — [evidência PR](https://github.com/brunolimaff-jpg/NOVO-APP/pull/383#issuecomment-4754627777).
- Bruno manual preview: 5/5. Threads review: 0 abertas.
- Commits finais: `888b9487`, `72e6dd36`, `b472848c`, `63f1c85e`.
- Design debt: Cofre skeleton 3 seções (não bloqueia merge).
- Handoff: `Bruno Vault/20-SESSOES/2026-06/2026-06-19T19-30-00-pr383-fase-d-pr-gate-ia.md`.
- Histórico pré-merge; ver entrada MERGE acima.

## Timeline

### 2026-06-18 (PR #382 — Cofre durante a geracao)

- Cofre movido de `MessageTimeline` para a raiz do `App`, cobrindo a tela inteira com blur e bloqueio de ponteiros.
- Estado semantico `generationKind` diferencia `dossier`, `follow_up` e `deep_dive`; somente dossies ativam o Cofre.
- PostCompletion emite prontidao apenas com bot final visivel, painel preenchido, Virtuoso dimensionado e composer liberado.
- Dissolve normal de 350 ms; aborto/erro liberam; timeout de 10 s inicia somente apos a API finalizar.
- Validacao local: 1.505 testes + 64 contratos, typecheck, build, 44 testes focados, lint do escopo e E2E de painel branco 3/3.
- Gate de chat bloqueado por ausencia de `PINECONE_API_KEY`/`PINECONE_DOCS_KEY` no ambiente.
- Preview real validado com Scheffer: cobertura integral em 1280x720 e 375x812, persistencia durante a geracao e liberacao apenas com painel, bot, Virtuoso e composer validos.
- Preview revelou progresso `8 de 7`; total corrigido para nunca ser menor que os estagios concluidos/renderizados, com teste RED/GREEN.
- Proximo: confirmar checks e smoke no SHA final; sem merge sem `MERGE`.

### 2026-06-18 (Sprint 1 — CNPJ QSA + catch log)

- PR #380 aberta (branch `fix/sprint1-cnpj-qsa-knowncnpjs`, commit `e4fc6587`).
- T-B.2: `partner.document` validado (14 digitos) e formatado no `partnerText` para `validateTeiaCnpjsOutput` extrair via regex. Falsos-positivos de "CNPJ nao confirmado" eliminados.
- T-B.3: `.catch(() => {})` -> `scoutDiag.warn` em `waterfall-orchestrator.ts:307`. Logs de erro agora tem contexto.
- 1502/1502 testes verdes, typecheck limpo. PR #380 aguardando CI.
- 3 novas licoes: fix incompleto, documento QSA (CPF mascarado), Codex nao modifica config.
- Playbook Sprint 1 parcial: T-B.2 e T-B.3 concluidos. Proximas: Sprint 2 (T-C.1), Sprint 3 (T-D.1 + T-A.4).
- Handoff: documentacao consolidada (este arquivo + HANDOFF_AI.md + decisions.md + CALIBER_LEARNINGS.md).

### 2026-06-18 (PR #379 mergeada + playbook verification)

- PR #379 mergeada (db5a9a8d) e em producao.
- CRON_SECRET configurado no Vercel Production. CRON_DELETE_ENABLED nunca configurado (decisao do Bruno).
- Cron validado em producao: `{"dryRun":true,"candidates":0,"cleaned":0,"total":0}`.
- Hook completion-check.sh consultivo com `decision: null` em producao.
- Shell test adicionado ao CI: `bash tests/scripts/completion-check.test.sh`.
- Codex revertido: `.mcp.json` restaurado (deepseek, vercel, sentry), `ai-actions.md` restaurado, manifest.json e 4 planos restaurados.
- CODEX.md removido (duplicata de CLAUDE.md). Playbook em `docs/superpowers/` removido.
- Branch protection restaurada (required_conversation_resolution: true).
- Playbook verificado: 16 tarefas em 5 fases. Fase 0 CONCLUIDA. Fases A-D com status.
- Playwright E2E validado no preview Vercel: login -> CNPJ Scheffer -> waterfall -> Score 82/100.
- Decisao: Codex/CodeRabbit nao modifica `.mcp.json`, `nimbalyst-local/` ou `.claude/plugins/`.
- Decisao: Vercel deploy poll em 2s, nao 5s.
- 4 novas licoes: branch protection merge, Vercel environments orfaos, OAuth MCP expira, gh api boolean.
- Handoff: `Bruno Vault/20-SESSOES/2026-06/2026-06-18T08-37-04-p0-playbook-foundation.md`.
- Proximo passo: decidir qual fase do playbook atacar (A-D).

### 2026-06-18 (Trava removida + inicio do P0)

- Playbook consolidado como roadmap priorizado e nao bloqueante.
- Worktree criada: `codex/p0-playbook-foundation`.
- Baseline validado: 162 arquivos e 1.501 testes verdes.
- Banner/bloqueio de senha confirmados no codigo e testes.
- Producao online; cron retornou 500 por `CRON_SECRET` ausente.
- Cron protegido localmente com dry-run por padrao; RED e GREEN registrados.
- Rotacao de API keys adiada e retirada do escopo atual por decisao do Bruno.
- Handoff duravel: `Bruno Vault/20-SESSOES/2026-06/2026-06-18T08-37-04-p0-playbook-foundation.md`.
- PR #379 aberta como draft: https://github.com/brunolimaff-jpg/NOVO-APP/pull/379; primeiro commit `73b8fb81`.
- Checks da PR #379 verdes no commit `23177dc8`, incluindo E2E Critical Browser, Preview Smoke e Vercel.
- Branch publicada ate o head `667fc8fc`.
- Preview Ready: `https://scoutagro-ljs7o8dik-brunolimaff-3629s-projects.vercel.app`.
- `CRON_SECRET` configurado somente no Preview; `CRON_DELETE_ENABLED` nao configurado.
- Dry-run autenticado no Preview: HTTP 200, `{dryRun:true,candidates:0,cleaned:0,total:0}`.
- Hook global instalado da versao versionada; teste PASS e encerramento apenas consultivo (`decision: null`).
- Producao nao alterada por ausencia de `MERGE` explicito.
- Proximo passo: revisar PR #379; apos merge autorizado, repetir o dry-run em producao antes de habilitar exclusao.

### 2026-06-17 (Registro do plano bloqueante)

- **Playbook de Execucao a Prova de IA** validado e registrado como plano bloqueante.
- **16 tarefas em 5 fases:** Fundacao (T-00.1 a T-00.6), Causa-raiz (T-A.1, T-A.2), Loading declarativo (T-B.1 a T-B.4), Unificar timeout (T-C.1, T-C.2), Liquidar divida (T-D.1 a T-D.3).
- **Validacao concluida:** 4 ajustes aplicados apos revisao. Confianca 85%.
- **Fase 0 pronta para iniciar.** Proxima acao: Gate typecheck (T-00.1), Gate lint (T-00.2), Gate testes+coverage (T-00.3), Gate E2E (T-00.4), Helper timeout (T-00.5), Harness telemetria (T-00.6).
- **Nova decisao:** DI-2026-06-17-01 — Playbook como plano bloqueante. Mudancas de assunto exigem confirmacao do Bruno.
- **Arquivos atualizados:** HANDOFF_AI.md (bloco PLANO BLOQUEANTE ATIVO), activeContext.md (secao do plano), progress.md (entrada de hoje), decisions.md (DI-2026-06-17-01).

### 2026-06-16 (Sessao estendida — Sentry-Vercel + incidente de vazamento)

- **Diagnostico Sentry vazio:** env vars manuais no Vercel com `internal: true` impediam injecao de SENTRY_DSN pela integracao Marketplace. Serverless functions nunca enviavam erros ao Sentry.
- **Remocao de 8 env vars orfas:** GEMINI_API_KEY, PINECONE_API_KEY, etc. removidas do Vercel.
- **Integracao Sentry** instalada via Vercel Marketplace (org s-3j, projeto scout-360).
- **Vite define condicional:** `vite.config.ts` com define que expoe SENTRY_DSN como VITE_SENTRY_DSN apenas quando `!process.env.VITEST`. Sugestao do Gemini Code Assist aplicada no commit f8af6206.
- **Deploy producao** c6cb97d8 + f8af6206 com source maps.
- **PR #378 aberta:** https://github.com/brunolimaff-jpg/NOVO-APP/pull/378
  - 2 commits, 1 arquivo (vite.config.ts)
  - CI: Build, Tests, Typecheck, E2E, Smoke, CodeQL, Dossier Golden — todos verdes
  - CodeRabbit, Qodo, Gemini Code Assist, Cursor Code Review respondidos
- **INCIDENTE DE VAZAMENTO:** backticks no corpo do comentario GitHub via `gh api -f body` foram expandidos pelo shell como substituicao de comandos. Tokens expostos publicamente. GITHUB_TOKEN revogado automaticamente e reautenticado. Demais tokens pendentes de rotacao manual.
- **5 novas licoes** no CALIBER_LEARNINGS (env vars internal, Vite define, Hobby log drains, Vercel CLI bug, gh api backticks)
- **3 novas decisoes:**
  - DI-2026-06-16-01: Sentry via Marketplace, nao env vars manuais
  - DI-2026-06-16-02: Vite define SENTRY_DSN condicional
  - DI-2026-06-16-03: gh api com heredoc, nunca backticks
- **PR #378 mergeada** (ce40644a, 16/06): https://github.com/brunolimaff-jpg/NOVO-APP/pull/378
  - 2 commits (c6cb97d8, f8af6206), 1 arquivo (vite.config.ts)
  - Todos os 5 bots respondidos (CodeRabbit, Qodo, Gemini Code Assist, Cursor Code Review, SonarCloud)
  - Branch `worktree-fix+sentry-vercel-integration` deletada apos merge
- **PR #377** ainda aberta: CNPJ limit fix (branch `codex/fix-cnpj-limit`)
- **Tokens pendentes de rotacao:** DeepSeek, Pinecone, Apify, Context7, Vercel Bypass

### 2026-06-16 (Sessao de consolidacao)

- HANDOFF_AI.md atualizado com secao "O que NAO funcionou" (4 abordagens falhas documentadas)
- Branch `feature/supabase-auth` confirmada como ja deletada
- Pendentes consolidadas: deadline 18/06, auditoria RLS, dossier_accesses, user_context dupes, monitoramento Sentry
- .agents/memory/ atualizado (activeContext, progress)

### 2026-06-15 (Sessao de encerramento — 3 bugs de historico apos login)

- **Bug 1 — operator_id nao restaurado no localStorage:** `storageRemove()` limpava `scout360:operator_id` no inicio do fluxo.
  - Commit: `4ca4339a` — fix: restaura operator_id no localStorage apos resolucao de auth
  - Commit: `c32db0d9` — fix: atualiza teste OperatorContext para refletir restauracao
- **Bug 2 — Race condition operator-relinked:** `window.dispatchEvent` no useEffect pai. React executa effects de pais antes de filhos.
  - Commit: `9ba0a2cc` — fix: race condition com setTimeout(0)
- **Bug 3 — RLS bloqueando authenticated:** Policy `operator_own_dossies` com `TO anon`.
  - Commit: `fe6c6f9b` — fix: RLS dossies adiciona role authenticated
  - Migration: `supabase/migrations/20260615_fix_dossies_rls_authenticated.sql`
- **Diagnostico comprovado:** Ananda (18 dossies, 80 eventos) e Wuender (47 dossies, 34 empresas) — dados intactos.
- **5 novas licoes** no CALIBER_LEARNINGS.
- **3 novas decisoes:** DI-2026-06-15-05/06/07.

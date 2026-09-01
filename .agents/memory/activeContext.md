# Active Context

Last updated: 2026-09-01 (madrugada) — BRU-158 MICRODELTA FECHADO @ `287358ff` (PR #492 Draft, CI verde no SHA; Golden Live = falha credencial pré-existente BRU-160). Run real do Bruno no preview `scoutagro-2c8mvf9t0` QUEBROU (órfão RUNNING `e8c1ad56`) → Planejador criou **BRU-162 (Terminalização órfã, P0, In Progress)** e despachou **Fase A = RCA read-only agora**. BRU-161 pausado por BRU-162+BRU-156.

## Estado atual

- **BRU-158 MICRODELTA (commit `287358ff`, PR #492)**: Gate 1 = teste de caracterização do wiring EvidencePack→extraContext no `waterfall-orchestrator.test.ts` (41/41) + negative control (sem `connectEvidencePackToPool`, teste FALHA — provado localmente, mutação não commitada). Gate 2 = RED→GREEN: `formatAvailableSourcesForPrompt` agora expõe `[match=…]` + `[origin=…]` (pool 4/4). Bônus: removido teste órfão `identityWindowRaceCondition.contract.test.ts` (importa funções inexistentes, nunca commitado) → full suite 1781/1781, typecheck/lint(meus arquivos)/build OK.
- **RCA BRU-162 Fase A (run `e8c1ad56`, preview `scoutagro-2c8mvf9t0`, build `287358ff`)**: 6/6 módulos concluídos (provider=zen, deepseek-v4-flash, fallback_used=false). **Fronteira de falha**: `module:end` do "Caminho de Venda" chegou ao servidor (`/api/llm`, 00:18:06Z), mas o cliente **NUNCA emitiu `module:complete`** desse módulo — nem benchmark, save, `markDossierRunCompleted`, nem stop heartbeat. Último heartbeat 00:18:04Z; próximo (previsto ~00:18:19) nunca veio → **main thread do browser congelou processando o retorno do último módulo** (o maior: prompt 92k chars). Pós-retorno roda na main thread: `sanitizeStreamText` → `enforceSeniorEvidenceConstraints` → `applyPromptLeakShield` → `normalizeGroundingSources` (`investigation-orchestration.ts:410-490`). Órfão RUNNING com lease expirada; zero eventos pós-00:18:06.
- **Despacho Planejador (chat 6a957742)**: NÃO autoriza reduzir janela de cleanup nem UPDATE manual agora. **Limpeza autorizada condicionalmente** após 21:18:43 BRT (1h pós-lease) se o run seguir RUNNING, sem dossier, sem heartbeat/evento e único candidato stale → via `close_stale_dossier_runs()` + READ-BACK (FAILED/STALE_RUN_LEASE_EXPIRED/stale_cleanup/lease liberada). **BRU-162 Fase A = RCA read-only agora**; comparar com `bd14faa3` mas só declarar mesma causa se a fronteira coincidir. Locks: REAL_PROVIDER_CALLS=0, REAL_SEARCH_CALLS=0, sem novo run Preview, sem Golden, sem Produção/schema/merge, sem BRU-161.
- **Medida G (`close_stale_dossier_runs`)**: existe em `api/cron-dossier-run-cleanup.ts:50-55` mas **inativa** (`dossier-ownership-contract.md:45` — "inativa até BRU-10"). Nada executa em produção/preview.

## Estado atual

- **BRU-158 Q1 (GREEN, `f256b840`)**: `connectEvidencePackToPool()` conecta o pack do `executeQueryPlan` ao pool da sessão (usableForReport entra com proveniência moduleName/evidenceTier/entityMatch/queryOrigin/extractedClaim); `mergeDossierSourceRefs` preserva campos extras (spread `...source`); `formatAvailableSourcesForPrompt` expõe `[tier=X]` + claim. Testes: `tests/utils/dossierSourcePool.test.ts` (4). Sem LLM/busca real (REAL_PROVIDER_CALLS=0).
- **CI no head**: Tests/Typecheck/Lint/Build/Smoke + gates ✅; Golden Dossier Live = FAILURE pré-existente de credencial (fora do gate por decisão; BRU-160 cuida).
- **Frente ativa**: BRU-157 (Zen-only stabilization, P0) — decisão do Bruno: só Zen primeiro, ponta a ponta. **NÃO** é o Golden BRU-153.
- **Fase A CONCLUÍDA** — PR #492 `feat/bru-157-zen-only-stabilization` @ `6db80b16` (base #490 `1bcf31b1`). Causa provada: step interno 90s/60s hardcoded < proxy 210s → step abortava chamada válida (run `e29ab677`: `timeout after 90000ms`, Vercel HTTP 200 após abort). Fix: `services/llm/budgets.ts` fonte única (proxy 210s + headroom 15s = 225s step), integrado em waterfall-orchestrator + porta-reconciliation. RED→GREEN, `REAL_PROVIDER_CALLS=0`.
- **Gates Fase A**: focused 64/64 + budgets 3/3 + ownership 4/4 · contracts 148/148 · full suite 1773/1793 (única falha = `identityWindowRaceCondition.contract.test.ts`, untracked pré-existente) · typecheck/lint 0 erros novos · build OK · diff --check OK. CI success + Preview Smoke success.
- **Preview #492 testado pelo Bruno → 429 em todas as chamadas `/api/llm`**: LiteLLM sem orçamento; **envs do preview ainda NÃO em modo Zen — Fase B pendente**. → **RESOLVIDO na Fase B (ver abaixo)**.
- **FASE B EXECUTADA (2026-08-31 noite)**: (1) microdelta da ressalva fechado — `llmProxy` consome `LLM_PROXY_TIMEOUT_DEFAULT_MS` de `budgets.ts`, override `VITE_LLM_PROXY_TIMEOUT_MS` removido (teste de contrato impede regressão), commit `3c965091`, focused 58/58 + budgets 4/4, typecheck/lint/build OK; (2) 9 envs branch-scoped no preview #492 (LLM_PROVIDER=zen, OPENCODE_ZEN_*, SUPABASE_URL/ANON/VITE_* do xlvs + **SUPABASE_SERVICE_ROLE_KEY do xlvs** — a project-level apontava para `vmqf`/produção!); (3) 2 redeploys; deployment final `scoutagro-1kncemvhu` / `dpl_3hE35mFvUFAUsjXCJ8N3xVfzt2qd` (código `3c965091`). (4) **Smoke Zen-only**: HTTP 200 `{"text":"OK","_model":"deepseek-v4-flash"}`; telemetria server-side `module:start` gravada no **xlvs** (`srv-mthmeoie-j2pm`); **vmqf 0 writes** (scout_diagnostics/dossier_runs/operator_events). LiteLLM requests=0: NÃO VERIFICADO via API admin (404 em todos os endpoints do litellm.homolog) — compensado por fail-closed (spec cb9c25bf) + servedModel=Zen. Limitação pré-existente: `module:end` é insert fire-and-forget pós-resposta (pode se perder; `module:start` chega).
- **Postagens no Planejador (chat 6a957742, via navegador interno/Browser Use IAB)**: confirmação de estado + aviso de execução da Fase B (recado do Bruno: "use superpowers e ponytail" + registrar Fase B no Linear BRU-157) + retorno do smoke.
- **PR #490** `feat/llm-fallback-v1` @ `1bcf31b1` (Draft): Fallback V1 canônico, 75/75.
- **BRU-155** (PR #491 `c54e88f9`): compositor V3 implementado, **bloqueado temporariamente** pelo BRU-157 (despacho Planejador).
- **BRU-153 (Golden)**: BLOCKED. **BRU-156** (recovery): frente separada.
- **Supabase Preview `xlvs`**: schema canônico; produção `vmqf` intacta.
- Vault checkpoint: [[2026-08-31T13-38-41-bru157-zen-only-fase-a-checkpoint|BRU-157 Zen-only Fase A + preview 429]].
- **Read-back postado no Planejador (chat 6a957742, 2026-08-31 fim de tarde)**: confirmação do despacho vigente (Fase B autorizada · Fase A PASS COM RESSALVA · ZEN SMOKE pendente · RUN REAL só após smoke · GOLDEN/PRODUÇÃO/MERGE NÃO) + estado verificado (branch 6db80b16=origin, PRs 490/491/492, produção b6fa24c5). Ressalva do Planejador a fechar na Fase B: `VITE_LLM_PROXY_TIMEOUT_MS` ainda pode sofrer override no llmProxy (drift). Run acidental em produção preservado como evidência. Postado via navegador interno (Browser Use IAB, envio em `#composer-submit-button`).

## Não fazer

- Nunca mergear sem a palavra MERGE do Bruno.
- Dados reais no Zen antes da fronteira de dados aprovada.
- Não criar `VITE_OPENCODE_ZEN_*`; nunca imprimir a chave.
- Golden no Preview somente com banco apontando para `xlvs...`.
- Não remover rotas/módulos sem inventário; não flexibilizar Sanitizer/Verifier; não trocar modelo/provider (despachos BRU-155/157).
- ⚠️ Senha de teste vazou no console (dump do Bruno) — trocar; nunca registrar credencial.

## Próximo passo (BRU-157 — aguardando Planejador)

1. **Aguardar despacho do Planejador** sobre o run real (94ae20c4 COMPLETED, Zen provado no banco ×5) e o **achado 1**: cap de request 180s (`MAX_REQUEST_BUDGET_MS` em api/_llm-client.ts) abortou o módulo societário pesado → subir p/ ~225s (alinhado a budgets.ts) ou aceitar degradação.
2. Achados 2-4 abertos: module:deadline do waterfall client; grounding-unavailable (esperado no preview?); divergência UI×banco no fechamento pós-reload (candidato BRU-156).
3. Prova direta LiteLLM requests=0 (se o Planejador exigir): painel/endpoint admin do litellm.homolog.seniorlabs.io — CLI/API sem acesso (404).
4. Depois: BRU-155 (V3) → BRU-156 → auditoria → BRU-153 (exige autorização explícita) → BRU-144 (nova key) → alias scoutagro.
5. Trocar a senha de teste (vazou em dump de console).

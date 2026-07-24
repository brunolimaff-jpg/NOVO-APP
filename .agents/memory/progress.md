# Progress

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

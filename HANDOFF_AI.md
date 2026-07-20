# Handoff — Estabilização do dossiê

> **Atualizado:** 2026-07-20
> **Baseline:** `e0e3d8b2468fdf4e1afe3159c2a5b8320e395845`
> **Foco:** PR 2 — contenção de Radar, War Room e execuções secundárias.

## Estado

- O ciclo experimental de agentes está encerrado e não é requisito do produto.
- O plano canônico está em `docs/planos/estabilizacao-dossie-litellm-v1.md`.
- O primeiro ciclo estabiliza exclusivamente o dossiê: pesquisa, geração, persistência, renderização e acompanhamento contextual.
- Radar, War Room, benchmark independente e RAG documental ficam fora do ciclo inicial.

## PR 1 — mergeada

- Branch: `codex/dossie-baseline-ci-vercel`.
- Escopo: Node 24, npm 11.11.0, `npm ci`, CI, Vercel, Sentry sourcemaps opt-in e documentação operacional.
- O Preview final `dpl_AMQkRove9o47UHrVwt1pB8okXE9d` ficou READY: npm 11.11.0, Build Output e 13 Functions Node; não houve deploy manual nem produção.
- Sentry runtime não mudou. O plugin de build só envia sourcemaps com `SENTRY_UPLOAD_SOURCEMAPS=true` e token.
- O build local Vercel continua `LOCAL_VERCEL_BUILD_UNLINKED`; não usar `vercel pull` para repetir a evidência remota.
- Skills Governance e Agent Orchestration validam somente seus domínios; não existe gate global de escopo misto nesta PR.
- Typecheck, Tests, Golden e E2E permanecem falhas preexistentes comparadas à baseline.

## PR 2

- Branch: `codex/dossie-pr2-contencao`.
- Radar, auto-scan, War Room, benchmark independente, docs-RAG, Teste de Integridade generativo e ping LiteLLM foram removidos da aplicação ativa.
- `api/gemini`, `api/rag`, Pinecone, dados históricos e `runDossierBenchmarkStage` permanecem preservados.
- Preview esperado: nove Functions Node; nenhum LLM real, migration, deploy manual ou merge nesta PR.

## Próximo passo seguro

Validar Preview, Functions e CI da PR 2 antes de qualquer recuperação seguinte.

# Handoff — Estabilização do dossiê

> **Atualizado:** 2026-07-20
> **Baseline:** `a55113e525d31c5a0de82f5b01208ac82ae1eb29`
> **Foco:** PR 1 — baseline, CI e Vercel.

## Estado

- O ciclo experimental de agentes está encerrado e não é requisito do produto.
- O plano canônico está em `docs/planos/estabilizacao-dossie-litellm-v1.md`.
- O primeiro ciclo estabiliza exclusivamente o dossiê: pesquisa, geração, persistência, renderização e acompanhamento contextual.
- Radar, War Room, benchmark independente e RAG documental ficam fora do ciclo inicial.

## PR 1

- Branch: `codex/dossie-baseline-ci-vercel`.
- Escopo: Node 24, npm 11.11.0, `npm ci`, CI, Vercel, Sentry sourcemaps opt-in e documentação operacional.
- O Preview final `dpl_AMQkRove9o47UHrVwt1pB8okXE9d` ficou READY: npm 11.11.0, Build Output e 13 Functions Node; não houve deploy manual nem produção.
- Sentry runtime não mudou. O plugin de build só envia sourcemaps com `SENTRY_UPLOAD_SOURCEMAPS=true` e token.
- O build local Vercel continua `LOCAL_VERCEL_BUILD_UNLINKED`; não usar `vercel pull` para repetir a evidência remota.
- Skills Governance e Agent Orchestration validam somente seus domínios; não existe gate global de escopo misto nesta PR.
- Typecheck, Tests, Golden e E2E permanecem falhas preexistentes comparadas à baseline.

## Próximo passo seguro

Revisar a PR 1. A PR 2 só começa após novo call graph de Radar, War Room e RAG.

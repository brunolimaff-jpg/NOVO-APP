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
- Escopo: Node 24, npm 11.11.0, `npm ci`, CI, Vercel Build Output e documentação operacional.
- Não executar: LLM, runtime de agentes, piloto, migration, deploy ou mudança funcional.
- `npm ci` passou com Node 24.14.1/npm 11.11.0; build e validação documental passaram.
- Typecheck, testes gerais, Golden e E2E seguem falhando por causas comparadas com a baseline. Com Node 24.14.1/npm 11.11.0, Typecheck e Golden reproduzem as mesmas falhas funcionais da baseline.
- O Preview automático `dpl_B5P2ob3VcmgmrB8aaojUdUFyocmw` ficou READY, executou `npm ci`, concluiu Build Output e gerou 13 Functions Node. Production e deploy manual não foram executados.
- O `vercel build` local permanece não vinculado (`LOCAL_VERCEL_BUILD_UNLINKED`); não executar `vercel pull` sem autorização específica, pois pode materializar configuração de ambiente.
- Skills Governance e Agent Orchestration passam a classificar PRs fora de suas superfícies como `NOT_APPLICABLE_SUCCESS`, preservando validação fail-closed quando seus próprios arquivos mudam.

## Próximo passo seguro

Revisar a PR 1 e decidir, com autorização explícita, como obter Build Output sem expor configuração de ambiente. A PR 2 só começa após novo call graph de Radar, War Room e RAG.

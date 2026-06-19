# Active Context

Last updated: 2026-06-19 — PR #383 Fase D + PR Gate IA

## Prioridade Atual

PR #383: Fase D CI (coverage, perf budget, timeout tests) + transição para **PR Gate IA** — E2E fora dos required checks do GitHub.

- **Branch:** `worktree-feat+fase-d-ci-quality-gates`
- **HEAD:** `032dbf5b`
- **PR:** https://github.com/brunolimaff-jpg/NOVO-APP/pull/383
- **CI rápido:** verde (typecheck, tests, coverage, build, golden, smoke)
- **E2E GitHub:** vermelho (Critical UX + Preview Vercel) — esperado até remover blocking
- **Validação UX real:** preview Vercel manual 5/5 ~1,7 min; PR Gate IA antes do merge
- **Design debt:** Cofre skeleton 3 seções — não bloqueia
- **Próximo:** implementer remove E2E blocking; skill valida preview; merge com **MERGE**

## Decisão Ativa — PR Gate IA (DI-2026-06-19-01)

Bruno confirmou: CI rápido no GitHub; E2E crítico sob demanda no preview via agente; merge só com token **MERGE**.

Vault: `30-DECISOES/DECISAO-PR-GATE-IA-2026-06-19.md`

## Contexto Anterior

- PR #382 mergeada (Cofre durante geração)
- Playbook Fase D em execução nesta PR

## Playbook Status (Fase D)

| Tarefa | Status |
|--------|--------|
| T-D.1 Coverage gate | ✅ |
| T-D.2 E2E | 🟡 PR Gate IA |
| T-D.3 Timeout tests | ✅ |
| T-D.4 Perf budget | ✅ |

## Fora do Escopo Imediato

- Merge #383 (aguarda PR Gate IA + MERGE)
- Cofre skeleton 3 seções (design debt)

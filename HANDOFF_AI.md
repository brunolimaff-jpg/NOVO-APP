# Handoff — Pós-auditoria 50 PRs + Plano de Estabilização

**Atualizado:** 2026-06-19 (Onda 2.5 doc-handoff)  
**Produção:** `scoutagro.vercel.app`  
**Plano:** `.cursor/plans/avaliação_auditoria_50_prs_f7ced8ea.plan.md`

## Estado Atual

- **Auditoria 50 PRs (#316–#382):** concluída e reconciliada com o código + delta pós-auditoria.
- **Veredito:** parcialmente válido — loading/render/persistência ainda frágeis; auth/CI melhoraram.
- **PR #383:** **MERGEADA** (2026-06-19) — Fase D CI, remoção lockout auth, PR Gate IA, specs `critical-ux`.
- **PR #384:** **CLOSED** (não mergeada) — escopo absorvido por #383 (AuthGate sem lockout, helpers E2E, `cofre-progressive-dossier.spec.ts`).
- **Onda 0:** pendente — sync `origin/main` + `validate:ci` na branch de trabalho.
- **Onda 1:** **em andamento** — RAF safety net + persist flush + E2E 2ª investigação/stop (P0).
- **Merge futuro:** token **MERGE** na mensagem (regra permanente).

## Reconciliação Auditoria × Repo

| Achado auditoria | Status pós-reconciliação |
|------------------|--------------------------|
| P0 #372 lockout auth | ✅ Resolvido — #383 remove bloqueio guest |
| P0 #349 RAF safety net | ⚠️ Válido — Onda 1.2–1.3 |
| P0 #358 silent persist | ⚠️ Válido — Onda 1.1 (`useSessionStorage.ts:128`) |
| #347 display:none + !important | ⚠️ Código TS sem `!important`; causa raiz **unknown**; Cofre #382 mitiga |
| #381 layoutTraceTelemetry | ✅ Removido — dívida diagnóstica documentada |
| #377 200 CNPJs / 60s | ❌ Impreciso — `MAX_COMPANIES=60`, deadline 45s em socio-search |
| Status "FRÁGIL" global | Nuanceado — CI/auth estáveis; loading/persist ainda frágeis |

## Plano de Estabilização (4 ondas)

| Onda | Foco | Status |
|------|------|--------|
| 0 | Sync main (#383) + gates CI | ⏳ pendente |
| 1 | P0: persist flush, RAF re-entrância, E2E preview | 🔄 em andamento |
| 2 | P1: toast investigação, diagnosticLog backoff, socio-search budget, ADR cache | ⏳ após Onda 1 |
| 3 | Reducer loading, extrair watchdog, probes T-A.5 | ⏳ após Onda 1 estável |
| 4 | PR Gate contínuo + policy §9 auditoria | ✅ ativo (DI-2026-06-19-01) |

## Decisões Ativas

| ID | Tema | Status |
|----|------|--------|
| DI-2026-06-19-01 | PR Gate IA — E2E fora required GitHub | ✅ TRAVA FINAL |
| DI-2026-06-19-02 | Cache read-only vs toast/retry (Onda 2.4) | 📋 ADR — recomenda Opção B |

## PRs de referência

- **#382** — Cofre overlay + `useDeferredValue` (mitigação arquitetural freeze 27k+ chars)
- **#383** — Fase D + auth + E2E `critical-ux` (mergeada)
- **#384** — fechada; conteúdo consolidado em #383

## Próximo passo único

Executar **Onda 1** na branch `fix/onda-1-raf-persist-e2e`: 1.1 persist flush → 1.2 RAF → 1.3–1.5 testes/E2E preview.

## Prompt retomada

```
▎ Auditoria 50 PRs reconciliada. #383 mergeada; #384 absorvida.
▎ Prioridade: Onda 1 (RAF + persist + E2E) — branch fix/onda-1-raf-persist-e2e.
▎ Não mergear PRs que adicionem useState loading / catch {} / RAF sem cleanup.
▎ Merge: CI rápido + PR Gate IA preview + token MERGE.
```

## Vault / docs

- Plano: `.cursor/plans/avaliação_auditoria_50_prs_f7ced8ea.plan.md`
- Auditoria fonte: `~/Downloads/auditoria-50-prs-scout360 (1).md`
- Decisão PR Gate: `Bruno Vault/30-DECISOES/DECISAO-PR-GATE-IA-2026-06-19.md`

# Handoff — Pós-auditoria 50 PRs + Plano de Estabilização

**Atualizado:** 2026-06-19 (Onda 3 concluída)  
**Produção:** `scoutagro.vercel.app`  
**Plano:** `.cursor/plans/avaliação_auditoria_50_prs_f7ced8ea.plan.md`

## Estado Atual

- **Auditoria 50 PRs (#316–#382):** concluída e reconciliada com o código + delta pós-auditoria.
- **Veredito:** parcialmente válido — loading/render/persistência **melhoraram** (Ondas 1–3); safety nets DOM **mantidos** até 7 dias Cofre estável em produção.
- **PR #383:** **MERGEADA** (2026-06-19) — Fase D CI, remoção lockout auth, PR Gate IA, specs `critical-ux`.
- **PR #385:** **ABERTA** — `fix/onda-1-raf-persist-e2e` — Ondas 1–3 do plano de estabilização.
- **Ondas 0–3:** ✅ implementadas na branch; aguardando PR Gate IA no preview pós-push Onda 3.
- **Merge futuro:** token **MERGE** na mensagem (regra permanente).

## Plano de Estabilização (5 ondas: 0–4)

| Onda | Foco                                                                                  | Status                       |
| ---- | ------------------------------------------------------------------------------------- | ---------------------------- |
| 0    | Sync main (#383) + gates CI                                                           | ✅                           |
| 1    | P0: persist flush, RAF re-entrância, E2E preview                                      | ✅                           |
| 2    | P1: toast investigação, diagnosticLog backoff, socio-search budget, ADR cache Opção B | ✅                           |
| 3    | Reducer loading, extrair watchdog, probes T-A.5, cache operator-scoped                | ✅ (safety nets DOM adiados) |
| 4    | PR Gate contínuo + policy §9 auditoria                                                | ✅ ativo (DI-2026-06-19-01)  |

## Próximo passo único

PR Gate IA na **#385**: E2E `critical-ux` no preview Vercel pós-Onda 3 → validação manual Bruno → merge com token **MERGE**.

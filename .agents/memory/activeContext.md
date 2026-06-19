# Active Context

Last updated: 2026-06-19 — Pós-auditoria 50 PRs + Onda 1 em andamento

## Prioridade Atual

**Onda 1 — P0 remanescentes (RAF + persist + E2E)**

| # | Tarefa | Arquivo | Status |
|---|--------|---------|--------|
| 1.1 | Toast + scoutDiag + retry no flush unmount | `hooks/useSessionStorage.ts:128` | ⏳ |
| 1.2 | RAF: validar geração dentro do callback | `features/chat/message-orchestrator.ts:319-328` | ⏳ |
| 1.3 | Teste re-entrância 2 gerações mesmo RAF tick | `tests/features/chat/message-orchestrator.test.ts` | ⏳ |
| 1.4 | E2E: 2ª investigação limpa | novo spec ou extensão | ⏳ |
| 1.5 | E2E: stop → nova investigação | `tests-e2e/` | ⏳ |

- **Branch alvo:** `fix/onda-1-raf-persist-e2e` (a partir de `main` pós-#383)
- **Plano completo:** `.cursor/plans/avaliação_auditoria_50_prs_f7ced8ea.plan.md`

## Contexto Pós-Auditoria

- Auditoria 50 PRs (#316–#382) reconciliada com repo + PR #383.
- **#383 mergeada** — Fase D CI, lockout auth removido, PR Gate IA.
- **#384 closed** — escopo consolidado em #383.
- Veredito: loading/render/persist **ainda frágeis**; auth/CI **estáveis**.

## Decisões Ativas

- **DI-2026-06-19-01:** PR Gate IA — merge só com E2E preview + **MERGE**
- **DI-2026-06-19-02:** Cache read-only (A) vs toast/retry (B) — ADR recomenda B

## Fora do Escopo Imediato

- Onda 2 P1 (toast investigação, diagnosticLog, socio-search budget)
- Onda 3 reducer loading + remoção safety nets DOM
- Merge de PRs no fluxo dossiê até Onda 1 fechar

## Referências

- HANDOFF_AI.md
- CALIBER_LEARNINGS.md (entrada auditoria 2026-06-19)
- `Bruno Vault/30-DECISOES/DECISAO-PR-GATE-IA-2026-06-19.md`

# Progress

Last updated: 2026-06-08 -- PR #346: P0 producao travada vs preview OK

Timeline **curto** no repo. Sessoes e narrativa: Bruno Vault `20-SESSOES/` -- ver `docs/OBSIDIAN_VAULT.md`.
**Historico detalhado (snapshot):** `Bruno Vault/90-SISTEMA/archive/REPO-PROGRESS-SNAPSHOT-2026-05-26.md`

## Em andamento

- **PR #346** fix/validate-inline-sources-timeout: mergeada pelo Bruno em 2026-06-07T20:43:57Z, merge commit `af9cd468`. Codigo validado em `992ece9f`: `/api/link-status` e `/api/gemini` cobrem body read + parse com timeout/abort; continuity-question recebe abort real + race local de 15s; loading timer ganhou identidade canonica + `LoadingStageTimer`; timeline prefere fallback estatico para bot gigante.
- **Status 2026-06-08**: PR verde no codigo validado `992ece9f` (`E2E Critical Browser` PASS 3m53s); preview real Scheffer validada 3x com `PostCompletion=6`, `ui-finalized=1`, `check:10000ms=1` e `stuck_or_blank=0`; doc handoff + licoes espelhados no Bruno Vault e branch docs-only `codex/pr346-p0-handoff-docs`.

## Concluido

| Data       | Marco                                                                              |
| ---------- | ---------------------------------------------------------------------------------- |
| 2026-06-06 | **Bug descoberto**: fetch com AbortSignal.timeout nao cobre response.json()        |
| 2026-06-06 | **Correcao implementada**: AbortController explicito + body read timeout (15s)     |
| 2026-06-06 | **FreezeDiag**: 18 marcos de telemetria no waterfall-orchestrator                  |
| 2026-06-06 | **13 testes** para timeout/fallback/FreezeDiag                                     |
| 2026-06-06 | **Mock fix**: response.text() adicionado ao mock de fetch                          |
| 2026-06-06 | **PR #346 aberta**: preview Exec #1 passou (Scheffer)                              |
| 2026-06-07 | **/api/gemini protegido**: `response.text()` + `JSON.parse()` sob timeout total     |
| 2026-06-07 | **Erro controlado restaurado**: waterfall failed renderiza `ErrorMessageCard`       |
| 2026-06-07 | **Loading timer instrumentado**: `LoadingStageTimer` e compliance canonico          |
| 2026-06-07 | **Preview Scheffer 3x validada no head `992ece9f`**: `pos-register-end=1`, `ui-finalized=1`, `PostCompletion=6`, `stuck_or_blank=0` |
| 2026-06-07 | **CI PR #346 verde**: `E2E Critical Browser` voltou para `SUCCESS`                  |
| 2026-06-07 | **PR #346 mergeada pelo Bruno**: merge commit `af9cd468`                             |
| 2026-06-08 | **Doc handoff final**: repo + Bruno Vault atualizados com licoes do P0 producao vs preview |
| 2026-06-05 | **Bug P0 overlay hero resolvido**: 5 camadas, 5 PRs (#333, #334, #335, #342, #343) |
| 2026-06-05 | **PR #343 mergeada**: setTimeout swap para flushDiagnosticsNow                     |

## Licoes registradas

- 17 licoes do bug P0 overlay hero em `CALIBER_LEARNINGS.md` e vault
- Nova licao: `AbortSignal.timeout()` so cobre conexao, nao `response.json()` — usar AbortController + body read timeout separado
- Nova licao: PR #346 consolidou cadeia body-read/abort/diagnostics/loading/timeline e validação de produto no Vault `LICOES-P0-PRODUCAO-TRAVADA-PREVIEW-OK-2026-06-08.md`

## Comandos de validacao

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e:errors
npx playwright test tests-e2e/scheffer-cnpj-blank-panel.spec.ts
```

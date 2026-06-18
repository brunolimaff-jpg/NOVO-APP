# Active Context

Last updated: 2026-06-18 - PR #379 mergeada, playbook verificado

## Prioridade Atual

P0 operacional concluido. Playbook verificado (16 tarefas, 5 fases). Proximo passo: decidir qual fase atacar.

- **Branch:** `main` (PR #379 mergeada em `db5a9a8d`)
- **Vault:** `20-SESSOES/2026-06/2026-06-18T08-37-04-p0-playbook-foundation.md`
- **Fase:** Pos-P0, playbook verification complete
- **Producao:** `scoutagro.vercel.app` — cron dry-run ativo, CRON_DELETE_ENABLED nunca configurado
- **Risco:** Nenhum bloqueio ativo

## Estado do Projeto

- PR #379 mergeada e em producao (db5a9a8d).
- Cron protecao dry-run validada (`dryRun:true, candidates:0, cleaned:0`).
- Hook completion-check.sh consultivo com `decision: null` — testado, funcional.
- Shell test no CI (`bash tests/scripts/completion-check.test.sh`).
- Codex revertido: `.mcp.json`, `ai-actions.md`, manifest.json, 4 planos restaurados.
- CODEX.md removido (duplicata de CLAUDE.md).
- Branch protection restaurada (required_conversation_resolution: true).
- Playwright E2E validado no preview Vercel: login -> CNPJ Scheffer -> waterfall -> Score 82/100.

## Playbook Status

| Fase   | Tarefas-chave                               | Status             |
| ------ | ------------------------------------------- | ------------------ |
| Fase 0 | PR #379 (P0)                                | ✅ CONCLUIDA       |
| T-A    | Causa raiz display:none, invariante, layout | 🟡 PARCIAL / ❌ 1  |
| T-B    | Error handling (rede, CNPJ, waterfall)      | ✅ 1 / ❌ 1 / 🟡 1 |
| T-C    | Telemetria (layoutTraceTelemetry.ts)        | ❌ 1               |
| T-D    | CI/Gates (coverage, E2E, timeout, perf)     | ❌ 3 / 🟡 1        |

## Decisões Ativas

- CRON_DELETE_ENABLED nunca configurado — cron e so painel de observacao.
- Codex/CodeRabbit nao modifica `.mcp.json`, `nimbalyst-local/`, ou `.claude/plugins/`.
- Vercel deploy poll: 2s, nao 5s.
- Branch protection desabilitada temporariamente durante merge de PR com required_conversation_resolution.

## Fora do Escopo Atual

- Rotacao de API keys permanece pendente.

## Validacao Atual

- Cron producao: HTTP 200, dry-run, zero candidatos.
- Suite de testes: 162 arquivos / 1.502 testes verdes (baseline mantido).
- Playwright E2E: validado no preview Vercel — fluxo completo login + CNPJ + waterfall.

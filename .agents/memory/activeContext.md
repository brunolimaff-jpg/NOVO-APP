# Active Context

Last updated: 2026-06-18 - PR #382 Cofre durante a geracao

## Prioridade Atual

PR #382: publicar e validar no Preview o Cofre de tela inteira durante dossies. Follow-up e Deep Dive continuam inline; liberacao depende do PostCompletion visual valido.

- **Branch:** `worktree-sprint2+remove-layout-trace-telemetry`
- **Risco:** medio; mudanca no bloqueio global da UI durante geracao
- **Validacao local:** typecheck, suite completa (1.505), contratos (64), build, E2E painel branco (3/3), lint do escopo e testes focados (44)
- **Bloqueio:** gate `validate:chat:no-autoscroll` requer chave Pinecone ausente no ambiente local
- **Proximo passo:** push, aguardar checks/Preview e validar Scheffer desktop + 375 px

## Contexto Anterior

Sprint 1 concluida (T-B.2 e T-B.3). PR #380 aguardando CI para merge. Proximo: decidir entre Sprint 2 (remover layoutTraceTelemetry.ts) ou Sprint 3 (coverage + display:none).

- **Branch:** `main` (PR #379 mergeada `db5a9a8d`; PR #380 branch `fix/sprint1-cnpj-qsa-knowncnpjs`, commit `e4fc6587`)
- **Vault (manha):** `20-SESSOES/2026-06/2026-06-18T08-37-04-p0-playbook-foundation.md`
- **Vault (tarde):** `20-SESSOES/2026-06/2026-06-18T15-00-00-sprint1-cnpj-qsa-catch.md` (pendente criacao)
- **Fase:** Sprint 1 — T-B.2 e T-B.3 concluidos
- **Producao:** `scoutagro.vercel.app` — cron dry-run ativo, CRON_DELETE_ENABLED nunca configurado
- **Risco:** Nenhum bloqueio ativo

## Estado do Projeto

- PR #379 mergeada e em producao (db5a9a8d).
- PR #380 (Sprint 1): branch `fix/sprint1-cnpj-qsa-knowncnpjs`, commit `e4fc6587`.
  - T-B.2: `partner.document` validado (14 digitos) e formatado no `partnerText` para `validateTeiaCnpjsOutput`.
  - T-B.3: `.catch(() => {})` -> `scoutDiag.warn` em `waterfall-orchestrator.ts:307`.
  - 1502/1502 testes verdes, typecheck limpo.
- Cron protecao dry-run validada (`dryRun:true, candidates:0, cleaned:0`).
- Hook completion-check.sh consultivo com `decision: null`.
- Codex revertido: `.mcp.json`, `ai-actions.md`, manifest.json, 4 planos restaurados.
- Branch protection restaurada (required_conversation_resolution: true).

## Playbook Status

| Fase   | Tarefas-chave                               | Status             |
| ------ | ------------------------------------------- | ------------------ |
| Fase 0 | PR #379 (P0)                                | ✅ CONCLUIDA       |
| T-A    | Causa raiz display:none, invariante, layout | 🟡 PARCIAL / ❌ 1  |
| T-B    | Error handling (rede, CNPJ, waterfall)      | ✅ 3 / 🟡 0 / ❌ 0 |
| T-C    | Telemetria (layoutTraceTelemetry.ts)        | ❌ 1 (Sprint 2)    |
| T-D    | CI/Gates (coverage, E2E, timeout, perf)     | ❌ 3 / 🟡 1        |

## Decisoes Ativas

- CRON_DELETE_ENABLED nunca configurado — cron e so painel de observacao.
- Codex/CodeRabbit nao modifica `.mcp.json`, `nimbalyst-local/`, ou `.claude/plugins/`.
- Vercel deploy poll: 2s, nao 5s.
- Branch protection desabilitada temporariamente durante merge de PR com required_conversation_resolution.
- Fix incompleto e pior que fix nenhum — validar pipeline completo (Set -> consumidores).
- Documentos QSA = CPF mascarado ate validacao de 14 digitos.

## Fora do Escopo Atual

- Rotacao de API keys permanece pendente.
- Sprint 2 (remover layoutTraceTelemetry.ts) e Sprint 3 (coverage + display:none) nao iniciadas.

## Validacao Atual

- Cron producao: HTTP 200, dry-run, zero candidatos.
- Suite de testes: 162 arquivos / 1.502+ testes verdes.
- PR #380: 1502/1502 verdes, typecheck limpo, aguardando merge.

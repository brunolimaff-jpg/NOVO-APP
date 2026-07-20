# Progress

## 2026-07-14 — Fase 3B.3C.1 (live readiness macOS)

- Branch `fix/fase-3b3c1-live-readiness-macos` @ `636c3d4e`
- Separa `asset_checksums_esperados` × `binary_checksums_esperados` (arm64 binário com proveniência)
- Verificador live de hook + atestação humana fora do repo
- `check-pilot-readiness.rb` somente leitura
- Sem instalar DCG / sem alterar hooks / sem Codex ou piloto real

## 2026-07-14 — PR #430 MERGED (Fase 3B.3C)

- Squash `636c3d4e6fe2b369f7e7644242e79b7edb8781d1`

## 2026-07-17 — Encerramento da prova final supervisionada

- PRs #442, #443 e #444 concluídas e preservadas.
- Preparação bloqueada antes da reserva por `RUNNER_HEAD_NOT_FROZEN`.
- Encerramento formal documentado; nenhum runtime, piloto, state, evidência,
  entrega ou Run Report foi criado.
- Prioridade devolvida ao backlog do Scout 360; próxima triagem: #409–#418 e
  #435.

# 2026-07-20 — PR 1: baseline, CI e Vercel

- Baseline remota confirmada em `a55113e525d31c5a0de82f5b01208ac82ae1eb29`.
- Worktree principal estava suja; PR 1 segue em worktree isolada.
- Plano consolidado: `docs/planos/estabilizacao-dossie-litellm-v1.md`.
- Escopo: Node 24, npm 11.11.0, `npm ci`, CI, Vercel e documentação operacional.
- Próximo gate: validar build e Build Output sem tocar em funcionalidades do dossiê.
- `npm ci` passou em Node 24.14.1/npm 11.11.0; build e docs check passaram.
- Typecheck e testes gerais falharam por baseline fora do diff.
- `vercel build` foi bloqueado por `project_settings_required`; não houve pull, deploy ou leitura de configuração remota.

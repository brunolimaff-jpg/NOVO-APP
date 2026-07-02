# Active Context

Last updated: 2026-07-02 — BUG-8 PR #409 local fix implementado

## Estado Atual

- **Worktree atual:** `/Users/brunolima/Documents/NOVO-APP/.claude/worktrees/sweet-bhabha-d544e3`
- **Branch:** `feat/pipeline-v2-pr409-prompts-v2-output-mode`
- **PR:** #409 — bloqueada por BUG-8 até validação Scheffer do zero no preview
- **SHA base investigado:** `44ad4056`
- **Merge guard:** nunca mergear sem `MERGE` explícito do Bruno

## O que mudou nesta sessão

- Centralizada a política de recovery em `decideTimelineRecoveryMode(...)`.
- Blank panel reativo abaixo de `60_000` chars não ativa mais `messages-static-fallback`; faz remount controlado da timeline via `timelineRecoveryNonce`.
- Static fallback permanece só como último recurso para dossiê `>=60_000`.
- `SessionsSidebar` passou a renderizar preview limpo/capado em 160 chars, evitando dossiê completo no DOM do histórico.
- Testes regressivos adicionados para dossiê ~42k sem static fallback e sidebar com bot 50k sem sentinel no `document.body.textContent`.
- Docs vivas atualizadas para remover contrato antigo de static `4k/5k`.

## Validação

- Testes focados: 96/96 passando.
- Build: passou, com falha não bloqueante do Sentry CLI por DNS/rede bloqueada.
- Typecheck: falha por débitos pré-existentes fora do patch; nenhum erro restante nos arquivos alterados nesta sessão.

## Próximo passo

- Commitar/pushar o fix, aguardar preview no novo SHA e rodar Scheffer do ZERO no preview.

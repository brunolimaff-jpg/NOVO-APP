# Handoff - P0 Playbook Revisado

**Atualizado:** 2026-06-18
**Branch:** `codex/p0-playbook-foundation`
**Base:** `origin/main` (`ce40644a`)
**Worktree:** `/Users/brunolima/.config/superpowers/worktrees/NOVO-APP/p0-playbook-foundation`
**PR:** https://github.com/brunolimaff-jpg/NOVO-APP/pull/379 (draft, head `667fc8fc`)

## Objetivo

Executar o P0 operacional e consolidar o Playbook de Execucao a Prova de IA como roadmap priorizado, sem bloquear mudancas de assunto.

## Estado

- A trava criada por DI-2026-06-17-01 foi revogada por decisao do Bruno.
- Plano revisado: `docs/superpowers/plans/2026-06-18-ai-proof-execution-playbook-revised.md`.
- Vault: `20-SESSOES/2026-06/2026-06-18T08-37-04-p0-playbook-foundation.md`.
- `CODEX.md` consolidado sem trava global de agentes.
- Rotacao de API keys ficou fora do escopo atual por decisao do Bruno; nao foi marcada como resolvida.
- PR #377 permanece aberta e `CLEAN`; nao houve merge.
- PR #379 aberta como draft e publicada ate `667fc8fc`.
- Hook global de conclusao instalado a partir de `scripts/hooks/completion-check.sh`; agora retorna `decision: null` e apenas avisa pendencias.

## P0 de Senha e Cron

- Deadline no codigo: `2026-06-18T23:59:59-03:00` em `hooks/useAuthGate.ts`.
- Banner antes do prazo e bloqueio/recuperacao depois do prazo possuem testes.
- Producao responde 200 na aplicacao, mas nao recebeu esta mudanca.
- No Preview da branch, `CRON_SECRET` foi configurado somente para esse ambiente.
- `CRON_DELETE_ENABLED` nao foi configurado; o cron permanece em dry-run.
- Chamada autenticada no Preview respondeu HTTP 200 com `{dryRun:true,candidates:0,cleaned:0,total:0}`.

## Validacao

- Suite final: `npm test` -> 162 arquivos, 1.502 testes verdes.
- RED do cron: 2 testes falharam antes da protecao dry-run.
- GREEN do cron: 9 testes verdes apos a protecao.
- Typecheck, build e `docs:obsidian:check` passaram.
- PR #379 publicada ate `667fc8fc`.
- Preview Ready: `https://scoutagro-ljs7o8dik-brunolimaff-3629s-projects.vercel.app`.
- Cron autenticado no Preview: HTTP 200, dry-run, zero candidatos e zero exclusoes.
- Hook global: teste PASS; pendencias geram aviso sem bloquear o encerramento.
- Lint permanece vermelho por 7 erros preexistentes mapeados para a Fase 0.
- Validador global do Vault permanece vermelho por transcricoes legadas sem frontmatter; os arquivos novos passaram na verificacao estrutural isolada.
- Producao do novo codigo: **NAO VALIDADO**, sem merge ou deploy de producao.

## Proximos Passos

1. Revisar a PR #379 e aguardar `MERGE` explicito antes de alterar producao.
2. Apos o merge, configurar `CRON_SECRET` em producao e repetir o dry-run autenticado.
3. Revisar os candidatos antes de autorizar `CRON_DELETE_ENABLED=true` em producao.

## Guardas

- Nao descartar a `main` local suja em `/Users/brunolima/Documents/NOVO-APP`.
- Nao habilitar exclusao do cron sem dry-run revisado.
- Nao mergear PR sem `MERGE` explicito.

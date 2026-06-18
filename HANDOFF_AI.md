# Handoff - P0 Playbook Revisado

**Atualizado:** 2026-06-18
**Branch:** `codex/p0-playbook-foundation`
**Base:** `origin/main` (`ce40644a`)
**Worktree:** `/Users/brunolima/.config/superpowers/worktrees/NOVO-APP/p0-playbook-foundation`
**PR:** https://github.com/brunolimaff-jpg/NOVO-APP/pull/379 (draft)

## Objetivo

Executar o P0 operacional e consolidar o Playbook de Execucao a Prova de IA como roadmap priorizado, sem bloquear mudancas de assunto.

## Estado

- A trava criada por DI-2026-06-17-01 foi revogada por decisao do Bruno.
- Plano revisado: `docs/superpowers/plans/2026-06-18-ai-proof-execution-playbook-revised.md`.
- Vault: `20-SESSOES/2026-06/2026-06-18T08-37-04-p0-playbook-foundation.md`.
- `CODEX.md` consolidado sem trava global de agentes.
- Rotacao de API keys ficou fora do escopo atual por decisao do Bruno; nao foi marcada como resolvida.
- PR #377 permanece aberta e `CLEAN`; nao houve merge.
- PR #379 aberta como draft; primeiro commit `73b8fb81`.

## P0 de Senha e Cron

- Deadline no codigo: `2026-06-18T23:59:59-03:00` em `hooks/useAuthGate.ts`.
- Banner antes do prazo e bloqueio/recuperacao depois do prazo possuem testes.
- Producao responde 200 na aplicacao.
- O endpoint `/api/cron-email-confirmation` respondeu 500: `CRON_SECRET not configured`.
- Correcao local: cron agora e dry-run por padrao; exclusao exige `CRON_DELETE_ENABLED=true`.
- Nao configurar `CRON_SECRET` antes de publicar essa protecao, pois a versao atual de producao apaga candidatos diretamente.

## Validacao

- Suite final: `npm test` -> 162 arquivos, 1.502 testes verdes.
- RED do cron: 2 testes falharam antes da protecao dry-run.
- GREEN do cron: 9 testes verdes apos a protecao.
- Typecheck, build e `docs:obsidian:check` passaram.
- PR #379 em `23177dc8`: CI, E2E Critical Browser, Preview Smoke, Vercel, CodeQL e revisoes automaticas verdes.
- Preview: `https://scoutagro-i99c5svwe-brunolimaff-3629s-projects.vercel.app`.
- Lint permanece vermelho por 7 erros preexistentes mapeados para a Fase 0.
- Validador global do Vault permanece vermelho por transcricoes legadas sem frontmatter; os arquivos novos passaram na verificacao estrutural isolada.
- Preview/producao do novo codigo: **NAO VALIDADO**, ainda sem deploy.

## Proximos Passos

1. Configurar `CRON_SECRET` somente depois que esta protecao chegar ao ambiente escolhido.
2. Chamar o endpoint autenticado em dry-run e registrar a contagem.
3. Revisar os candidatos antes de autorizar `CRON_DELETE_ENABLED=true`.

## Guardas

- Nao descartar a `main` local suja em `/Users/brunolima/Documents/NOVO-APP`.
- Nao habilitar exclusao do cron sem dry-run revisado.
- Nao mergear PR sem `MERGE` explicito.

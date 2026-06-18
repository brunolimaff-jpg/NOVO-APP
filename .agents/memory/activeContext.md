# Active Context

Last updated: 2026-06-18 - P0 validado no Preview; producao aguarda MERGE

## Prioridade Atual

O Playbook de Execucao a Prova de IA e um roadmap priorizado, nao uma trava de conversa. Mudancas de assunto nao exigem confirmacao previa.

- **Branch:** `codex/p0-playbook-foundation`
- **Plano:** `docs/superpowers/plans/2026-06-18-ai-proof-execution-playbook-revised.md`
- **Vault:** `20-SESSOES/2026-06/2026-06-18T08-37-04-p0-playbook-foundation.md`
- **Fase:** P0 operacional
- **Risco:** producao ainda usa a versao anterior; nao configurar o segredo antes do merge da protecao
- **PR:** #379 (draft) - https://github.com/brunolimaff-jpg/NOVO-APP/pull/379
- **Preview:** `https://scoutagro-ljs7o8dik-brunolimaff-3629s-projects.vercel.app` (Ready)
- **Head:** `667fc8fc`

## P0

- Banner e bloqueio de senha existem; deadline: `2026-06-18T23:59:59-03:00`.
- Producao esta online, mas ainda nao recebeu a protecao.
- Preview da branch tem `CRON_SECRET`; `CRON_DELETE_ENABLED` permanece ausente.
- Dry-run autenticado no Preview: HTTP 200, zero candidatos e zero exclusoes.
- Proximo passo: revisar/mergear somente com `MERGE`, repetir o dry-run em producao e revisar candidatos antes de habilitar exclusao.

## Fora do Escopo Atual

- Rotacao de API keys foi adiada por decisao explicita do Bruno; nao esta resolvida.

## Estado do Projeto

- PR #377 aberta e `CLEAN`; sem merge autorizado.
- PR #379 aberta como draft para o P0; sem merge autorizado.
- Branch publicada ate `667fc8fc`; Preview Ready e cron validado em dry-run.
- Hook global instalado da versao versionada; retorna `decision: null`, avisa pendencias e passou no teste.
- PR #378 mergeada em `ce40644a`.
- `main` local original permanece suja e nao deve ser alterada por esta branch.
- Pendencias tecnicas: auditoria RLS, `dossier_accesses`, duplicatas em `user_context` e monitoramento do historico.

## Validacao Atual

- Suite final: 162 arquivos / 1.502 testes verdes.
- Cron: RED registrado; GREEN com 9 testes.
- Typecheck, build e docs Obsidian verdes; lint com 7 erros preexistentes.
- Novo codigo validado no Preview Vercel; producao **NAO VALIDADA** e inalterada.

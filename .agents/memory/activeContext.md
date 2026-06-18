# Active Context

Last updated: 2026-06-18 - P0 do playbook revisado em execucao

## Prioridade Atual

O Playbook de Execucao a Prova de IA e um roadmap priorizado, nao uma trava de conversa. Mudancas de assunto nao exigem confirmacao previa.

- **Branch:** `codex/p0-playbook-foundation`
- **Plano:** `docs/superpowers/plans/2026-06-18-ai-proof-execution-playbook-revised.md`
- **Vault:** `20-SESSOES/2026-06/2026-06-18T08-37-04-p0-playbook-foundation.md`
- **Fase:** P0 operacional
- **Risco:** cron destrutivo sem protecao na versao atual de producao

## P0

- Banner e bloqueio de senha existem; deadline: `2026-06-18T23:59:59-03:00`.
- Producao esta online, mas o cron retorna 500 por ausencia de `CRON_SECRET`.
- Implementado localmente: dry-run por padrao e exclusao somente com `CRON_DELETE_ENABLED=true`.
- Proximo passo: publicar a protecao, validar dry-run e revisar candidatos antes de habilitar exclusao.

## Fora do Escopo Atual

- Rotacao de API keys foi adiada por decisao explicita do Bruno; nao esta resolvida.

## Estado do Projeto

- PR #377 aberta e `CLEAN`; sem merge autorizado.
- PR #378 mergeada em `ce40644a`.
- `main` local original permanece suja e nao deve ser alterada por esta branch.
- Pendencias tecnicas: auditoria RLS, `dossier_accesses`, duplicatas em `user_context` e monitoramento do historico.

## Validacao Atual

- Suite final: 162 arquivos / 1.502 testes verdes.
- Cron: RED registrado; GREEN com 9 testes.
- Typecheck, build e docs Obsidian verdes; lint com 7 erros preexistentes.
- Novo codigo em Preview Vercel: **NAO VALIDADO**.

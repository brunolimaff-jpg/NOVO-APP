# HANDOFF — PR #466 reutilização segura de dossiês

> Atualizado: 2026-07-30
> Referência portátil: Bruno Vault / `04 - Histórico ChatGPT/Sessões Anteriores/2026-07/2026-07-30T15-51-32-pr466-reutilizacao-segura-dossies.md`

## Estado

- PR #465 foi mergeada por autorização explícita: squash `bd98c829`.
- PR #466: https://github.com/brunolimaff-jpg/NOVO-APP/pull/466
- Branch: `codex/secure-cross-operator-dossier-reuse`
- Head antes da correção de privacidade: `c82f6833406dee4ae346b80ec3d1842fcf488288`.
- Estado: `OPEN/DRAFT`, mergeável; checks automáticos em andamento no último snapshot.
- Migration 24 permanece code-only; nenhuma migration remota aplicada nesta missão.

## Entrega

- As RPCs autorizam somente usuário Auth confirmado `@senior.com.br`, com e-mail idêntico no perfil e `operator_id`; falhas usam `42501 access denied` genérico.
- `authenticated` é o único papel com `EXECUTE`; `PUBLIC`, `anon` e `service_role` permanecem bloqueados.
- Descoberta retorna somente registro próprio ou raiz estrangeira com exatamente um relatório bot não vazio marcado por `scorePorta` objeto; falha técnica bloqueia geração.
- Acesso abre o registro próprio e canonicaliza cópia estrangeira diretamente para a raiz; linhagem inválida/circular/copy-to-copy é recusada.
- Fonte permanece imutável; cópia estrangeira contém somente uma mensagem sintética e o relatório canônico sanitizado por allowlist.
- Conversa privada, follow-ups, feedback, erros, `companyContext` e chaves desconhecidas não são copiados.
- Concorrência possui barreiras comprovadas por advisory lock, índice único parcial e `ON CONFLICT` direcionado; não foi executado teste simultâneo de duas sessões.
- Cliente mantém modal durante carga, mostra erro, bloqueia clique duplo e injeta a sessão completa sem `getRemoteSession` no fluxo.
- Abrir uma sessão carregada cancela geração ativa, aborta a requisição e deduplica a sessão local.
- `shared_dossiers`, policies amplas e PR #456 não foram alteradas.

## Validação local

- Runtime canônico: Node 24.14.1 / npm 11.11.0.
- Direcionados: 152/152 PASS.
- PostgreSQL 17 runtime: PASS, incluindo guarda negativa das capturas e rollback.
- Replay PostgreSQL 17: 24/24 PASS.
- Typecheck: 14 erros idênticos à `main`; novos 0.
- Testes: branch 1553 PASS/34 FAIL; `main` 1526 PASS/35 FAIL; novas falhas 0.
- Lint: 0 erros/61 warnings; build e diff check: PASS.

## Próximo passo

1. Aplicar e validar a migration 24 em rollout controlado antes de merge/deploy.
2. Auditar checks automáticos sem responder ou resolver threads nesta missão.
3. Manter Draft; merge e rollout da migration exigem missões separadas.

## Guardrails

- Não aplicar migration remota, não tocar Produção/Preview/Vercel manualmente.
- Históricos sem marcador inequívoco não são compartilháveis; sem backfill ou heurística nesta PR.
- Lock da migration é aceito para a tabela pequena; índices de expressão ficam adiados.
- Não executar smoke pago nem compartilhamento público por link.
- Não alterar `shared_dossiers` ou PR #456.
- Não fazer merge sem nova mensagem contendo `MERGE`.

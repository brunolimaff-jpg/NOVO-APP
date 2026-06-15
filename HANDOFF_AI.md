# Handoff — Sessao 2026-06-15 (3 bugs historico + RLS + race condition)

> **Estado:** `main` (`fe6c6f9b`) — 3 commits de correcao pos-PR #376. Git limpo, sincronizado.
> **Vercel producao:** scoutagro.vercel.app
> **Supabase project:** `vmqfcaoirjcfucvlnpig` (NOVO-APP)

---

## Resumo da Sessao

| #   | Tarefa                                                       | Status |
| --- | ------------------------------------------------------------ | ------ |
| 1   | Bug 1 — operator_id sumia do localStorage apos login         | OK     |
| 2   | Bug 2 — race condition no evento operator-relinked           | OK     |
| 3   | Bug 3 — RLS bloqueando usuarios authenticated (historico []) | OK     |
| 4   | Diagnostico — Ananda (18 dossies sem historico)              | OK     |
| 5   | Diagnostico — Wuender (47 dossies sem historico)             | OK     |
| 6   | Migration RLS aplicada no Supabase remoto                    | OK     |
| 7   | Documentacao — licoes, decisoes, handoff, Bruno Vault        | OK     |

## Correcoes aplicadas

| Correcao                                                                                            | Origem                   |
| --------------------------------------------------------------------------------------------------- | ------------------------ |
| OperatorContext: storageSet(OPERATOR_ID_KEY) apos auth resolution                                   | Auto-diagnostico (Bug 1) |
| OperatorContext: setTimeout(0) no dispatch do operator-relinked                                     | Auto-diagnostico (Bug 2) |
| supabase/migrations/20260615_fix_dossies_rls_authenticated.sql: ALTER POLICY TO anon, authenticated | Auto-diagnostico (Bug 3) |

## Decisoes desta sessao

- **DI-2026-06-15-05: Evento operator-relinked deve usar setTimeout(0) para garantir listeners montados**
  React executa useEffect dos pais antes dos filhos. `window.dispatchEvent` sincrono no efeito pai nunca alcanca listeners em efeitos filhos. `setTimeout(() => dispatchEvent(...), 0)` da tempo dos children montarem antes do evento disparar.
- **DI-2026-06-15-06: RLS policy de dossies deve cobrir anon + authenticated**
  Usuarios logados no Supabase usam role `authenticated`, nao `anon`. Toda policy que protege dados de negocio (dossies, user_context) precisa explicitar `TO anon, authenticated` ou a role correta. Policy criada apenas com `TO anon` bloqueia silenciosamente usuarios logados retornando `[]`.
- **DI-2026-06-15-07: Debug de sidebar vazia comeca pela network layer, nao pelo state React**
  Sidebar vazia com dados intactos no banco = cadeia de 3 bugs (localStorage vazio -> query com temp ID -> RLS filtra -> retorna []). Cada um mascara o proximo. Network request `content-length: 2` com payload `[]` e sinal diagnostico de RLS bloqueando.

## Arquivos alterados

| Arquivo                                                        | Mudanca                                             | Status  |
| -------------------------------------------------------------- | --------------------------------------------------- | ------- |
| contexts/OperatorContext.tsx                                   | storageSet operator_id + setTimeout dispatch        | local   |
| supabase/migrations/20260615_fix_dossies_rls_authenticated.sql | Migration RLS (anon + authenticated)                | local   |
| HANDOFF_AI.md                                                  | Documentacao                                        | updated |
| .agents/memory/\*                                              | activeContext, progress, decisions                  | updated |
| CALIBER_LEARNINGS.md                                           | 5 novas licoes (RLS, race, dispatch, network debug) | updated |

## Diagnosticos

- **Ananda** (ananda.aiello@senior.com.br): 18 dossies, 80 eventos, operator_id = op_97dd493823354672. RLS retornava `[]`.
- **Wuender** (wuender.amik@senior.com.br): 47 dossies, 34 empresas, operator_id = op_22708f96efed492f. Mesmo bug.
- Ambos resolvidos apos aplicar os 3 fixes + migration RLS.

## Branch Health

- `main` local = `origin/main` (`fe6c6f9b`) — sincronizado.
- Nenhuma worktree ativa.
- Branch `feature/supabase-auth` ainda existe — pode ser deletada.

## Riscos residuais

- Branch `feature/supabase-auth` pode ser deletada (local + remote).
- Deadline 18/06: usuarios existentes sem senha perdem acesso.
- Outras policies RLS podem ter sido criadas com `TO anon` apenas.

## Proximo passo

Monitorar Sentry e validar se usuarios com historico vazio antes do fix agora veem seus dossies. Deletar branch `feature/supabase-auth`.

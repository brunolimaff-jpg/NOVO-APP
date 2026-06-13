# Handoff — PR #372 Supabase Auth pronta para merge

- **PR:** #372 — `feature/supabase-auth`
- **Codigo runtime validado:** `c86fd0dd` (`fix: allow authenticated storage writes`)
- **Status GitHub:** `CLEAN`, todos os checks verdes, **nao mergeada**
- **Preview final:** https://scoutagro-48emv2pdu-brunolimaff-3629s-projects.vercel.app
- **Alias da branch:** https://scoutagro-git-feature-supabase-auth-brunolimaff-3629s-projects.vercel.app
- **Supabase project:** `vmqfcaoirjcfucvlnpig` (`NOVO-APP`)
- **Deadline de migracao:** 18/06/2026

## Resumo

A PR #372 migra o fluxo local de operador para Supabase Auth e fecha os bloqueadores encontrados antes do merge. A cadeia final de identidade e:

`Supabase Auth auth.uid()` -> `profiles.operator_id` -> dados do operador/dossies.

O app nao grava mais identidade autenticada (`operator_id`, nome, email) no localStorage proprio. A sessao fica salva pelo token do Supabase Auth no navegador.

## Commits relevantes da revisao final

- `6d7b89c1` — fecha bloqueadores de auth remediation: restaura `/api/link-status`, remove `/api/pulse-news`, corrige AuthGate pos-deadline, login com senha simples, E2E e migrations.
- `2fd6f3f8` — remove cache local de identidade derivada de auth para resolver alerta CodeQL de clear-text storage.
- `c86fd0dd` — aguarda RPC de relink legado, adiciona RLS authenticated para `user_context`/radar e reduz radar para aviso nao bloqueante.

## Migrations aplicadas

No Supabase remoto (`vmqfcaoirjcfucvlnpig`):

- `20260613_user_context_schema`
- `20260613_lock_profiles_operator_id`
- `auth_storage_rls_policies`

A ultima migration permite que usuario autenticado:

- leia `user_context` proprio ou legado pelo proprio email;
- grave/atualize apenas o `operator_id` ligado ao seu `profiles`;
- use radar apenas quando o `operator_id` bate com `profiles.operator_id`.

## Validacao local

Rodado em worktree limpa `/tmp/novo-app-validate-a0yzFv` antes da limpeza:

- `npm run typecheck` — passou
- `npm run test` — 162 arquivos, 1498 testes passaram
- `npm run build` — passou, com aviso conhecido de chunk grande
- `npx eslint` nos arquivos alterados — 0 erros, 1 warning antigo em teste (`mockProfileError`)
- `git diff --check HEAD~1..HEAD` — passou

Observacao: o typecheck na pasta principal ainda e poluido por `components/MetricsDashboard.tsx` nao rastreado, fora da PR.

## Checks GitHub/Vercel

Todos passaram no commit runtime `c86fd0dd` antes do commit documental final:

- Build
- Typecheck
- Tests
- Dossier Golden
- E2E Critical Browser
- CodeQL
- CodeRabbit
- GitGuardian
- Smoke preview
- Vercel
- Vercel Preview Comments

## Validacao manual no preview

Preview testado: https://scoutagro-48emv2pdu-brunolimaff-3629s-projects.vercel.app

Fluxo validado:

1. Login com a conta do Bruno funcionou.
2. Reload manteve a sessao salva via Supabase Auth.
3. `scout360:operator_id`, `scout360:operator_name` e `scout360:operator_email` ficaram `null` no localStorage.
4. Token Supabase presente (`sb-vmqfcaoirjcfucvlnpig-auth-token`).
5. CNPJ `04.733.767/0001-80` validou como `SCHEFFER & CIA LTDA`, cidade `Sapezal`, UF `MT`.
6. Investigacao completa iniciou, criou historico, concluiu o waterfall e gerou dossie com Score 84.
7. Console sem erros de RLS, `saveUserContext`, `saveRadar`, `row-level security` ou `violates`.
8. Logs de `FreezeDiag`/`BlankPanelDebug` apareceram apenas como diagnostico; a UI renderizou o dossie, sem painel branco.

## Riscos residuais

- Radar continua usando storage legado em partes do fluxo; nesta PR ele foi tratado como nao bloqueante, conforme decisao do Bruno.
- Backend/operacao de recuperacao assistida pos-deadline ainda precisa ser fechado fora desta PR.
- `CRON_SECRET` deve permanecer configurado nos ambientes Vercel onde o cron real rodar.
- Arquivos locais nao relacionados seguem fora da PR: `.claude/worktrees/`, `components/MetricsDashboard.tsx`, `docs/planos/2026-06-13-pr372-auth-remediation-plan.md`.

## Proximo passo

Se Bruno quiser concluir, confirmar explicitamente com **MERGE**. Sem essa palavra, nao executar merge por causa do merge guard do repo.

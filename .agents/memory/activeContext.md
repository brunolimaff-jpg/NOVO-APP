# Active Context

Last updated: 2026-06-15 — sessao de 3 bugs de historico: localStorage, race condition, RLS

## Estado Atual

- **Branch local:** `main` (`fe6c6f9b`) — 3 commits pos-PR #376, sincronizado com `origin/main`
- **Vercel producao:** scoutagro.vercel.app
- **Supabase project:** `vmqfcaoirjcfucvlnpig`
- **Deadline:** 18/06/2026 — usuarios existentes precisam cadastrar senha
- **Git status:** limpo, sincronizado com origin/main

## O que foi entregue nesta sessao

- **Bug 1 — operator_id sumia do localStorage:** `storageRemove()` limpava `scout360:operator_id`, `getOperatorId()` so lia do localStorage. Corrigido: `storageSet(OPERATOR_ID_KEY, resolved.operatorId)` apos resolucao de auth.
- **Bug 2 — Race condition operator-relinked:** `window.dispatchEvent(new CustomEvent('operator-relinked'))` disparava ANTES dos listeners filhos registrarem. Corrigido: `setTimeout(() => window.dispatchEvent(...), 0)`.
- **Bug 3 — RLS bloqueando authenticated:** Policy `operator_own_dossies` criada com `TO anon`. Usuarios logados (role `authenticated`) recebiam `[]` sem erro. Corrigido: `ALTER POLICY operator_own_dossies ON public.dossies TO anon, authenticated`.
- **Diagnostico Ananda:** 18 dossies, 80 eventos — dados intactos, RLS bloqueando.
- **Diagnostico Wuender:** 47 dossies, 34 empresas — mesmo bug.
- **Migration RLS aplicada** no Supabase remoto.

## Decisoes ativas

- DI-2026-06-15-05: Evento operator-relinked usa setTimeout(0)
- DI-2026-06-15-06: RLS de dossies cobre anon + authenticated
- DI-2026-06-15-07: Debug de sidebar vazia comeca pela network layer
- Decisoes anteriores (DI-2026-06-15-01 a 04) permanecem ativas em `decisions.md`

## Atencao

- Branch `feature/supabase-auth` pode ser deletada (local + remote).
- Deadline 18/06 se aproximando — verificar banner e cron ativos.
- Outras policies RLS podem ter sido criadas com `TO anon` apenas — revisar.

## Proximo passo

Monitorar Sentry e validar se usuarios com historico vazio antes do fix agora veem seus dossies.

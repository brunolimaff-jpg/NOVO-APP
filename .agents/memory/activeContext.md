# Active Context

Last updated: 2026-06-14 — PR #372 validada com fix de travamento no preview

## Estado Atual

- **Branch:** `feature/supabase-auth`
- **PR #372:** aberta, branch `feature/supabase-auth`, sem merge executado
- **Status:** fix validado no preview da branch; sem merge executado
- **Codigo runtime validado:** `c3fb8d14` no deployment `dpl_9EMsNL6fD1nZzFv8z4idXjtvQJZA`
- **Preview final:** https://scoutagro-48emv2pdu-brunolimaff-3629s-projects.vercel.app
- **Alias da branch:** https://scoutagro-git-feature-supabase-auth-brunolimaff-3629s-projects.vercel.app
- **Supabase project:** `vmqfcaoirjcfucvlnpig`
- **Deadline:** 18/06/2026 — usuarios existentes precisam cadastrar senha

## Entrega da PR #372

- Supabase Auth integrado ao app.
- `profiles.operator_id` virou o vinculo canonico entre auth e dados de negocio.
- `OperatorContext` resolve identidade por `auth.uid() -> profiles.operator_id`, com fallback legado por email.
- Relink legado agora aguarda `link_legacy_operator`; se a RPC falhar, preserva o profile autenticado.
- Identidade autenticada nao e mais persistida no localStorage proprio (`operator_id`, nome, email).
- `user_context` recebeu policies authenticated para leitura propria/legado por email e escrita apenas do operator_id do profile.
- Radar recebeu policies authenticated e falhas de persistencia viraram aviso nao bloqueante.
- `/api/link-status` foi mantida com protecao SSRF; `/api/pulse-news` foi removida para respeitar limite Vercel Hobby.

## Fix 2026-06-14 — travamento no preview da branch

- Sintoma: alias da branch travava em `Consolidando informações...` no fim do waterfall Scheffer (`04.733.767/0001-80`).
- Evidencia: Vercel `READY`, `/api/gemini` e `/api/link-status` com HTTP 200, Sentry sem issue unresolved recente, Supabase com `dossier_started` mas sem conclusao.
- Causa pratica: etapa opcional de promocao/validacao de fontes inline podia segurar o fechamento do waterfall antes de `PostCompletion`.
- Correcao: `validateInlineSourcesForPromotion` agora limita candidatos a 8, tem budget duro de 5s, loga `inline-validation:skipped-or-timeout` e segue com `[]`; `/api/link-status` responde parcial com `Promise.allSettled`.

## Validacao final

- 2026-06-14 fix waterfall:
  - `npx vitest run tests/features/validate-inline-sources-freeze-diag.test.ts tests/api-link-status.test.ts` passou.
  - `npx vitest run tests/features/dossier/waterfall-orchestrator.test.ts` passou.
  - `npm run build` passou, com aviso conhecido de chunk grande.
  - `npm run typecheck` na pasta principal falha apenas pelo arquivo nao rastreado fora de escopo `components/MetricsDashboard.tsx`; `npx tsc --noEmit -p tsconfig.codex-validate.json` temporario excluindo esse arquivo passou.
  - Preview validado no alias da branch com login Bruno e CNPJ `04.733.767/0001-80`: `SCHEFFER & CIA LTDA` concluiu, saiu do loading, sem `Interromper`/`Consolidando`.
  - Supabase confirmou `dossier_started` e `dossier_completed` para `04733767000180`; `scout_diagnostics` registrou `post-validate-inline`, `health-check-final`, `ui-finalized` e `PostCompletion`.
  - Sentry sem issues unresolved nas ultimas 24h; Vercel runtime sem error/fatal no deployment validado.
- Local limpo: `npm run typecheck`, `npm run test` (1498 testes), `npm run build`, lint de arquivos alterados sem erro.
- Supabase remoto: migration `auth_storage_rls_policies` aplicada.
- GitHub: Build, Typecheck, Tests, Dossier Golden, E2E Critical Browser, CodeQL, CodeRabbit, GitGuardian, Smoke preview e Vercel passaram.
- Preview manual:
  - login Bruno OK;
  - reload manteve sessao Supabase;
  - localStorage proprio sem `operator_*`;
  - CNPJ `04.733.767/0001-80` validou `SCHEFFER & CIA LTDA`, `Sapezal/MT`;
  - investigacao concluiu e gerou dossie com Score 84;
  - sem erros de RLS/`saveUserContext`/`saveRadar` no console.

## Decisoes recentes

- **Merge guard:** nao executar merge sem a palavra `MERGE`.
- **Identidade:** auth.uid e autoridade; localStorage nao autoriza nada.
- **Legado por email:** permitido somente com RPC validando email do profile autenticado.
- **Radar:** pode resetar/ficar nao bloqueante; fluxo principal e auth + dossie.
- **RLS:** nesta PR foi aplicada RLS authenticated minima para storage de auth/radar.

## Atencao local

- Existem arquivos locais fora do escopo da PR e nao devem ser revertidos/commitados sem pedido:
  - `.claude/worktrees/`
  - `components/MetricsDashboard.tsx`
  - `docs/planos/2026-06-13-pr372-auth-remediation-plan.md`

## Proximo passo

Se o Bruno confirmar com `MERGE`, pode executar o merge da PR #372. Caso contrario, apenas manter a PR pronta.

# Active Context

Last updated: 2026-06-13 — PR #372 pronta para merge, sem merge executado

## Estado Atual

- **Branch:** `feature/supabase-auth`
- **PR #372:** aberta, codigo runtime validado em `c86fd0dd`, merge state `CLEAN`
- **Status:** todos os checks GitHub/Vercel passaram; aguardando confirmacao explicita com `MERGE`
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

## Validacao final

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

# Progress

Last updated: 2026-06-14 — fix do waterfall validado no preview

## Timeline

### 2026-06-14

- **Fix do travamento no preview da PR #372:**
  - Investigacao Scheffer no alias da branch travava em `Consolidando informações...` antes de `PostCompletion`.
  - Evidencia cruzada: Vercel `READY`, `/api/gemini` 200, `/api/link-status` 200, Sentry sem issue unresolved recente, Supabase com `dossier_started` sem conclusao.
  - `features/dossier/waterfall-orchestrator.ts`: promocao de fontes inline virou etapa estritamente opcional, com 8 candidatos maximos, budget de 5s e log `inline-validation:skipped-or-timeout`.
  - `api/link-status.ts`: validacao de URLs usa `Promise.allSettled` e devolve resultado parcial; falhas viram `unknown`.
- **Validacao local do fix:**
  - `npx vitest run tests/features/validate-inline-sources-freeze-diag.test.ts tests/api-link-status.test.ts` passou: 16 testes.
  - `npx vitest run tests/features/dossier/waterfall-orchestrator.test.ts` passou: 21 testes.
  - `npm run build` passou, com aviso conhecido de chunk grande.
  - `npm run typecheck` segue bloqueado pelo arquivo nao rastreado `components/MetricsDashboard.tsx`; checagem temporaria excluindo apenas esse arquivo passou.
- **Validacao preview do fix:**
  - Deployment Vercel `dpl_9EMsNL6fD1nZzFv8z4idXjtvQJZA` ficou `READY` no commit `c3fb8d14`.
  - Smoke HTTP: `/` 200 e `POST /api/link-status` 200.
  - Fluxo Scheffer (`04.733.767/0001-80`) com login Bruno concluiu em preview: UI saiu de loading, sem `Interromper`, sem `Consolidando informações...`.
  - Console/diagnostico: `post-validate-inline`, `health-check-final`, `ui-finalized`, `PostCompletion`; `operator_events` registrou `dossier_completed`.

### 2026-06-13

- **PR #372 pronta para merge, sem merge executado:**
  - Codigo runtime validado em `c86fd0dd` na branch `feature/supabase-auth`
  - Merge state GitHub: `CLEAN`
  - Todos os checks passaram: Build, Typecheck, Tests, Dossier Golden, E2E Critical Browser, CodeQL, CodeRabbit, GitGuardian, Smoke preview, Vercel
- **Correcoes finais de pre-merge:**
  - `6d7b89c1` — fechou bloqueadores da remediation: AuthGate pos-deadline, `/api/link-status` restaurada, `/api/pulse-news` removida, login simples, E2E ajustado
  - `2fd6f3f8` — removeu cache local de identidade autenticada para resolver CodeQL clear-text storage
  - `c86fd0dd` — aplicou RLS authenticated para `user_context`/radar, aguardou RPC de relink legado e tornou radar nao bloqueante
- **Supabase remoto atualizado:**
  - Migrations presentes: `20260613_user_context_schema`, `20260613_lock_profiles_operator_id`, `auth_storage_rls_policies`
  - Projeto: `vmqfcaoirjcfucvlnpig`
- **Validacao local limpa:**
  - `npm run typecheck` passou
  - `npm run test` passou: 162 arquivos, 1498 testes
  - `npm run build` passou
  - `npx eslint` nos arquivos alterados: 0 erros, 1 warning antigo em teste
  - `git diff --check HEAD~1..HEAD` passou
- **Validacao manual preview final:**
  - Preview: `https://scoutagro-48emv2pdu-brunolimaff-3629s-projects.vercel.app`
  - Login Bruno OK e reload manteve sessao Supabase
  - localStorage proprio sem `scout360:operator_id`, `scout360:operator_name`, `scout360:operator_email`
  - CNPJ `04.733.767/0001-80` validou `SCHEFFER & CIA LTDA`, `Sapezal/MT`
  - Investigacao completa concluiu e gerou dossie com Score 84
  - Console sem erros de RLS, `saveUserContext`, `saveRadar`, `denied` ou `violates`

### 2026-06-12

- **PR #372** (feature/supabase-auth): Migracao de auth local para Supabase Auth completa
  - Sprint 0: Diagnostico (430 operator_ids, 117 emails, 292 fragmentados)
  - Sprint 1: AuthContext, AuthModal, AuthGate, profiles table + RLS
  - Sprint 2: Validacao email, cron confirmacao 48h, vercel.json
  - Sprint 3: Consolidacao operator_ids (430->125), safety net
  - Sprint 4: AuthGate graceful fallback sem provider
- **Code review:** P0/P1 iniciais corrigidos antes da rodada final

### 2026-06-10

- **PR #359** (merge `ccf49eb`): ChatInterface refactoring completo
  - Extraiu 6 hooks, 1 util, removeu hasLargeBotMessage, 811 -> 331 linhas (-59%)
  - 28 testes TDD, 3 bugs corrigidos

### 2026-06-09

- PR #352: CNPJ AbortError + ContinuityQuestion + bugs mapeados
- PR #353: Inline Loading Bubble

### 2026-06-08

- 3 PRs fechadas (347/348/349): safety net, hard invariant, PWA removal
- Waterfall restart loop: causa raiz = StrictMode em producao, corrigido
- 14 novos aprendizados registrados no CALIBER_LEARNINGS

### 2026-06-06

- PR #346: Validate Inline Sources timeout fetch + FreezeDiag
- Handoff final bug P0 + freeze investigation

### 2026-06-05

- PR #342: Overlay hero static fallback (camada 4)
- PR #343: setTimeout swap — flushDiagnosticsNow deferido
- Bug Loading 93%: investigacao concluida, 3 camadas

### 2026-06-03

- PR #327: CNPJ Proxy + UX Teia Societaria + Blank Panel

### 2026-06-02

- PR #328: Correcao Tela Branca Pos-Waterfall + handoff final

### 2026-06-01

- Quick Wins P0 + Waterfall 95% Restart Loop Fix

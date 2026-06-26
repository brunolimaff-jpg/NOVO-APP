# Progress

Last updated: 2026-06-26 — Sprint 1 concluida: cherry-picks sobre fe6c6f9

## Timeline

### 2026-06-26 (Sprint 1 — Plano de Profissionalizacao: cherry-picks sobre fe6c6f9)

- **Branch alvo:** `stabilize/from-production-fe6c6f9` (commit `fe6c6f9ba59fb7063356a5f0adcc51c411db3c4a`)
- **Branch de trabalho:** `stabilize/fe6c6f9-cherry-picks`
- **3/5 cherry-picks aplicados com sucesso:**
  - PR #379 (Cron + playbook P0) — 6 SHAs
  - PR #380 (CNPJ QSA knownCnpjs fix) — 2 SHAs
  - Sentry DSN + error monitoring — 6 SHAs
- **2/5 ABORTADOS por conflito massivo:**
  - MCP config (`.mcp.json`) — 25+ arquivos em conflito, trouxe Cofre/LiteLLM que nao existem em fe6c6f9
  - PR #383 (CI gates + auth lockout) — 10 arquivos em conflito, dependia de useCofreTransition deletado
- **Limpeza pos-abortos:** ChatInterface.tsx restaurado para baseline fe6c6f9
- **Validacao:** typecheck verde, build 18.6s, preview Vercel OK, API CNPJ OK
- **PR criada:** #389 (draft)
- **Branch mergeada:** `stabilize/fe6c6f9-cherry-picks` → `origin/stabilize/from-production-fe6c6f9`
- **Decisoes:**
  - DI-2026-06-26-01: Cherry-pick de 25+ arquivos com cross-cutting inviavel, reimplementar manual
  - DI-2026-06-26-02: useStaticTimelineFallback.ts e blankPanelTelemetry.ts sao parte de fe6c6f9
- **Pendente para Sprint 2:** MCP config, CI gates, LiteLLM core

### 2026-06-15 (Sessao de encerramento — feature/supabase-auth cleanup)

- **Fechamento de 3 PRs obsoletas** (#367 Sprint1, #368 Sprint2, #370 Sprint4) — merges ja feitos direto na feature/supabase-auth, PRs fechadas sem merge
- **Confirmacao PRs #372 e #373** — ja estavam mergeadas em origin/main
- **Commit de 7 arquivos pendentes** — handoff, memory, MetricsDashboard.tsx, plano PR372, gitignore, ajustes residuais em AuthGate/AuthContext/OperatorContext/waterfall/smoke/tests
- **Sincronizacao main local** — de 31 commits atras para `ce444a2e` (atualizado com origin/main)
- **Merge feature/supabase-auth → main** — 2 novos commits + merge commit
- **Push** — origin/main + origin/feature/supabase-auth
- **Vercel deploy** — automatico apos push em main
- **.gitignore** — .claude/worktrees/ adicionado
- **Estado final:** git status limpo, branch sincronizada, nada pendente

### 2026-06-14 (Sessao longa — PR #372 + #373)

- **Code Review PR #372** — 5 agentes paralelos:
  - CLAUDE.md compliance, Bug scan, Git blame issues, PR anteriores, Code comments
  - 3 bugs corrigidos no commit `ed2d8b17` (signOut try/catch, AbortController, fetchPromise)
- **Merge PR #372** (`e3234855`) — 16:11 UTC, deploy producao Vercel
- **PR #373 criado** — remove comex morta + cache CNPJ TTL 30s + codigo orfao
- **5 ciclos de review** — Gemini + CodeRabbit apontaram 4 bugs no cache:
  - Promises rejeitadas bloqueavam retry (`f834794e`)
  - AbortSignal contaminava cache entre callers (`14f26d7f`)
  - Timer stale deletava entrada nova (`14f26d7f`)
  - CI quebrado por mock leakage (`9e9d3367`, `vitest.config.ts`)
- **Validacao preview** — Chrome DevTools: login, CNPJ, waterfall, console limpo
- **Merge PR #373** (`53b948dd`) — 17:47 UTC, deploy producao Vercel (12 lambdas)
- **Decisoes registradas:**
  - DI-2026-06-14-01: Worktree so para features novas
  - DI-2026-06-14-02: CNPJ cache sem AbortSignal + identity check
  - DI-2026-06-14-03: restoreMocks + clearMocks globais

### 2026-06-14 (antes do merge — fix waterfall + preview)

- Fix do travamento no preview da PR #372 (inline sources non-blocking)
- Validacao local e preview do fix

### 2026-06-13

- PR #372 pronta para merge, todos os checks passando
- 3 migrations aplicadas no Supabase remoto
- Validacao manual preview final

### 2026-06-12

- PR #372 (feature/supabase-auth): Migracao de auth local para Supabase Auth completa
- Sprint 0-4: diagnostico, auth context, validacao email, consolidacao, graceful fallback

### 2026-06-10 a 2026-06-08

- PR #359 (ChatInterface refactoring), PR #352-353 (bugs, inline loading)
- 3 PRs (#347-349): safety net, hard invariant, PWA removal
- 14 aprendizados no CALIBER_LEARNINGS

### 2026-06-06 a 2026-06-01

- PR #346 (Validate Inline Sources), PR #342-343 (Overlay hero, setTimeout swap)
- Bug Loading 93% investigacao, PR #327-328 (CNPJ Proxy, White Screen)
- Quick Wins P0, Waterfall 95% restart loop fix

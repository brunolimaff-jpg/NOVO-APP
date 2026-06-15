# Progress

Last updated: 2026-06-14 — sessao finalizada com ambas PRs merged e deployed

## Timeline

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

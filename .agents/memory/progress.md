# Progress

Last updated: 2026-06-15 — sessao PR #376: 4 bugs, Sentry, E2E, diagnostico Ananda/Wuender

## Timeline

### 2026-06-15 (Sessao longa — PR #376 + PR #374 + diagnosticos)

- **PR #376 criada e mergeada** — Correcao de 4 bugs:
  - Bug A: Safety net desarmada — activeGenerationRef deletado antes dos probes (`finalizeWaterfallUI.ts`, `message-orchestrator.ts`)
  - Bug B: Contador "8/7" — "Consolidando..." contava como etapa (`loadingStatus.ts`, `InlineLoadingBubble.tsx`)
  - Bug C: Bolha inline travada (stale thinking) — guard + auto-destruicao (`MessageRow.tsx`, `InlineLoadingBubble.tsx`)
  - Bug D: Sidebar vazia apos criar conta — operator_id nao restaurado (`OperatorContext.tsx`)
- **PR #374 unificada na #376** — Texto mapa societario + ARIA progressbar
- **Diagnostico Ananda:** erro de email (@uxor vs @senior), 22 dossies, 80 eventos
- **Diagnostico Wuender:** "Consolidando informacoes" travado, waterfall sem end, 47 dossies
- **Sentry — 4 novos alertas:** loading stuck timeout, waterfall leak, session persist, generation ref
- **Typecheck:** MetricsDashboard.tsx index signature
- **Test timeout:** vitest.config.ts 15s para CI
- **E2E:** auth helper criado (setupE2EAuth + loginViaSupabase), 10 arquivos, 6/6 preview Vercel
- **Code review:** Gemini + CodeRabbit feedback — useEffect self-destruct, normalize stage, sentry originalMsgCount, probe error log, graceExpired reset
- **Deploy Vercel:** build + typecheck + 1501 testes passando
- **Decisoes registradas:**
  - DI-2026-06-15-01: activeGenerationRef sobrevive aos probes
  - DI-2026-06-15-02: "Consolidando..." e rotulo de UI
  - DI-2026-06-15-03: stale-thinking retorna null
  - DI-2026-06-15-04: OperatorContext restaura operator_id no localStorage

### 2026-06-15 (Sessao de encerramento — feature/supabase-auth cleanup)

- Fechamento de 3 PRs obsoletas (#367 Sprint1, #368 Sprint2, #370 Sprint4)
- Confirmacao PRs #372 e #373 ja mergeadas em origin/main
- Commit de 7 arquivos pendentes
- Sincronizacao main local (31 commits atras)
- Merge feature/supabase-auth → main + push
- Limpeza de 8 worktrees e 9 branches

### 2026-06-14 (Sessao longa — PR #372 + #373)

- Code Review PR #372 — 5 agentes paralelos, 3 bugs corrigidos
- Merge PR #372, PR #373 criado e mergeado
- 5 ciclos de review, 4 bugs no cache CNPJ
- Validacao preview Chrome DevTools

### 2026-06-13

- PR #372 pronta para merge, todos os checks passando
- 3 migrations aplicadas no Supabase remoto

### 2026-06-12

- PR #372 (feature/supabase-auth): Migracao auth local para Supabase Auth completa
- Sprint 0-4: diagnostico, auth context, validacao email, consolidacao, graceful fallback

### 2026-06-10 a 2026-06-08

- PR #359 (ChatInterface refactoring), PR #352-353 (bugs, inline loading)
- 3 PRs (#347-349): safety net, hard invariant, PWA removal
- 14 aprendizados no CALIBER_LEARNINGS

### 2026-06-06 a 2026-06-01

- PR #346 (Validate Inline Sources), PR #342-343 (Overlay hero, setTimeout swap)
- Bug Loading 93% investigacao, PR #327-328 (CNPJ Proxy, White Screen)
- Quick Wins P0, Waterfall 95% restart loop fix

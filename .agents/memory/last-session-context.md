# Last Session Context

Saved: 2026-07-11

> Snapshot de conveniencia. Fontes operacionais canonicas continuam sendo
> `activeContext.md`, `progress.md`, `decisions.md` e `HANDOFF_AI.md`.

## Branch e PRs relevantes

- **Branch principal:** `stabilize/from-production-fe6c6f9` (88 commits atras de main)
- **origin/main:** `d54cdca8` (feat: Pipeline V2 + Brave collector, PR #408 mergeada)
- **PR #409:** `feat/pipeline-v2-pr409-prompts-v2-output-mode` — bloqueada (gate UX + token MERGE)
- **PR #410:** `fix/main-typecheck-pr408` — bloqueada (checks remotos vermelhos)
- **PR #412-415:** worktrees Codex ativas (RLS/auth, LiteLLM, security SSRF, preview smoke)

## Estado atual

- BUG-7 (persistencia pos-waterfall): resolvido (`252b240d`)
- BUG-8 (UX morta pos-waterfall): backend corrigido, 2 bugs UI seguem (flags `dossierCard` + `heavyDefer` = OFF)
- Auditoria independente 2026-07-07: inventario validativo criado em `docs/auditoria-inventario-validativo-2026-07-07.md`
- Plano final de auditoria em `docs/planos/plano-final-auditoria-2026-07-07.md`

## Proxima acao

- Revisar PR #410 antes de avancar PR #409
- Hotfix de seguranca pequeno (Sentry masking, schema estrito recordDiagnostics, CJK em prompt, PORTA clamp)
- Nao implementar correcao de BUG-8 sem nova run Scheffer

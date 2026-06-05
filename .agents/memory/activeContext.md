# Active Context

Last updated: 2026-06-05 — Bug P0 overlay hero resolvido, PWA/SW removido

## Estado

- **PR #333, #334, #335** mergeadas em `main`: overlay hero preso em producao corrigido via remocao PWA/SW + hard invariant no waterfall
- Service Worker CacheFirst era a causa raiz primaria: servia bundles antigos em producao
- Preview nunca teve SW, por isso o bug era invisivel em homologacao
- Hard invariant no waterfall-orchestrator forcadamente libera o overlay quando condicoes observaveis indicam fim do waterfall

## Proximo passo

1. Smoke producao no fluxo Scheffer
2. Monitorar Sentry/scout_diagnostics para `overlay-force-removed`
3. Ajustar logs de `overlay-force-removed` de error para warn/info (PR futura)
4. Remover kill-switch sw.js apos 1-2 releases

## Ponteiros

- PR #334: Remocao PWA/SW (principal)
- PR #335: Follow-up Gemini (display:none, useMemo, optional chaining)
- Vault: `20-SESSOES/2026-06/2026-06-05T15-30-00-NOVO-APP-overlay-hero-pwa-removal.md`

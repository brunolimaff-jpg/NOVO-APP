# Active Context

Last updated: 2026-06-05 — Bug P0 overlay hero COMPLETAMENTE RESOLVIDO. TODAS as 4 PRs mergeadas.

## Estado

- **Bug P0 FECHADO**: overlay hero nunca mais trava em producao com waterfall Scheffer
- **4 PRs mergeadas** (#333, #334, #335, #342) — nenhuma branch aberta
- **Root Cause 4 camadas** identificada e corrigida:
  1. SW CacheFirst servia bundles antigos
  2. Gap waterfall vs setIsLoading sem bridge
  3. abortControllerRef nullificado (isAbort=true falso)
  4. Static fallback display:none: flex-basis:0% + h-full = 0px de altura

## Decisoes arquiteturais ativas

- `abortControllerRef` pertence ao `processMessage`, NUNCA ao helper de UI
- DOM cleanup via querySelector direto (3 seletores), NUNCA TreeWalker(document.body)
- DOM cleanup display:none e safety net; React render condition e primario
- Hard invariant como airbag: condicoes observaveis forcadamente liberam a UI
- LayoutTrace como ferramenta de diagnostico

## Pendencias nao bloqueantes

- Kill-switch sw.js: manter 1-2 releases, depois remover
- ContinuityQuestion JSON truncado: log como debug, fallback funcional
- AbortError CNPJ lookup: debug, nao error
- foundationCacheName null em producao
- `scoutagro.vercel.app` alias orfao — NÃO esta nos domains do projeto Vercel

## Links

- Vault: `Bruno Vault/20-SESSOES/2026-06/2026-06-05T19-30-00-NOVO-APP-overlay-hero-camada4-static-fallback.md`
- Licoes (16): `Bruno Vault/30-LICOES/LICOES-SW-CACHEFIRST-OVERLAY-PWA-2026-06-05.md`
- CALIBER_LEARNINGS.md: secoes atualizadas com 12 novos aprendizados

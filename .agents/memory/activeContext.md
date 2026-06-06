# Active Context

Last updated: 2026-06-05 -- Bug P0 OVERLAY RESOLVIDO. 4 PRs mergeadas. PR #343 ABERTA (setTimeout swap).

## Estado

- **Bug P0 FECHADO**: overlay hero nunca mais trava em producao com waterfall Scheffer
- **4 PRs mergeadas** (#333, #334, #335, #342) -- todas em main
- **PR #343 ABERTA** (branch `codex/finalize-waterfall-ui`): setTimeout swap para flushDiagnosticsNow
- **Root Cause 5 camadas** identificada:
  1. SW CacheFirst servia bundles antigos
  2. Gap waterfall vs setIsLoading sem bridge (PR #342)
  3. abortControllerRef nullificado (isAbort=true falso) (PR #342)
  4. Static fallback display:none: flex-basis:0% + h-full = 0px de altura (PR #342)
  5. **(NOVA)** flushDiagnosticsNow sincrono no mesmo tick pos-setState bloqueava React re-render (PR #343)

## Decisoes arquiteturais ativas

- `abortControllerRef` pertence ao `processMessage`, NUNCA ao helper de UI
- DOM cleanup via querySelector direto (3 seletores), NUNCA TreeWalker(document.body)
- DOM cleanup display:none e safety net; React render condition e primario
- Hard invariant como airbag: condicoes observaveis forcadamente liberam a UI
- LayoutTrace como ferramenta de diagnostico
- `flushDiagnosticsNow` deve ser deferido com `setTimeout(0)`; agendar ANTES do setState, nao depois

## Pendencias

| Item                             | Status              | Acao                 |
| -------------------------------- | ------------------- | -------------------- |
| PR #343 setTimeout swap          | ABERTA              | Code review + merge  |
| Kill-switch sw.js                | MANTER 1-2 RELEASES | Remover depois       |
| ContinuityQuestion JSON truncado | DEBUG LOG           | Ja feito             |
| AbortError CNPJ lookup           | DEBUG LOG           | Ja feito             |
| foundationCacheName null         | INVESTIGAR          | Separado             |
| `scoutagro.vercel.app` alias     | INVESTIGAR          | Nao esta nos domains |

## Links

- PR #343: https://github.com/brunolimaff-jpg/NOVO-APP/pull/343 (ABERTA)
- Vault sessoes: `Bruno Vault/20-SESSOES/2026-06/2026-06-05T19-30-00-NOVO-APP-overlay-hero-camada4-static-fallback.md`
- Licoes (16): `Bruno Vault/30-LICOES/LICOES-SW-CACHEFIRST-OVERLAY-PWA-2026-06-05.md`
- CALIBER_LEARNINGS.md: secoes atualizadas com bug P0 + setTimeout swap

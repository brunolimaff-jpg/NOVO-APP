# Progress

Last updated: 2026-06-05 — Bug P0 overlay hero + remocao PWA/SW resolvidos

Timeline **curto** no repo. Sessoes e narrativa: Bruno Vault `20-SESSOES/` -- ver `docs/OBSIDIAN_VAULT.md`.
**Historico detalhado (snapshot):** `Bruno Vault/90-SISTEMA/archive/REPO-PROGRESS-SNAPSHOT-2026-05-26.md`

## Em andamento

| Data | Marco | Link |
|------|-------|------|
| 2026-06-05 | **PR #335 MERGEADA** — Gemini follow-up: display:none em vez de .remove(), useMemo puro, optional chaining ate o fim, ES2024 lib | PR #335 |
| 2026-06-05 | **PR #334 MERGEADA** — Remove PWA/SW (VitePWA, manifest.json, sw.js manual) + hard invariant no waterfall (setIsLoading + DOM cleanup) + kill-switch sw.js | PR #334 |
| 2026-06-05 | **PR #333 MERGEADA** — Review fixes Gemini + Qodo: null checks, useEffect, import facade, backendKey | PR #333 |

## Concluido recente

| Data | Marco |
|------|-------|
| 2026-06-05 | PWA/SW removido do projeto. CacheFirst em producao era a causa raiz do overlay preso apos waterfall |
| 2026-06-05 | Hard invariant adicionado ao waterfall-orchestrator: airbag que forcadamente libera o overlay quando condicoes indicam fim do waterfall |
| 2026-06-05 | Testes de overlay regression + hard invariant adicionados |
| 2026-06-03 | PR #331 mergeada — handoff estatico sincrono pos-waterfall |
| 2026-06-03 | PR #330 mergeada — blank panel fix |

## Comandos de validacao

```bash
npm run typecheck
npm test
npm run build
```

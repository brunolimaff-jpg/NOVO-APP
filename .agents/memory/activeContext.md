# Active Context

Last updated: 2026-05-27 (PR #301 aberta)

## Boot

1. Bruno Vault: `00-MASTER.md` -> `MOC-Licoes.md` -> `10-PROJETOS/NOVO-APP.md`
2. `HANDOFF_AI.md` -> este arquivo -> `progress.md`
3. Handoff sessao: `docs/handoffs/2026-05-27-dossier-link-integrity-pr301.md`

## Fase atual

**PR #301 ABERTA** — `fix/dossier-link-integrity-fontes` — integridade links + fontes dossiê

**CI:** verde no remoto (`b3af760`)

**Local não commitado:** UX preview waterfall + overlay LoadingSmart (`App.tsx`, `waterfall-orchestrator.ts`, `ChatInterface.tsx`, `message-orchestrator.ts`)

### Entregue na PR (commits remotos)

| Commit | Resumo |
|--------|--------|
| `2c6e40b` | dossierLinkIntegrity, footer Fontes, pool prompt, waterfall finalize |
| `a7d56ff` | review Gemini + testes MessageActionsBar |
| `b3af760` | tela branca: coerceGroundingSources, hero gate, Virtuoso |

### Riscos residuais

- Produção (`scoutagro.vercel.app`) sem merge da PR
- `open-web-search` degradado — env Brave/API Vercel
- Pool vazio → dossiê sem links externos reais (by design)

## Ponteiros

- `docs/handoffs/2026-05-27-dossier-link-integrity-pr301.md`
- `utils/dossierFinalize.ts`, `features/dossier/waterfall-orchestrator.ts`
- `HANDOFF_AI.md`

# Active Context

Last updated: 2026-05-27 (PR #302 pronta para merge)

## Boot

1. Bruno Vault: `00-MASTER.md` -> `MOC-Licoes.md` -> `10-PROJETOS/NOVO-APP.md`
2. `HANDOFF_AI.md` -> este arquivo -> `progress.md`
3. Vault sessao: `20-SESSOES/2026-05/2026-05-27T14-00-00-dossier-link-integrity-fontes-pr301.md`

## Fase atual

**PR #302 PRONTA PARA MERGE** — `perf/dossier-link-integrity-and-memo`

### Entregue na PR

| Commit | Resumo |
|--------|--------|
| `8cdc326` | perf: otimiza dossierLinkIntegrity com lookup O(1) e adiciona React.memo |
| `7f098e8` | fix: resolve 3 review comments da PR #302 + causa raiz do freeze 95% |
| `f3679b7` | fix: previne tela branca apos geracao do dossier |

### Otimizacoes
- `dossierLinkIntegrity.ts`: `buildPoolLookupMap()` pré-constrói Map lookup (prefixo título → URL, hostname → URL)
- `LoadingSmart.tsx`: `React.memo`, `processingKey` como concatenação de string (não useMemo)
- `InvestigationDashboard.tsx`: `React.memo` para evitar re-renders
- `shouldSuspendVirtualizedList`: comparação explícita `=== 'hero'` (removida coerção `?? 'hero'`)
- Fix tela branca: libera timeline sob overlay quando dossier final já existe

### Review comments resolvidos (Gemini Code Assist)
1. Falsos positivos com chaves curtas: `title.length >= 3` e `host.length >= 3` no `buildPoolLookupMap`
2. useMemo desnecessário: trocado por concatenação direta de string em `processingKey`
3. Comentário O(1) vs O(N): JSDoc atualizado para refletir que lookup é O(N) por link

## Ponteiros

- PR #302: https://github.com/brunolimaff-jpg/NOVO-APP/pull/302
- `utils/dossierLinkIntegrity.ts`, `components/LoadingSmart.tsx`
- `HANDOFF_AI.md`
- `CALIBER_LEARNINGS.md`

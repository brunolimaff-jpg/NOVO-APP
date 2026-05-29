# Handoff Tecnico — [NOVO-APP] — 29/05/2026 (novos bugs preview + decisao fechar PR #314)

## Objetivo da Proxima Sessao

- **Corrigir 2 P0 + 1 P2 no `feat/dossier-lifecycle`**: `operator_email: null`, tela branca transicao LoadingSmart, dynamic import
- **Fechar PR #314 atual**, squash commits (3-4 semanticos), abrir nova PR limpa
- **Retomar `feat/crm-supabase-migration`** stashed

**Proximo passo: Corrigir `operator_email: null` em `services/storage.ts` + tela branca em `utils/renderStateClassifier.ts`, squash, abrir nova PR.**

## Estado Atual

- **Branch atual:** `feat/dossier-lifecycle` — commit 211e240, 11 commits a frente do main
- **PR #314:** https://github.com/brunolimaff-jpg/NOVO-APP/pull/314 — aberta, pendente de correcoes
- **PR #313:** MERGEADA (squash) — fix/remove-web-search-fallback
- **Main:** sincronizada (commit `8d6e33f`)
- **Working tree:** limpa
- **Stashes:** `feat/crm-supabase-migration` (stash@{3}, stash@{4}, stash@{5})

## O que foi feito

### 1. PR #313 mergeada (fix/remove-web-search-fallback)

- Squash merge: 8d6e33f no main
- Branch local `fix/remove-web-search-fallback` ainda existe (deletar)

### 2. feat/dossier-lifecycle rebasada no main

- Commits web-search-fallback removidos durante rebase
- 3 P0 corrigidos (commit 0486897): cleanup race, silent errors, cross-device

### 3. Novos bugs encontrados no preview Vercel (Lilian/Karine)

| Prio | Bug                                                  | Local                               | Solucao planejada                                                                                                     |
| ---- | ---------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| P0   | `operator_email: null` em todos os dossies           | `services/storage.ts:153-218`       | Adicionar `operator_email` no upsert, ler de `localStorage.getItem('scout360:operator_email')`                        |
| P0   | Tela branca na transicao LoadingSmart -> timeline    | `utils/renderStateClassifier.ts`    | `classifyPanelState` retorna `'empty'` quando `messages` vazio e `resumoDossie` null. Ajustar logica de classificacao |
| P2   | Dynamic import `await import('../services/storage')` | `components/DossierShareBar.tsx:22` | Substituir por static import                                                                                          |

### 4. Decisao: fechar PR #314 e abrir nova PR limpa

**Opcao 3 escolhida:**

- Fechar PR #314 atual
- Corrigir os 3 bugs
- Squash commits em 3-4 commits semanticos
- Abrir nova PR limpa

### Validacao apos correcoes

- Typecheck pendente
- Testes pendentes
- CI pendente

## Riscos Tecnicos Residuais

1. **P0 withTimeout (api/gemini.ts:416 e :491):** AbortController cria signal mas nao propaga para chat.sendMessage() nem sendFunctionResponses(). **(Documentado, nao corrigido)**
2. **Branch residual `fix/remove-web-search-fallback`:** mergeada, branch local ainda existe
3. **CRM migration:** stashed, precisa ser retomado ou descartado
4. **12 findings do code review ainda nao corrigidos:** 2 P1, 7 P2, 3 P3 (serao resolvidos na nova PR)

## Links

- **PR #314:** https://github.com/brunolimaff-jpg/NOVO-APP/pull/314
- **PR #313 (merged):** https://github.com/brunolimaff-jpg/NOVO-APP/pull/313
- **Preview:** `scoutagro-git-feat-dossier-lifecycle-brunolimaff-3629s-projects.vercel.app`
- **Vault novos bugs:** `Bruno Vault/20-SESSOES/2026-05/2026-05-29T20-30-00-novos-bugs-preview-fechamento-pr314.md`
- **Licoes:** `Bruno Vault/30-LICOES/` (lições desta sessão pendentes de registro)

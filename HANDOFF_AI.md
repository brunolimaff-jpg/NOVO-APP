# Handoff Tecnico — [NOVO-APP] — 29/05/2026 (fim de sessao)

## Objetivo da Proxima Sessao

- **`feat/dossier-lifecycle` (PR #314)** — 3 P0 corrigidos. Restam 2 P1 + 7 P2 + 3 P3 do code review. Aguardar CI para merge.
- **`feat/crm-supabase-migration`** — stashed, sem PR.

**Proximo passo: Corrigir P1 e P2 restantes OU mergear PR #314 se CI verde (P0s ja foram). Depois iniciar CRM migration.**

## Estado Atual

- **Branch atual:** `feat/dossier-lifecycle` — commit 0486897, pushado
- **PR #314:** https://github.com/brunolimaff-jpg/NOVO-APP/pull/314 — 3 P0 corrigidos
- **PR #313:** MERGEADA (squash) — fix/remove-web-search-fallback removido
- **Main:** sincronizada (commit `8d6e33f`)
- **Working tree:** limpa
- **Stashes:** `feat/crm-supabase-migration` (stash@{1}, stash@{2})

## O que foi feito

### 1. PR #313 mergeada (fix/remove-web-search-fallback)

- Squash merge: 8d6e33f no main
- Branch local `fix/remove-web-search-fallback` ainda existe (precisa deletar)

### 2. feat/dossier-lifecycle rebasada no main

- Commits web-search-fallback (`f1a62c6`, `ab53040`) removidos durante rebase — ja estavam no main via squash
- `git rebase main` → 2 commits skipados, resto aplicou limpo
- Force push com `--force-with-lease`

### 3. 3 P0 corrigidos (commit 0486897)

| P0 | Arquivo | Problema | Solucao |
|----|---------|----------|---------|
| #1 | ChatInterface.tsx:141 | useEffect cleanup limpava completedDossier no mesmo ciclo do evento dossier:completed | Adicionado `completedDossierSessionRef` para so limpar quando sessao for diferente |
| #2 | dossierDuplicate.ts:40,55 | findExistingDossier silenciava erros Supabase com `!error && data` | Log `scoutDiag.warn` antes do fallthrough para null |
| #3 | ChatInterface.tsx:230 | handleAccessExistingDossier usava getDossier (IDB-only) como guard apos findExistingDossier achar no Supabase | Fallback Supabase quando IDB retorna null |

### Validacao

- Typecheck: limpo
- Testes: 145 files / 1257 testes — 100% passando
- CI pendente (Build, Tests, Typecheck, Dossier Golden)

## Riscos Tecnicos Residuais

1. **P0 withTimeout (api/gemini.ts:416 e :491):** AbortController cria signal mas nao propaga para chat.sendMessage() nem sendFunctionResponses(). Afeta TODA chamada Gemini com timeout. **(Documentado, nao corrigido)**
2. **P1/P2/P3 restantes na PR #314:** 2 P1, 7 P2, 3 P3 do code review ainda pendentes
3. **CRM migration:** stashed, precisa ser retomado ou descartado

## Findings restantes do code review (PR #314)

**P1 (2):**
- 4. touchUserContext ausente no handleNewResearchOverride
- 5. DossierShareBar sem key={dossierId}

**P2 (7):**
- 6. Listener sem guard de session
- 7. dossier_reopened tracking com getDossier null
- 8. Empty catch em handleCopyLink
- 9. Queries Supabase sequenciais (podiam ser paralelas)
- 10. Guard cnpjDigits >= 11 aceita CPF
- 11. window.open sem noreferrer
- 12. pendingPayloadRef + duplicateDossier split confuso

**P3 (3):**
- 13. CustomEvent sem tipo compartilhado
- 14. Case-sensitive empresa_alvo
- 15. Lazy import de storage no clique

## Links

- **PR #314:** https://github.com/brunolimaff-jpg/NOVO-APP/pull/314
- **PR #313 (merged):** https://github.com/brunolimaff-jpg/NOVO-APP/pull/313
- **Vault code review:** `Bruno Vault/20-SESSOES/2026-05/2026-05-29T17-30-00-code-review-dossier-lifecycle-pr313.md`
- **Licoes:** `Bruno Vault/30-LICOES/LICOES-APRENDIDAS-CONSOLIDACAO-CODE-REVIEW-2026-05-29.md`

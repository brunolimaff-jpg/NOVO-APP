# Active Context

Last updated: 2026-07-23 — PR4 gateway LiteLLM local

## Estado

- **Base:** `3b929f7b4d2be01e9b9c1d33e753599b96f98355` (head exato da PR3).
- **Branch ativa:** `codex/dossie-pr4-gateway`.
- **Worktree:** `/Users/brunolima/Documents/NOVO-APP-dossie-pr4-gateway`.
- **Commit funcional:** `2f132aa1`.
- **Foco:** `api/dossier.ts`, gateway LiteLLM interno, auth, ownership, abort, chat contextual e logs correlacionados.
- **Vault:** [[2026-07-23T13-54-30-novo-app-pr4-local-gateway]].
- **Isolamento Preview/Produção:** `NÃO_VERIFICADO` após única requisição Vercel `HTTP 403`.
- **Release:** bloqueado; sem push, deploy, PR, migration ou merge.

## Validação

- 32 testes focados, ESLint focado, `git diff --check` e build passaram.
- Typecheck/suíte ampla continuam bloqueados por falhas preexistentes documentadas no handoff.
- Functions: 10 esperadas por delta (9 observadas na PR3 + `api/dossier.ts`); prova de Build Output pendente.

## Não antecipar

Brave, EvidencePack, RAG, PR5, waterfall final, UI final, cutover, remoção Gemini ou PR6.

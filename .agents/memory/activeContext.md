# Active Context

Last updated: 2026-08-17 13:25 — checkpoint pré-compactação; barreira holding/governança delta autorizado (7 achados, 9 REDs escritos, código não implementado)

## Estado

- **Branch:** `feat/v6-shadow-prep` · **HEAD remoto:** `5ea3b0fd` (restauração QSA + progress) sobre `14cd5def` (barreira 1ª versão) — PR #483 OPEN/DRAFT/MERGEABLE
- **Delta autorizado** (comentário 91ec007e, BRU-119): 7 fixes no gold-policy.ts + entity-aware-gold-verifier.ts. **Código NÃO implementado** — apenas 9 REDs escritos no entity-aware-gold-verifier.test.ts.
- **Escopo 6→7 achados**: demandsGovernance + bypass modalidade + controladoria + QSA exclusion + controladora isolada + entity binding + proveniência por mesma categoria.
- **Gates:** targeted → Gold 100% → full 100% → typecheck → lint → build → no-gemini → diff-check → FF push → CI exact SHA → Preview same-SHA + Smoke.
- **Provider/Scheffer:** aguarda autorização Bruno. **Merge:** bloqueado.

## Próximo passo (Bruno)

1. Conferir CI + Golden Dossier Live do `198d1b04` (único FAIL anterior era o contract_fail wordCount).
2. **Revalidação visual do Bruno no Preview do `198d1b04`** (Scheffer): wordCount ≥900, sem espelhos em prosa, sem scaffolding bold, tabela de elos sem duplicatas.
3. Depois: revisão formal → READY FOR MERGE (merge exige `MERGE` do Bruno).
4. Depois do merge da #483: rebase #467.

## Não fazer

- Merge #483 sem token `MERGE` do Bruno · Produção · Supabase write/migrations
- Retry do compact (congelado) · mudança de modelo/provider/prompt
- Mexer no lab BRU-77 (frente do executor paralelo)
- `Goal` segue cobrindo demandas do Planejador; ZCode supervisiona execução e evidência.

## Vault / memória

- Sessão handoff: [[2026-08-16T13-03-10-fluxo-atual-gold-handoff]] · Chat produto: `6a81fda2`
- BRU-121: `docs/BRU-121-RELATORIO-LEITURA-INTEGRAL.md` (212 linhas, Mermaid, 3 opções)
- CALIBER_LEARNINGS: lição scaffolding + lição bold/inline patterns

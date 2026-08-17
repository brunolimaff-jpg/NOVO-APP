# Active Context

Last updated: 2026-08-17 tarde — veredito visual do Preview corrigido (c80651cf: P0 visual + P0 semântico + P2 + P1 parcial); run d2b1fc59 = GOLD_PASS (wordCount 1012); aguardando aceite visual do Bruno + despacho A/B/C do Planejador

## Estado

- **Branch:** `feat/v6-shadow-prep` · **HEAD remoto:** `e22f2110` (docs) sobre `c80651cf` (fixes veredito visual) sobre `198d1b04` (wordCount) — PR #483 DRAFT
- **CI f115a860→54a2ddc3:** 21/21 checks aplicáveis SUCCESS · Preview same-SHA deployado · Smoke PASS
- **BRU-119 entregue:** A (prompt leitura) + B (scaffold bold) + C (dedupe narrow). Review PASS. **Follow-up `198d1b04`:** a instrução "leitura curta 2-3 frases" derrubou wordCount <900 → contract_fail (factual_minimal) no Preview e no Golden Live; seção 2 agora pede "leitura executiva 2-3 parágrafos (6-8 frases)" — aprovado pelo Bruno. Gates: gold 416/416, full 2217/2218 (flake waterfall conhecido), typecheck/lint/build/no-gemini OK.
- **#456 e #452:** FECHADAS como superseded (autorizado pelo Planejador).
- **BRU-121:** Leitura integral arquitetural concluída. Relatório em `docs/BRU-121-RELATORIO-LEITURA-INTEGRAL.md` (212 linhas, Mermaid, coverage ledger, 8 riscos, 3 opções de convergência). Recomendação: Opção A (Gold primeiro).

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

# Active Context

Last updated: 2026-07-20 — PR 2: contenção de superfícies secundárias

## Estado

- **Baseline:** `e0e3d8b2468fdf4e1afe3159c2a5b8320e395845`
- **Branch ativa:** `codex/dossie-pr2-contencao`
- **Foco:** PR 2 — contenção de Radar, War Room e health generativo.
- **Plano:** `docs/planos/estabilizacao-dossie-litellm-v1.md`.
- **Não fazer nesta PR:** LiteLLM, `api/gemini`, `api/rag`, waterfall, benchmark interno, Supabase, Pinecone, LLM real, migration ou deploy manual.
- **Alvo de Preview:** nove Functions Node, sem Radar, War Room, docs-RAG, health generativo ou ping LiteLLM.

## Decisões vivas

- `api/dossier.ts` será o único endpoint de negócio chamado pela UI.
- Cancelamento final terá abort da conexão e cancelamento persistido/cooperativo.
- Benchmark interno do dossiê permanece; benchmark independente fica indisponível.
- RAG do dossiê será integração nova, opcional e degradável.
- Radar, War Room e benchmark independente estão indisponíveis; dados históricos, Pinecone e `runDossierBenchmarkStage` permanecem preservados.

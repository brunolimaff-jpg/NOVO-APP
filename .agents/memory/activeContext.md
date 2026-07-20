# Active Context

Last updated: 2026-07-20 — Estabilização do dossiê

## Estado

- **Baseline:** `a55113e525d31c5a0de82f5b01208ac82ae1eb29`
- **Branch ativa:** `codex/dossie-baseline-ci-vercel`
- **Foco:** PR 1 — Node 24, npm determinístico, CI, Vercel e Build Output.
- **Plano:** `docs/planos/estabilizacao-dossie-litellm-v1.md`.
- **Não fazer nesta PR:** LiteLLM, Gemini, prompts, Supabase, Sentry, Pinecone, Radar, War Room, LLM real, runtime de agentes, piloto, migration ou deploy.

## Decisões vivas

- `api/dossier.ts` será o único endpoint de negócio chamado pela UI.
- Cancelamento final terá abort da conexão e cancelamento persistido/cooperativo.
- Benchmark interno do dossiê permanece; benchmark independente fica indisponível.
- RAG do dossiê será integração nova, opcional e degradável.

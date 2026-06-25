---
type: decision-index
area: decisions
status: active
source_of_truth:
  - .agents/memory/decisions.md
  - HANDOFF_AI.md
  - docs/ai-context/refactor/02-BOARD.md
  - CALIBER_LEARNINGS.md (secao ARQUITETURA FINAL)
last_reviewed: 2026-06-24 — ATUALIZADO: Fase 5 consolidada (LiteLLM/PR #386)
tags:
  - obsidian
  - decisions
  - architecture
  - roadmap
  - litellm
  - fase5
---

# Índice de Decisões

> **ATENCAO:** Este indice estava desatualizado desde 2026-04-19. A Fase 5 (Junho 2026) introduziu mudancas arquiteturais profundas. A fonte de verdade CANONICA para a arquitetura final esta em `CALIBER_LEARNINGS.md` (secao ARQUITETURA FINAL) e `HANDOFF_AI.md` (secao ARQUITETURA FINAL). As secoes abaixo sao legadas e serao atualizadas em proxima sessao.

Voltar para [[00-MASTER]].

## ARQUITETURA FINAL (Junho 2026) — Resumo Executivo

- **Provedores de IA:** Sonnet 4.6 (criticos) + DeepSeek V3.2 (operacionais) via LiteLLM/Bedrock. DeepSeek direto como provider economico. **ZERO Gemini** como provider principal (aspiracional — fallback ainda presente).
- **3 Tiers:** Premium (Opus+Sonnet, $0.60), Padrao (Sonnet+DeepSeek, $0.17), Economico (DeepSeek direto, $0.06).
- **Roteamento por modulo:** HYBRID_MODEL_MAP (`utils/llm/modelRouter.ts:34`).
- **LiteLLM Proxy:** DEV/HOMOLOG OK. PROD bloqueado. DeepSeek direto via `api.deepseek.com` nao depende do proxy.
- **Diferencial Gemini irreproduzivel:** Foundation Cache (~43K chars CNPJ) + Google Search Grounding nativo. Brave Search externo e substituto parcial inferior.
- **Status:** Pipeline hibrido IMPLEMENTADO mas NAO FUNCIONAL (callLiteLLM sempre falha). Todo dossie via Gemini fallback atualmente.
- **Referencia canonica:** `CALIBER_LEARNINGS.md` > ARQUITETURA FINAL, `HANDOFF_AI.md` > ARQUITETURA FINAL, `decisions.md` > DI-2026-06-24-FINAL.

## Novas decisoes da Fase 5 (NOVO-APP branch feat/litellm-experiment)

### Mudanca de provider de IA

- Gemini como provider principal foi substituido por pipeline hibrido Sonnet+DeepSeek
- Custo caiu de ~$0.50/dossie (Gemini) para $0.06 (DeepSeek direto) ou $0.17 (Sonnet+DeepSeek)
- **Referencia:** decisions.md DI-24-14, DI-24-19, experiments em `scripts/test-models.ts`

### Skeleton loading substitui CofreOverlay durante geracao

- `loadingVariant='inline'` exibe skeleton cards (DossieSkeletonLoader) em vez de overlay hero (CofreOverlay)
- **Status:** Implementado em worktree `feature/inline-loading-bubble` (`/Users/brunolima/Documents/NOVO-APP-inline`). NAO mergeado na branch `feat/litellm-experiment` que ainda usa CofreOverlay com fixes.

### Fallback binario (aspuracional)

- Fallback Gemini deve ser removido: provider escolhido ou funciona ou mostra erro
- **Status:** `respondWithGeminiFallback` ainda presente em `api/gemini.ts:339`. Task #30 marcada completed mas nao mergeada.

### Decisoes legadas (pre-Fase 5)

### Memoria repo-local

- a camada `.agents/memory/*` e o handoff curto oficial entre sessoes
- impacto maior em [[ARCH-State-Storage]] e [[ROADMAP-Overview]]

### `plan-work` como padrao de planejamento

- planejamentos relevantes devem nascer de pesquisa do repo antes de editar
- impacto maior em [[ROADMAP-Refactor-Track]]

### Handoffs hierarquicos

- `HANDOFF_AI.md` segue como entrada rapida
- board/open-items/handoff do refactor continuam como verdade viva
- impacto maior em [[ROADMAP-Overview]]

### Teia Societaria Tipo 5

- Mermaid LR dinamico substitui o rumo de SVG manual para producao
- drill-down por socio exige evidencia do grupo, bloqueio de homonimo e cache persistente server-side
- detalhes em [[TEIA-SOCIETARIA-ENRIQUECIMENTO]]

### Stores com `Context + Reducer`

- Sprint 4 escolheu `stores/*` em vez de adicionar `zustand`
- impacto maior em [[ARCH-State-Storage]] e [[ARCH-App-Orchestration]]

## Decisoes recentes (pre-Fase 5)

- [[FECHAMENTO-TEIA-CNPJ-PR285-2026-05-25]] — 2026-05-25 — fechamento da PR #285
- [[ACHADO-P0-TEIA-CNPJ-ESCOPO-2026-05-25]] — 2026-05-25 — QSA oficial confirma socio -> CNPJ
- [[MELHORIAS-DOSSIE-RAG]] — 2026-05-23 — 10 melhorias no fluxo de dossie
- [[TEIA-SOCIETARIA-ENRIQUECIMENTO]] — 2026-05-23 — Componente visual de estrutura societaria
- [[UX-REDESIGN-DIREÇÕES]] — 2026-05-23 — Redesenho UX do Scout 360
- [[LICOES-APRENDIDAS-TEIA-CNPJ-2026-05-24]] — 2026-05-24 — Licoes do hotfix P0
- [[HANDOFF-TEIA-CNPJ-2026-05-25]] — 2026-05-25 — Handoff consolidado da PR #285

## Como usar esta nota

- Para arquitetura atual (Fase 5): consultar `CALIBER_LEARNINGS.md` > ARQUITETURA FINAL e `HANDOFF_AI.md`
- Para decisoes detalhadas: `decisions.md` (decisoes DI-24-11 a DI-24-25 e DI-2026-06-24-FINAL)
- Para erros exatos: `HANDOFF_AI.md` > "O que NAO funcionou — Erros Exatos"
- Este indice precisa ser revisado para incluir notas especificas da Fase 5

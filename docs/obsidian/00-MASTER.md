---
type: master
area: repo-graph
status: active
source_of_truth:
  - HANDOFF_AI.md
  - .agents/memory/activeContext.md
  - .agents/memory/progress.md
  - ARQUITETURA.md
last_reviewed: 2026-06-24
tags:
  - obsidian
  - repo-graph
  - architecture
  - roadmap
---

# 00 MASTER

Este arquivo e o centro do grafo versionado do repositório dentro do Obsidian.

Use este material para navegar por arquitetura e roadmap. O status vivo continua vindo de `HANDOFF_AI.md`, `.agents/memory/*` e `ARQUITETURA.md`.

## Comece aqui

- [[OBSIDIAN-README]]
- [[META-Contract]]
- [[DECISIONS-Index]]
- [[MELHORIAS-DOSSIE-RAG]]
- [[UX-REDESIGN-DIREÇÕES]]

## Arquitetura (Ativa)

- [[ARCH-App-Orchestration]]
- [[ARCH-Chat-Experience]]
- [[ARCH-Serverless-RAG]]
- [[ARCH-Tests-Quality]]

> **Arquivos arquivados (arquitetura pre-Fase 5):** ARCH-Services-Gemini, ARCH-State-Storage, roadmaps. Consulte `docs/archive/docs-pre-fase5/` se necessário.

## Wiki Pages (Fase 5)

- `docs/wiki/pages/31-arquitetura-llm-providers.md` — Pipeline hibrido LiteLLM/Sonnet/DeepSeek
- `docs/wiki/pages/32-hybrid-model-map.md` — Roteamento inteligente por modulo
- `docs/wiki/pages/33-grounding-cache-bug-p0.md` — Bug P0 do grounding cache
- `docs/wiki/pages/` (30 paginas adicionais sobre operacao)

## Fontes canonicas

- `HANDOFF_AI.md`
- `ARQUITETURA.md`
- `.agents/memory/activeContext.md`
- `.agents/memory/progress.md`
- `.agents/memory/decisions.md`
- `CALIBER_LEARNINGS.md`
- `docs/obsidian/decisions/FECHAMENTO-TEIA-CNPJ-PR285-2026-05-25.md` (PR #285 — fechamento validado)
- `docs/obsidian/decisions/HANDOFF-TEIA-CNPJ-2026-05-25.md`
- `docs/ai-context/refactor/02-BOARD.md`

## Leitura rapida do estado atual (24 jun 2026)

- **Fase 5 concluida:** LiteLLM/Bedrock/DeepSeek como pipeline hibrido. Gemini eliminado como provider principal.
- **ARQUITETURA.md reescrito** — reflete a arquitetura atual (LiteLLM, HYBRID_MODEL_MAP, 3 tiers).
- **CODEBASE_INDEX.md regenerado** — cobre todos os diretorios ativos do projeto.
- **Waterfall:** Timeouts ajustados (120s modulo, 180s max). Hard-cap 330s removido.
- **Bug P0 ativo:** groundingSources=0 com foundation cache (ver wiki page 33).
- Documentos pre-Fase 5 movidos para `docs/archive/docs-pre-fase5/`.

## Regras desta camada

- Toda nota principal deve linkar de volta para [[00-MASTER]].
- Toda nota principal deve apontar sua `source_of_truth`.

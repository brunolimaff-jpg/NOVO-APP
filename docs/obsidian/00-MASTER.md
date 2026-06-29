---
type: master
area: repo-graph
status: active
source_of_truth:
  - HANDOFF_AI.md
  - .agents/memory/activeContext.md
  - .agents/memory/progress.md
  - docs/ai-context/refactor/02-BOARD.md
last_reviewed: 2026-04-23
tags:
  - obsidian
  - repo-graph
  - architecture
  - roadmap
---

# 00 MASTER

Este arquivo e o centro do grafo versionado do repositório dentro do Obsidian.

Use este material para navegar por arquitetura e roadmap. O status vivo continua vindo de `HANDOFF_AI.md`, `.agents/memory/*` e `docs/ai-context/refactor/*`.

## Comece aqui

- [[OBSIDIAN-README]]
- [[META-Contract]]
- [[DECISIONS-Index]]

## Arquitetura

- [[ARCH-App-Orchestration]]
- [[ARCH-Chat-Experience]]
- [[ARCH-Services-Gemini]]
- [[ARCH-Serverless-RAG]]
- [[ARCH-State-Storage]]
- [[ARCH-Tests-Quality]]

## Roadmap

- [[ROADMAP-Overview]]
- [[ROADMAP-Sprint-Atual]]
- [[ROADMAP-Refactor-Track]]
- [[ROADMAP-Proximos-Blocos]]

## Fontes canonicas

- `HANDOFF_AI.md`
- `.agents/memory/activeContext.md`
- `.agents/memory/progress.md`
- `.agents/memory/decisions.md`
- `docs/obsidian/decisions/LICOES-APRENDIDAS-PROMPTS-2026-05-24.md` (13 lições aprendidas — sessão 2026-05-24)
- `docs/obsidian/decisions/FECHAMENTO-TEIA-CNPJ-PR285-2026-05-25.md` (PR #285 — fechamento validado, lições e pendências)
- `docs/obsidian/decisions/HANDOFF-TEIA-CNPJ-2026-05-25.md` (PR #285 — snapshots históricos; alguns estados foram superados)
- `docs/ai-context/refactor/02-BOARD.md`
- `docs/ai-context/refactor/03-OPEN-ITEMS.md`
- `docs/ai-context/refactor/06-HANDOFF.md`

## Leitura rapida do estado atual

- O programa de refatoracao segue ativo.
- A Sprint 7 foi encerrada via PR `#239`, com validacao manual aceita em `2026-04-23`.
- A Sprint 8 agora e o proximo passo oficial da trilha.
- `services/geminiService.ts` continua como fachada publica estavel.
- `constants.ts` agora e facade publica, com inteligencia de mercado em `constants/market-intelligence.ts`.
- `services/warRoomService.ts` e o proximo hotspot tecnico grande da trilha.

## Regras desta camada

- Toda nota principal deve linkar de volta para [[00-MASTER]].
- Toda nota principal deve apontar sua `source_of_truth`.
- O checker local e `npm run docs:obsidian:check`.

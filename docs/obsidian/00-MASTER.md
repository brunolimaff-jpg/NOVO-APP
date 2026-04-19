---
type: master
area: repo-graph
status: active
source_of_truth:
  - HANDOFF_AI.md
  - .agents/memory/activeContext.md
  - .agents/memory/progress.md
  - docs/ai-context/refactor/02-BOARD.md
last_reviewed: 2026-04-19
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
- `docs/ai-context/refactor/02-BOARD.md`
- `docs/ai-context/refactor/03-OPEN-ITEMS.md`
- `docs/ai-context/refactor/06-HANDOFF.md`

## Leitura rapida do estado atual

- O programa de refatoracao segue ativo.
- A Sprint 5 esta implementada no branch de trabalho e ainda depende de PR + smoke manual.
- `services/geminiService.ts` continua como fachada publica estavel.
- `components/chat/*` e o destino atual da modularizacao do shell do chat.
- O proximo bloco tecnico grande segue em `prompts/megaPrompts.ts` e legado/consolidacao de constantes.

## Regras desta camada

- Toda nota principal deve linkar de volta para [[00-MASTER]].
- Toda nota principal deve apontar sua `source_of_truth`.
- O checker local e `npm run docs:obsidian:check`.

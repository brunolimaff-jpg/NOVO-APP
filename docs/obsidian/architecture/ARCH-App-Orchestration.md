---
type: architecture-note
area: app
status: active
source_of_truth:
  - App.tsx
  - index.tsx
  - ARQUITETURA.md
  - docs/ai-context/ARCHITECTURE_MAP.md
last_reviewed: 2026-04-22
tags:
  - obsidian
  - architecture
  - app
  - orchestration
---

# ARCH Orquestração do App

Voltar para [[00-MASTER]].

## Papel

`App.tsx` continua como o orquestrador principal da SPA, mesmo depois das extrações das Sprints 3 a 5. `index.tsx` monta providers e boundaries; `App.tsx` ainda faz a cola entre chat, dossie, radar, CRM e overlays.

## Hotspots

- `App.tsx`
- `index.tsx`
- `components/ChatInterface.tsx`
- `components/chat/*`
- `stores/chatStore.tsx`
- `stores/dossierStore.tsx`

## Dependencias proximas

- shell visual: [[ARCH-Chat-Experience]]
- estado e persistencia: [[ARCH-State-Storage]]
- servicos de IA: [[ARCH-Services-Gemini]]

## Pressao de roadmap

- a Sprint 7 preservou `App.tsx` fora do escopo e concentrou a higiene em constantes/legado
- os proximos blocos ainda dependem de manter `App.tsx` como fachada estavel enquanto o legado e dissolvido

## Fontes canonicas

- `ARQUITETURA.md`
- `docs/ai-context/ARCHITECTURE_MAP.md`
- `docs/ai-context/refactor/02-BOARD.md`
- `docs/ai-context/refactor/04-ARCHITECTURE-TARGET.md`

## Notas relacionadas

- [[ARCH-Chat-Experience]]
- [[ARCH-State-Storage]]
- [[ROADMAP-Sprint-Atual]]

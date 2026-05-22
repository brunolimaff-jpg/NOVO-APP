---
type: architecture-note
area: chat
status: active
source_of_truth:
  - components/ChatInterface.tsx
  - components/chat/ChatShell.tsx
  - components/chat/MessageTimeline.tsx
  - components/chat/Composer.tsx
  - components/chat/ChatPanels.tsx
last_reviewed: 2026-04-23
tags:
  - obsidian
  - architecture
  - chat
  - ui
---

# ARCH Experiência de Chat

Voltar para [[00-MASTER]].

## Papel

Esta area concentra a experiencia central do produto: gate inicial, home, timeline, composer, sidebar e overlays do chat.

## Estrutura atual

- `components/ChatInterface.tsx` e a fachada publica estavel
- `components/chat/ChatShell.tsx` compoe shell, header e areas
- `components/chat/MessageTimeline.tsx` controla gate, home e timeline
- `components/chat/Composer.tsx` centraliza envio, retry, stop e prefill
- `components/chat/ChatPanels.tsx` centraliza dashboard, settings, radar e war room

## Dependencias proximas

- shell raiz: [[ARCH-App-Orchestration]]
- camada de IA: [[ARCH-Services-Gemini]]
- testes e qualidade: [[ARCH-Tests-Quality]]

## Pressao de roadmap

- a Sprint 5 modularizou esta camada sem quebrar `ChatInterfaceProps`
- o legado `hooks/useChat.ts` foi removido na Sprint 7 e continua bloqueado pelo guardrail
- a trilha futura passa pela Sprint 8 de War Room e pelo fechamento documental

## Fontes canonicas

- `HANDOFF_AI.md`
- `.agents/memory/activeContext.md`
- `docs/ai-context/refactor/02-BOARD.md`
- `tests/components/ChatInterface.test.tsx`

## Notas relacionadas

- [[ARCH-App-Orchestration]]
- [[ARCH-Services-Gemini]]
- [[ROADMAP-Refactor-Track]]

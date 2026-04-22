---
type: architecture-note
area: state
status: active
source_of_truth:
  - stores/chatStore.tsx
  - stores/dossierStore.tsx
  - hooks/useSessionStorage.ts
  - services/sessionRemoteStore.ts
last_reviewed: 2026-04-22
tags:
  - obsidian
  - architecture
  - state
  - storage
---

# ARCH State Storage

Back to [[00-MASTER]].

## Papel

Esta area junta estado de sessao/loading/export, persistencia local e sincronizacao remota. A Sprint 4 consolidou `stores/*` como estrategia padrao em vez de introduzir outra biblioteca.

## Blocos principais

- `stores/chatStore.tsx`
- `stores/dossierStore.tsx`
- `hooks/useSessionStorage.ts`
- `utils/idbStorage.ts`
- `services/sessionRemoteStore.ts`
- `services/feedbackRemoteStore.ts`

## Dependencias proximas

- consumidor raiz: [[ARCH-App-Orchestration]]
- servicos de IA: [[ARCH-Services-Gemini]]

## Pressao de roadmap

- a Sprint 5 manteve esta camada estavel para o shell novo
- a Sprint 7 substituiu o teste stale do hook legado por cobertura direta das heuristicas de titulo/empresa
- futuras limpezas de legado ainda passam por storage e titulos de sessao

## Fontes canonicas

- `.agents/memory/decisions.md`
- `HANDOFF_AI.md`
- `docs/ai-context/refactor/02-BOARD.md`
- `docs/ai-context/refactor/06-HANDOFF.md`

## Notas relacionadas

- [[ARCH-App-Orchestration]]
- [[ARCH-Services-Gemini]]
- [[ROADMAP-Sprint-Atual]]

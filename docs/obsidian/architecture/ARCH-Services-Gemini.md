---
type: architecture-note
area: services
status: active
source_of_truth:
  - services/geminiService.ts
  - services/gemini/
  - services/ragService.ts
  - services/clientLookupService.ts
last_reviewed: 2026-04-22
tags:
  - obsidian
  - architecture
  - services
  - gemini
---

# ARCH Services Gemini

Back to [[00-MASTER]].

## Papel

Esta area segura o contrato publico de IA e a orquestracao interna de investigacao. O repo preserva `services/geminiService.ts` como fachada estavel e empurra a logica para `services/gemini/*`.

## Blocos principais

- `services/geminiService.ts` - fachada publica
- `services/gemini/investigation-orchestration.ts` - envio principal
- `services/gemini/porta.ts` - parser e feeds PORTA
- `services/gemini/runtime.ts` - runtime helpers, deep dive e timeouts
- `services/gemini/recovery.ts` - recovery de perguntas abertas
- `services/ragService.ts` - acesso a RAG interno/docs

## Dependencias proximas

- APIs e Vercel: [[ARCH-Serverless-RAG]]
- persistencia e sessao: [[ARCH-State-Storage]]
- shell consumidor: [[ARCH-Chat-Experience]]

## Pressao de roadmap

- Sprint 6 quebrou `prompts/megaPrompts.ts` em facade + `prompts/mega/*`
- Sprint 7 preservou `services/geminiService.ts` fora do escopo
- Sprint 8 e follow-ups do War Room ainda pressionam esta camada
- a fachada publica nao deve voltar a concentrar logica nova

## Fontes canonicas

- `ARQUITETURA.md`
- `docs/ai-context/ARCHITECTURE_MAP.md`
- `docs/ai-context/refactor/02-BOARD.md`
- `docs/ai-context/refactor/04-ARCHITECTURE-TARGET.md`

## Notas relacionadas

- [[ARCH-Serverless-RAG]]
- [[ARCH-State-Storage]]
- [[ROADMAP-Proximos-Blocos]]

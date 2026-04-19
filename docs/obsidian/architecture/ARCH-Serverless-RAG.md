---
type: architecture-note
area: serverless
status: active
source_of_truth:
  - api/
  - services/ragService.ts
  - services/geminiProxy.ts
  - vercel.json
last_reviewed: 2026-04-19
tags:
  - obsidian
  - architecture
  - api
  - vercel
---

# ARCH Serverless RAG

Back to [[00-MASTER]].

## Papel

As rotas `api/*.ts` sao o runtime real de integracao com Vercel para RAG, proxy Gemini, extracao de conteudo, radar e buscas auxiliares. O frontend local nao reproduz completamente esse ambiente.

## Hotspots

- `api/gemini.ts`
- `api/rag.ts`
- `api/docs-rag.ts`
- `api/extract-content.ts`
- `api/open-web-search.ts`
- `api/radar-scan.ts`
- `vercel.json`

## Dependencias proximas

- camada de orquestracao: [[ARCH-Services-Gemini]]
- suite de validacao: [[ARCH-Tests-Quality]]

## Pressao de roadmap

- War Room endurecido e futuros modos de busca continuam presos a allowlists, Pinecone e operacao em Vercel
- nao existe meta de adicionar MCPs ou automacao externa nesta trilha

## Fontes canonicas

- `AGENTS.md`
- `docs/SEGURANCA-API.md`
- `docs/CHECKLIST-PRODUCAO.md`
- `docs/ai-context/ROADMAP_WAR_ROOM.md`

## Notas relacionadas

- [[ARCH-Services-Gemini]]
- [[ARCH-Tests-Quality]]
- [[ROADMAP-Proximos-Blocos]]

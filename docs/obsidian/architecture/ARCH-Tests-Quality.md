---
type: architecture-note
area: quality
status: active
source_of_truth:
  - tests/
  - tests-e2e/
  - .github/workflows/ci.yml
  - docs/testing-strategy.md
last_reviewed: 2026-04-19
tags:
  - obsidian
  - architecture
  - tests
  - quality
---

# ARCH Tests Quality

Back to [[00-MASTER]].

## Papel

Esta area protege o refactor em andamento com suites focadas, golden de dossie, E2E de smoke e gates minimos de CI.

## Blocos principais

- Vitest em `tests/`
- Playwright em `tests-e2e/`
- golden do dossie em `tests/App.dossierGolden.test.tsx`
- guardrail do legado `useChat` em `tests/architecture/useChatImportGuard.test.ts`
- CI em `.github/workflows/ci.yml`

## Dependencias proximas

- shell do chat: [[ARCH-Chat-Experience]]
- APIs e runtime Vercel: [[ARCH-Serverless-RAG]]

## Pressao de roadmap

- a trilha atual privilegia testes focados por sprint
- `npm run lint` segue fora do gate por backlog historico
- smoke manual em Vercel continua obrigatorio antes de fechar sprint estrutural

## Fontes canonicas

- `.agents/memory/progress.md`
- `docs/testing-strategy.md`
- `docs/ai-context/refactor/05-VALIDATION.md`
- `.github/workflows/ci.yml`

## Notas relacionadas

- [[ARCH-Chat-Experience]]
- [[ARCH-Serverless-RAG]]
- [[ROADMAP-Overview]]

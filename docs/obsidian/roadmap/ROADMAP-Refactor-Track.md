---
type: roadmap-note
area: refactor
status: active
source_of_truth:
  - docs/ai-context/refactor/01-MASTER-PLAN.md
  - docs/ai-context/refactor/02-BOARD.md
  - docs/ai-context/refactor/07-SPRINT-LOG.md
last_reviewed: 2026-04-22
tags:
  - obsidian
  - roadmap
  - refactor
  - sprints
---

# ROADMAP Refactor Track

Back to [[00-MASTER]].

## Sequencia principal

1. Sprint 1 - auth local e fronteiras basicas
2. Sprint 2 - quebra interna da camada Gemini
3. Sprint 3 - extracao do fluxo de chat para `features/chat/*`
4. Sprint 4 - extracao do dossie + stores e boundaries
5. Sprint 5 - modularizacao do shell `components/chat/*`
6. Sprint 6 - divisao de `prompts/megaPrompts.ts`
7. Sprint 7 - constantes e remocao de legado (`validation`)
8. Sprint 8 - War Room e documentacao final

## Areas puxadas por essa trilha

- [[ARCH-Chat-Experience]]
- [[ARCH-Services-Gemini]]
- [[ARCH-App-Orchestration]]
- [[ARCH-State-Storage]]

## Regras da trilha

- manter fachadas publicas estaveis quando a sprint for estrutural
- validar em cortes pequenos e com testes focados
- usar Vercel como runtime real para smoke final

## Proxima leitura

- [[ROADMAP-Overview]]
- [[DECISIONS-Index]]

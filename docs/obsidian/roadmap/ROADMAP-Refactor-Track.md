---
type: roadmap-note
area: refactor
status: active
source_of_truth:
  - docs/ai-context/refactor/01-MASTER-PLAN.md
  - docs/ai-context/refactor/02-BOARD.md
  - docs/ai-context/refactor/08-PHASE2-MAINTAINABILITY-PLAN.md
last_reviewed: 2026-04-23
tags:
  - obsidian
  - roadmap
  - refactor
  - sprints
---

# ROADMAP Refactor Track

Back to [[00-MASTER]].

## Fase 1 (concluida)

1. Sprint 1 - auth local e fronteiras basicas
2. Sprint 2 - quebra interna da camada Gemini
3. Sprint 3 - extracao do fluxo de chat para `features/chat/*`
4. Sprint 4 - extracao do dossie + stores e boundaries
5. Sprint 5 - modularizacao do shell `components/chat/*`
6. Sprint 6 - divisao de `prompts/megaPrompts.ts`
7. Sprint 7 - constantes e remocao de legado
8. Sprint 8 - War Room modular + stub `features/radar/*` (mergeada em `main`)

## Fase 2 (ativa em planejamento)

9. Sprint 9 - App shell decoupling + governanca
10. Sprint 10 - Radar boundary completion
11. Sprint 11 - componentes grandes + tipagem forte
12. Sprint 12 - hardening final + fechamento documental

## Areas puxadas por essa trilha

- [[ARCH-App-Orchestration]]
- [[ARCH-Chat-Experience]]
- [[ARCH-State-Storage]]
- [[ARCH-Services-Gemini]]

## Regras da trilha

- manter fachadas publicas estaveis durante refactors estruturais
- validar em cortes pequenos e com testes focados
- usar Vercel como runtime real para smoke final

## Proxima leitura

- [[ROADMAP-Overview]]
- [[DECISIONS-Index]]

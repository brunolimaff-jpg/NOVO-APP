---
type: roadmap-note
area: refactor
status: active
source_of_truth:
  - docs/ai-context/refactor/01-MASTER-PLAN.md
  - docs/ai-context/refactor/02-BOARD.md
  - docs/ai-context/refactor/08-PHASE2-MAINTAINABILITY-PLAN.md
last_reviewed: 2026-05-19
tags:
  - obsidian
  - roadmap
  - refactor
  - sprints
---

# Trilha de Refatoração

Voltar para [[00-MASTER]].

## Fase 1 (concluida)

1. Sprint 1 - auth local e fronteiras basicas
2. Sprint 2 - quebra interna da camada Gemini
3. Sprint 3 - extracao do fluxo de chat para `features/chat/*`
4. Sprint 4 - extracao do dossie + stores e boundaries
5. Sprint 5 - modularizacao do shell `components/chat/*`
6. Sprint 6 - divisao de `prompts/megaPrompts.ts`
7. Sprint 7 - constantes e remocao de legado
8. Sprint 8 - War Room modular + stub `features/radar/*` (mergeada em `main`)

## Fase 2 (ativa)

9. Sprint 9 - App shell decoupling + governanca (concluída)
10. Sprint 10 - Radar boundary completion (concluída)
11. Sprint 11 - componentes grandes + tipagem forte (ativa: Onda 1A documental)
12. Sprint 12 - hardening final + fechamento documental (planejada)

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

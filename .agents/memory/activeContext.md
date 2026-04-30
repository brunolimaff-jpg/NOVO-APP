# Active Context

Last updated: 2026-04-30

## Current operating context

This repo uses repo-local memory plus canonical handoff docs so sessions can resume on any machine.

Read order:

1. `AGENTS.md`
2. `HANDOFF_AI.md`
3. `.agents/memory/activeContext.md`
4. `.agents/memory/progress.md`
5. `.agents/memory/decisions.md`
6. `docs/obsidian/00-MASTER.md` for visual navigation only

## Current refactor phase

Fase 1 (Sprints 1-8) esta concluida em `main`.

- Sprint 8 mergeada via PR `#241` (`ccd2001518367961637b1a9488c2319aa83d0a21`)
- `services/war-room/*` ativo com fachada publica preservada em `services/warRoomService.ts`
- `features/radar/*` oficializado como boundary inicial (stub)

Fase 2 (manutenibilidade) foi aberta de forma documental:

- `docs/ai-context/refactor/08-PHASE2-MAINTAINABILITY-PLAN.md`
- Sprint 9-12 definidas como trilha curta de reducao de acoplamento

## Current task context

Correcao do dossie modular para o caso Grupo Piccini:

- O fluxo modular de dossie agora passa `googleSearch` por modulo quando `useGrounding: true`.
- As fontes retornadas por cada modulo sao agregadas em `groundingSources` na mensagem final do waterfall.
- Evidencia Senior foi blindada para HCM-only: quando o CRM confirma HCM mas nao confirma ERP, o texto deve tratar ERP como gap/hipotese e nao como cliente ERP Senior.
- Exportacao PDF deixou de usar PDF programatico quebrado e passou a abrir uma visualizacao HTML de impressao/salvar PDF.
- A visualizacao HTML de impressao sanitiza emojis/simbolos, renderiza headings, listas, links, tabelas e blocos Mermaid, e aplica CSS de impressao para margens, quebras e tabelas legiveis.

## Immediate next step

1. Validar manualmente a exportacao HTML no navegador usando um dossie real do Grupo Piccini.
2. Conferir que o dossie gerado cita Grupo Piccini, RRP Energia, Tapurah, BNDES, usina de etanol de milho e capacidade industrial quando as fontes publicas forem encontradas.
3. Conferir que CRM HCM-only nao gera frase de ERP Senior confirmado/core.

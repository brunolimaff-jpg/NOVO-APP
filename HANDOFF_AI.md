# Handoff Tecnico - Fonte Canonica

Use este arquivo como ponto de entrada rapido para qualquer nova IA trabalhando neste repositorio.

## Ordem de leitura

Para continuidade entre IAs, leia primeiro:

1. `AGENTS.md`
2. `.agents/memory/activeContext.md`
3. `.agents/memory/progress.md`
4. `.agents/memory/decisions.md`
5. `docs/SKILLS-GOVERNANCE.md`
6. `docs/ai-context/refactor/00-README.md`
7. `docs/ai-context/refactor/01-MASTER-PLAN.md`
8. `docs/ai-context/refactor/02-BOARD.md`
9. `docs/ai-context/refactor/03-OPEN-ITEMS.md`
10. `docs/ai-context/refactor/06-HANDOFF.md`
11. `docs/obsidian/00-MASTER.md` para navegacao visual de arquitetura + roadmap (camada de grafo, nao fonte canonica)

## Contexto minimo estavel

- Projeto: **Senior Scout 360**
- Objetivo: aplicacao web de inteligencia comercial para investigacao de empresas, dossies, Score PORTA, CRM e radar
- Stack principal: React 19 + TypeScript + Vite + Tailwind + perfil local de operador + Gemini + Pinecone
- Auth atual: local-only, persistido no dispositivo via `contexts/OperatorContext.tsx`
- Integracao externa padrao para IA: `GitHub`
- Runtime real de validacao manual: Vercel
- Camada visual versionada para arquitetura/roadmap: `docs/obsidian/00-MASTER.md`

## Entrypoints e hotspots

- Bootstrap da app: `index.tsx`
- Orquestrador principal: `App.tsx` (hotspot ainda ativo, mas a Sprint 4 tirou estado de sessao/loading/export para `stores/*` e a Sprint 5 moveu o shell visual do chat para `components/chat/*`)
- UI principal do chat: `components/ChatInterface.tsx` (fachada publica estavel)
- Componentes internos do chat: `components/chat/*`
- Fachada publica da camada Gemini: `services/geminiService.ts`
- Implementacao interna da camada Gemini: `services/gemini/`
- Features extraidas do App (novo destino): `features/chat/`
- Contratos centrais: `types.ts`
- Prompts: `prompts/`
- Serverless handlers: `api/*.ts`

## Fluxo operacional resumido

1. O usuario interage pela UI de chat.
2. `App.tsx` coordena o shell principal e o acionamento dos fluxos; sessao/loading/export agora vivem em `stores/*` e a logica especializada segue em `features/*`.
3. `services/geminiService.ts` expoe o contrato publico e delega para `services/gemini/`.
4. Lookup, RAG, proxy Gemini, parsing PORTA e recovery ficam na camada de services.
5. Sessao, feedback, exportacao e CRM passam por services e utils do repo.

## Estado arquitetural atual

- `services/geminiService.ts` e fachada de compatibilidade.
- A orquestracao interna foi decomposta em:
  - `services/gemini/investigation-orchestration.ts`
  - `services/gemini/porta.ts`
  - `services/gemini/sources.ts`
  - `services/gemini/sanitization.ts`
  - `services/gemini/status.ts`
  - `services/gemini/recovery.ts`
  - `services/gemini/runtime.ts`
  - `services/gemini/auxiliary.ts`
  - `services/gemini/config.ts`
  - `services/gemini/contracts.ts`
- `features/chat/` e o novo destino das responsabilidades extraidas de `App.tsx`:
  - `features/chat/loading-progress.ts` - estado e progresso de loading (Sprint 3 / corte 1)
  - `features/chat/session-controller.ts` - ciclo de vida de sessao e save remoto (Sprint 3 / cortes 2A-2C)
  - `features/chat/feedback-actions.ts` - handlers de feedback, section feedback, toggle de fontes, report de erro (Sprint 3 / corte 3)
  - `features/chat/message-orchestrator.ts` - orquestracao do envio padrao (Sprint 3 / ultimo corte, mergeado)
  - `features/chat/message-helpers.ts` - helpers compartilhados de hint de empresa, abort e sugestoes de continuidade
- `features/dossier/` foi o destino da Sprint 4:
  - Onda 1 moveu waterfall, benchmark, retries e reconciliacao PORTA
  - Onda 2 consolidou `stores/*` e error boundaries por feature
  - Onda 1 mergeada em `main` via PR `#227`:
    - `features/dossier/waterfall-orchestrator.ts`
    - `features/dossier/benchmark-stage.ts`
    - `features/dossier/porta-reconciliation.ts`
- `stores/` entrou na Onda 2:
  - `stores/chatStore.tsx`
  - `stores/dossierStore.tsx`
- Boundaries da Onda 2:
  - `features/chat/ChatErrorBoundary.tsx`
  - `features/dossier/DossierErrorBoundary.tsx`
- Auditoria compartilhada de erro:
  - `utils/errorBoundaryAudit.ts`
- `components/chat/` e o destino ativo da Sprint 5:
  - `components/chat/contracts.ts`
  - `components/chat/ChatShell.tsx`
  - `components/chat/MessageTimeline.tsx`
  - `components/chat/Composer.tsx`
  - `components/chat/ChatPanels.tsx`
- `hooks/useChat.ts` e legado e nao deve ganhar novos imports de producao.
- O guardrail de arquitetura esta em `tests/architecture/useChatImportGuard.test.ts`.
- `npm run test:dossier` roda a regressao offline do caso canonico Scheffer e deve ser o fast-check quando houver mudanca real em dossie.

## Programa de Refatoracao

- Sprint 1 (done): remocao de Clerk/auth, migracao para `OperatorContext`
- Sprint 2 (done): extracao interna da camada Gemini para `services/gemini/`
- Sprint 3 (done): extracao do fluxo de chat para `features/chat/` concluida; validacao manual integrada fechada em `2026-04-15`
- Sprint 4 (done): Onda 1 mergeada via PR `#227`; Onda 2 mergeada via PR `#228` em `2026-04-17`
- Sprint 5 (active): `components/ChatInterface.tsx` foi modularizado em `components/chat/*` no branch `codex/sprint5-chatinterface-modularization` com gates automatizados green em `2026-04-17`
- Sprints 6-8: ver `docs/ai-context/refactor/01-MASTER-PLAN.md`

## Scripts principais

- `npm run dev`
- `npm run test`
- `npm run typecheck`
- `npm run build`
- `npm run lint`
- `npm run test:dossier`

## Validacao manual da Sprint 5

- Confirmar o gate inicial do operador quando nao existe nome local
- Validar a home inicial e o disparo de nova investigacao
- Validar timeline com sessao ativa, incluindo loading hero/inline e fallback visual
- Validar header actions abrindo dashboard, settings, radar e war room
- Validar composer com send, stop e retry sem regressao funcional

## Regras de continuidade

- Nao confie em contexto de chat antigo.
- Nao confie em paths de maquina antigos ou em descricoes de working tree fora do repo.
- A memoria repo-local em `.agents/memory/` registra o contexto curto entre sessoes e deve apontar para as fontes canonicas.
- O estado atual do programa de refatoracao vive em `docs/ai-context/refactor/02-BOARD.md`.
- O estado atual do ambiente de skills e integracoes vive em `docs/SKILLS-GOVERNANCE.md`.
- `docs/obsidian/00-MASTER.md` organiza a navegacao por grafo no Obsidian, mas nao substitui handoff/memory/board como fonte de verdade.
- Nao assuma skills globais em `~/.codex/skills`; use apenas a allowlist do repo.
- Antes de planejar implantacoes, use a skill repo-local `plan-work` quando disponivel.
- Validacao manual final deve acontecer em preview/producao na Vercel, nao em `npm run dev`.

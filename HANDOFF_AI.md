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

## Contexto minimo estavel

- Projeto: **Senior Scout 360**
- Objetivo: aplicacao web de inteligencia comercial para investigacao de empresas, dossies, Score PORTA, CRM e radar
- Stack principal: React 19 + TypeScript + Vite + Tailwind + perfil local de operador + Gemini + Pinecone
- Auth atual: local-only, persistido no dispositivo via `contexts/OperatorContext.tsx`
- Integracao externa padrao para IA: `GitHub`
- Runtime real de validacao manual: Vercel

## Entrypoints e hotspots

- Bootstrap da app: `index.tsx`
- Orquestrador principal: `App.tsx` (hotspot reduzido; Sprint 4 Onda 1 tirou o runtime de dossie e a Onda 2 fecha estado/boundaries)
- UI principal do chat: `components/ChatInterface.tsx`
- Fachada publica da camada Gemini: `services/geminiService.ts`
- Implementacao interna da camada Gemini: `services/gemini/`
- Features extraidas do App (novo destino): `features/chat/`
- Contratos centrais: `types.ts`
- Prompts: `prompts/`
- Serverless handlers: `api/*.ts`

## Fluxo operacional resumido

1. O usuario interage pela UI de chat.
2. `App.tsx` coordena sessao, loading, mensagens e acionamento dos fluxos, delegando o chat para `features/chat/*` e o runtime de dossie para `features/dossier/*`.
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
  - `features/chat/message-helpers.ts` - fachada leve para os helpers compartilhados de hint de empresa, abort e sugestoes de continuidade
- `features/dossier/` e o destino ativo da Sprint 4:
  - Onda 1 (`done`): `waterfall-orchestrator.ts`, `benchmark-stage.ts` e `porta-reconciliation.ts` agora concentram waterfall, benchmark, retries e reconciliacao PORTA
  - Onda 2 (`next`): consolidar `stores/*` e error boundaries por feature
- `utils/conversationFlow.ts` concentra os helpers compartilhados de continuidade/abort/company hint usados por chat e dossie
- `hooks/useChat.ts` e legado e nao deve ganhar novos imports de producao.
- O guardrail de arquitetura esta em `tests/architecture/useChatImportGuard.test.ts`.
- `npm run test:dossier` roda a regressao offline do caso canonico Scheffer e deve ser o fast-check quando houver mudanca real em dossie.

## Programa de Refatoracao

- Sprint 1 (done): remocao de Clerk/auth, migracao para `OperatorContext`
- Sprint 2 (done): extracao interna da camada Gemini para `services/gemini/`
- Sprint 3 (done): extracao do fluxo de chat para `features/chat/` concluida; validacao manual integrada fechada em `2026-04-15`
- Sprint 4 (active): Onda 1 concluida para extracao do fluxo de dossie; Onda 2 fica focada em `stores/*` + error boundaries
- Sprints 5-8: ver `docs/ai-context/refactor/01-MASTER-PLAN.md`

## Scripts principais

- `npm run dev`
- `npm run test`
- `npm run typecheck`
- `npm run build`
- `npm run lint`
- `npm run test:dossier`

## Regras de continuidade

- Nao confie em contexto de chat antigo.
- Nao confie em paths de maquina antigos ou em descricoes de working tree fora do repo.
- A memoria repo-local em `.agents/memory/` registra o contexto curto entre sessoes e deve apontar para as fontes canonicas.
- O estado atual do programa de refatoracao vive em `docs/ai-context/refactor/02-BOARD.md`.
- O estado atual do ambiente de skills e integracoes vive em `docs/SKILLS-GOVERNANCE.md`.
- Nao assuma skills globais em `~/.codex/skills`; use apenas a allowlist do repo.
- Antes de planejar implantacoes, use a skill repo-local `plan-work` quando disponivel.
- Validacao manual final deve acontecer em preview/producao na Vercel, nao em `npm run dev`.

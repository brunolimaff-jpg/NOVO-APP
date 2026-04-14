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
- Orquestrador principal: `App.tsx`
- UI principal do chat: `components/ChatInterface.tsx`
- Fachada publica da camada Gemini: `services/geminiService.ts`
- Implementacao interna da camada Gemini: `services/gemini/`
- Contratos centrais: `types.ts`
- Prompts: `prompts/`
- Serverless handlers: `api/*.ts`

## Fluxo operacional resumido

1. O usuario interage pela UI de chat.
2. `App.tsx` coordena sessao, loading, mensagens e acionamento dos fluxos.
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
- `hooks/useChat.ts` e legado e nao deve ganhar novos imports de producao.
- O guardrail de arquitetura esta em `tests/architecture/useChatImportGuard.test.ts`.

## Scripts principais

- `npm run dev`
- `npm run test`
- `npm run typecheck`
- `npm run build`
- `npm run lint`

## Regras de continuidade

- Nao confie em contexto de chat antigo.
- Nao confie em paths de maquina antigos ou em descricoes de working tree fora do repo.
- A memoria repo-local em `.agents/memory/` registra o contexto curto entre sessoes e deve apontar para as fontes canonicas.
- O estado atual do programa de refatoracao vive em `docs/ai-context/refactor/02-BOARD.md`.
- O estado atual do ambiente de skills e integracoes vive em `docs/SKILLS-GOVERNANCE.md`.
- Nao assuma skills globais em `~/.codex/skills`; use apenas a allowlist do repo.
- Antes de planejar implantacoes, use a skill repo-local `plan-work` quando disponivel.
- Validacao manual final deve acontecer em preview/producao na Vercel, nao em `npm run dev`.

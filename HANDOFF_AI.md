# Handoff Tecnico - Fonte Canonica

Use este arquivo como ponto de entrada rapido para qualquer nova IA trabalhando
neste repositorio.

## Ordem de leitura

Para continuidade entre IAs, leia primeiro:

1. `AGENTS.md`
2. `docs/SKILLS-GOVERNANCE.md`
3. `docs/ai-context/refactor/00-README.md`
4. `docs/ai-context/refactor/01-MASTER-PLAN.md`
5. `docs/ai-context/refactor/02-BOARD.md`
6. `docs/ai-context/refactor/03-OPEN-ITEMS.md`
7. `docs/ai-context/refactor/06-HANDOFF.md`

## Contexto minimo estavel

- Projeto: **Senior Scout 360**
- Objetivo: aplicacao web de inteligencia comercial para investigacao de empresas,
  dossies, Score PORTA, CRM e radar
- Stack principal: React 19 + TypeScript + Vite + Tailwind + perfil local de
  operador + Gemini + Pinecone
- Autenticacao: nao ha login; o operador informa um nome local obrigatorio,
  persistido no dispositivo
- Integracao externa padrao para IA: `GitHub`

## Entrypoints e hotspots

- Bootstrap da app: `index.tsx`
- Orquestrador principal: `App.tsx`
- UI principal do chat: `components/ChatInterface.tsx`
- Motor principal de IA: `services/geminiService.ts`
- Contratos centrais: `types.ts`
- Prompts: `prompts/`
- Serverless handlers: `api/*.ts`

## Fluxo operacional resumido

1. O usuario interage pela UI de chat.
2. `App.tsx` coordena sessao, loading, mensagens e acionamento dos fluxos.
3. `services/geminiService.ts` concentra a orquestracao principal de IA.
4. Sessao, feedback, exportacao e CRM passam por services e utils do repo.
5. O roadmap ativo hoje prioriza separar `App.tsx`, `geminiService.ts`,
   `ChatInterface.tsx` e `prompts/megaPrompts.ts`.

## Scripts principais

- `npm run dev`
- `npm run test`
- `npm run typecheck`
- `npm run build`
- `npm run lint`

## Regras de continuidade

- Nao confie em contexto de chat antigo.
- Nao confie em paths de maquina antigos ou em descricoes de working tree fora do repo.
- O estado atual do programa de refatoracao vive em
  `docs/ai-context/refactor/02-BOARD.md`.
- O estado atual do ambiente de skills e integracoes vive em
  `docs/SKILLS-GOVERNANCE.md`.
- Nao assuma skills globais em `~/.codex/skills`; use apenas a allowlist do repo.

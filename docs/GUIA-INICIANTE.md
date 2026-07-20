# Guia Iniciante — Senior Scout 360

Este é o caminho mais curto para rodar o projeto e entender como ele está organizado hoje.

## 1) Requisitos

- Node.js 24.x
- npm 11.11.0

## 2) Rodar localmente

```bash
npm ci
cp .env.example .env
npm run dev
```

Abra `http://localhost:3000`.

Preencha no `.env` o que for necessário para o seu fluxo:

- `VITE_CLERK_PUBLISHABLE_KEY`
- `GEMINI_API_KEY`
- `PINECONE_API_KEY`

## 3) Mapa mental rápido

- `App.tsx`: orquestra o fluxo principal
- `components/`: UI e composição de tela
- `services/`: IA, integrações e regras de backend/frontend
- `api/`: funções serverless
- `contexts/`: estado global
- `prompts/`: prompts e builders

## 4) Comandos úteis

```bash
npm run test
npm run typecheck
npm run build
npm run lint
```

Smoke E2E local:

```bash
npx playwright install
npm run test:e2e:smoke
```

## 5) Problemas comuns

### `tsc not found`

Rode `npm ci`.

### `Missing GEMINI_API_KEY`

Revise o `.env`.

### Funciona localmente e falha em produção

Confira variáveis de ambiente e comportamento das rotas serverless em `api/`.

## 6) Operação de IA no repo

- A integração externa padrão é `GitHub`.
- As skills válidas do repo são versionadas em `.agents/skills/`.
- Não dependa do que existe em `~/.codex/skills`.

Fonte de verdade:

- `AGENTS.md`
- `docs/SKILLS-GOVERNANCE.md`
- `HANDOFF_AI.md`

## 7) Próximos passos

1. Ler `AGENTS.md`
2. Ler `docs/SKILLS-GOVERNANCE.md`
3. Entender `App.tsx`
4. Ler `services/geminiService.ts`
5. Ler `docs/SEGURANCA-API.md`

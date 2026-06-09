# Senior Scout 360

Senior Scout 360 is a React 19 + TypeScript + Vite web app for commercial intelligence in agribusiness. The product helps Senior sellers investigate prospects, build dossier-style analysis, qualify accounts with Score PORTA, and support follow-up through CRM and radar workflows.

## Quick start

```bash
npm install
cp .env.example .env
npm run dev
```

Main commands:

```bash
npm run test
npm run typecheck
npm run build
npm run lint
```

## Project shape

- `App.tsx`: main app orchestrator
- `components/`: UI and view composition
- `services/`: AI, data, and backend-facing logic
- `prompts/`: prompt assets and prompt builders
- `api/`: Vercel serverless handlers
- `tests/` and `tests-e2e/`: automated validation

## AI operating model

This repo intentionally uses a minimal AI setup:

- `GitHub` is the primary external integration.
- Repo-local skills are curated and versioned under `.agents/skills/`.
- Global `~/.codex/skills` content must not be required to operate the repo.
- No extra MCP servers are configured as part of the standard project setup.

The canonical skill policy lives in [`docs/SKILLS-GOVERNANCE.md`](./docs/SKILLS-GOVERNANCE.md).

## Documentação técnica

A documentação arquitetural do Senior Scout 360 está disponível na [Wiki técnica](docs/wiki/README.md).

Ela reúne:

- visão geral da arquitetura;
- fluxo de sessões e mensagens;
- waterfall de geração de dossiê;
- loading e estados visuais;
- contratos de interface;
- observabilidade e diagnóstico;
- testes e gates;
- segurança e integrações.

### Fonte de verdade

O código e os testes da versão atual prevalecem sobre a documentação gerada automaticamente.

A Wiki deve ser usada como:

- mapa arquitetural;
- ponto de entrada para novos agentes;
- índice para investigações;
- apoio a auditorias por área.

Ela não substitui a leitura e a validação do código atual.

### Estado do incidente visual

O incidente histórico de `display:none` no fallback estático está mitigado pelo recovery `static-fallback-display-recovery`.

- não há reincidência registrada após a PR #347;
- a causa raiz permanece aberta;
- o estado atual é monitoramento;
- uma nova investigação deve ser aberta somente diante dos gatilhos registrados no [handoff técnico](HANDOFF_AI.md).

### Leitura recomendada para agentes

1. [HANDOFF_AI.md](HANDOFF_AI.md) — estado atual, gatilhos de reabertura e prompt de retomada
2. [docs/wiki/README.md](docs/wiki/README.md) — índice da Wiki técnica
3. [docs/wiki/pages/05-arquitetura-do-app.md](docs/wiki/pages/05-arquitetura-do-app.md) — arquitetura do app
4. [docs/wiki/pages/06-sess-es-e-mensagens.md](docs/wiki/pages/06-sess-es-e-mensagens.md) — sessões e mensagens
5. [docs/wiki/pages/07-waterfall-de-dossi.md](docs/wiki/pages/07-waterfall-de-dossi.md) — waterfall de dossiê
6. [docs/wiki/pages/10-loading-e-estados-visuais.md](docs/wiki/pages/10-loading-e-estados-visuais.md) — loading e estados visuais
7. [docs/wiki/pages/16-depurar-painel-branco.md](docs/wiki/pages/16-depurar-painel-branco.md) — depuração de painel branco
8. [docs/wiki/pages/23-contratos-de-ui.md](docs/wiki/pages/23-contratos-de-ui.md) — contratos de UI
9. [docs/wiki/pages/24-testes-e-gates.md](docs/wiki/pages/24-testes-e-gates.md) — testes e gates
10. [docs/wiki/pages/26-observabilidade-e-diagn-sticos.md](docs/wiki/pages/26-observabilidade-e-diagn-sticos.md) — observabilidade e diagnósticos

## Obsidian repo graph

The repo now includes a versioned Obsidian documentation layer under [`docs/obsidian/`](./docs/obsidian/).

- Start from [`docs/obsidian/00-MASTER.md`](./docs/obsidian/00-MASTER.md) for the architecture + roadmap graph entrypoint.
- Treat it as a navigation layer. The canonical live status still lives in `HANDOFF_AI.md`, `.agents/memory/*`, and `docs/ai-context/refactor/*`.
- Validate the graph contract with `npm run docs:obsidian:check`.

## Core docs

| Document                                                                           | Purpose                                              |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------- |
| [`AGENTS.md`](./AGENTS.md)                                                         | Primary repo instructions                            |
| [`docs/GUIA-INICIANTE.md`](./docs/GUIA-INICIANTE.md)                               | Fast onboarding                                      |
| [`docs/SKILLS-GOVERNANCE.md`](./docs/SKILLS-GOVERNANCE.md)                         | Allowed skills and environment policy                |
| [`docs/obsidian/00-MASTER.md`](./docs/obsidian/00-MASTER.md)                       | Obsidian graph entrypoint for architecture + roadmap |
| [`docs/obsidian/OBSIDIAN-README.md`](./docs/obsidian/OBSIDIAN-README.md)           | Vault usage and maintenance contract                 |
| [`HANDOFF_AI.md`](./HANDOFF_AI.md)                                                 | Stable entrypoint for AI handoff                     |
| [`ARQUITETURA.md`](./ARQUITETURA.md)                                               | Technical architecture                               |
| [`docs/ai-context/refactor/00-README.md`](./docs/ai-context/refactor/00-README.md) | Refactor program context                             |

## CI and delivery

- CI checks live in `.github/workflows/ci.yml`.
- `main` should remain the protected production branch.
- Prefer merging only after `test`, `typecheck`, and `build` are green.

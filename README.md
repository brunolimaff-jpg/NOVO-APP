# Senior Scout 360

Senior Scout 360 é um app web React 19 + TypeScript + Vite para inteligência comercial no agronegócio. O produto ajuda vendedores Senior a investigar prospects, construir análises estilo dossiê, qualificar contas com Score PORTA e dar suporte ao follow-up através de fluxos de CRM e radar.

## Início rápido

```bash
npm install
cp .env.example .env
npm run dev
```

Comandos principais:

```bash
npm run test
npm run typecheck
npm run build
npm run lint
```

## Estrutura do projeto

- `App.tsx`: orquestrador principal do app
- `components/`: composição de UI e visual
- `services/`: lógica de IA, dados e backend
- `prompts/`: assets e builders de prompt
- `api/`: handlers serverless Vercel
- `tests/` e `tests-e2e/`: validação automatizada

## Modelo operacional de IA

Este repo usa intencionalmente uma configuração mínima de IA:

- `GitHub` é a integração externa principal.
- Skills locais do repo são curadas e versionadas sob `.agents/skills/`.
- Conteúdo global `~/.codex/skills` não deve ser necessário para operar o repo.
- Nenhum MCP server extra é configurado como parte do setup padrão.

A política canônica de skills está em [`docs/SKILLS-GOVERNANCE.md`](./docs/SKILLS-GOVERNANCE.md).

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
4. [docs/wiki/pages/06-sessoes-e-mensagens.md](docs/wiki/pages/06-sessoes-e-mensagens.md) — sessões e mensagens
5. [docs/wiki/pages/07-waterfall-de-dossie.md](docs/wiki/pages/07-waterfall-de-dossie.md) — waterfall de dossiê
6. [docs/wiki/pages/10-loading-e-estados-visuais.md](docs/wiki/pages/10-loading-e-estados-visuais.md) — loading e estados visuais
7. [docs/wiki/pages/16-depurar-painel-branco.md](docs/wiki/pages/16-depurar-painel-branco.md) — depuração de painel branco
8. [docs/wiki/pages/23-contratos-de-ui.md](docs/wiki/pages/23-contratos-de-ui.md) — contratos de UI
9. [docs/wiki/pages/24-testes-e-gates.md](docs/wiki/pages/24-testes-e-gates.md) — testes e gates
10. [docs/wiki/pages/26-observabilidade-e-diagnosticos.md](docs/wiki/pages/26-observabilidade-e-diagnosticos.md) — observabilidade e diagnósticos

## Grafo Obsidian do repositório

O repo agora inclui uma camada de documentação Obsidian versionada em [`docs/obsidian/`](./docs/obsidian/).

- Comece por [`docs/obsidian/00-MASTER.md`](./docs/obsidian/00-MASTER.md) para o ponto de entrada do grafo de arquitetura + roadmap.
- Trate como camada de navegação. O status vivo canônico continua em `HANDOFF_AI.md`, `.agents/memory/*` e `docs/archive/refactor-program/`.
- Valide o contrato do grafo com `npm run docs:obsidian:check`.

## Documentação principal

| Documento                                                                                    | Propósito                                       |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| [`AGENTS.md`](./AGENTS.md)                                                                   | Instruções principais do repositório            |
| [`docs/GUIA-INICIANTE.md`](./docs/GUIA-INICIANTE.md)                                         | Onboarding rápido                               |
| [`docs/SKILLS-GOVERNANCE.md`](./docs/SKILLS-GOVERNANCE.md)                                   | Política de skills e ambiente                   |
| [`docs/obsidian/00-MASTER.md`](./docs/obsidian/00-MASTER.md)                                 | Ponto de entrada do grafo Obsidian              |
| [`docs/obsidian/OBSIDIAN-README.md`](./docs/obsidian/OBSIDIAN-README.md)                     | Uso do vault e contrato de manutenção           |
| [`HANDOFF_AI.md`](./HANDOFF_AI.md)                                                           | Ponto de entrada estável para handoff de IA     |
| [`ARQUITETURA.md`](./ARQUITETURA.md)                                                         | Arquitetura técnica                             |
| [`docs/archive/refactor-program/00-README.md`](./docs/archive/refactor-program/00-README.md) | Contexto do programa de refatoração (arquivado) |

## CI e entrega

- Checks de CI estão em `.github/workflows/ci.yml`.
- `main` deve permanecer a branch de produção protegida.
- Prefira merge apenas depois de `test`, `typecheck` e `build` verdes.

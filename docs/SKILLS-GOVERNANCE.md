# Governança de Skills e Integrações

Este documento é a fonte de verdade do ambiente de IA deste repositório.

Objetivo: manter o repo operável sem depender de skills versionadas dentro do repositório ou de integrações externas obrigatórias.

## Política atual

- Integração externa padrão: nenhuma obrigatória
- MCPs extras no repo: nenhum
- Skills globais do usuário não são pré-requisito operacional
- Skills válidas para uso padrão: nenhuma é exigida pelo repo
- `docs/obsidian/` é uma camada documental versionada do repo para navegação em grafo, não uma integração externa nem um MCP extra
- **Supabase** é a nova camada de banco de dados para persistência (Postgres gerenciado via `lib/supabaseClient.ts`), integração obrigatória para persistência remota — `services/storage.ts`, `services/syncQueue.ts`

## Allowlist oficial

A skill `delivery-loop` é a única skill operacional ativa e versionada no repo. Nenhuma integração externa é obrigatória.

## Classificação operacional

### `active`

- `delivery-loop` — orquestrador canônico do ciclo de entrega (fases 0–8, estado terminal `REPORT_READY`). Fonte: `.agents/skills/delivery-loop/SKILL.md`. Spec: `docs/plans/2026-06-23-delivery-loop-design.md`. Wrappers que apenas a invocam: `~/.claude/commands/delivery-loop.md`, `~/.agents/skills/source-command-delivery-loop/SKILL.md`. O repo prevalece sobre definições globais.

### `archived`

Continuam versionados em `.agents/skills/archive/2026-04-curation/` como lições aprendidas e material de referência:

- `api-design`
- `debugging-tools`
- `frontend-developer`
- `observability`
- `playwright-testing`
- `skill-audit`
- `super-brainstorm`
- `superhuman`
- `test-strategy`
- notas e guias avulsos que estavam misturados em `.agents/skills/`

Também foram arquivados os documentos legados de MCP/skills que descreviam um stack maior do que o uso atual.

### `global-only`

Skills globais podem existir na máquina do usuário e podem ser usadas por conveniência, mas não devem ser assumidas por docs, handoffs ou automações do projeto.

## Regras de uso

- Antes de usar uma skill, confirme se ela é realmente necessária para a tarefa.
- Antes de citar uma integração externa, confirme se ela é opcional ou foi oficialmente adicionada aqui.
- Não documente fluxos que dependam de skills globais específicas não versionadas no repo.
- Não reintroduza MCPs locais sem atualizar este documento, `README.md`, `AGENTS.md`, `CLAUDE.md` e `skills-lock.json`.

## Estado esperado do repo

- `.agents/skills/` contém `delivery-loop/` (ativa), `archive/` (referência histórica) e skills de conveniência
- `skills-lock.json` reflete ausência de skills locais ativas
- `.mcp.json` não declara servidores extras
- `README.md`, `CLAUDE.md`, `AGENTS.md` e `HANDOFF_AI.md` contam a mesma história
- `docs/obsidian/00-MASTER.md` aponta para arquitetura + roadmap e deixa explícitas as fontes canônicas reais

## Short roadmap

No curto prazo, este setup cobre o necessário para:

- planejar e executar a refatoração estrutural
- documentar decisões de arquitetura e handoff
- preservar lições aprendidas sem acoplar o repo a skills locais

# Governança de Skills e Integrações

Este documento é a fonte de verdade do ambiente de IA deste repositório.

Objetivo: manter o repo operável com um conjunto pequeno de capacidades versionadas, sem depender do conteúdo do ambiente global do usuário.

## Política atual

- Integração externa padrão: `GitHub`
- MCPs extras no repo: nenhum
- Skills globais em `~/.codex/skills`: não são pré-requisito operacional
- Skills válidas para uso padrão: apenas a allowlist abaixo

## Allowlist oficial

| Item | Tipo | Status | Motivo |
|---|---|---|---|
| `GitHub` | plugin | keep | Integração externa principal |
| `scoutagro-pilot-os` | local | keep | Contexto do produto e priorização do repo |
| `clean-code` | local | keep | Qualidade e legibilidade recorrentes |
| `codedocs` | local | keep | Continuidade entre IAs e documentação viva |
| `code-review-mastery` | vendorized | keep | Review local de diffs e checkpoints |
| `refactoring-patterns` | vendorized | keep | Separação estrutural segura |
| `clean-architecture` | vendorized | keep | Cortes arquiteturais e fronteiras |

## Classificação operacional

### `keep`

- `.agents/skills/scoutagro-pilot-os`
- `.agents/skills/clean-code`
- `.agents/skills/codedocs`

### `vendorized`

- `.agents/skills/code-review-mastery`
- `.agents/skills/refactoring-patterns`
- `.agents/skills/clean-architecture`

### `archived`

Foram removidos do fluxo padrão e arquivados em `.agents/skills/archive/2026-04-curation/`:

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

Todo o restante de `~/.codex/skills` fica fora do contrato deste repo. Pode existir na máquina do usuário, mas não deve ser assumido por docs, handoffs ou automações do projeto.

## Regras de uso

- Antes de usar uma skill, confirme se ela está na allowlist deste documento.
- Antes de citar uma integração externa, confirme se ela é `GitHub` ou se foi oficialmente adicionada aqui.
- Não documente fluxos que dependam de skills globais não versionadas no repo.
- Não reintroduza MCPs locais sem atualizar este documento, `README.md`, `AGENTS.md`, `CLAUDE.md` e `skills-lock.json`.

## Estado esperado do repo

- `.agents/skills/` contém apenas a allowlist ativa e a pasta `archive/`
- `skills-lock.json` reflete apenas as skills locais aprovadas
- `.mcp.json` não declara servidores extras
- `README.md`, `CLAUDE.md`, `AGENTS.md` e `HANDOFF_AI.md` contam a mesma história

## Short roadmap

No curto prazo, este setup cobre o necessário para:

- planejar e executar a refatoração estrutural
- revisar diffs locais antes de PR
- documentar decisões de arquitetura e handoff
- operar o repo com `GitHub` como integração principal

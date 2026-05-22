---
type: meta-contract
area: repo-graph
status: active
source_of_truth:
  - docs/obsidian/_meta/manifest.json
  - AGENTS.md
  - README.md
last_reviewed: 2026-04-19
tags:
  - obsidian
  - repo-graph
  - contract
---

# Contrato Meta

Voltar para [[00-MASTER]].

## Metadados obrigatorios

Toda nota principal desta camada deve ter:

- `type`
- `area`
- `status`
- `source_of_truth`
- `last_reviewed`
- `tags`

## Regras estruturais

- [[00-MASTER]] deve linkar todas as notas principais.
- Cada nota principal deve backlinkar [[00-MASTER]].
- Cada nota principal deve apontar os documentos canônicos reais em `source_of_truth`.
- Use nomes de nota unicos para evitar colisao de wikilinks.

## Granularidade

- mapear por area e modulo
- citar poucos arquivos-chave dentro de cada nota
- nao criar uma nota por arquivo nesta v1

## Contrato de manutencao

- manifeste as notas obrigatorias em `docs/obsidian/_meta/manifest.json`
- valide o conjunto com `npm run docs:obsidian:check`
- sincronize esse material com `HANDOFF_AI.md`, `.agents/memory/*` e `docs/ai-context/refactor/*`

## Notas relacionadas

- [[OBSIDIAN-README]]
- [[DECISIONS-Index]]

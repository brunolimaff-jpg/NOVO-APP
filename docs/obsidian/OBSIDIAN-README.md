---
type: guide
area: repo-graph
status: active
source_of_truth:
  - README.md
  - AGENTS.md
  - HANDOFF_AI.md
  - docs/SKILLS-GOVERNANCE.md
last_reviewed: 2026-04-19
tags:
  - obsidian
  - repo-graph
  - guide
---

# Obsidian README

Back to [[00-MASTER]].

## Objetivo

Esta pasta cria uma camada visual versionada para usar o `Graph` do Obsidian como mapa do repositório.

O foco desta v1 e arquitetura + roadmap do código. Nao cobre dossies comerciais nem reaproveita o fluxo `obsidian-clipper`.

## Como abrir

1. Abra o repositório no Obsidian como vault.
2. Entre em `docs/obsidian/00-MASTER.md`.
3. Abra a visualizacao de grafo.
4. Use o filtro versionado em `.obsidian/graph.json` para navegar apenas por `docs/obsidian`.

## O que fica versionado

- notas em `docs/obsidian/`
- configuracao compartilhavel do Obsidian em `.obsidian/core-plugins.json` e `.obsidian/graph.json`

## O que fica local

- estado de workspace do Obsidian
- arquivos `.canvas`
- outros artefatos pessoais da interface do app

## Manutencao

- atualize [[00-MASTER]] quando entrar ou sair nota principal
- atualize as notas afetadas quando arquitetura ou roadmap mudarem
- rode `npm run docs:obsidian:check` antes de fechar a tarefa

## Fontes canonicas

- `HANDOFF_AI.md`
- `.agents/memory/*`
- `docs/ai-context/refactor/*`
- `ARQUITETURA.md`

## Notas relacionadas

- [[META-Contract]]
- [[ROADMAP-Overview]]
- [[DECISIONS-Index]]

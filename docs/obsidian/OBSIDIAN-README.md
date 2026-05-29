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

# README do Obsidian

Voltar para [[00-MASTER]].

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

## Graph config

A configuracao do Graph em `.obsidian/graph.json` define:

| Config               | Valor                      | Efeito                                                  |
| -------------------- | -------------------------- | ------------------------------------------------------- |
| `search`             | `path:"docs/obsidian"`     | So notas dentro de `docs/obsidian` aparecem no grafo    |
| `nodeSizeMultiplier` | `1.8`                      | Nos 80% maiores que o padrao                            |
| `hideUnresolved`     | `true`                     | Links quebrados nao aparecem                            |
| Color group          | `[type:licoes-aprendidas]` | Destaca notas de licoes aprendidas em laranja (#f59e0b) |

### Contrato frontmatter

Para que o grupo de cor funcione, **toda nota de licao aprendida** deve incluir no frontmatter:

```yaml
type: licoes-aprendidas
```

Se criar uma nova nota de licao sem esse `type`, ela nao sera destacada no grafo — vai aparecer como um no comum.

### Como ajustar o grupo

1. Graph view → engrenagem (⚙) → Groups → "licoes-aprendidas"
2. O slider **Size** controla o tamanho relativo desse grupo no grafo
3. Para mudar a cor: clique no circulo colorido e escolha outra

---

## Fontes canonicas

- `HANDOFF_AI.md`
- `.agents/memory/*`
- `docs/ai-context/refactor/*`
- `ARQUITETURA.md`

## Notas relacionadas

- [[META-Contract]]
- [[ROADMAP-Overview]]
- [[DECISIONS-Index]]

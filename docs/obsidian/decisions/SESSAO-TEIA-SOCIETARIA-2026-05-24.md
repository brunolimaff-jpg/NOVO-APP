---
title: "Sessao: Teia societaria profunda"
type: sessao
projeto: "NOVO-APP"
data: 2026-05-24T12:47:40-04:00
branch: "codex/investigar-busca-da-teia-societria"
tags:
  - sessao
  - NOVO-APP
  - teia-societaria
  - dossie
  - github
---

# Sessao: Teia societaria profunda

## Resumo

Sessao focada em corrigir a profundidade e a leitura visual da teia societaria no dossie. As PRs #279 e #280 foram validadas no GitHub e mergeadas em `main`.

## PRs

| PR | Titulo | Estado | Merge commit |
|---|---|---|---|
| [#279](https://github.com/brunolimaff-jpg/NOVO-APP/pull/279) | `[codex] teia societaria tipo 5` | Mergeada em 2026-05-24 12:40 -04 | `5887d318e724c1d07248b3ae97fbcaaf24693f57` |
| [#280](https://github.com/brunolimaff-jpg/NOVO-APP/pull/280) | `[codex] deepen societary map research` | Mergeada em 2026-05-24 12:47 -04 | `cbca8034901771a0c6a0bec564f9393d9b173a2c` |

## Trabalho concluido

- `api/socio-search.ts`: busca societaria profunda com todas as queries, mais resultados no Brave, abertura controlada de paginas, extracao de CNPJ e enriquecimento via lookup oficial.
- `features/dossier/waterfall-orchestrator.ts`: contexto de teia com RAG, Docs RAG, concorrentes, PORTA state e QSA oficial; complexidade deterministica para acionar modulo 1b quando ha evidencia objetiva.
- `features/dossier/societaryGraph.ts`: consolidacao de filiais por radical de CNPJ, CNPJ pontuado, labels simples por empresa, tipo visual por papel/CNAE e arestas informativas.
- `features/dossier/SocietaryMap.tsx`: mapa inicia em "Todos", atualiza buscas incrementalmente, cancela requests no unmount e usa `geminiCnpjs` como fonte visual.
- `components/SectionalBotMessage.tsx`: mapa societario passa a ser montado com base no texto completo do dossie, evitando perda de empresas extraidas pelo Gemini.

## Decisoes principais

| Decisao | Racional |
|---|---|
| Profundidade maxima em 2 niveis | Evita explosao recursiva: raiz -> socios -> empresas ligadas aos socios. |
| Filiais consolidadas na matriz | Evita um bloco por filial; exibe `Matriz + N filiais` no CNPJ raiz. |
| `trade` nao vira flag penalizadora | A busca nao produz mais `evidenceType: trade`; cache antigo segue compativel. |
| `Trading` fica como tipo visual | Quando nome, papel ou CNAE indicam trading, o no mostra `Trading` em vez de `Empresa relacionada`. |
| Arestas tem rotulo de vinculo | Labels como `QSA da matriz`, `Administra CNPJ`, `Mesmo radical CNPJ`, `CNPJ relacionado` explicam o encaixe sem afirmar controle juridico. |

## Arquivos afetados

### Modificados na linha principal da entrega

- `api/socio-search.ts`
- `features/dossier/waterfall-orchestrator.ts`
- `features/dossier/SocietaryMap.tsx`
- `features/dossier/societaryGraph.ts`
- `features/dossier/teiaTextParser.ts`
- `components/SectionalBotMessage.tsx`
- `lib/cnpjLookup.ts`

### Testes relevantes

- `tests/api-socio-search.test.ts`
- `tests/features/dossier/waterfall-orchestrator.test.ts`
- `tests/features/dossier/SocietaryMap.test.tsx`
- `tests/features/dossier/societaryGraph.test.ts`
- `tests/features/dossier/teiaTextParser.test.ts`
- `tests/components/SectionalBotMessage.test.tsx`
- `tests/lib/cnpjLookup.test.ts`

## Validacao

### Antes do merge da #280

- `npm exec vitest run tests/api-socio-search.test.ts tests/features/dossier/societaryGraph.test.ts tests/features/dossier/SocietaryMap.test.tsx` -> 31 testes verdes.
- `npm run typecheck` -> verde.
- `npm run test:dossier` -> verde.
- `npm run test` -> 124 arquivos, 922 testes verdes.

### Resolucao de conflito apos merge da #279

- Worktree temporario: `/tmp/NOVO-APP-pr280-merge`.
- Commit de atualizacao da branch #280: `9a07513 merge main into societary deep search`.
- Recorte apos conflito: `npm exec vitest run tests/api-socio-search.test.ts tests/features/dossier/societaryGraph.test.ts tests/features/dossier/SocietaryMap.test.tsx tests/components/SectionalBotMessage.test.tsx tests/lib/cnpjLookup.test.ts` -> 40 testes verdes.
- `npm run typecheck` -> verde.
- GitHub Actions da #280 apos conflito: Typecheck, Dossier Golden, Tests, Build, Smoke preview, Vercel e GitGuardian verdes.

## Estado atual

- #279 mergeada em `main`.
- #280 mergeada em `main`.
- Review threads da #280 estavam resolvidas antes do merge.
- O smoke manual em preview foi pulado por decisao do Bruno; o preview protegido exigia login/bypass local. O smoke automatizado do GitHub passou com o secret configurado.

## Observacoes operacionais

- A tentativa de merge da #279 com `--delete-branch` mergeou a PR, mas falhou ao deletar a branch local porque ela esta em uso no worktree `/Users/brunolima/.config/superpowers/worktrees/NOVO-APP/codex-teia-societaria-tipo5`.
- A tentativa de merge da #280 mergeou a PR, mas o `gh` falhou ao atualizar o checkout local por alteracoes pendentes em arquivos de memoria/docs. O estado remoto esta correto.
- O checkout principal ainda pode conter alteracoes locais nao relacionadas. Nao foram revertidas.

## Pendencias

- Rodar um fluxo humano no preview logado/bypassado com `04.733.767/0001-80` quando houver acesso de navegador autenticado ou secret local.
- Conferir visualmente se os rotulos de aresta estao claros para Bruno: `QSA da matriz`, `Administra CNPJ`, `CNPJ relacionado`, `Mesmo radical CNPJ`.
- Sincronizar memoria/Obsidian se a documentacao local pendente for consolidada depois.

## Comandos uteis

```bash
gh pr view 279 --json state,mergedAt,mergeCommit,url
gh pr view 280 --json state,mergedAt,mergeCommit,url
npm run typecheck
npm run test:dossier
npm run test
```

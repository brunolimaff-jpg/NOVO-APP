# Achado P0 - Teia CNPJ: Escopo de grupo vs CNPJ lateral

**Data:** 2026-05-25  
**Status:** decisao duravel; bloqueio funcional da PR #285 superado em 2026-05-25 17:05
**Escopo:** PR #285 (`codex/cnpj-socios-todos-cnpjs`)  
**Severidade:** P0 funcional/semantico

## Decisao

QSA oficial confirma `socio -> CNPJ`, nao `CNPJ -> grupo`.

Um CNPJ onde o socio aparece deve ser `partner_other_cnpj` ate existir prova independente de vinculo com a raiz/grupo. Oficialidade da fonte qualifica o vinculo do socio, nao a tese de grupo economico.

## Contrato semantico

| Escopo | Quando usar | Pode sustentar tese comercial? |
|--------|-------------|--------------------------------|
| `group_link` | Mesmo radical de CNPJ ou evidencia independente conectando CNPJ a raiz/grupo | Sim, se a evidencia for forte e citada |
| `partner_other_cnpj` | QSA/CNPJ Aberto/Receita confirma que o socio aparece no CNPJ, mas grupo nao esta confirmado | Nao; serve para pergunta de reuniao/validacao |
| `unconfirmed` | CNPJ textual, com `*`, invalido, inconsistente ou sem validacao oficial | Nao; apenas pendencia de validacao |

Labels finais de produto:

- Filtro: `CNPJs laterais`
- Matriz: sem coluna/badge textual de relacao lateral
- Evidencia interna: `Vinculo do socio; grupo nao confirmado`, sem renderizar essa frase como narrativa principal

Termos proibidos para lateral:

- `Proprias`
- `Side business`
- `veiculo operacional do grupo`
- `oficial do grupo`
- uso como prova de enterprise, bioinsumos, verticalizacao ou wedge Senior

## Timeline

| Data | PR | Estado | Papel na linha do tempo |
|------|----|--------|-------------------------|
| 2026-05-23 | #279 | MERGED | Criou Teia Societaria Tipo 5 com Mermaid LR e drill-down por socio. |
| 2026-05-24 | #280 | MERGED | Aprofundou pesquisa da teia e preparou busca reversa por socio. |
| 2026-05-24 | #283 | MERGED | Consolidou prompts e anti-alucinacao. |
| 2026-05-24 | #284 | MERGED | Fechou War Room RAG anti-alucinacao. |
| 2026-05-25 | #285 | MERGED | Integra CNPJ Aberto e matriz societaria; P0 semantico corrigido e documentado no fechamento. |
| 2026-05-25 | #286 | MERGED | Links inline auditaveis; trilha complementar, validada depois da #285. |

## Correcoes exigidas

- API: CNPJ Aberto retorna empresa lateral estruturada com `relationshipScope: partner_other_cnpj`, `rootContext: false`, `sourceProvider: cnpj_aberto`, `evidenceBasis: official_qsa_owner_search`, `claimType: socio_participation`, `rootRelationStatus: not_supported`, `operationalThesisAllowed: false`.
- Parser: `QSA Oficial | OFICIAL` em `Outros CNPJs` continua lateral.
- Prompt: regra explicita de que `OFICIAL` qualifica o vinculo do socio, nao o grupo.
- UI: tabela nao duplica toolbar externa e separa metricas de grupo vs laterais.
- Grafo: lateral nao cria aresta `Root -> company` e nao recebe badge `oficial`.

## Status da correcao

Atualizacao 16:01:

- Testes novos adicionados para API, parser, prompt, tabela e grafo.
- Recorte Vitest da teia passou com 91 testes.

Atualizacao 16:08:

- `validate-prompts.sh`, recorte Vitest da teia, `typecheck`, `lint` e `build` passaram localmente.
- `lint` manteve 5 warnings conhecidos fora do escopo do P0.
- `build` manteve warning conhecido de chunk grande por Mermaid.
- Status historico: naquele momento a PR #285 continuava bloqueada ate validacao visual/preview confirmar que laterais nao viram grupo.

Atualizacao 17:05:

- PR #285 ficou `CLEAN` no GitHub com checks remotos verdes.
- API via proxy local da preview retornou inventario lateral nao degradado.
- Browser local validou matriz preenchida sem coluna/badge lateral e sem secoes textuais inseguras.
- Fechamento atual: `docs/obsidian/decisions/FECHAMENTO-TEIA-CNPJ-PR285-2026-05-25.md`.

Atualizacao 20:36:

- PR #285 mergeada em `main` no commit `ed5c825`.
- PR #286 mergeada em `main` no commit `0eb2935`.
- Nao ha PR aberta no GitHub neste momento.

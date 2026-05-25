# Achado P0 - Teia CNPJ: Escopo de grupo vs CNPJ lateral

**Data:** 2026-05-25  
**Status:** ativo  
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

Labels finais:

- Filtro: `CNPJs laterais`
- Badge: `CNPJ lateral do socio`
- Evidencia: `Vinculo do socio; grupo nao confirmado`

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
| 2026-05-25 | #285 | OPEN / bloqueada | Integra CNPJ Aberto e matriz societaria, mas revelou mistura de lateral com grupo. |
| 2026-05-25 | #286 | OPEN | Links inline auditaveis; trilha complementar, nao corrige o P0. |

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
- PR #285 continua bloqueada ate validacao visual/preview confirmar que laterais nao viram grupo.

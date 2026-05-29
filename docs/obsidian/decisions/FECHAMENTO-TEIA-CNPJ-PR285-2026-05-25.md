---
type: fechamento
tags:
  - fechamento
  - teia-cnpj
---

# Fechamento - Teia CNPJ PR #285

**Data:** 2026-05-25  
**Atualizacao:** 17:05 -04  
**Branch:** `codex/cnpj-socios-todos-cnpjs`  
**PR:** #285  
**HEAD validado:** `2c9a976`  
**Status:** mergeada em `main` no commit `ed5c825`; PR #286 tambem mergeada em `0eb2935`

## Atualizacao 20:36 — pos-merge

- PR #285 foi mergeada em `main`: `ed5c825 feat: show partner CNPJs in societary map (#285)`.
- PR #286 foi validada, corrigida, teve threads resolvidas e foi mergeada em `main`: `0eb2935 fix: distribuir links inline no texto para maior auditoria (#286)`.
- `gh pr list --state open` retornou lista vazia.
- Este documento permanece como registro do fechamento da Teia; proximas mudancas devem entrar em novo ciclo de reestruturacao, nao como hotfix escondido.

## Resumo executivo

A PR #285 saiu do bloqueio funcional. O achado P0 continua como regra duravel, mas a implementacao atual ja corrige o erro central: CNPJ onde o socio aparece nao vira evidencia de grupo economico.

O ponto mais importante e semantico:

> Fonte oficial confirma `socio -> CNPJ`. Ela nao confirma `CNPJ -> grupo`.

## O que estava errado

- A Teia misturava CNPJ lateral do socio com empresa do grupo.
- CNPJ Aberto/QSA Oficial era tratado como bloco textual generico, perdendo contrato estruturado.
- A tabela chamava lateral de `Proprias` ou `Side business`.
- A narrativa usava lateral para tese de bioinsumos, verticalizacao, enterprise ou wedge Senior.
- A matriz duplicava filtros externos e internos.
- A UI exibia uma coluna/badge `CNPJ lateral do socio` que poluia a leitura.
- A mensagem renderizada mostrava tabelas textuais inseguras como `Outros CNPJs onde o socio aparece`.
- Alertas automaticos criavam ruido falso, incluindo validacao societaria e entidades internacionais sem CNPJ.
- Cache antigo de `/api/socio-search` podia servir payload semanticamente errado.
- Checks verdes nao bastavam: a preview ja tinha ficado verde enquanto a API retornava `companies: 0`.

## O que ficou corrigido

- `/api/socio-search` retorna CNPJ Aberto como contrato estruturado, nao como texto solto.
- `relationshipScope: partner_other_cnpj` e o default para QSA/CNPJ Aberto quando nao ha prova independente de grupo.
- `rootContext: false` impede promocao indevida para raiz/grupo.
- `operationalThesisAllowed: false` impede usar lateral como prova de tese comercial.
- CNPJs baixados/inativos entram em `rejected`, fora do inventario principal.
- Cache da rota subiu para `v7-structured-lateral-cnpj`.
- Tabela mostra apenas `EMPRESA`, `CNPJ`, `CNAE` e socios.
- Filtro/metricas usam `CNPJs laterais`.
- Tabela e Grafo usam os mesmos nomes curtos de socios.
- Mensagem exibida/copiada remove secoes inseguras: `Outros CNPJs`, `Alertas`, `Vinculo do socio; grupo nao confirmado`.
- `.env.local` local ficou com proxy para preview e bypass da Vercel, sem versionar segredo.

## Contrato duravel

| Campo                      | Regra                                                                                         |
| -------------------------- | --------------------------------------------------------------------------------------------- |
| `group_link`               | Usar apenas com mesmo radical de CNPJ ou evidencia independente conectando CNPJ a raiz/grupo. |
| `partner_other_cnpj`       | Usar quando QSA/CNPJ Aberto/Receita confirma que o socio aparece no CNPJ, sem prova de grupo. |
| `unconfirmed`              | Usar para CNPJ textual, com `*`, inconsistente, invalido ou sem confirmacao oficial.          |
| `rootContext`              | `false` para lateral; `true` somente quando houver prova de grupo.                            |
| `operationalThesisAllowed` | `false` para lateral.                                                                         |

Termos proibidos para lateral: `Proprias`, `Side business`, `veiculo operacional do grupo`, `oficial do grupo`, bioinsumos proprios, verticalizacao, enterprise, wedge Senior.

## Evidencia de validacao

- `./scripts/validate-prompts.sh` — OK, 59 testes.
- Recorte Vitest da teia — OK, 88 testes no fechamento visual; 91 testes na correcao semantica inicial.
- `npm run typecheck` — OK.
- `npm run lint` — OK com 5 warnings preexistentes fora do escopo.
- `npm run build` — OK com warning conhecido de chunk grande por Mermaid.
- PR #285 no GitHub — `mergeStateStatus: CLEAN`; Typecheck, Tests, Dossier Golden, Build, GitGuardian, Vercel, Vercel Preview Comments e Smoke Preview verdes.
- API via proxy local da preview: `GUILHERME MOGNON SCHEFFER` retornou 15 empresas, 5 rejeitadas, `degraded: false`; amostra com `partner_other_cnpj` e `rootContext: false`.
- Browser local em `http://127.0.0.1:3000/`: apos alternar `Grafo -> Tabela`, matriz exibiu 18 CNPJs laterais; sem `Relação`, sem badge `CNPJ lateral do socio`, sem `Outros CNPJs`, sem `Alertas`, sem `Vinculo...`.

## Linha do tempo resumida

| PR   | Status | Papel                                                                                |
| ---- | ------ | ------------------------------------------------------------------------------------ |
| #279 | MERGED | Teia Societaria Tipo 5 com Mermaid e drill-down.                                     |
| #280 | MERGED | Deep research da Teia; aumentou profundidade e revelou necessidade de busca reversa. |
| #283 | MERGED | Consolidacao de prompts e anti-alucinacao.                                           |
| #284 | MERGED | War Room RAG anti-alucinacao.                                                        |
| #285 | MERGED | Corrige busca por socios, matriz, contrato lateral e limpeza visual.                 |
| #286 | MERGED | Links inline auditaveis; validada depois da #285 e encerrada sem PR aberta.          |

## Licoes aprendidas

1. Checks verdes nao provam comportamento de negocio; a API real da preview precisa retornar dados nao degradados.
2. Fonte oficial qualifica o vinculo do socio, nao a tese de grupo.
3. LLM nao deve extrair CNPJ; no maximo descobre URL. Dado societario precisa vir de fonte estruturada ou scraping verificavel.
4. API especializada vence scraping generico quando existe contrato de dominio.
5. CNPJ com digito valido ainda pode ser falso se nasceu de LLM; validacao matematica nao prova existencia.
6. Parser, prompt, API, grafo e UI precisam compartilhar o mesmo vocabulário de escopo.
7. Cache precisa versionar mudanca semantica; senao um payload velho parece bug novo.
8. UI de analise deve reduzir ruido: coluna/badge de relacao lateral atrapalhava mais do que ajudava.
9. Tabelas textuais geradas pelo modelo nao podem competir com componentes estruturados.
10. `OFICIAL` em tabela de QSA significa "oficial do vinculo societario", nao "oficial do grupo".
11. Baixadas/inativas devem aparecer apenas como referencia/rejeicao, nao inventario ativo.
12. Comentarios antigos de PR ficam perigosos quando novas validacoes contradizem o status anterior.
13. Documentacao diaria append-only evitou perder o caminho de investigacao.
14. A proxima etapa nao e mais hotfix pontual: e reestruturar a Teia como modulo de dominio.

## Pendencias apos merge

### P0

- Nenhum P0 conhecido para bloquear a #285 depois da validacao atual.

### P1

- Configurar `SUPABASE_SERVICE_ROLE_KEY` na Preview geral ou branch da Teia para cache persistente server-side.
- Criar smoke de preview que falhe quando todos os socios retornarem `companies: 0` ou quando `degraded: true` sem inventario util.
- Revalidar Scheffer em preview remoto logado quando houver janela humana, apesar do fluxo local com proxy ja ter validado API e UI.
- Revisar heuristica de laterais em outros grupos economicos alem de Scheffer.

### P2

- Adicionar ordenacao por coluna na SocietaryMatrix.
- Adicionar painel de detalhes/evidencias por linha.
- Melhorar acessibilidade dos dots de socios com tooltip/aria-label consistente.
- Reduzir bundle/chunk grande de Mermaid.
- Reestruturar prompts da Teia para contrato unico, sem tabela textual concorrente.

## Proximo ciclo: reestruturar a Teia

1. Criar um boundary de dominio para Teia CNPJ: tipos, normalizadores, escopos e validadores em um modulo unico.
2. Fazer API, parser, grafo e tabela consumirem os mesmos tipos, sem duplicar regra semantica.
3. Separar inventario ativo, laterais, rejeitados e pendentes no contrato da API.
4. Transformar narrativa de Teia em camada derivada dos dados estruturados, nao em fonte primaria.
5. Automatizar gate de preview com fixture Scheffer e pelo menos um segundo grupo.
6. Documentar cada regressao nova como `Atualizacao HH:mm` no daily log, sem reescrever historico antigo.

## Onde continuar

- Achado semantico: `docs/obsidian/decisions/ACHADO-P0-TEIA-CNPJ-ESCOPO-2026-05-25.md`
- Licoes da busca reversa: `docs/obsidian/decisions/LICOES-APRENDIDAS-BUSCA-REVERSA-2026-05-25.md`
- Handoff tecnico da trilha: `docs/obsidian/decisions/HANDOFF-TEIA-CNPJ-2026-05-25.md`
- Daily log: `docs/obsidian/daily/2026-05-25.md`

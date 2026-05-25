# Licoes Aprendidas - Hotfix Teia CNPJ: Todos os CNPJs dos Socios

**Data:** 2026-05-24  
**Branch:** `codex/cnpj-socios-todos-cnpjs`  
**PR:** `#285`  
**Contexto:** regressao de preview com poucos CNPJs no mapa, nome invalido `Cia Ltda` e texto dizendo mais CNPJs do que a UI renderizava.

## Tabela de Licoes

| # | Licao | Erro cometido | Como evitar | Severidade |
|---|---|---|---|---|
| 1 | Validar inventario, nao so label visual | A UI passou a rotular `Outro CNPJ do socio`, mas a API ainda retornava poucos CNPJs | Teste deve contar empresas retornadas/renderizadas por socio e cobrir fonte com muitos CNPJs | P0 |
| 2 | Texto do dossie nao pode prometer mais do que o grafo mostra | O texto dizia dezenas de CNPJs, mas o mapa usava subconjunto pequeno | Preview deve validar consistencia entre total textual, evidencias e nos do grafo | P0 |
| 3 | Prompt nao pode amostrar inventario societario | `teia-deep` permitia "mais relevantes" e limite fixo, escondendo CNPJs laterais | Proibir amostragem em CNPJ; exigir todos os CNPJs validos encontrados, com aviso de parcialidade quando houver limite operacional | P0 |
| 4 | CNPJ fallback precisa validar digito verificador | A extracao aceitava 14 digitos sintaticos quando lookup oficial falhava | Todo CNPJ extraido deve passar por `isValidCnpj`; lookup nao pode validar numero invalido por omissao | P0 |
| 5 | Fonte oficial tambem pode trazer nome inutil | `lookupCnpj` podia devolver `Cia Ltda`, que nao identifica empresa real | Sanitizar razao social oficial e substituir por nome inferido do bloco ou fallback `Empresa CNPJ ...` | P1 |
| 6 | Parser precisa normalizar acentos antes de mapear enum | `PÚBLICA` virava baixa confianca e podia ser descartada no grafo | Aplicar `normalizeText` antes de comparar confianca, fonte e cabecalhos | P1 |
| 7 | `partner_other_cnpj` nao pode colapsar por radical | CNPJs laterais com mesmo radical eram agregados como se fossem matriz/filial do grupo | Chave de grafo para `partner_other_cnpj` deve ser CNPJ exato; radical so vale para vinculo de grupo | P0 |
| 8 | Promocao de evidencia precisa preservar o vinculo mais forte | Um mesmo CNPJ podia entrar primeiro como lateral e depois nao ser promovido a `group_link` | Merge do grafo deve promover evidencia mais forte e criar aresta raiz somente quando o escopo justificar | P1 |
| 9 | Parcialidade deve aparecer no contrato de API e na UI | Quando a busca era truncada, o usuario via resultado pequeno sem saber que era parcial | Retornar `diagnostics.totalCnpjsFound/truncated/truncatedReason` e exibir aviso na UI | P1 |
| 10 | `validate-prompts.sh` deve ser gate antes de preview | A regressao teria sido mais visivel se prompt/parser/grafo estivessem no mesmo gate | Rodar `./scripts/validate-prompts.sh` antes de PR/preview sempre que mexer em prompt, parser ou grafo | P0 |
| 11 | Revisar as PRs recentes quando regressao volta em loop | A causa estava no encadeamento PR #279/#280/#285, nao em um arquivo isolado | Em regressao persistente, revisar pelo menos as duas ultimas PRs da area e a PR que introduziu o componente | P1 |
| 12 | Smoke de preview precisa validar comportamento de negocio | Preview anterior validava que nao duplicava filial, mas nao validava todos os CNPJs laterais | Smoke Scheffer deve checar ausencia de `Cia Ltda`, presenca de multiplos `Outro CNPJ do socio` e sem aresta raiz indevida | P0 |
| 13 | Checks verdes nao provam profundidade societaria | PR #285 ficou com Typecheck/Tests/Build/Vercel/Smoke verdes, mas `/api/socio-search` retornou 0 empresas para todos os 6 socios | Gate de merge precisa chamar a API real da preview e falhar quando o inventario vier todo vazio/degradado | P0 |
| 14 | Remover um provedor quebrado nao cria uma fonte boa | Brave estava quebrando com 402, mas DuckDuckGo-only passou a retornar `empty_result` no runtime Vercel | Diferenciar "removi dependencia ruim" de "restaurei profundidade"; validar fonte real antes de liberar | P0 |
| 15 | Diagnostico bom nao e resultado de produto | `searchFailureCount: 6` mostrou a causa melhor, mas o usuario continuou sem CNPJs dos socios | Tratar diagnostico como ferramenta de debug; merge so quando o comportamento final estiver correto | P1 |
| 16 | Comentario antigo de PR pode ficar perigoso | Comentarios diziam que a preview estava validada, mas validacoes posteriores contradisseram isso | Ao revalidar e encontrar regressao, postar novo comentario de status e marcar docs antigos como obsoletos | P1 |
| 17 | Metodo HTTP errado pode poluir validacao manual | Uma primeira tentativa via GET retornou 405 para `/api/open-web-search` e `/api/socio-search`, mas as rotas reais usam POST | Antes de registrar falha funcional, conferir contrato da rota e repetir pelo metodo real | P2 |

## Checklist de Prevencao

- Antes de mexer em Teia CNPJ, mapear o fluxo inteiro: prompt -> parser -> API -> grafo -> UI -> preview.
- Para qualquer mudanca em prompt/parser/grafo, rodar `./scripts/validate-prompts.sh`.
- Para qualquer mudanca em `/api/socio-search`, testar: CNPJ invalido, muitos CNPJs, nome oficial truncado, cache versionado e fallback sem lookup.
- Para qualquer mudanca no grafo, testar: `partner_other_cnpj` sem aresta raiz, `group_link` com aresta raiz e promocao de evidencia.
- Antes de concluir no preview, validar Scheffer `04.733.767/0001-80` com criterio visual e textual, nao apenas HTTP 200.
- Antes de mergear PR com API serverless, validar o metodo real (`POST` neste caso) e registrar payload/resposta resumida.
- Smoke Preview deve falhar se os 6 socios Scheffer retornarem `companies: 0`, mesmo com status HTTP 200.

## PRs que devem ser revisitadas quando a regressao reaparecer

| PR | Motivo |
|---|---|
| #279 | Introduziu SocietaryMap, `/api/socio-search` e drill-down; origem provavel de lacunas de contrato entre busca, grafo e UI |
| #280 | Ajustou/validou Teia e pode ter congelado a expectativa de poucos nos ou de fonte parcial |
| #285 | Hotfix atual; qualquer nova regressao deve comparar diff local com esta PR antes de criar outro workaround |

## Resultado esperado desta licao

A Teia CNPJ nao deve mais tratar "mostrar um label correto" como resolvido. O criterio de pronto e: todos os CNPJs validos encontrados para cada socio aparecem com escopo explicito, nomes sem identidade real nao entram, o usuario enxerga parcialidade e a validacao de preview confirma o comportamento no fluxo real.

## Nao resolvido em 2026-05-25

Validacao funcional da preview em 2026-05-25 09:30 -04 mostrou que o problema central continua aberto:

- `/api/cnpj?cnpj=04733767000180` funciona e retorna 6 socios da Scheffer.
- `/api/open-web-search` retorna `OpenWebSearch/DdgDegraded`, `duckduckgo empty_result`, `contentLength: 0`.
- `/api/socio-search` retorna `companies: 0` para todos os 6 socios, `degraded: true`, `pagesFetched: 0`, `searchFailureCount: 6`.
- PR #285 nao deve ser mergeada ate investigar fonte/provedor/cache e revalidar profundidade real.

O que ja foi feito e nao basta: parser mais rigido, grafo com escopo correto, CNPJ pendente com `*`, Mermaid tracejado, remocao do Brave, diagnostico de falha e checks verdes. O gargalo restante esta antes do parser/grafo: a camada de busca nao entrega paginas/texto/CNPJs para processar.

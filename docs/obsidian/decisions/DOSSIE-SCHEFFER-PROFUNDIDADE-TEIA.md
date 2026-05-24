---
type: decisao-registrada
area: dossie
status: em-andamento
data: 2026-05-23
branch: codex/teia-societaria-tipo5
relacionados:
  - TEIA-SOCIETARIA-ENRIQUECIMENTO
  - MELHORIAS-DOSSIE-RAG
tags:
  - dossie
  - teia-societaria
  - prompt
  - rag
  - scheffer
  - evidencias
---

# Dossie Profundo Scheffer — Teia Societaria como Inteligencia

Voltar para [[DECISIONS-Index]] | [[TEIA-SOCIETARIA-ENRIQUECIMENTO]] | [[MELHORIAS-DOSSIE-RAG]].

## Decisao

A teia societaria nao deve ser tratada como apenas um quadro visual. Ela deve ser o primeiro modulo de inteligencia do dossie, com a mesma profundidade observada no fluxo real da Scheffer:

- massa real do grupo economico;
- CNPJs principais e veiculos operacionais;
- QSA oficial e socios relevantes;
- holdings, filiais, unidades, verticais e operacao internacional;
- mapa Mermaid LR como sintese visual do `SocietaryMap`;
- evidencias, nivel de confianca e implicacao comercial.

O componente `SocietaryMap` entra como camada visual e interativa. Os prompts modulares (1a + 1b) e o waterfall continuam responsaveis pela profundidade analitica.

## Evidencia da validacao real

Validacao feita na preview da PR #279:

- Preview Vercel `scoutagro-git-codex-teia-soci-0ba06d-brunolimaff-3629s-projects.vercel.app` estava `READY` no commit `13a113393974b2f3031f4f4d6ad6c68c6fddd72c`.
- Fluxo Chrome pelo botao demo "Grupo Scheffer" gerou dossie completo, score PORTA `78/100`, segmento `AGI` e `74` modulos Senior.
- O Modulo 1 saiu como `DOSSIÊ: TEIA SOCIETÁRIA E MASSA REAL - GRUPO SCHEFFER`, com:
  - cabeca do grupo;
  - total de CNPJs mapeados;
  - area estimada;
  - presenca internacional;
  - tabela mestre de CNPJs;
  - mapa de poder societario;
  - sinais de enterprise invisivel;
  - gatilhos de abordagem.
- O mapa LR renderizou `Scheffer Colombia SAS` conectado como expansao internacional.
- `/api/cnpj?cnpj=04733767000180`, via `vercel curl`, retornou QSA oficial com 6 participantes, incluindo `SCHEFFER PARTICIPACOES S/A`.
- `/api/socio-search`, na mesma preview, retornou degradado com `Cache persistente societario nao configurado.`. Portanto, o drill-down server-side ainda depende de configurar `SUPABASE_SERVICE_ROLE_KEY` na Vercel.

## Problema a evitar

Sem ajuste de prompt/waterfall, a UI pode mostrar um mapa correto, mas o dossie pode ficar raso:

- raiz -> socios -> empresas sem leitura executiva;
- ausencia de "massa real" e de CNPJs operacionais;
- perda de operacoes internacionais como Scheffer Colombia;
- gatilhos comerciais genericos;
- conexoes visuais sem disciplina de evidencia.

O alvo nao e "desenhar melhor". O alvo e o vendedor enxergar a estrutura real de poder, escala e oportunidade.

## Arquitetura Aprovada: Sub-modulos Progressivos

Apos revisao de design, a abordagem de prompt unico foi substituida por sub-modulos progressivos:

### Modulo 1a — Identidade (obrigatorio, temp 0.1)

**Cobertura:**
1. Visao geral do grupo economico real (cabeca, CNPJ raiz, total CNPJs, area, faturamento, segmento)
4. Referencia ao SocietaryMap (sem gerar Mermaid — o componente visual e responsavel)

**Gateway de complexidade embutido:**
- `[[TEIA_COMPLEXIDADE:BAIXA]]` — ≤3 CNPJs E ≤2 socios E sem holding
- `[[TEIA_COMPLEXIDADE:MEDIA]]` — 4-8 CNPJs OU socios multiplos OU holding simples
- `[[TEIA_COMPLEXIDADE:ALTA]]` — 9+ CNPJs OU holdings em cascata OU operacao internacional

**Emite:** `PORTA_FEED_P`, `PORTA_SEG`

### Modulo 1b — Profundidade (condicional, temp 0.2)

So executa se complexidade MEDIA ou ALTA.

**Cobertura:**
2. Tabela mestre de CNPJs
3. QSA e poder societario
5. Sinais de enterprise invisivel
6. Implicacao comercial

**Regras de busca:**
- Exaustao: maximo 2 niveis de profundidade
- Comprovacao de conexao: mesmo CNPJ raiz (8 digitos) OU socio comum com CPF/qualificacao OU endereco fiscal + CNAE. Nome parecido NAO e suficiente.
- Fontes internacionais: mesma hierarquia, declarar idioma e confianca

### Fallback

`PROMPT_RADAR_EXPANSAO_GOD_MODE` mantido como fallback completo caso modulo 1a falhe.

### Matriz de responsabilidades

| Artefato | Faz | Nao faz |
|----------|-----|---------|
| SocietaryMap.tsx | UNICO grafo visual (Mermaid LR) | Analise, texto |
| Prompt modulo 1a | Analise textual (itens 1+4) | Mermaid (referencia o grafo) |
| Prompt modulo 1b | Profundidade (itens 2,3,5,6) | Mermaid |
| PROMPT_RADAR_EXPANSAO_GOD_MODE | Fallback se 1a falhar | Nao chamado na rota normal |

### Contornos para alucinacao CNPJ (3 camadas)

1. **Prompt:** Regra explicita de CNPJ (ja aplicada no Bloco A)
2. **Pos-geracao:** Validador no waterfall-orchestrator — extrai CNPJs, cruza com QSA, alerta se >30% nao confirmados
3. **UI:** SocietaryMap so renderiza CNPJs validados

## Contrato dos modulos

### Modulo 1a — Contrato de saida

```
# TEIA SOCIETARIA: VISAO GERAL DO GRUPO - [EMPRESA]

**Visao Geral do Grupo Economico Real**
- Cabeca do Grupo: [holding/matriz]
- CNPJ Raiz: [##.###.###/####-##]
- Total de CNPJs mapeados: [X]
- Faturamento Consolidado: [fonte ou estimativa]
- Area total estimada: [X ha]
- Capacidade estatica: [X ton]
- Segmento inferido: [PRD/AGI/COP] — Justificativa
- Nivel de Complexidade Societaria: [ALTO/MEDIO/BAIXO]
- Mapa Interativo: Consulte o grafico SocietaryMap na interface.

[[TEIA_COMPLEXIDADE:BAIXA/MEDIA/ALTA]]
[[PORTA_FEED_P:...]]
[[PORTA_SEG:...]]
```

### Modulo 1b — Contrato de saida

```
## Tabela Mestre de CNPJs
| CNPJ | Razao Social | Relacao | CNAE | Fonte | Confianca |

## QSA e Poder Societario
- Socios oficiais com qualificacao
- Empresas relacionadas
- Controle estimado
- Risco de homonimo

## Sinais de Enterprise Invisivel
- Verticalizacao, logistica, internacionalizacao, industrias, gaps

## Implicacao Comercial
- Por que a estrutura aumenta prioridade
- Dores comerciais
- Perguntas de reuniao
- Oferta ou wedge Senior
```

## Regras de prompt (aplicam-se a 1a e 1b)

O prompt do modulo de teia deve dizer explicitamente:

- Nao entregue apenas organograma ou lista de socios.
- Trate teia societaria como "massa real + poder + oportunidade comercial".
- Priorize fontes nessa ordem: QSA/CNPJ oficial, CRM Senior, RAG interno, docs Senior, web publica, inferencia.
- Quando nao houver percentual societario, declarar `CLASSIFICACAO ESTIMADA`.
- Quando uma empresa aparecer apenas por nome de socio, nao conectar como fato; marcar como risco de homonimo ou evidencia rejeitada.
- Quando houver operacao internacional com fonte publica, preservar a entidade no dossie e no mapa.
- Se o drill-down estiver degradado, manter o modulo textual com o que for confirmado e indicar lacunas.

## Alinhamento com [[MELHORIAS-DOSSIE-RAG]]

Esta decisao depende do plano RAG/contexto para sair do caso Scheffer e virar padrao:

- A1 deve levar RAG, concorrentes e PORTA state ao waterfall.
- B1 deve permitir query especifica por modulo.
- Para o modulo de teia, a query base e `holding socios QSA grupo economico [empresa]`.
- A temperatura do modulo de teia deve ser `0.1` para 1a e `0.2` para 1b.
- O contexto adicional deve ser truncado e marcado por fonte para evitar mistura entre CRM, RAG e web.

## Relacao com [[TEIA-SOCIETARIA-ENRIQUECIMENTO]]

A PR #279 ja resolve a camada visual/dados basica:

- QSA no pipeline CNPJ;
- `SocietaryMap`;
- `societaryGraph`;
- `/api/socio-search`;
- Mermaid LR;
- evidencias no componente;
- fallback textual preservado.

Este documento complementa a PR com o contrato de profundidade do dossie e a nova arquitetura de sub-modulos progressivos. A teia visual continua subordinada aos modulos 1a/1b, que sao a fonte da analise textual.

## Exemplo de forma esperada

```
graph LR
  A["Scheffer & Cia (Matriz)"] --> B["Filiais MT"]
  A --> C["Scheffer Bio"]
  A --> D["Scheffer Logistica"]
  A --> E["Scheffer Sementes"]
  A -.->|Expansao internacional| F["Scheffer Colombia SAS"]
```

Esse mapa e gerado exclusivamente pelo `SocietaryMap`. Os modulos 1a/1b nao geram Mermaid — apenas referenciam o componente.

## Implementacao

### Fatia 0 — Ambiente (ja feito na PR #279)

- QSA no pipeline CNPJ
- SocietaryMap com Mermaid LR
- /api/socio-search server-side

### Fatia 1 — Prompts (EM IMPLEMENTACAO)

- `prompts/mega/teia-identity.ts` — Modulo 1a (identidade + gateway)
- `prompts/mega/teia-deep.ts` — Modulo 1b (profundidade)

### Fatia 2 — Waterfall (EM IMPLEMENTACAO)

- Integracao dos modulos 1a/1b no orquestrador
- Gateway de complexidade decide se chama 1b
- Fallback para PROMPT_RADAR_EXPANSAO_GOD_MODE
- Validador de CNPJ pos-geracao
- Temperatura via DossierModuleOptions

### Fatia 3 — UI

- Manter `SocietaryMap` como complemento visual.
- Nao remover a tabela textual nem os gatilhos comerciais.
- Quando a API degradar, exibir fallback e lacuna com linguagem de negocio.

## Criterios de aceite

- Dossie Scheffer com CNPJ `04.733.767/0001-80` continua exibindo `Scheffer Colombia SAS`.
- O modulo 1a contem visao geral + referencia ao SocietaryMap.
- O modulo 1b executa apenas quando complexidade MEDIA ou ALTA.
- O modulo 1b contem tabela mestre, QSA, sinais e implicacao comercial.
- QSA oficial aparece como evidencia oficial.
- Empresas conectadas por drill-down exibem fonte e confianca.
- Homonimos nao entram como conexao visual.
- >30% de CNPJs nao confirmados geram alerta no dossie.
- Se module 1a falhar, fallback para PROMPT_RADAR_EXPANSAO_GOD_MODE.
- `npm run typecheck`, recorte Vitest afetado e `npm run docs:obsidian:check` passam antes de PR.

## Riscos

| Risco | Mitigacao |
|---|---|
| Prompt 1a + 1b grande e caro | 1a e enxuto (~8K tokens), 1b so executa se necessario |
| LLM inventar empresa | Prioridade de fonte e regra de nao conectar sem evidencia |
| Gateway de complexidade falhar | Fallback para PROMPT_RADAR_EXPANSAO_GOD_MODE |
| Dependencia de scraping | Cache persistente obrigatorio em producao |
| Casos menores ficarem inflados | 1a entrega apenas visao geral; 1b nao executa em BAIXA |

## Proximo passo

Implementar a Fatia 1 (prompts 1a e 1b) e Fatia 2 (waterfall), validar com `npm run typecheck` e testes, depois testar no preview Vercel com o caso Scheffer.

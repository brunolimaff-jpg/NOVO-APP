---
grok_wiki: true
page_id: "page-socio-search-reference"
title: "Busca societária"
repository: "local/NOVO-APP"
branch: "default"
generated_at: "2026-06-08T23:39:43.629Z"
source_files:
  - "api/socio-search.ts"
  - "services/socio-search/types.ts"
  - "services/socio-search/orchestration.ts"
  - "services/socio-search/scoring.ts"
  - "services/socio-search/parser.ts"
  - "services/socio-search/cache.ts"
  - "tests/api-socio-search.test.ts"
---

---
title: "Busca societária"
description: "Request schema, resposta estruturada, cache em memória e persistente, deadline, enriquecimento por CNPJ, trace diagnostics e razões de rejeição."
---

`POST /api/socio-search` é a rota serverless Node.js que faz o drill-down de um sócio da empresa raiz, retorna CNPJs relacionados com escopo explícito e alimenta a Teia societária sem expor chamadas diretas de lookup cadastral no browser.

## Superfície da API

:::endpoint POST /api/socio-search Busca empresas associadas a um sócio

A rota aceita somente `POST`, aplica headers básicos de segurança, valida o corpo com Zod e responde `200` mesmo quando a busca externa degrada. Erros de contrato retornam `400`; método diferente de `POST` retorna `405`.

<ParamField body="socioName" type="string" required>
Nome do sócio investigado. Mínimo de 3 e máximo de 160 caracteres.
</ParamField>

<ParamField body="rootCompanyName" type="string" required>
Razão social ou nome da empresa raiz. Mínimo de 2 e máximo de 180 caracteres.
</ParamField>

<ParamField body="rootCnpj" type="string">
CNPJ da empresa raiz. É normalizado antes de entrar na chave de cache e nas regras de escopo.
</ParamField>

<ParamField body="trace" type="boolean">
Quando `true`, adiciona `trace` com detalhes de cache, provedores, totais e rejeições agrupadas.
</ParamField>

<RequestExample>

```json
{
  "socioName": "Guilherme M. Scheffer",
  "rootCompanyName": "Scheffer & Cia Ltda",
  "rootCnpj": "04.733.767/0001-80",
  "trace": true
}
```

</RequestExample>

<ResponseExample>

```json
{
  "companies": [
    {
      "name": "E.Z.M.S. Participações Ltda",
      "cnpj": "09567366000111",
      "partnerName": "Guilherme M. Scheffer",
      "sourceUrl": "https://cnpjaberto.com.br/09567366000111",
      "sourceTitle": "CNPJ Aberto — E.Z.M.S. Participações Ltda",
      "snippet": "E.Z.M.S. Participações Ltda — CNPJ 09.567.366/0001-11 — Sócio-administrador",
      "confidence": "strong",
      "evidenceType": "qsa",
      "relationshipScope": "partner_other_cnpj",
      "validationStatus": "official",
      "rootContext": false,
      "rootCompanyName": "Scheffer & Cia Ltda",
      "rootCnpj": "04733767000180",
      "role": "Holdings de instituições não-financeiras",
      "sourceDepth": "cnpj_lookup",
      "sourceProvider": "cnpj_aberto",
      "evidenceBasis": "official_qsa_owner_search",
      "claimType": "socio_participation",
      "rootRelationStatus": "not_supported",
      "operationalThesisAllowed": false
    }
  ],
  "rejected": [],
  "degraded": false,
  "cached": false,
  "diagnostics": {
    "queriesRun": ["cnpjaberto.com/companies_by_owner"],
    "pagesFetched": 0,
    "cacheSource": "none",
    "rejectedCount": 0,
    "cnpjsEnriched": 1,
    "totalCnpjsFound": 1
  },
  "trace": {
    "enabled": true,
    "cache": {
      "required": false,
      "configured": false,
      "status": "miss",
      "source": "none"
    },
    "providers": [
      {
        "provider": "cnpj_aberto",
        "attempted": true,
        "returnedCount": 1,
        "acceptedCount": 1,
        "rejectedCount": 0
      }
    ],
    "totals": {
      "companiesCount": 1,
      "rejectedCount": 0,
      "pagesFetched": 0,
      "cnpjsEnriched": 1,
      "cnpjsFound": ["09567366000111"],
      "queriesRun": ["cnpjaberto.com/companies_by_owner"],
      "degraded": false,
      "truncated": false,
      "searchNoResultCount": 0,
      "searchFailureCount": 0
    },
    "rejectedByReason": {}
  }
}
```

</ResponseExample>

:::

## Semântica da resposta

| Campo | Tipo | Contrato |
| --- | --- | --- |
| `companies` | `SocioSearchCompany[]` | Empresas aceitas para renderização ou validação posterior. |
| `rejected` | `RejectedSocioSearchResult[]` | Fontes descartadas com `reason`, `sourceTitle`, `sourceUrl` e `snippet` quando disponíveis. |
| `degraded` | `boolean` | `true` quando a busca não encontrou empresas por falha/ausência de fonte, ou quando o resultado foi truncado. |
| `cached` | `boolean` | `true` quando a resposta veio de cache em memória ou persistente. |
| `diagnostics` | `object` | Contadores operacionais sempre úteis para debug sem habilitar `trace`. |
| `trace` | `object` | Presente apenas quando o request envia `trace: true`. |

### Escopos de relacionamento

| Valor | Significado operacional | Efeito na Teia |
| --- | --- | --- |
| `group_link` | Há contexto suficiente para ligar a empresa ao grupo raiz. | Pode criar vínculo raiz ↔ empresa. |
| `partner_other_cnpj` | O CNPJ pertence ao sócio, mas não há prova independente de grupo econômico. | Entra como “Sócio admin” sem promover tese de grupo. |
| `unconfirmed` | O CNPJ foi extraído de texto, mas não recebeu confirmação oficial. | Entra como pendente, com `rawCnpjLabel` e `validationStatus: "pending"`. |

<Warning>
Oficialidade em QSA confirma a relação `sócio -> CNPJ`; não confirma, sozinha, que o CNPJ pertence ao grupo econômico da empresa raiz.
</Warning>

## Pipeline de busca

```text
SocietaryMap
  -> POST /api/socio-search por sócio, em lotes de 5
      -> cache persistente, quando configurado
      -> cache em memória
      -> runSearch()
          -> CNPJ Aberto estruturado, PF apenas
          -> consultasocio.com direto, PF apenas e como fallback
          -> queries web genéricas
              -> Gemini Search Grounding se GEMINI_API_KEY existir
              -> DuckDuckGo Lite como fallback
          -> abertura controlada de páginas candidatas
          -> extração de CNPJs válidos
          -> lookup oficial server-side para até 5 CNPJs
```

A busca estruturada por CNPJ Aberto depende de `CNPJABERTO_API_KEY`. A busca web genérica é BYOK: usa `GEMINI_API_KEY` quando disponível para encontrar URLs com grounding e mantém fallback para DuckDuckGo Lite. O contrato da rota não depende de um provedor único; a ausência ou falha de fonte aparece em `degraded`, `diagnostics.searchFailureCount`, `diagnostics.searchNoResultCount` e `trace.providers`.

## Cache e persistência

| Item | Valor atual |
| --- | --- |
| TTL | 7 dias |
| Limite do cache em memória | 250 entradas |
| Versão da chave | `v7-structured-lateral-cnpj` |
| Operador do cache persistente | `server:socio-search` |
| Tabela persistente | `extract_cache` |
| ID persistente | `socio-search:${cacheKey}` |

A chave usa `rootCnpj` normalizado quando disponível; caso contrário usa `rootCompanyName` normalizado, mais `socioName` normalizado. Payload persistido remove `trace` antes da gravação.

Em `VERCEL=1` ou `NODE_ENV=production`, o cache persistente é considerado requerido, mas a rota não bloqueia a busca viva quando `SUPABASE_SERVICE_ROLE_KEY` ou URL Supabase não estão configuradas. Se o cache persistente falhar, a resposta pode continuar vindo da busca em tempo real e depois cair para cache volátil em memória.

<Note>
A chave pública anon do Supabase não habilita cache server-side. A leitura/gravação persistente usa `SUPABASE_URL` ou `VITE_SUPABASE_URL` junto com `SUPABASE_SERVICE_ROLE_KEY`.
</Note>

## Limites, deadline e truncamento

| Constante | Valor | Uso |
| --- | ---: | --- |
| `maxDuration` | `60s` | Limite da função Vercel. |
| `SEARCH_DEADLINE_MS` | `45000` | Budget total do `runSearch`. |
| `CNPJ_LOOKUP_TIMEOUT_MS` | `3500` | Timeout máximo por lookup oficial dentro do budget restante. |
| `MAX_CNPJ_LOOKUPS` | `5` | Limite global de enriquecimentos oficiais por execução. |
| `PAGE_FETCH_LIMIT` | `4` | Máximo de páginas candidatas abertas. |
| `PAGE_EXTRACT_LIMIT` | `6000` | Limite de texto extraído por página. |
| `MAX_COMPANIES` | `60` | Máximo de empresas retornadas. |

Quando a fonte contém mais CNPJs do que o limite operacional, a rota retorna `diagnostics.truncated: true`, `diagnostics.truncatedReason: "company_limit"` e `degraded: true`. Quando o deadline encerra uma busca que já tem resultados parciais, o motivo pode ser `"deadline"`.

## Razões de rejeição

`rejected` preserva descartes importantes para auditoria e UI, especialmente quando `companies` vem vazio.

| Caso | Razão esperada |
| --- | --- |
| Evidência fraca ou homônimo | `Possivel homonimo sem CNPJ valido ou fonte societaria suficiente.` |
| Texto declara ausência de conexão | `Possivel homonimo sem contexto suficiente do socio.` |
| CNPJ Aberto sem CNPJ válido | `CNPJ Aberto retornou empresa sem CNPJ valido.` |
| Situação cadastral baixada/inativa | `CNPJ baixado/inativo na Receita: ...` |
| QSA oficial não contém o sócio pesquisado | `QSA oficial nao confirma o socio ... neste CNPJ.` |
| Lookup oficial indisponível, mas CNPJ textual válido | Empresa pendente com `relationshipScope: "unconfirmed"` e `rawCnpjLabel` com `*`. |

## Diagnósticos e trace

`diagnostics` fica no payload padrão e deve ser usado para triagem rápida:

| Campo | Interpretação |
| --- | --- |
| `queriesRun` | Fontes e queries executadas. |
| `pagesFetched` | Quantidade de páginas candidatas abertas. |
| `cacheSource` | `none`, `memory` ou `persistent`. |
| `rejectedCount` | Total de itens rejeitados. |
| `cnpjsEnriched` | CNPJs que passaram por lookup oficial. |
| `totalCnpjsFound` | CNPJs válidos encontrados antes de limites de enriquecimento. |
| `searchNoResultCount` | Buscas que responderam “Nenhum resultado encontrado”. |
| `searchFailureCount` | Buscas/fontes indisponíveis. |
| `truncated` | Resultado parcial por limite operacional. |
| `truncatedReason` | `company_limit` ou `deadline`. |

`trace` adiciona detalhes por provedor e só deve ser enviado quando o rastreamento for necessário. A Teia envia `trace: true` quando o rastreador `teia` está ativo, por exemplo via `localStorage.scoutTrace = "teia"`.

## Consumo pela Teia societária

`SocietaryMap` primeiro resolve a empresa raiz via `fetchCompanyByCnpj`, que passa por `/api/cnpj`. Depois chama `/api/socio-search` para cada sócio, em batches de 5, e aplica cada resultado incrementalmente na UI. O frontend não chama `lookupCnpj` direto, porque esse helper é server-only e acessa BrasilAPI, CNPJ.ws e MinhaReceita fora do proxy.

Após montar o grafo, o enriquecimento de CNAE também usa `fetchCompanyByCnpj` via `/api/cnpj`, em tempo ocioso, com limite de 24 CNPJs. Isso evita CORS e reduz bloqueio de main thread depois do waterfall.

## Operação local e produção

No `npm run dev`, o Vite escuta na porta `3000` e inclui `/api/socio-search` no proxy local de APIs. Por padrão, esse proxy aponta para `https://scoutagro.vercel.app`; `LOCAL_DEV_API_PROXY_TARGET` pode trocar o alvo. Se `VERCEL_AUTOMATION_BYPASS_SECRET` existir, o proxy envia `x-vercel-protection-bypass`.

Variáveis relevantes:

| Variável | Obrigatória | Efeito |
| --- | --- | --- |
| `CNPJABERTO_API_KEY` | Não | Habilita fonte estruturada de empresas por sócio. |
| `GEMINI_API_KEY` | Não para o schema | Habilita busca de URLs por grounding antes do fallback DuckDuckGo. |
| `SUPABASE_URL` ou `VITE_SUPABASE_URL` | Só para cache persistente | Base REST do Supabase para `extract_cache`. |
| `SUPABASE_SERVICE_ROLE_KEY` | Só para cache persistente | Chave server-side para ler/gravar cache. |
| `VITE_SCOUT_DIAGNOSTICS_ENABLED` | Não | Ativa flush de eventos `scoutDiag` para `/api/gemini`. |
| `VITE_VERBOSE_LOGS` | Não | Aumenta visibilidade de logs informativos. |

## Validação recomendada

<Steps>
<Step title="Validar contrato da rota">
Execute o recorte de testes da API:

```bash
npm exec vitest run tests/api-socio-search.test.ts
```
</Step>

<Step title="Validar consumo na Teia">
Quando a mudança afetar campos usados pelo grafo ou pela UI, rode também:

```bash
npm exec vitest run tests/features/dossier/SocietaryMap.test.tsx tests/features/dossier/societaryGraph.test.ts
```
</Step>

<Step title="Validar tipos">
Finalize com:

```bash
npm run typecheck
```
</Step>
</Steps>

Para smoke manual, use sempre `POST`. Um `GET` em `/api/socio-search` retorna `405` e não mede a busca societária.

## Troubleshooting

| Sintoma | Checagem |
| --- | --- |
| `400 Invalid request` | Verifique tamanho mínimo de `socioName` e `rootCompanyName`. |
| `405 Method not allowed` | A rota só aceita `POST`. |
| `companies: []` com `degraded: true` | Compare `searchFailureCount`, `searchNoResultCount` e `queriesRun`. Falha de fonte e ausência de resultado são diagnósticos diferentes. |
| Resultado antigo após mudança semântica | Verifique `CACHE_KEY_VERSION`; mudança de significado em campos de escopo exige nova versão. |
| CNPJ aparece com `*` | O CNPJ foi extraído de texto, mas não confirmado por lookup oficial dentro do budget. |
| `partner_other_cnpj` parece empresa do grupo | Não promova pelo frontend. Esse escopo representa CNPJ do sócio, não tese de grupo. |
| Cache persistente não grava | Confirme `SUPABASE_SERVICE_ROLE_KEY`; a rota pode continuar servindo busca viva e cache volátil. |

## Related pages

<CardGroup>
<Card title="Teia societária" href="/teia-societaria">
Modelo de grafo, escopos `group_link`, `partner_other_cnpj`, `unconfirmed` e renderização visual.
</Card>
<Card title="Referência de APIs serverless" href="/api-serverless-reference">
Contratos gerais das rotas `api/*.ts`, validação, headers e comportamento degradado.
</Card>
<Card title="Configurar Supabase" href="/configurar-supabase">
Variáveis, tabelas críticas e persistência usada pelo cache server-side.
</Card>
<Card title="Observabilidade e diagnósticos" href="/observabilidade">
`scoutDiag`, traces, flush para Supabase e leitura de sinais operacionais.
</Card>
</CardGroup>

## Related pages

- page-teia-societaria
- page-api-serverless-reference


## Source files

- `api/socio-search.ts`
- `services/socio-search/types.ts`
- `services/socio-search/orchestration.ts`
- `services/socio-search/scoring.ts`
- `services/socio-search/parser.ts`
- `services/socio-search/cache.ts`
- `tests/api-socio-search.test.ts`

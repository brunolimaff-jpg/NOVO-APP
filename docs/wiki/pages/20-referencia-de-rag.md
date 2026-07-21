---
grok_wiki: true
page_id: 'page-rag-reference'
title: 'Referência de RAG'
description: 'Contratos de `/api/rag` e `/api/docs-rag`, namespaces permitidos, thresholds, sinal sem documentação, cliente `ragService` e uso no War Room.'
repository: 'local/NOVO-APP'
branch: 'default'
generated_at: '2026-06-08T23:39:43.629Z'
source_files:
  - 'services/ragService.ts'
  - 'api/rag.ts'
  - 'api/docs-rag.ts'
  - 'services/war-room/retrieval.ts'
  - 'scripts/ingestPdfDocs.ts'
  - 'tests/api-docs-rag.test.ts'
  - 'tests/services/ragService.test.ts'
---

> **Ciclo atual:** `/api/rag` e o índice Pinecone permanecem preservados. `/api/docs-rag` era exclusivo do War Room e foi removida da aplicação ativa; o conteúdo abaixo dessa rota é histórico.

A superfície de RAG do Senior Scout 360 passa por duas Vercel Functions (`/api/rag` e `/api/docs-rag`) e por um cliente browser-safe em `services/ragService.ts`; a UI não fala direto com Pinecone nem com o provedor de embeddings.

## Superfície implementada

| Camada         | Arquivo                          | Responsabilidade                                                                                        |
| -------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------- |
| API global     | `api/rag.ts`                     | Busca contexto amplo no Pinecone, opcionalmente dentro de `PINECONE_NAMESPACE`.                         |
| API documental | `api/docs-rag.ts`                | Busca documentação indexada em namespaces permitidos e só retorna contexto textual evidencial.          |
| Cliente        | `services/ragService.ts`         | Normaliza query, aplica timeout de 15s, retry em 5xx e traduz vazio/sinal sem docs para `failed: true`. |
| War Room       | `services/war-room/retrieval.ts` | Cacheia, combina, filtra, prioriza e injeta blocos estáticos antes do prompt.                           |
| Ingestão       | `scripts/*Ingest*.ts`            | Gera embeddings `RETRIEVAL_DOCUMENT` e faz upsert no Pinecone.                                          |

<Note>
O contrato público do frontend é o endpoint interno e o retorno `{ context, failed }`. Hoje a implementação usa Gemini embeddings e Pinecone, mas a UI fica portável se outro provedor preservar os formatos de request, response e metadata.
</Note>

## Endpoints

:::endpoint POST /api/rag Contexto global de propostas/base interna

`/api/rag` aceita apenas `POST`, roda em runtime `nodejs` e define `maxDuration = 60`. A rota aplica headers comuns de segurança e sempre degrada falhas internas para HTTP 200 com contexto vazio.

<ParamField body="query" type="string" required>
Texto de busca. Deve ter entre 1 e 10000 caracteres.
</ParamField>

<RequestExample>

```bash
curl -X POST http://localhost:3000/api/rag \
  -H 'Content-Type: application/json' \
  -d '{"query":"Senior ERP agronegócio gestão de safra"}'
```

</RequestExample>

A rota usa `gemini-embedding-001` com `taskType: "RETRIEVAL_QUERY"`, consulta `topK: 8` com metadata e mantém apenas matches com `score > 0.35`.

<ResponseField name="context" type="string">
Blocos unidos por `\n\n---\n\n`, no formato `[Proposta: <metadata.source>]\n<metadata.text>`.
</ResponseField>

<ResponseField name="degraded" type="boolean">
Presente como `true` quando a rota capturou erro interno e respondeu sem interromper o fluxo.
</ResponseField>

<ResponseExample>

```json
{
  "context": "[Proposta: proposta-agro]\nConteúdo relevante do match..."
}
```

</ResponseExample>

Erros de método retornam `405`. Body inválido retorna `400`. Falha de chave, embedding ou Pinecone retorna `200` com:

```json
{
  "context": "",
  "degraded": true,
  "detail": "mensagem resumida"
}
```

:::

:::endpoint POST /api/docs-rag Documentação indexada para War Room

`/api/docs-rag` aceita `POST`, roda em runtime `nodejs`, usa `maxDuration = 60` e restringe a consulta a namespaces permitidos. A rota existe para contexto documental verificável, não para completar respostas com matches fracos.

<ParamField body="query" type="string" required>
Texto de busca. Deve ter entre 1 e 10000 caracteres.
</ParamField>

<ParamField body="namespace" type="string">
Opcional. Quando informado, sobrescreve o namespace configurado, mas precisa estar na allowlist.
</ParamField>

Namespaces aceitos:

| Namespace         | Uso                                              |
| ----------------- | ------------------------------------------------ |
| `senior-erp-docs` | Documentação Senior, padrão da rota.             |
| `competitor-pdfs` | PDFs de concorrentes, usado no modo `benchmark`. |

<RequestExample>

```bash
curl -X POST http://localhost:3000/api/docs-rag \
  -H 'Content-Type: application/json' \
  -d '{"query":"ERP Banking CNAB conciliação","namespace":"senior-erp-docs"}'
```

</RequestExample>

A rota usa `gemini-embedding-001` com `taskType: "RETRIEVAL_QUERY"`, consulta `topK: 8` e mantém matches com `score >= 0.6`. O contexto só é montado quando o match tem `metadata.text` ou `metadata.content`.

<ResponseField name="context" type="string">
Blocos textuais no formato `### <categoria>: <titulo>\n<texto>\n(Fonte: <url>)`.
</ResponseField>

<ResponseField name="matches" type="array">
Lista de metadata dos matches retornados pelo Pinecone. É útil para diagnóstico, mas o texto evidencial vem de `context`.
</ResponseField>

<ResponseExample>

```json
{
  "context": "### ERP Banking: Integração bancária\nTexto indexado confiável.\n(Fonte: https://documentacao.senior.com.br/... )",
  "matches": [
    {
      "categoria": "ERP Banking",
      "titulo": "Integração bancária",
      "text": "Texto indexado confiável.",
      "url": "https://documentacao.senior.com.br/..."
    }
  ]
}
```

</ResponseExample>

Quando não há vetor, matches, score suficiente ou match textual, a rota retorna:

```json
{
  "context": "[SEM DOCUMENTAÇÃO ENCONTRADA — NÃO complete com suposições. Informe que não há dados verificados disponíveis.]"
}
```

Namespace inválido retorna `400` com a allowlist:

```json
{
  "error": "Invalid namespace",
  "allowed": ["senior-erp-docs", "competitor-pdfs"]
}
```

:::

## Configuração

| Variável                  | Usada por                                        | Default/fallback                                                 |
| ------------------------- | ------------------------------------------------ | ---------------------------------------------------------------- |
| `GEMINI_API_KEY`          | `/api/rag`, `/api/docs-rag`, scripts de ingestão | Obrigatória nas APIs.                                            |
| `PINECONE_API_KEY`        | `/api/rag`, fallback de `/api/docs-rag`          | Obrigatória se não houver chave docs.                            |
| `PINECONE_DOCS_KEY`       | `/api/docs-rag`, scripts de docs                 | Preferida para docs; fallback de `/api/rag`.                     |
| `PINECONE_INDEX`          | `/api/rag`, fallback de `/api/docs-rag`          | `scout-arsenal` se vazio, segredo `pcsk_*` ou nome inválido.     |
| `PINECONE_DOCS_INDEX`     | `/api/docs-rag`, scripts de ingestão             | `scout-arsenal`.                                                 |
| `PINECONE_NAMESPACE`      | `/api/rag`, fallback docs                        | Opcional em `/api/rag`; fallback para docs.                      |
| `PINECONE_DOCS_NAMESPACE` | `/api/docs-rag`, `ingestPdfDocs`                 | Default docs: `senior-erp-docs`; default PDF: `competitor-pdfs`. |
| `GEMINI_OCR_MODEL`        | `scripts/ingestPdfDocs.ts`                       | `gemini-3-flash-preview`.                                        |

<Warning>
Não configure chaves Pinecone com prefixo `VITE_` para o fluxo de API. Os endpoints usam variáveis server-side; variáveis `VITE_*` podem entrar no bundle do frontend.
</Warning>

## Cliente `ragService`

`buscarContextoPinecone(query, empresaAlvo?)` chama `/api/rag`. Quando `empresaAlvo` existe, a query enviada vira `<empresaAlvo> <query>`.

`buscarContextoDocsPinecone(query, namespace?)` chama `/api/docs-rag`. O campo `namespace` só entra no payload quando foi passado explicitamente.

Comportamento comum:

| Regra                              | Valor                                            |
| ---------------------------------- | ------------------------------------------------ |
| Timeout browser                    | `15000ms` via `AbortController`.                 |
| Tamanho máximo da query no cliente | `9500` caracteres após normalização de espaços.  |
| Retry                              | Uma nova tentativa apenas para respostas `5xx`.  |
| Retorno de sucesso                 | `{ context: string, failed: false }`.            |
| Retorno degradado                  | `{ context: "", failed: true }`.                 |
| Sinal sem docs                     | Convertido para `failed: true` e contexto vazio. |

## Uso no War Room

`loadWarRoomDocsContext(mode, message, flags, onStatus?)` só consulta RAG nos modos `tech` e `benchmark`.

| Modo                        | Namespaces documentais                | Base global                 |
| --------------------------- | ------------------------------------- | --------------------------- |
| `tech`                      | `senior-erp-docs`                     | Também consulta `/api/rag`. |
| `benchmark`                 | `senior-erp-docs` e `competitor-pdfs` | Também consulta `/api/rag`. |
| `killscript` / `objections` | Não consulta                          | Não consulta                |

O War Room cria queries adicionais quando detecta intenção de Fercus, talhão, processo agrícola, GAtec agrícola ou ERP Banking. Depois combina os blocos, remove duplicatas exatas, limita o contexto a `6000` caracteres e aplica filtros contra ruído como páginas 404 e customizações HCM fora de foco.

Se houver contexto, o prompt recebe:

```text
## DOCUMENTAÇÃO OFICIAL (USE PARA EMBASAR)

<contexto RAG>

---

## PERGUNTA DO USUÁRIO
"..."
```

Se o contexto ficar vazio ou alguma consulta falhar parcialmente, `docsUnavailable` vira `true`. `queryWarRoom` continua o fluxo e adiciona aviso no resultado de `tech` ou `benchmark`: o Pinecone não respondeu e a resposta usou conhecimento complementar.

## Contrato de metadata para ingestão

`/api/docs-rag` só considera evidência textual quando o match contém `metadata.text` ou `metadata.content`. Metadata com `titulo`, `categoria` e `url`, mas sem texto indexado, não entra em `context`.

<Check>
`tests/api-docs-rag.test.ts` protege esse contrato: match forte sem texto retorna o sinal sem documentação, mesmo com score alto.
</Check>

Scripts relevantes:

| Script                                | Namespace                     | Observação                                                                |
| ------------------------------------- | ----------------------------- | ------------------------------------------------------------------------- |
| `scripts/crawlAndIngestSeniorDocs.ts` | `senior-erp-docs`             | Faz crawl de URLs `documentacao.senior.com.br`, gera chunks e embeddings. |
| `scripts/ingestErpDocs.ts`            | `senior-erp-docs`             | Ingestão CSV por título/URL, sem texto completo no metadata.              |
| `scripts/ingestExtraDocs.ts`          | `senior-erp-docs`             | Ingestão adicional de Agro/Flow/HCM.                                      |
| `scripts/ingestCanonicalBanking.ts`   | `senior-erp-docs`             | Curadoria manual de ERP Banking com `metadata.text`.                      |
| `scripts/ingestPdfDocs.ts`            | `competitor-pdfs` por default | Ingestão recursiva de PDFs, com fallback OCR Gemini.                      |

Comando disponível no `package.json`:

```bash
npm run ingest:pdfdocs -- ./alvos2 Concorrente 20 1800 220 scout-arsenal competitor-pdfs
```

Argumentos de `ingestPdfDocs.ts`:

| Posição | Campo           | Default                                                    |
| ------- | --------------- | ---------------------------------------------------------- |
| `2`     | pasta de PDFs   | `alvos2`                                                   |
| `3`     | categoria       | `Concorrente`                                              |
| `4`     | batch size      | `20`                                                       |
| `5`     | chunk size      | `1800`                                                     |
| `6`     | overlap         | `220`                                                      |
| `7`     | índice Pinecone | `PINECONE_DOCS_INDEX`, `PINECONE_INDEX` ou `scout-arsenal` |
| `8`     | namespace       | `PINECONE_DOCS_NAMESPACE` ou `competitor-pdfs`             |

## Verificação e troubleshooting

<Steps>
<Step title="Validar contrato da rota documental">
Rode o teste específico quando alterar `/api/docs-rag`, thresholds ou metadata de ingestão.

```bash
npm test -- tests/api-docs-rag.test.ts
```

</Step>

<Step title="Validar cliente browser">
Rode o teste do cliente ao alterar timeout, retry, normalização ou payload.

```bash
npm test -- tests/services/ragService.test.ts
```

</Step>

<Step title="Validar War Room">
Rode a suíte de retrieval quando mexer em cache, namespaces, filtros, blocos estáticos ou flags de intenção.

```bash
npm test -- tests/services/war-room/retrieval.test.ts
```

</Step>
</Steps>

Sinais comuns:

| Sintoma                                  | Causa provável                                      | Checagem                                                                            |
| ---------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `context` vazio com `degraded: true`     | Falha de chave, embedding ou Pinecone na serverless | Conferir `GEMINI_API_KEY`, `PINECONE_API_KEY`/`PINECONE_DOCS_KEY` e logs da função. |
| Sinal `[SEM DOCUMENTAÇÃO ENCONTRADA...]` | Sem match, score `< 0.6` ou metadata sem texto      | Inspecionar metadata do namespace consultado.                                       |
| `Invalid namespace`                      | Namespace fora da allowlist                         | Usar `senior-erp-docs` ou `competitor-pdfs`.                                        |
| War Room marca Pinecone indisponível     | Todas as consultas vazias ou falha parcial          | Ver `docsUnavailable`, status callbacks e métricas `ragQueries*`.                   |
| Localhost chama produção                 | Proxy Vite para `/api/rag` e `/api/docs-rag`        | Conferir `LOCAL_DEV_API_PROXY_TARGET` e bypass Vercel quando necessário.            |

## Related pages

<CardGroup>
<Card title="Usar o War Room" href="/usar-war-room">
Fluxo de consulta técnica e benchmark que consome o contexto RAG.
</Card>
<Card title="Ingerir documentação para RAG" href="/ingerir-docs-rag">
Comandos e parâmetros de ingestão para CSV, crawler Senior e PDFs.
</Card>
<Card title="Referência de APIs serverless" href="/api-serverless-reference">
Regras comuns de runtime, validação, headers e degradação das rotas `api/*.ts`.
</Card>
<Card title="Referência de configuração" href="/configuracao-reference">
Variáveis `.env`, proxy local, Vercel e fronteiras entre frontend e serverless.
</Card>
</CardGroup>

## Source files

- `services/ragService.ts`
- `api/rag.ts`
- `api/docs-rag.ts`
- `services/war-room/retrieval.ts`
- `scripts/ingestPdfDocs.ts`
- `tests/api-docs-rag.test.ts`
- `tests/services/ragService.test.ts`

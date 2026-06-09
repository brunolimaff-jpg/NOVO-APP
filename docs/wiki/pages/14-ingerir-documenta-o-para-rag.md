---
grok_wiki: true
page_id: "page-ingerir-docs-rag"
title: "Ingerir documentação para RAG"
repository: "local/NOVO-APP"
branch: "default"
generated_at: "2026-06-08T23:39:43.629Z"
source_files:
  - "scripts/crawlAndIngestSeniorDocs.ts"
  - "scripts/ingestErpDocs.ts"
  - "scripts/ingestPdfDocs.ts"
  - "api/docs-rag.ts"
  - "services/ragService.ts"
  - "services/war-room/retrieval.ts"
  - "tests/api-docs-rag.test.ts"
---

---
title: "Ingerir documentação para RAG"
description: "Comandos e parâmetros para CSV, crawler Senior, PDFs de concorrentes, embeddings, namespaces Pinecone e verificação por `/api/docs-rag`."
---

A ingestão documental do Senior Scout 360 roda por scripts CLI em `scripts/`, gera embeddings com `gemini-embedding-001` e grava vetores no Pinecone; a consulta em runtime passa por `/api/docs-rag`, que só monta contexto evidencial quando o match possui `metadata.text` ou `metadata.content`.

## Superfície implementada

| Entrada | Comando/script | Namespace padrão | Uso principal | Observação operacional |
|---|---|---:|---|---|
| CSV de links Senior | `scripts/ingestErpDocs.ts` | `senior-erp-docs` | Vetorizar título, área, portal e URL | Não persiste texto documental em `metadata.text`; sozinho tende a retornar sinal sem documentação em `/api/docs-rag`. |
| Crawler HTML Senior | `scripts/crawlAndIngestSeniorDocs.ts` | `senior-erp-docs` | Buscar páginas em `documentacao.senior.com.br`, extrair texto e chunkar | Tem allowlist/SSRF guard e relatório final; verifique se os chunks textuais também ficam disponíveis em metadata antes de tratar como evidência. |
| PDFs de concorrentes | `scripts/ingestPdfDocs.ts` | `competitor-pdfs` | Extrair PDF nativo ou OCR Gemini e indexar chunks | Usado pelo modo `benchmark` do War Room junto com `senior-erp-docs`. |
| Base curada Banking | `scripts/ingestCanonicalBanking.ts` | `senior-erp-docs` | Inserir bloco canônico de ERP Banking | Persiste `metadata.text`, portanto atende diretamente ao contrato atual de `/api/docs-rag`. |
| Higienização | `scripts/higienizarPinecone.ts` | `senior-erp-docs` | Relatar stats, duplicatas e índice órfão | `--execute` remove o índice órfão `documentacao`; sem flag é dry-run. |

<Warning>
Contagem de vetores no Pinecone não prova que o War Room terá contexto. O endpoint `/api/docs-rag` descarta matches que têm apenas `url`, `titulo` e `categoria`; o contexto final exige texto em `metadata.text` ou `metadata.content`.
</Warning>

## Variáveis de ambiente

Use variáveis sem prefixo `VITE_` para chaves reais em produção e scripts. Os scripts ainda aceitam alguns fallbacks legados com `VITE_*`, mas o frontend não deve carregar segredo Pinecone.

| Variável | Usada por | Default/fallback | Obrigatória |
|---|---|---|---|
| `GEMINI_API_KEY` | scripts de ingestão e `/api/docs-rag` | scripts aceitam `VITE_API_KEY`; API exige `GEMINI_API_KEY` | Sim |
| `PINECONE_DOCS_KEY` | scripts e `/api/docs-rag` | fallback para `PINECONE_API_KEY`; alguns scripts aceitam `VITE_PINECONE_KEY` | Sim, ou `PINECONE_API_KEY` |
| `PINECONE_API_KEY` | scripts, `/api/rag`, fallback de `/api/docs-rag` | usado se `PINECONE_DOCS_KEY` não existir | Sim, se não houver `PINECONE_DOCS_KEY` |
| `PINECONE_DOCS_INDEX` | scripts e `/api/docs-rag` | `scout-arsenal` | Não |
| `PINECONE_INDEX` | `/api/docs-rag` e PDFs como fallback | validado antes de uso | Não |
| `PINECONE_DOCS_NAMESPACE` | `/api/docs-rag` e PDFs | API cai para `senior-erp-docs`; PDFs caem para `competitor-pdfs` | Não |
| `PINECONE_NAMESPACE` | fallback de `/api/docs-rag` | usado antes do default | Não |
| `GEMINI_OCR_MODEL` | OCR de PDFs | `gemini-3-flash-preview` | Não |

O nome do índice passa por guarda defensiva: valor vazio, valor com prefixo de chave `pcsk_` ou nome fora do padrão de índice faz a API cair para `scout-arsenal`.

## Preparar ambiente

```bash title="exports mínimos"
export GEMINI_API_KEY="..."
export PINECONE_DOCS_KEY="..."
export PINECONE_DOCS_INDEX="scout-arsenal"
```

```bash title="checagem local de exports Pinecone"
./check-exports.command
```

<Note>
`check-exports.command` confirma chave e índice Pinecone. Para ingestão e `/api/docs-rag`, `GEMINI_API_KEY` também precisa existir porque a consulta e os scripts geram embeddings.
</Note>

## Ingerir CSV de links Senior

`ingestErpDocs.ts` lê um arquivo dentro de `Links documentação/`. Sem argumento, usa `senior_erp_links.csv`.

```bash title="CSV padrão"
npx tsx scripts/ingestErpDocs.ts
```

```bash title="CSV específico dentro de Links documentação/"
npx tsx scripts/ingestErpDocs.ts senior_erp_links.csv
```

Campos aceitos no CSV:

| Campo | Uso |
|---|---|
| `URL Completa` ou `URL` | URL usada para gerar o ID e a fonte. Linhas sem URL são ignoradas. |
| `Título`, `TÃ­tulo` ou `Titulo` | Título usado no texto vetorizado e metadata. |
| `Módulo`, `MÃ³dulo`, `Categoria` ou `Produto` | Categoria/área da documentação. |
| `Breadcrumb` ou `Portal` | Complemento do texto vetorizado. |

O texto enviado ao embedding segue o formato `Manual Senior | Área: ... | Título: ...`. O upsert grava `categoria`, `titulo` e `url` no metadata, em lotes de `50`.

## Ingerir páginas reais com crawler Senior

`crawlAndIngestSeniorDocs.ts` usa o mesmo CSV de links, mas faz fetch das páginas permitidas e cria chunks de conteúdo HTML extraído.

```bash title="crawler Senior"
npx tsx scripts/crawlAndIngestSeniorDocs.ts senior_erp_links.csv
```

Parâmetros e limites fixos:

| Item | Valor |
|---|---:|
| Diretório do CSV | `Links documentação/` |
| Namespace | `senior-erp-docs` |
| Índice default | `scout-arsenal` |
| Batch de upsert | `50` |
| Timeout por fetch | `15000ms` |
| Delay entre inícios de tarefas | `500ms` |
| Concorrência | `3` workers |
| Chunk | `1800` caracteres |
| Overlap | `220` caracteres |
| User-Agent | `SeniorScout360-Crawler/1.0` |

O crawler só aceita URLs `https://documentacao.senior.com.br/`. A guarda bloqueia protocolo não HTTPS, `localhost`, loopback, `169.254.*`, `10.*`, `172.16-31.*` e `192.168.*`.

<Warning>
O relatório final do crawler mostra páginas, falhas e chunks indexados. Depois dele, valide `/api/docs-rag`; se a resposta continuar com sinal sem documentação, o problema provável é ausência de texto em metadata ou score abaixo de `0.6`, não necessariamente falha de upsert.
</Warning>

## Ingerir PDFs de concorrentes

O script de PDFs tem comando npm próprio:

```bash title="PDFs padrão em ./alvos2"
npm run ingest:pdfdocs
```

```bash title="PDFs com parâmetros explícitos"
npm run ingest:pdfdocs -- ./alvos2 Concorrente 20 1800 220 scout-arsenal competitor-pdfs
```

Ordem dos argumentos:

| Posição | Parâmetro | Default |
|---:|---|---|
| `1` | `INPUT_DIR` | `./alvos2` |
| `2` | `CATEGORY` | `Concorrente` |
| `3` | `BATCH_SIZE` | `20` |
| `4` | `CHUNK_SIZE` | `1800` |
| `5` | `CHUNK_OVERLAP` | `220` |
| `6` | `INDEX_OVERRIDE` | `PINECONE_DOCS_INDEX`, `PINECONE_INDEX` ou `scout-arsenal` |
| `7` | `NAMESPACE_OVERRIDE` | `PINECONE_DOCS_NAMESPACE` ou `competitor-pdfs` |

O script varre PDFs recursivamente, tenta extração nativa com `pdf-parse` e só usa OCR Gemini quando o texto nativo tem menos de `350` caracteres. PDFs acima de `18 MiB` não entram no fallback OCR. Cada chunk recebe metadata como `categoria`, `titulo`, `source: "pdf-folder"`, `file_path`, `file_name`, `chunk_index`, `chunk_total`, `ocr_used`, `extraction` e `kind: "competitor-pdf"`.

## Namespaces permitidos

`/api/docs-rag` aceita apenas dois namespaces documentais:

| Namespace | Origem esperada | Uso no app |
|---|---|---|
| `senior-erp-docs` | Documentação Senior, base curada e links oficiais | Default da API e modo técnico do War Room |
| `competitor-pdfs` | PDFs de concorrentes | Consultado junto com `senior-erp-docs` no modo `benchmark` |

Qualquer outro valor em `namespace` retorna `400` com `error: "Invalid namespace"` e a lista `allowed`.

## Contrato de `/api/docs-rag`

:::endpoint POST /api/docs-rag Consulta documentação técnica indexada

Gera embedding da `query`, consulta Pinecone com `topK: 8`, filtra matches com score mínimo `0.6` e retorna contexto textual separado por `---`.

<ParamField body="query" type="string" required>
Texto de busca. Deve ter de `1` a `10000` caracteres.
</ParamField>

<ParamField body="namespace" type="string">
Namespace documental opcional. Só aceita `senior-erp-docs` ou `competitor-pdfs`.
</ParamField>

<RequestExample>

```bash
curl -s "https://SEU_DEPLOY.vercel.app/api/docs-rag" \
  -H "Content-Type: application/json" \
  -d '{"query":"ERP Banking pagamentos eletrônicos", "namespace":"senior-erp-docs"}'
```

</RequestExample>

<ResponseExample>

```json
{
  "context": "### ERP Banking: ERP Banking Senior - Base Curada 1\nFonte Curada ERP Banking Senior...\n(Fonte: https://documentacao.senior.com.br/...)",
  "matches": [
    {
      "categoria": "ERP Banking",
      "titulo": "ERP Banking Senior - Base Curada 1",
      "url": "https://documentacao.senior.com.br/...",
      "text": "Fonte Curada ERP Banking Senior..."
    }
  ]
}
```

</ResponseExample>

Respostas especiais:

| Condição | Status | Resposta |
|---|---:|---|
| Método diferente de `POST` | `405` | `{ "error": "Method not allowed" }` |
| Body inválido ou `query` vazia | `400` | `{ "error": "Invalid request", "details": ... }` |
| Namespace não permitido | `400` | `{ "error": "Invalid namespace", "allowed": [...] }` |
| Sem embedding, sem matches, score baixo ou sem metadata textual | `200` | `context` com `[SEM DOCUMENTAÇÃO ENCONTRADA ...]` |
| Erro de Gemini/Pinecone/env | `200` | `{ "context": "", "degraded": true, "detail": "..." }` |

:::

## Como o War Room consome documentação

`services/ragService.ts` normaliza a query para até `9500` caracteres, chama `/api/docs-rag` com timeout de `15s` e marca `failed: true` quando recebe status não OK, timeout, erro de rede, contexto vazio ou o prefixo `[SEM DOCUMENTAÇÃO ENCONTRADA`.

`services/war-room/retrieval.ts` usa cache por `namespace::query` por `120000ms`, corta o contexto final em `6000` caracteres e consulta documentação só nos modos `tech` e `benchmark`.

```text
War Room tech
  -> senior-erp-docs
  -> /api/rag global em paralelo

War Room benchmark
  -> senior-erp-docs
  -> competitor-pdfs
  -> /api/rag global em paralelo
```

Quando flags de intenção indicam Fercus, talhão, agrícola ou Banking, o War Room adiciona queries especializadas, filtra blocos ruidosos e pode injetar blocos estáticos de referência se o contexto retornado não contém as âncoras esperadas.

## Verificar ingestão

<Steps>
<Step title="1. Confirme variáveis e índice">
Rode `./check-exports.command` e confirme `PINECONE_DOCS_KEY` ou `PINECONE_API_KEY`, além de `PINECONE_DOCS_INDEX`.
</Step>

<Step title="2. Rode a ingestão">
Use o script adequado para CSV, crawler ou PDFs. No final, confira namespace, índice, quantidade de chunks ou registros e falhas reportadas.
</Step>

<Step title="3. Consulte `/api/docs-rag`">
Use uma query que deve bater em um documento recém-indexado e informe o namespace correto.
</Step>

<Step title="4. Valide contexto textual">
Considere sucesso apenas quando `context` trouxer texto documental e fonte. Resposta com `[SEM DOCUMENTAÇÃO ENCONTRADA ...]` indica que o War Room deve recusar ou continuar degradado.
</Step>
</Steps>

Em dev local, o Vite faz proxy de `/api/docs-rag` para `LOCAL_DEV_API_PROXY_TARGET`, cujo default é `https://scoutagro.vercel.app`. Para validar outro preview, defina `LOCAL_DEV_API_PROXY_TARGET` e, se necessário, `VERCEL_AUTOMATION_BYPASS_SECRET`.

```bash title="consulta via dev server proxy"
curl -s "http://localhost:3000/api/docs-rag" \
  -H "Content-Type: application/json" \
  -d '{"query":"consulta analítica de talhão", "namespace":"senior-erp-docs"}'
```

```bash title="testes de contrato"
npx vitest run tests/api-docs-rag.test.ts tests/services/ragService.test.ts tests/config/localDevApiProxy.test.ts
```

## Manutenção do Pinecone

```bash title="dry-run de higienização"
npx tsx scripts/higienizarPinecone.ts
```

```bash title="execução com remoção do índice órfão documentacao"
npx tsx scripts/higienizarPinecone.ts --execute
```

O dry-run relata estatísticas do índice principal, tenta listar registros com prefixo `senior-doc-` e aponta duplicatas por base de ID. Com `--execute`, o script também tenta deletar o índice órfão `documentacao`.

<Warning>
`--execute` aplica alteração destrutiva no Pinecone. Rode primeiro sem a flag e confirme que `MAIN_INDEX` aponta para o índice correto.
</Warning>

## Troubleshooting

| Sintoma | Causa provável | Ação |
|---|---|---|
| `/api/docs-rag` retorna `[SEM DOCUMENTAÇÃO ENCONTRADA ...]` após ingestão | Match sem `metadata.text`/`metadata.content`, score abaixo de `0.6` ou namespace errado | Inspecione metadata dos vetores e valide com `senior-erp-docs` ou `competitor-pdfs`. |
| `Invalid namespace` | Namespace fora da allowlist | Use apenas `senior-erp-docs` ou `competitor-pdfs`. |
| Índice configurado cai para `scout-arsenal` | `PINECONE_DOCS_INDEX` vazio, com formato inválido ou contendo chave `pcsk_` | Corrija o nome do índice; não coloque API key no campo de índice. |
| Crawler rejeita URL | URL fora de `https://documentacao.senior.com.br/` ou host privado/reservado | Ajuste o CSV; o crawler não é genérico. |
| PDF não gera chunks | Pasta sem PDFs, extração abaixo de `350` caracteres, PDF acima de `18 MiB` para OCR ou falha HTTP no OCR | Confira logs de extração, reduza o arquivo ou use PDF com texto selecionável. |
| Localhost consulta ambiente errado | Proxy local aponta para `https://scoutagro.vercel.app` | Defina `LOCAL_DEV_API_PROXY_TARGET` para o preview desejado. |
| War Room técnico recusa muitas perguntas | Cobertura insuficiente de `senior-erp-docs` | Priorize nova ingestão/correção de metadata antes de afrouxar filtros ou score. |

## Related pages

<CardGroup>
<Card title="Referência de RAG" href="/rag-reference">
Contratos de `/api/rag` e `/api/docs-rag`, namespaces, thresholds e cliente `ragService`.
</Card>
<Card title="Usar o War Room" href="/usar-war-room">
Fluxo de consulta técnica e benchmark com contexto documental.
</Card>
<Card title="Referência de configuração" href="/configuracao-reference">
Variáveis `.env`, defaults, proxy local e fronteiras frontend/serverless.
</Card>
<Card title="Segurança de API" href="/seguranca-api">
Chaves no servidor, headers comuns, SSRF guard e limites de payload.
</Card>
</CardGroup>

## Related pages

- page-rag-reference
- page-usar-war-room


## Source files

- `scripts/crawlAndIngestSeniorDocs.ts`
- `scripts/ingestErpDocs.ts`
- `scripts/ingestPdfDocs.ts`
- `api/docs-rag.ts`
- `services/ragService.ts`
- `services/war-room/retrieval.ts`
- `tests/api-docs-rag.test.ts`

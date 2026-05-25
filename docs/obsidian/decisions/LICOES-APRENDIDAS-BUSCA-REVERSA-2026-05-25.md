# Licoes Aprendidas - Busca Reversa de CNPJs por Nome de Socio

**Data:** 2026-05-25
**Branch:** `codex/cnpj-socios-todos-cnpjs`
**PR:** `#285`
**Contexto:** 7 ciclos de tentativa para encontrar uma fonte de busca que funcione no runtime Vercel e entregue CNPJs de socios com profundidade real.

## Resumo Executivo

A PR #285 nasceu como hotfix para corrigir a regressao de profundidade de CNPJs por socio. Ao longo de 3 dias, passamos por 8 ciclos de tentativa, cada um resolvendo um problema mas revelando outro. O estado atualizado em 2026-05-25 16:01 e: CNPJ Aberto resolve a fonte de dados, mas revelou um P0 semantico. QSA oficial confirma `socio -> CNPJ`, nao `CNPJ -> grupo`. Todo CNPJ fora de prova independente do grupo deve entrar como `partner_other_cnpj` / `CNPJ lateral do socio`.

## Os 8 Ciclos

### Ciclo 1: DuckDuckGo GET para POST

**Problema:** O metodo GET em `duckduckgo.com/lite/` retornava apenas um formulario HTML vazio, sem resultados de busca.

**Correcao:** Mudar para POST em `lite.duckduckgo.com/lite/` com `Content-Type: application/x-www-form-urlencoded` e body `q=...`.

**Arquivo:** `utils/documentExtractor.ts` — funcao `performDuckDuckGoSearch()`

**Resultado:** Funciona localmente. Na Vercel, o IP de datacenter pode ser bloqueado ou rate-limited pelo DuckDuckGo.

**Commit:** `b8b9058`

### Ciclo 2: consultasocio.com (scraping direto)

**Problema:** Precisavamos de uma fonte de dados societarios que nao dependesse de provedor de busca generico.

**Correcao:** Implementar `searchConsultasocioDirect()` — constroi URL no padrao `/q/sa/{slug}` (nome minusculo sem acentos com hifens), faz scrape com Cheerio, extrai texto da pagina contendo CNPJs.

**Arquivos:**
- `utils/documentExtractor.ts` — funcoes `buildConsultasocioUrl()`, `searchConsultasocioDirect()`, `isPessoaJuridica()`
- `api/socio-search.ts` — `runSearch()` chama `searchConsultasocioDirect()` antes de busca web generica, mas apenas para pessoa fisica (PF)

**Parametros atuais:**
- `maxPages = 15` (inicialmente 3, ajustado no commit `3e0058e`)
- Timeout de 10s por pagina
- User-Agent: `Mozilla/5.0 ScoutAgro/1.0`

**Resultado: FUNCIONA PERFEITAMENTE LOCAL.** Para Elizeu Scheffer, entregou 80 CNPJs de 14 empresas distintas em 9 paginas, com nome de empresa, CNPJ e contexto societario completo.

**Problema:** Bloqueia no runtime Vercel (IP de datacenter). O site consultasocio.com retorna HTTP 403 ou bloqueia o request. Isso impede o uso em producao.

**Commit:** `b8b9058` (implementacao inicial), `3e0058e` (maxPages 3 para 15)

### Ciclo 3: Mermaid flickering no SocietaryMap

**Problema:** O componente `SocietaryMap.tsx` chamava `setCompaniesByPartner()` a cada socio processado, causando re-renderizacao completa do Mermaid a cada adicao, resultando em flickering visual.

**Correcao:** Coletar todas as empresas de todos os socios em um array temporario, depois chamar `setCompaniesByPartner(collected)` uma unica vez ao final.

**Arquivo:** `features/dossier/SocietaryMap.tsx` — renderizacao em batch

**Resultado:** Renderizacao unica, sem flickering.

**Commit:** `e46f2d8`

### Ciclo 4: Mermaid nao renderiza empresas da tabela Gemini

**Problema:** Empresas extraidas da tabela Gemini (`Outros CNPJs onde o socio aparece`) nao tinham `sourceTitle` (campo vazio) e recebiam `confidence: weak`, o que fazia `hasEnoughEvidence()` no `societaryGraph.ts` rejeita-las e o Mermaid ficar vazio.

**Correcao:**
- `teiaTextParser.ts`: adicionar `sourceTitle: 'Gemini — Tabela CNPJs'` como valor default quando vazio
- `societaryGraph.ts`: promover `confidence` para `'medium'` quando o CNPJ e valido (`isValidCnpj()`), mesmo que a evidencia textual seja fraca

**Arquivos:** `features/dossier/societaryGraph.ts`, `features/dossier/teiaTextParser.ts`

**Resultado:** Empresas com CNPJ valido da tabela Gemini agora aparecem no Mermaid.

**Commit:** `42ca221`

### Ciclo 5: CNPJs falsos passando pelo parser e grafo

**Problema:** O parser (`teiaTextParser.ts`) e o grafo (`societaryGraph.ts`) nao validavam CNPJ por digito verificador. Um CNPJ com 14 digitos mas digito verificador invalido era aceito como valido, abrindo porta para alucinacao.

**Correcao:**
- Adicionar `isValidCnpj()` em `teiaTextParser.ts` antes de aceitar CNPJ como valido
- Adicionar `isValidCnpj()` em `societaryGraph.ts` para filtrar nos do grafo
- Reordenar `describeSocietaryCompanyType()` para detectar tipo societario antes de validar CNPJ

**Arquivos:** `features/dossier/teiaTextParser.ts`, `features/dossier/societaryGraph.ts`

**Resultado:** CNPJs com digito verificador invalido sao bloqueados em todas as camadas (API, parser, grafo, UI).

**Commit:** `e46f2d8` (junto com batch Mermaid)

### Ciclo 6: Gemini Search Grounding v1 (extracao direta do LLM)

**Problema:** consultasocio.com bloqueia na Vercel, DuckDuckGo retorna `empty_result`. Precisavamos de uma fonte de busca que funcione no runtime Vercel.

**Correcao:** Implementar `performGeminiSearch()` — chama Gemini 2.5 Flash com `google_search` tool, extrai texto da resposta do LLM que contem CNPJs e nomes de empresas, retorna no formato `Titulo/URL/Resumo/---`.

**Arquivo:** `utils/documentExtractor.ts` — funcao `performGeminiSearch()`

**Arquitetura:**
```
performWebSearch(query)
  -> performGeminiSearch(query, apiKey)  // Primaria
     -> se null: performDuckDuckGoSearch(query)  // Fallback
```

**Resultado: ALUCINA CNPJs FALSOS.** O Gemini, quando instruido a listar CNPJs, inventou numeros como `10.542.424/0001-00` e `50.123.456/0001-99`. Mesmo com `temperature: 0`, o modelo inventa CNPJs com formato valido mas digitos falsos. Testes locais confirmaram que o `isValidCnpj()` nao bloqueia esses CNPJs porque os digitos verificadores podem coincidentemente estar corretos.

**Licao critica:** LLM nao pode ser usado para extrair CNPJs diretamente. O modelo nao diferencia "lembrar de CNPJ real" de "gerar numero que parece CNPJ".

**Commit:** `f2d9500`

### Ciclo 7: Gemini Search Grounding v2 (URL discovery + scraping direto) — ATUAL

**Problema:** A v1 provou que LLM nao pode gerar/extrarir CNPJs diretamente. Precisamos de uma abordagem que use o Gemini apenas para encontrar URLs, nao para extrair dados.

**Correcao:** Reescrever `performGeminiSearch()` para usar o Gemini exclusivamente para descubrir URLs via `groundingMetadata.groundingChunks`. Para cada URL encontrada, fazer scraping direto com Cheerio e extrair o texto real da pagina. Zero texto gerado pelo LLM — apenas texto real de paginas web.

**Arquivo:** `utils/documentExtractor.ts` — funcao `performGeminiSearch()` reescrita

**Fluxo atual:**
```
performGeminiSearch(query, apiKey):
  1. Chama Gemini 2.5 Flash com tools: [{ google_search: {} }]
  2. Extrai groundingChunks[].web.uri (URLs reais)
  3. Para cada URL: fetch direto + Cheerio scrape
  4. Retorna texto real das paginas (NENHUM texto do LLM)
```

**Parametros:**
- Modelo: `gemini-2.5-flash`
- Temperature: `0`
- Max output tokens: `256` (suficiente para grounding, nao para gerar CNPJs)
- Timeout: 30s para API Gemini, 8s por fetch de pagina
- Max paginas extraidas: ilimitado (loop sobre chunks)
- User-Agent: `Mozilla/5.0 ScoutAgro/1.0`

**Resultado:** AINDA TESTANDO. A abordagem elimina a fonte de alucinacao (LLM nao gera CNPJs), mas ainda precisa ser validada na preview Vercel. A depencia critica continua sendo: `GEMINI_API_KEY` precisa estar configurada no runtime Vercel.

**Commit:** `6d49b28`

### Ciclo 8: CNPJ Aberto estruturado + ressalva semantica

**Problema:** CNPJ Aberto retornava empresas reais por socio, mas o pipeline transformava a resposta em blocos textuais genericos (`Titulo/URL/Resumo`). Isso fazia a UI e os prompts tratarem CNPJs laterais como `Proprias`, `Side business` ou prova de grupo.

**Correcao:** CNPJ Aberto passou a ter contrato estruturado antes de entrar em `/api/socio-search`.

**Contrato minimo:**
- `relationshipScope: partner_other_cnpj`
- `rootContext: false`
- `sourceProvider: cnpj_aberto`
- `evidenceBasis: official_qsa_owner_search`
- `claimType: socio_participation`
- `rootRelationStatus: not_supported`
- `operationalThesisAllowed: false`

**Ressalva semantica obrigatoria:** `OFICIAL` qualifica o vinculo do socio com aquele CNPJ. Nao qualifica o CNPJ como empresa do grupo.

**Resultado:** CNPJs como E.Z.M.S. Participacoes, G.S. Participacoes, NTOS e Participacoes, Carolina Scheffer Atelier e Scheffer Bio Insumos so podem aparecer como CNPJs laterais do socio enquanto nao houver prova independente de grupo.

**Status:** recorte Vitest da teia passou com 91 testes em 2026-05-25 16:00.

## Tabela Resumo dos 8 Ciclos

| # | Ciclo | Resultado | Problema resolvido | Problema criado/revelado |
|---|-------|-----------|-------------------|--------------------------|
| 1 | DuckDuckGo GET->POST | Funciona local | Formulario vazio no GET | Vercel pode bloquear IP |
| 2 | consultasocio.com scrape | PERFEITO local | Fonte societaria direta | Bloqueia na Vercel (datacenter IP) |
| 3 | Mermaid batch render | OK | Flickering no Mermaid | Nenhum |
| 4 | sourceTitle + confidence | OK | Mermaid vazio sem fonte | Nenhum |
| 5 | isValidCnpj em parser/grafo | OK | CNPJ falso aceito | Nenhum |
| 6 | Gemini Search v1 (LLM) | FALHA | Fonte pra Vercel | Alucina CNPJs falsos |
| 7 | Gemini Search v2 (URL-only) | TESTANDO | Alucinacao de CNPJs | Depende de GEMINI_API_KEY na preview |
| 8 | CNPJ Aberto estruturado | OK em teste local | Fonte dedicada por socio | Exige contrato semantico para nao promover lateral a grupo |

## Arquitetura anterior de busca (HEAD `6d49b28`, superada pelo Ciclo 8)

```
/api/socio-search (runSearch)
  |
  +-> searchConsultasocioDirect(socioName)  [PF apenas]
  |     -> FUNCIONA LOCAL, BLOQUEIA VERCEl
  |
  +-> performWebSearch(query)
        |
        +-> performGeminiSearch(query, apiKey)  [Primaria]
        |     -> Gemini 2.5 Flash + google_search
        |     -> Extrai URLs de groundingChunks
        |     -> Scrape direto de cada URL
        |     -> ZERO texto gerado pelo LLM
        |     -> Fallback se falhar: performDuckDuckGoSearch
        |
        +-> performDuckDuckGoSearch(query)  [Fallback]
              -> POST para lite.duckduckgo.com/lite/
              -> Pode retornar empty_result na Vercel
```

## Arquivos Alterados (diferencial entre b8b9058 e 6d49b28)

| Arquivo | Linhas alteradas | Ciclos envolvidos |
|---------|-----------------|-------------------|
| `utils/documentExtractor.ts` | +189 | 1, 2, 6, 7 |
| `api/socio-search.ts` | +81/-35 | 2 |
| `features/dossier/SocietaryMap.tsx` | +14/-47 | 3 |
| `features/dossier/teiaTextParser.ts` | +16 | 4, 5 |
| `features/dossier/societaryGraph.ts` | +4 | 4, 5 |
| `tests/features/dossier/SocietaryMap.test.tsx` | +80/-20 | 3 |
| `tests/api-socio-search.test.ts` | +16 | 2 |

## Licoes Aprendidas

### 1. LLM nao extrai CNPJ — LLM descobre URL, scraper extrai CNPJ

O erro fundamental do Ciclo 6 foi pedir para o Gemini listar CNPJs. O modelo respondeu com numeros que parecem CNPJs mas sao falsos. A correcao (Ciclo 7) e: usar LLM apenas para encontrar URLs de paginas web, e usar scraper (Cheerio) para extrair o texto real.

### 2. Nenhuma fonte unica funciona em todos os ambientes

- consultasocio.com: funciona local, bloqueia Vercel
- DuckDuckGo Lite: funciona local, pode retornar vazio na Vercel
- Gemini Search: funciona se GEMINI_API_KEY estiver configurada, mas LLM alucina se usado para extracao
- A solucao precisa de multiplas fontes com fallback hierarquico

### 3. isVaLidCnpj() nao e suficiente contra LLM

O Gemini do Ciclo 6 gerou CNPJs como `10.542.424/0001-00` que podem ter digito verificador valido por coincidencia. `isValidCnpj()` so valida o formato — nao prova que o CNPJ existe na Receita Federal. Apenas `lookupCnpj()` oficial ou scraping de pagina real pode confirmar existencia.

### 4. consultasocio.com e a melhor fonte local, mas bloqueia em producao

O scraper de consultasocio.com entrega qualidade excepcional (80 CNPJs, 14 empresas para Elizeu Scheffer), mas o IP da Vercel e bloqueado. Possiveis contornos (nao implementados):
- Proxy rotativo (complexo, anti-ToS)
- Cache persistente no Supabase para resultados bons (ja implementado mas sem SERVICE_ROLE_KEY configurada)
- Fonte alternativa de consulta societaria oficial

### 5. A pipeline de extracao precisa de 3 camadas

Para cada socio, o fluxo ideal e:
1. **Fonte direta** (consultasocio.com ou similar) — funciona local, falha Vercel
2. **Busca web com URLs reais** (Gemini Search Grounding v2) — descobre paginas, extrai texto
3. **Busca web generica** (DuckDuckGo) — fallback gratuito, pode ser bloqueado

### 6. Batch render e essencial para Mermaid

O Ciclo 3 mostrou que atualizar estado a cada socio causa flickering. O padrao de coleta + unica chamada `setState` ao final deve ser usado sempre que multiplas fontes alimentarem o mesmo componente visual.

### 7. Todo CNPJ textual precisa de validacao em 2 niveis

- Nivel 1: `isValidCnpj()` no parser/grafo (bloqueia formato invalido)
- Nivel 2: `lookupCnpj()` oficial ou scraper de pagina real (confirma existencia)
- CNPJ que passa nivel 1 mas nao nivel 2 deve ser marcado como `pending/unconfirmed` com `*`

## Checklist de Prevencao para Proximos Ciclos

- [ ] Antes de chamar Gemini para extrair dados estruturados, verificar se o LLM pode alucinar o dado especifico
- [ ] Se o LLM pode alucinar, usar apenas para descobrir URLs, nao para extrair conteudo
- [ ] Testar nova fonte de busca em 3 ambientes: local (npm run dev), Vercel preview, Vercel production
- [ ] Validar que GEMINI_API_KEY esta configurada no ambiente antes de considerar Gemini Search como resolvido
- [ ] Se consultasocio.com for a fonte principal local, planejar cache persistente para resultados bons
- [ ] Smoke preview deve falhar quando todos os socios retornarem companies: 0

## Decisao Atual

**CNPJ Aberto e a fonte primaria de busca reversa por socio, mas nunca deve virar bloco textual generico.** A resposta entra estruturada como vinculo do socio. O escopo de grupo so pode ser promovido por prova independente.

**Nao mergear PR #285** ate validar o P0 em preview: laterais aparecem como `CNPJs laterais`, nao como `Proprias`; nao existe aresta `Root -> company` para lateral; e nenhuma tese operacional usa lateral como prova.

## Referencias

- PR #285: `codex/cnpj-socios-todos-cnpjs`
- Commit b8b9058: DuckDuckGo POST + consultasocio initial
- Commit e46f2d8: Batch Mermaid + isValidCnpj
- Commit 3e0058e: consultasocio maxPages 15
- Commit 42ca221: sourceTitle + confidence
- Commit f2d9500: Gemini Search v1 (LLM)
- Commit 6d49b28: Gemini Search v2 (URL-only)
- Achado P0: `ACHADO-P0-TEIA-CNPJ-ESCOPO-2026-05-25.md`
- Licoes anteriores: `LICOES-APRENDIDAS-TEIA-CNPJ-2026-05-24.md`

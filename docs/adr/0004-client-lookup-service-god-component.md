# ADR-0004: clientLookupService.ts como god component

**Data:** 29/06/2026
**Status:** Aceito — débito técnico documentado
**Componente:** `services/clientLookupService.ts` (741 LOC — o maior dos 3 god components remanescentes)
**Branch de referência:** `stabilize/from-production-fe6c6f9` @ `4e65bb1`
**Decisor:** Bruno + IA gestora

---

## Contexto

O `services/clientLookupService.ts` é o **gateway único de consulta à base interna de
clientes Senior** no Scout 360. Antes de qualquer geração de dossiê ou resposta de chat,
este arquivo é consultado para responder a uma pergunta comercialmente crítica: *"A empresa
que o usuário está analisando já é cliente da Senior? Se sim, quais módulos ela contratou?
Quais são os gaps de cross-sell?"*. A resposta é injetada no prompt do LLM para que o
dossiê reflita a realidade cadastral em vez de alucinar informações comerciais.

O arquivo expõe **6 funções públicas** (`isConcorrenteOuPropria`, `lookupCliente`,
`formatarParaPrompt`, `benchmarkClientes`, `formatarBenchmarkParaPrompt`,
`formatarComexParaPrompt`) e **3 interfaces públicas** (`ClienteResult`, `LookupResponse`,
`BenchmarkResponse`). Internamente, acumula **16 funções privadas** de normalização de
texto, ranking de candidatos, fetch com retry/timeout e cacheamento — totalizando **41
declarações top-level** em 741 linhas, conforme enumerado por grep no início desta análise.

O backend da consulta é um **Google Apps Script** publicado como web app, cuja URL
fallback está hardcoded em `services/apiConfig.ts:6` e pode ser overrida pela env var
`VITE_LOOKUP_URL`. O Apps Script lê uma planilha Google Sheets mantida pela equipe
comercial da Senior — este arquivo **não** fala com Supabase, **não** usa service-role
keys e **não** faz queries SQL. Essa observação é importante porque o handoff v2 (Ticket C,
PR #397) migrou o **socio-search** (arquivo sibling `services/socio-search/cache.ts`) para
`createClient` do `@supabase/supabase-js` com `SUPABASE_SERVICE_ROLE_KEY` — mas este
god component **não é afetado** por essa migração. A confusão é fácil porque ambos os
arquivos vivem sob `services/` e ambos lidam com "dados de clientes", mas a infra é
completamente diferente (Apps Script + Google Sheets aqui; Supabase + service_role lá).

O arquivo cresceu organicamente porque cada nova capacidade de negócio foi adicionada
como mais um bloco na mesma superfície:

- **Lookup por nome** (`lookupCliente`) — capacidade original, com 3 variantes de busca
  em paralelo e ranking por matchType (exact/partial/broad).
- **Benchmark por keywords** (`benchmarkClientes`) — capacidade adicional para o estágio
  de benchmark do waterfall (god component #1, ADR-0001), com retry de cold start do
  Apps Script.
- **Formatação para prompt** (`formatarParaPrompt`, `formatarBenchmarkParaPrompt`,
  `formatarComexParaPrompt`) — três formatadores distintos que poderiam viver em arquivos
  separados, mas coabitam aqui porque compartilham o tipo `ClienteResult` e o contrato
  visual de "bloco markdown delimitado por `---`".
- **Detecção de concorrente** (`isConcorrenteOuPropria`) — função pura que NÃO faz I/O,
  usada para sinalizar ao `investigation-orchestration.ts` (god component #3, ADR-0003)
  quando uma resposta do LLM menciona um concorrente cadastrado. Está neste arquivo por
  conveniência histórica, não por coesão — poderia viver em `services/competitorService.ts`
  (que já existe e exporta `CONCORRENTES`).

No fluxo do waterfall (ADR-0001), este arquivo é chamado em pelo menos 2 pontos distintos:
o `waterfall-orchestrator.ts:25` importa `formatarParaPrompt` e `lookupCliente` para
construir o contexto de fundação do dossiê (módulo Porte/Teia), e o
`investigation-orchestration.ts:8-17` importa **6 símbolos** deste arquivo para enriquecer
tanto o chat quanto os módulos especializados. O `components/SystemHealthCheck.tsx:3`
também chama `lookupCliente` como parte de um health check de sistema — uso arriscado,
discutido na seção de Riscos.

Por que não foi refatorado antes: o piloto de 20 usuários do agronegócio brasileiro
depende da precisão do lookup. Um bug que confunda "Pampa" com "Pampafoods" (citado
explicitamente no comentário da linha 316) faria o LLM atribuir o catálogo de módulos
Senior de um cliente a outro — erro comercial grave. A lógica de ranking multi-variante
(L301-416) foi afinada iterativamente para evitar esses falsos positivos, e qualquer
refactor que mude a ordem do sort pode reabrir incidentes já resolvidos. Por Princípio 4
(não refatorar o que não entende), o caminho seguro é documentar como débito conhecido.

---

## Responsabilidades acumuladas

| # | Responsabilidade | Linhas aprox | Deveria estar em |
|---|---|---|---|
| 1 | Detecção de concorrente/própria por token-set (`isConcorrenteOuPropria`) — função pura, 0 I/O | 11-44 | `services/competitorService.ts` (já existe) |
| 2 | Definição de tipos públicos (`ClienteResult`, `LookupResponse`, `BenchmarkResponse`, `ComexPromptData`) | 92-121, 647-654 | `services/types/clientLookup.ts` |
| 3 | Fetch com timeout (15s) via AbortController (`fetchWithTimeout`) | 128-147 | `utils/httpClient.ts` |
| 4 | Fetch com retry exponencial (1s/2s/4s, 3 tentativas) (`fetchWithRetry`) | 150-189 | `utils/httpClient.ts` |
| 5 | Helpers de diagnóstico (`describeLookupEndpoint`, `truncateForDiag`, `errorMessage`) | 79-90, 123-125 | `utils/diagnosticHelpers.ts` |
| 6 | Normalização de texto (3 funções encadeadas: `stripLookupNoise` → `normalizeLookupBase` → `normalizeLookupText`) | 204-224 | `utils/lookupNormalize.ts` |
| 7 | Tokenização e stopword removal (`getRelevantLookupTokens`, `isGenericLookupPrefixToken`, `LOOKUP_TOKEN_STOPWORDS`) | 226-265 | `utils/lookupTokenize.ts` |
| 8 | Cache permanente de resultados positivos (`_lookupCache: Map<string, LookupResponse>`) | 192, 432-438, 519 | `services/lookupCache.ts` |
| 9 | Cache TTL de 30s para resultados negativos (`_notFoundCache`) — proteção contra cold start do Apps Script | 196, 442-458, 521-524 | `services/lookupCache.ts` |
| 10 | Algoritmo de ranking de candidatos por métricas (`getBestLookupCandidateMetrics` + `compareLookupCandidateMetrics`) | 271-355 | `services/lookupRanking.ts` |
| 11 | Ranking de variantes de busca (`rankLookupResponse` + `compareRankedLookupResponses`) | 357-416 | `services/lookupRanking.ts` |
| 12 | Orquestração do lookup: geração de variantes, Promise.allSettled, seleção do melhor | 418-535 | ✅ no arquivo (correto, mas ~117 linhas) |
| 13 | Fetch individual + parse JSON + tratamento de cold start (HTML retornado) (`fetchLookup`) | 537-575 | `services/lookupFetch.ts` |
| 14 | Formatação de CRM para prompt com 3 branches (não-encontrado / match não-exato / match exato) (`formatarParaPrompt`) | 577-644 | `services/lookupFormatters/crmFormatter.ts` |
| 15 | Benchmark de clientes por keywords com retry de cold start (`benchmarkClientes`) | 656-700 | `services/benchmarkService.ts` |
| 16 | Formatação de benchmark para prompt — top 5 clientes em markdown (`formatarBenchmarkParaPrompt`) | 702-723 | `services/lookupFormatters/benchmarkFormatter.ts` |
| 17 | Formatação de Comex Stat MDIC para prompt com regras de recomendação hardcoded (`formatarComexParaPrompt`) | 726-741 | `services/lookupFormatters/comexFormatter.ts` |
| 18 | Constantes de configuração (TIMEOUT_MS=15s, MAX_RETRIES=3, NOT_FOUND_TTL_MS=30s, COLD_START_RETRY_DELAY_MS=1.5s) | 67-77 | `config/lookupConfig.ts` |
| 19 | Sets de domain knowledge (`_concorrentesSet`, `_genericPrefixes`, `LOOKUP_TOKEN_STOPWORDS`, `GENERIC_PREFIX_NORMALIZED`) | 11-31, 47-65, 226-247 | `config/lookupDomain.ts` |

---

## Riscos conhecidos

1. **Blast radius total na pipeline de dossiê**: 4 consumidores em produção dependem
   deste arquivo: `services/llm/investigation-orchestration.ts:8-17` (importa 6 símbolos),
   `features/dossier/waterfall-orchestrator.ts:25` (importa 2), `utils/seniorEvidence.ts:1`
   (importa tipo `LookupResponse`), `components/SystemHealthCheck.tsx:3` (importa
   `lookupCliente`). Se este arquivo quebrar, nenhum dossiê recebe contexto de CRM e
   nenhum chat consegue diferenciar prospect de cliente atual. Evidência confirmada por
   grep em 6 arquivos de teste que o mockam (`clientLookupService.test.ts`,
   `investigation-orchestration.test.ts`, `geminiService.test.ts`,
   `waterfall-orchestrator.test.ts`, `SystemHealthCheck.test.tsx`,
   `App.dossierGolden.test.tsx`).

2. **Apps Script como single point of failure**: O backend é um Google Apps Script
   publicado como web app (`apiConfig.ts:5-6`). Apps Script tem cold start de até ~10-15s
   na primeira invocação após inatividade, quota de execução diária, e não tem SLA. O
   arquivo mitiga com retry (3x), timeout (15s), cache TTL de 30s para negativos, e
   retry de JSON.parse (cold start retorna HTML). Mas se o Apps Script for deletado,
   tiver a planilha fonte removida, ou atingir quota, TODOS os lookups falham
   silenciosamente — o dossiê é gerado sem contexto de CRM, sem erro visível ao usuário.

3. **Falsos positivos de match podem vazar CRM de um cliente para outro**: O comentário
   na linha 316-318 documenta o caso real "Pampa" vs "Pampafoods" — duas empresas
   diferentes com nomes que compartilham token. A defesa é o 3-branch em
   `formatarParaPrompt` (L592-602): se `matchType !== 'exact'`, retorna bloco de warning
   em vez dos dados de CRM. **Mas** o `matchType` é derivado do algoritmo de ranking
   (L301-355) que depende de thresholds empíricos (`partialTokenThreshold` na L305-306).
   Se o threshold for muito permissivo, um match `partial` pode ser promovido a `exact`
   e vazar dados. Não há teste que cubra o caso "Pampafoods consulta → retorna Pampa".

4. **`isConcorrenteOuPropria` com tokens genéricos em português**: O set
   `_concorrentesSet` (L11-31) inclui tokens como `'erp'`, `'gestão'`, `'gestao'`,
   `'rubi'`, `'ronda'`. "ERP" é acrônimo genérico (Enterprise Resource Planning);
   "gestão"/"gestao" é palavra comum em português; "Ronda" e "Rubi" são produtos Senior
   mas também palavras comuns (ronda = patrulha; rubi = pedra preciosa). A função
   (L38-44) faz `words.some(w => _concorrentesSet.has(w))` — se uma empresa alvo tiver
   "Gestão" no nome (comum em agronegócio: "Gestão Agro", "Grupo Gestão"), será
   sinalizada como concorrente/própria. Impacto: callback `onCompetitor` disparado
   indevidamente, possível bloqueio de resposta de chat. Probabilidade: baixa-média.

5. **Cache permanente sem invalidação explícita**: `_lookupCache` (L192) é um `Map`
   module-level que persiste por toda a sessão do browser. Se um cliente Senior for
   cadastrado/atualizado na planilha durante a sessão, o usuário não verá a atualização
   até reload da página. Não há botão de "invalidar cache" nem TTL para positivos. Para
   20 usuários em sessões longas (4-8h), isso significa decisões comerciais baseadas em
   dados stale. Impacto: informação comercial desatualizada. Probabilidade: média.

6. **`SystemHealthCheck.tsx` chama `lookupCliente` em health check** (L3): O componente
   de health check usa a função de lookup de produção como ping. Cada health check
   consome quota do Apps Script (que tem limite diário) e pode retornar falso-negativo
   de saúde se a planilha estiver temporariamente indisponível mas o resto do sistema
   OK. Não li o componente `SystemHealthCheck.tsx` (458 LOC) para confirmar frequência
   do ping nem critério de falha — flaggado como não-entendido (Princípio 14).

7. **Recomendações comerciais hardcoded em `formatarComexParaPrompt`** (L738): A string
   de prompt injeta regras de negócio: "É OBRIGATÓRIO recomendar o módulo Commerce Log
   na Fase 8... Se os produtos envolverem grãos/commodities, recomendar também o
   OneClick." Essas regras são trabalho de produto/vendas e não deveriam viver em código
   de formatação. Se a equipe comercial mudar a recomendação (ex: novo módulo substitui
   Commerce Log), o código precisa ser editado, deployado e validado — não é
   configurável. Impacto: rigidez comercial. Probabilidade: baixa.

8. **`formatarBenchmarkParaPrompt` mantém parâmetro morto `_empresaAlvo`** (L702): O
   underscore prefix indica parâmetro não usado, mas o chamador
   (`investigation-orchestration.ts`) ainda o passa. Code smell de refactor parcial.
   Não há aviso de deprecation. Se um refactor futuro remover o parâmetro da assinatura
   sem checar chamadores, quebra em runtime.

9. **Sem teste para `formatarBenchmarkParaPrompt` e `formatarComexParaPrompt`**: O suite
   de testes (411 LOC, 13 testes em `tests/services/clientLookupService.test.ts`) cobre
   `isConcorrenteOuPropria` (4), `lookupCliente` (7 cenários de cache + erro), 
   `formatarParaPrompt` (3) e `benchmarkClientes` (3). **Zero testes** para os 2 outros
   formatadores. Refatorar esses formatadores sem coverage é aposta.

10. **13 testes para 741 LOC = coverage raso**: Apenas 6 das 6 funções públicas têm
    teste direto, mas as 16 funções privadas de normalização/ranking/cache não têm teste
    unitário isolado — são testadas indiretamente via `lookupCliente`. Bugs no
    `compareLookupCandidateMetrics` (L288-299) ou no `partialTokenThreshold` (L305-306)
    só se manifestariam em dossiês de empresas com nomes específicos, difíceis de
    reproduzir em teste.

11. **`shouldLogLookupDebug` lê env var em module-load time** (L70):
    `import.meta.env?.VITE_VERBOSE_LOGS === 'true'` é avaliado quando o módulo é
    importado. Se a env var mudar em runtime (improvável em Vite, mas possível em
    testes com `vi.stubEnv`), o módulo precisa ser re-importado para o flag ter efeito.
    Não é bug, mas é armadilha para testes que tentam alternar verbose logs.

---

## O que entendo que faz (Princípio 14)

1. **`isConcorrenteOuPropria(empresa: string): boolean`** (L38-44): Função pura exportada.
   Lowercase + trim + split por whitespace/vírgula, retorna `true` se qualquer token
   estiver em `_concorrentesSet`. O set (L11-31) é populado por: `CONCORRENTES.map(c =>
   c.id.split('_')[0])` (ex: `totvs_protheus` → `totvs`) + hardcoded Senior products
   (`sapiens`, `hcm`, `gatec`, `erpx`, etc.) + hardcoded competitor products (`protheus`,
   `microsiga`, `datasul`). Evidência: assinatura L38, implementação L39-43, set L11-31.

2. **`lookupCliente(nomeEmpresa: string): Promise<LookupResponse>`** (L418-535): Função
   pública assíncrona. Pipeline: (a) strip noise de `nomeEmpresa` (vírgula vira espaço,
   pontuação final removida); (b) computa `cacheKey = normalizeCacheKey(nomeEmpresa)`;
   (c) checa `_lookupCache` (permanente) → hit retorna imediato; (d) checa
   `_notFoundCache` (TTL 30s) → hit retorna se não expirou, senão deleta entry; (e) gera
   até 3 variantes: `nomeLimpo`, `p1` (primeira palavra > 2 chars, se não for prefixo
   genérico), `strongest` (palavra não-genérica mais longa > 3 chars); (f) Promise.allSettled
   nas variantes via `fetchLookup`; (g) ranking dos resultados via
   `compareRankedLookupResponses`; (h) cacheia positivo em `_lookupCache` ou negativo em
   `_notFoundCache`; (i) retorna `LookupResponse`. Evidência: L418 assinatura, L432-458
   cache, L466-490 variantes+ranking, L518-524 cache write.

3. **`fetchWithTimeout(url, timeout=15s)`** (L128-147): Helper privado. Cria
   `AbortController`, `setTimeout(() => controller.abort(), timeout)`, faz `fetch` com
   `signal`, limpa timeout no retorno. Em caso de `AbortError`, relança como
   `Error('Timeout após ${timeout/1000}s')` com `cause` preservando o original.
   Evidência: L128 assinatura, L142-144 tratamento AbortError.

4. **`fetchWithRetry(url, retries=3)`** (L150-189): Helper privado. Loop de 1 a `retries`,
   chama `fetchWithTimeout`, em caso de erro loga debug/warn e aguarda backoff
   exponencial (1s, 2s, 4s — fórmula `1000 * Math.pow(2, attempt - 1)` na L179). Após
   esgotar, lança `lastError`. Evidência: L150 assinatura, L153 loop, L177-184 backoff,
   L188 throw final.

5. **Cache de duas camadas**: `_lookupCache: Map<string, LookupResponse>` (L192) —
   permanente para `encontrado=true`, sobrevive a toda a sessão. `_notFoundCache:
   Map<string, { data: LookupResponse; expiresAt: number }>` (L196) — TTL de
   `NOT_FOUND_TTL_MS = 30_000` (L74) para `encontrado=false`, protege contra cold start
   do Apps Script. Evidência: L432-438 read positivo, L442-458 read negativo com TTL,
   L518-524 write (positivo em `_lookupCache`, negativo em `_notFoundCache`).

6. **`formatarParaPrompt(lookup: LookupResponse): string`** (L577-644): Função pública
   pura. 3 branches: (a) `!lookup.ok || !encontrado || !results.length` → bloco
   "Empresa NÃO encontrada" com validação recomendada; (b) encontrado mas
   `effectiveMatchType !== 'exact'` → bloco "🟡 POSSÍVEL MATCH — NÃO USAR COMO
   CONFIRMAÇÃO" com instrução explícita de tratar como prospect; (c) encontrado + exact
   → bloco "🟢 CONFIRMADO" com `grupo`, `total_modulos`, `modulos_por_familia` (com
   ícones emoji por família), `gaps_crosssell` (com dicas comerciais por gap). Evidência:
   L578-583 branch a, L592-602 branch b, L605-643 branch c, ícones L612-620, dicas L629-636.

7. **`benchmarkClientes(keywords: string | string[]): Promise<BenchmarkResponse>`**
   (L656-700): Função pública. URL = `LOOKUP_API_URL?mode=benchmark&keywords=...`.
   Helper interno `attemptParse` faz `fetchWithRetry` + `resp.text()` + `JSON.parse`.
   Se JSON.parse falhar (Apps Script retornou HTML de cold start), lança
   `'JSON_PARSE_FAILED'`. No catch externo, se erro for `JSON_PARSE_FAILED`, aguarda
   `COLD_START_RETRY_DELAY_MS = 1500` (L77) e tenta `attemptParse` uma segunda vez.
   Falha total → retorna `{ ok: false, ... }`. Evidência: L656 assinatura, L663-680
   attemptParse, L684-696 retry de cold start.

8. **`formatarBenchmarkParaPrompt(bench, _empresaAlvo): string`** (L702-723): Função
   pública pura. Se `!bench.ok || !results.length` → bloco fallback informativo
   (diferencia "sendo processado" de "nenhum encontrado"). Senão, lista top 5 clientes
   com `grupo`, `familias_presentes`, `total_modulos`. `_empresaAlvo` é parâmetro morto
   (underscore prefix, não usado no corpo). Evidência: L702 assinatura, L703-710
   fallback, L715-719 top 5 loop.

9. **`formatarComexParaPrompt(comexData: ComexPromptData): string`** (L726-741): Função
   pública pura. Se `!comexData || !comexData.isExportador` → retorna string vazia
   (early return). Senão, bloco "🚢 COMEX STAT MDIC [🟢 CONFIRMADO]" com `faixaValorEstimado`
   e `principaisNCMs`. Injeta instrução hardcoded: "AUMENTA A NOTA DA DIMENSÃO O" +
   "É OBRIGATÓRIO recomendar Commerce Log... Se grãos/commodities, recomendar também
   OneClick." Evidência: L726 assinatura, L727 early return, L729-738 bloco + instrução.

10. **Algoritmo de ranking de candidatos** (`getBestLookupCandidateMetrics` L301-355 +
    `compareLookupCandidateMetrics` L288-299): Para cada label em
    `[result.grupo, ...result.razoes_sociais]`, computa métricas: `matchType`
    (exact/partial/broad), `exactPhrase` (boolean), `matchedAllTokens` (boolean),
    `matchedTokenCount`, `labelLengthDelta`. A função retorna as melhores métricas
    entre os labels. A comparação (L288-299) prioriza: `exactPhrase` >
    `matchedAllTokens` > `matchType` priority (exact=0, partial=1, broad=2) >
    `matchedTokenCount` (decrescente) > `labelLengthDelta` (crescente) >
    `localeCompare` desempate. Evidência: L301 assinatura, L310-343 loop de labels,
    L288-299 comparator.

11. **Ranking de variantes** (`rankLookupResponse` L357-396 +
    `compareRankedLookupResponses` L398-416): Cada variante de busca produz um
    `RankedLookupResponse`. O comparator (L398-416) prioriza: (a) `encontrado` >
    `não-encontrado`; (b) entre encontrados, melhor `topMetrics` via
    `compareLookupCandidateMetrics`; (c) `isFullVariant` (variante == query original)
    vence; (d) `response.total` menor vence (mais específico); (e) `variantIndex`
    menor vence (ordem de criação). Evidência: L399-401 encontrado vs não, L402-412
    desempate entre encontrados, L415 fallback por índice.

12. **Normalização de texto** (`stripLookupNoise` L214-220 → `normalizeLookupBase`
    L204-212 → `normalizeLookupText` L222-224): `stripLookupNoise` remove prefixos
    "Grupo/Empresa/Fazenda/Usina/Cia" e sufixos "Ltda/S.A./Eireli/ME/EPP" via 2 regexes.
    `normalizeLookupBase` faz lowercase + NFD normalize + remove diacríticos +
    não-alfanuméricos viram espaço + colapsa espaços. `normalizeLookupText` compõe os
    dois. Evidência: L214-220 strip, L204-212 base, L222-224 compose.

13. **`fetchLookup(query: string): Promise<LookupResponse>`** (L537-575): Helper privado.
   Monta URL `LOOKUP_API_URL?q=encodeURIComponent(query)`, chama `fetchWithRetry`, se
   `!resp.ok` loga warn e retorna `{ ok: false, ... }`, senão `resp.text()` +
   `JSON.parse`. Se JSON.parse falhar, loga warn com preview e retorna `{ ok: false }`.
   Evidência: L537 assinatura, L538 URL, L541 fetch, L542-548 HTTP error, L550-558
   text+parse, L559-566 parse error.

14. **`describeLookupEndpoint(url)`** (L79-86): Helper de privacidade de logs. Extrai
    `origin + pathname` da URL — sem query string. Como a query string carrega o nome
    da empresa sendo consultada (`?q=Empresa+Scheffer`), este helper evita vazar nomes
    de prospects para logs de diagnóstico. Evidência: L80-82 `new URL` + slice, L83-85
    fallback.

15. **Variantes de busca em `lookupCliente`** (L467-480): Gera até 3 variantes: (1)
    `nomeLimpo` (sempre); (2) `p1` = primeira palavra com `length > 2`, se não for
    prefixo genérico e diferente de `nomeLimpo`; (3) `strongest` = palavra não-genérica
    mais longa com `length > 3`, se diferente das anteriores. As 3 são consultadas em
    paralelo via `Promise.allSettled(variants.map(v => fetchLookup(v)))` na L482.
    Evidência: L467 p1, L470 isP1Generic check, L472-476 strongest, L478-480 variants
    array, L482 Promise.allSettled.

---

## O que NÃO entendo completamente (Princípio 14)

1. **`partialTokenThreshold` no `getBestLookupCandidateMetrics`** (L305-306): Fórmula
   `queryTokens.length <= 1 ? 1 : Math.min(queryTokens.length, Math.max(2,
   Math.ceil(queryTokens.length / 2)))`. Para 2 tokens → `max(2, 1) = 2` (requer 100%
   match); para 3 tokens → `max(2, 2) = 2` (66%); para 4 → `max(2, 2) = 2` (50%); para
   5 → `max(2, 3) = 3` (60%); para 6 → `max(2, 3) = 3` (50%); para 7 → `max(2, 4) = 4`
   (57%). A intenção parece ser "pelo menos metade dos tokens, mínimo 2, limitado ao
   total de tokens". Mas o `Math.min(queryTokens.length, ...)` só tem efeito para
   `length=1` (já coberto pelo ternário) — para `length >= 4` o `Math.min` nunca
   dispara. Ou é redundante ou cobre um caso que não consigo identificar.

2. **Composição do `_concorrentesSet`** (L11-31): O set inclui tokens genéricos em
   português (`'erp'`, `'gestão'`, `'gestao'`, `'ronda'`, `'rubi'`) que podem causar
   falsos positivos em nomes de empresas do agronegócio (ex: "Gestão Agro", "Ronda
   Rural"). Não está claro se esses tokens foram adicionados para casos específicos
   (ex: evitar que "ERP Senior" seja tratado como prospect) e o collateral damage em
   outros nomes foi aceito, ou se é oversight. Não há teste que cubra o cenário
   "empresa com 'Gestão' no nome é consultada".

3. **`_genericPrefixes` set** (L47-65): Inclui `'usina'` e `'fazenda'` — extremamente
   comuns no agronegócio (mercado-alvo do produto). A função
   `isGenericLookupPrefixToken` (L263-265) checa se um token é prefixo genérico. Em
   `lookupCliente` (L470, L475), isso filtra variantes. Para "Usina Açucareira São
   João", `p1 = 'usina'` é filtrado, e `strongest` cai para a palavra não-genérica mais
   longa (provavelmente "Açucareira" ou "João" dependendo do length). A estratégia é
   defensável, mas o trade-off (perder a palavra de maior valor comercial "Usina" na
   busca) não está documentado. Não sei se o Apps Script endpoint faz substring match
   (nesse caso "Açucareira" ainda retorna a Usina) ou full-text match (nesse caso a
   busca pode falhar).

4. **Contrato do Apps Script endpoint**: O URL `LOOKUP_API_URL?q=<query>` é chamado com
   texto livre, mas não há documentação neste arquivo sobre como o Apps Script faz a
   busca. É substring? Prefix match? Full-text? Fuzzy? Token match? Sem isso, é
   impossível avaliar se as 3 variantes geradas são otimais ou se geram ruído
   desnecessário. Se o endpoint faz substring case-insensitive, a variante `p1` (primeira
   palavra) é quase sempre um subset do `nomeLimpo` e só gera chamadas extras. Se faz
   match exato, as 3 variantes são essenciais.

5. **`MatchType` importado de `../../types`** (L6): Não li o arquivo `types.ts` para
   confirmar o enum completo. `LOOKUP_MATCH_PRIORITY` (L198-202) mapeia apenas 3 valores
   (`exact`, `partial`, `broad`). Se `MatchType` tiver outros valores (ex: `fuzzy`,
   `none`), `LOOKUP_MATCH_PRIORITY[matchType]` retorna `undefined` e a comparação
   `priorityDiff` em L292 resulta em `NaN`, quebrando o sort silenciosamente.

6. **Origem do caso "Pampa vs Pampafoods"** (comentário L316-318): O comentário
   documenta um caso real de confusão entre duas empresas, mas não referencia commit,
   Sentry, issue ou data. Não sei se o guard de 3-branch em `formatarParaPrompt`
   (L592-602) foi adicionado proativamente ou reativamente após um P0 comercial. Sem
   essa história, é difícil avaliar se o guard é suficiente ou se há outros pares de
   empresas com problema similar não cobertos.

7. **`formatarComexParaPrompt` regras hardcoded** (L738): "É OBRIGATÓRIO recomendar o
   módulo Commerce Log na Fase 8... Se os produtos envolverem grãos/commodities,
   recomendar também o OneClick." Não sei a origem dessas regras — playbook comercial?
   Decisão de produto? Acordo com squad de vendas? Se a Senior lançar um módulo
   substituto do Commerce Log, ou descontinuar o OneClick, o código precisa ser
   editado. Não há referência a documento externo ou issue.

8. **Fonte de `ComexPromptData`** (L117-121): A interface é privada (não exportada).
   `formatarComexParaPrompt` a consome, mas NENHUMA função neste arquivo produz
   `ComexPromptData`. O produtor deve ser o chamador (`investigation-orchestration.ts`,
   que importa `formatarComexParaPrompt`). Não sei de onde vêm os dados de exportação
   MDIC — há um serviço `comexService`? Um endpoint? Um scraper? A string "COMEX STAT
   MDIC" (L729) sugere fonte oficial (Ministério do Desenvolvimento, Indústria, Comércio
   e Serviços), mas o pipeline é opaco deste arquivo.

9. **`SystemHealthCheck.tsx` chama `lookupCliente`** (L3 do componente): Não li o
   componente (458 LOC). Não sei: (a) com que frequência chama (a cada 30s? a cada
   minuto?); (b) qual empresa consulta (empresa fixa? random? empresa do usuário
   logado?); (c) o que faz se o lookup falhar (marca sistema como unhealthy? mostra
   warning? ignora?). Cada chamada consome quota do Apps Script; se for muito
   frequente, pode degradar a disponibilidade do lookup para o fluxo de dossiê.

10. **`shouldLogLookupDebug` em module-load** (L70): `import.meta.env?.VITE_VERBOSE_LOGS
    === 'true'`. Não sei se essa env var é `true` em produção, HOMOLOG, ou só local. Se
    for `true` em produção, este arquivo é muito verboso (scoutDiag.debug em ~10 pontos:
    L156, L164, L170, L181, L420, L434, L446, L454, L461, L552). Se for `false`, os
    logs não existem — mas aí não há observabilidade de lookup em produção. Não há
    documento de configuração de env vars.

11. **`LOOKUP_MATCH_PRIORITY` desempate por `localeCompare`** (L298): O último critério
    de desempate entre dois candidatos com métricas idênticas é
    `a.normalizedLabel.localeCompare(b.normalizedLabel)`. Isso significa que, em caso de
    empate total, empresas com nomes que vêm antes alfabeticamente (em locale do browser)
    vencem. Não sei se esse desempate é intencional (preferir empresas "menores"
    alfabeticamente?) ou acidental (apenas para tornar o sort determinístico). Se for
    acidental, qualquer empresa cujo nome começa com letra tardia (ex: "Zé Agro") perde
    desempate sistemático.

12. **Por que `MAX_RETRIES = 3` e `TIMEOUT_MS = 15000`** (L68-69): O comentário na L68
    diz "15 segundos (Apps Script cold start pode demorar)". Mas 3 retries × 15s = 45s
    no pior caso, mais backoff (1+2+4=7s) = 52s por variante. Com 3 variantes em
    paralelo via `Promise.allSettled`, o tempo total é ~52s no pior caso. Não sei se
    esses números foram calibrados contra medições reais de cold start do Apps Script
    ou se são estimativas. Se o cold start real for > 15s, o timeout mata a tentativa
    antes do Apps Script responder.

13. **`benchmarkClientes` faz retry de JSON.parse mas `fetchLookup` não**: Em
    `benchmarkClientes` (L684-696), se JSON.parse falha, há retry após 1500ms. Em
    `fetchLookup` (L559-566), se JSON.parse falha, retorna `{ ok: false }` sem retry.
    A inconsistência não é explicada. Presumo que benchmark seja mais tolerante porque
    é estágio opcional do waterfall, mas o código não documenta isso.

---

## Plano de refatoração futuro

Nenhuma extração abaixo deve ser executada antes da Fase 5 (testes de carga) e da
Fase 7 (monitoramento) do plano V3. Todas exigem `npm run typecheck` e `npm test`
passando, mais regressão manual: gerar 3 dossiês completos em HOMOLOG com empresas
do agronegócio brasileiro (1 cliente Senior conhecido, 1 prospect, 1 empresa com nome
ambíguo estilo "Pampa/Pampafoods") e validar que o output é equivalente ao pré-refactor.

### Triviais (risco baixo, funções puras, 0 dependências externas)

1. **Extrair `isConcorrenteOuPropria` + `_concorrentesSet`** para
   `services/competitorService.ts` (já existe, exporta `CONCORRENTES`). ~35 linhas.
   Função pura, sem I/O. Pré-requisito: nenhum. Validação: `npm test` (4 testes
   existentes cobrem a função).

2. **Extrair `describeLookupEndpoint` + `truncateForDiag` + `errorMessage`** para
   `utils/diagnosticHelpers.ts`. ~15 linhas, funções puras. Pré-requisito: nenhum.
   Validação: `npm test`.

3. **Extrair constantes de configuração** (`TIMEOUT_MS`, `MAX_RETRIES`,
   `NOT_FOUND_TTL_MS`, `COLD_START_RETRY_DELAY_MS`) para `config/lookupConfig.ts`.
   ~10 linhas. Pré-requisito: nenhum. Validação: `npm test`.

4. **Extrair `formatarComexParaPrompt`** para
   `services/lookupFormatters/comexFormatter.ts`. ~16 linhas, função pura. Permite
   revisão separada das regras comerciais hardcoded (L738). Pré-requisito: nenhum.
   Validação: escrever 2 testes unitários (exportador com NCMs, não-exportador).

5. **Extrair `formatarBenchmarkParaPrompt`** para
   `services/lookupFormatters/benchmarkFormatter.ts`. ~22 linhas, função pura. Remove
   parâmetro morto `_empresaAlvo`. Pré-requisito: nenhum. Validação: escrever 2 testes
   unitários (com results, sem results).

### Médio (risco médio, requer testes baseline)

6. **Extrair normalização de texto** (`stripLookupNoise`, `normalizeLookupBase`,
   `normalizeLookupText`) para `utils/lookupNormalize.ts`. ~25 linhas, funções puras.
   Pré-requisito: nenhum. Validação: testes unitários com nomes reais do agronegócio
   (acento, sufixo Ltda/S.A., prefixo Grupo/Usina, maiúsculas).

7. **Extrair tokenização** (`getRelevantLookupTokens`, `isGenericLookupPrefixToken`,
   `LOOKUP_TOKEN_STOPWORDS`, `GENERIC_PREFIX_NORMALIZED`, `_genericPrefixes`) para
   `utils/lookupTokenize.ts`. ~40 linhas. Pré-requisito: extração #6. Validação:
   testes unitários cobrindo stopword removal, prefixo genérico, token único.

8. **Extrair cache de duas camadas** (`_lookupCache`, `_notFoundCache`, cache reads/writes
   em `lookupCliente`) para `services/lookupCache.ts` com interface
   `getPositive(key) / setPositive(key, data) / getNegative(key) / setNegative(key, data)`.
   ~50 linhas. Pré-requisito: nenhum. Validação: `npm test` (7 testes de cache em
   `lookupCliente` indiretamente cobrem).

9. **Extrair `fetchWithTimeout` + `fetchWithRetry`** para `utils/httpClient.ts`. ~62
   linhas. Pode ser reutilizado por outros serviços que falam com Apps Script (ex:
   `services/feedbackRemoteStore.ts`?). Pré-requisito: nenhum. Validação: `npm test` +
   regressão manual (testar cold start real em HOMOLOG).

10. **Extrair algoritmo de ranking** (`getBestLookupCandidateMetrics`,
    `compareLookupCandidateMetrics`, `rankLookupResponse`,
    `compareRankedLookupResponses`, `LookupCandidateMetrics`,
    `RankedLookupResponse`, `LOOKUP_MATCH_PRIORITY`) para `services/lookupRanking.ts`.
    ~145 linhas. Pré-requisito: extração #6 + #7. Validação: testes unitários com
    pares problemáticos documentados (Pampa/Pampafoods, nomes com tokens compartilhados).

### Complexo (risco alto, requer Fase 5 + 7 completas)

11. **Extrair `lookupCliente` em 3 sub-funções**: `buildLookupVariants(nome)` →
    `queryAllVariants(variants)` → `selectBestRanked(ranked)`. Cada uma em arquivo
    próprio. `lookupCliente` vira orquestrador de ~30 linhas. Pré-requisito: extrações
    #6-#10 + testes E2E (Fase 5) + monitoramento de latência de lookup (Fase 7).
    Validação: 3 dossiês em HOMOLOG com empresas distintas, comparar `encontrado`,
    `matchType`, `results[0].grupo` com baseline pré-refactor.

12. **Mover `benchmarkClientes` para `services/benchmarkService.ts`** com retry de cold
    start encapsulado. ~45 linhas. Pré-requisito: extração #9 (httpClient) + #11.
    Validação: regressão em 3 dossiês com benchmark habilitado.

13. **Separar formatadores em `services/lookupFormatters/`**: 3 arquivos (crum, benchmark,
    comex) já extraídos nos itens #4-#5. Reorganizar imports dos 4 consumidores
    (`investigation-orchestration.ts`, `waterfall-orchestrator.ts`,
    `seniorEvidence.ts`, `SystemHealthCheck.tsx`). Pré-requisito: extrações #4-#5 + #11.
    Validação: `npm test` + checar que nenhum import quebrou.

14. **Mover interfaces públicas** (`ClienteResult`, `LookupResponse`, `BenchmarkResponse`)
    para `services/types/clientLookup.ts`. Permite que consumidores importem tipos sem
    puxar a lógica. Pré-requisito: extrações #11-#13. Validação: `npm run typecheck`.

---

## Justificativa de não refatorar agora

1. **Princípio 4 (não refatorar o que não entende)**: Após ler o arquivo completamente
   (741 linhas), consigo explicar 15 das 19 responsabilidades acumuladas com evidência
   de file:line. As 4 que não entendo completamente (threshold empírico em
   `partialTokenThreshold`, composição do `_concorrentesSet` com tokens genéricos,
   contrato do Apps Script endpoint, origem do caso Pampa/Pampafoods) são
   pré-requisitos para qualquer extração segura do algoritmo de ranking — justamente a
   parte de maior risco comercial.

2. **Piloto de 20 usuários ativo**: Os 6 exports deste arquivo alimentam tanto o chat
   (via `investigation-orchestration.ts`) quanto o waterfall (via
   `waterfall-orchestrator.ts`). Refatorar sem suite de testes de aceitação robusta
   (13 testes em 411 LOC cobrem só 6 das 6 funções públicas, mas 0 das 16 funções
   privadas de ranking/normalização isoladamente) arrisca interromper a operação
   comercial. Princípio 1: documentação > refactor arriscado.

3. **LiteLLM HOMOLOG recém-estabilizado em produção**: O handoff v2 registra que o
   LiteLLM foi promovido a produção na Fase 3. O fluxo de dossiê agora passa por
   `proxyChatSendMessage` e `proxyGenerateContent` (god component #3, ADR-0003), que
   por sua vez consome `formatarParaPrompt` e `lookupCliente` deste arquivo. Qualquer
   refactor que mude o contrato do `LookupResponse` (forma como `encontrado`,
   `matchType`, `results` são estruturados) propaga regressão para o LLM.

4. **Apps Script como backend frágil**: O backend não é um serviço com SLA — é um
   Google Apps Script com cold start de até 15s, quota diária, e sem monitoramento
   externo. As mitigações (retry 3x, timeout 15s, cache TTL 30s, retry de JSON.parse)
   foram afinadas iterativamente contra incidentes reais de cold start. Refatorar o
   fetch sem reproduzir esses incidentes em HOMOLOG pode reabrir P0 silencioso.

5. **Dependência com ADR-0001 (waterfall-orchestrator.ts) e ADR-0003
   (investigation-orchestration.ts)**: O `waterfall-orchestrator.ts` (god component #1)
   importa `formatarParaPrompt` + `lookupCliente` (L25) e o
   `investigation-orchestration.ts` (god component #3) importa 6 símbolos deste arquivo
   (L8-17). Refatorar este arquivo sem coordenar com os refactorings planejados nos
   ADRs 0001 e 0003 é receita para quebra de contrato. Os 3 god components formam um
   cluster coeso que deve ser refatorado em sequência, não isoladamente.

6. **Custo de extrair > custo de manter agora**: O arquivo é estável na branch
   `stabilize/from-production-fe6c6f9`. Não há P0 aberto contra ele no Sentry
   (verificado no handoff). A documentação deste ADR já é a mitigação: future
   engenheiro saberá o que cada seção faz, o que NÃO entende, e qual o plano de
   extração seguro. Princípio 1 reforçado: documentação canônica vale mais que refactor
   arriscado para portfólio do Bruno (subir de cargo para Data Analyst).

---

## Referências

- **Código fonte**:
  - `services/clientLookupService.ts` (741 LOC — este ADR)
  - `services/apiConfig.ts` (57 LOC — define `LOOKUP_URL` com fallback hardcoded em L6)
  - `services/competitors.ts` (fonte de `CONCORRENTES` — não lido neste ADR)
  - `services/socio-search/cache.ts` (sibling que USA Supabase + service_role —
    NÃO confundir com este god component; alvo do Ticket C / PR #397)

- **Consumidores em produção** (4 arquivos):
  - `services/llm/investigation-orchestration.ts:8-17` (importa 6 símbolos:
    `benchmarkClientes`, `formatarBenchmarkParaPrompt`, `formatarComexParaPrompt`,
    `formatarParaPrompt`, `isConcorrenteOuPropria`, `lookupCliente` + tipos)
  - `features/dossier/waterfall-orchestrator.ts:25` (importa `formatarParaPrompt`,
    `lookupCliente`)
  - `utils/seniorEvidence.ts:1` (importa tipo `LookupResponse`)
  - `components/SystemHealthCheck.tsx:3` (importa `lookupCliente` — uso em health
    check, risco discutido na seção Riscos #6)

- **Testes** (6 arquivos):
  - `tests/services/clientLookupService.test.ts` (411 LOC, 13 testes em 5 describes:
    `isConcorrenteOuPropria` ×4, `lookupCliente - cache behavior` ×4,
    `lookupCliente - error handling` ×3, `formatarParaPrompt` ×3, `benchmarkClientes` ×3)
  - `tests/services/investigation-orchestration.test.ts:32-34` (mocka este módulo)
  - `tests/services/geminiService.test.ts:29` (mocka este módulo)
  - `tests/features/dossier/waterfall-orchestrator.test.ts:48` (mocka este módulo)
  - `tests/components/SystemHealthCheck.test.tsx:19` (mocka este módulo)
  - `tests/App.dossierGolden.test.tsx:237` (mocka este módulo)

- **Documentação relacionada**:
  - `docs/adr/0001-waterfall-orchestrator-god-component.md` (god component #1,
    consumidor de `formatarParaPrompt` + `lookupCliente`)
  - `docs/adr/0002-app-tsx-god-component.md` (god component #2)
  - `docs/adr/0003-investigation-orchestration-god-component.md` (god component #3,
    maior consumidor deste arquivo — importa 6 símbolos)
  - `handoff/scout360-handoff-v2/PRINCIPLES.md` (Princípios 4, 6, 9, 14)
  - `worklog.md` Task ID 4 (investigação de prompts duplicados — confirmou que
    `applyPromptLeakShield` é chamado em ADR-0003, indiretamente relevante aqui)

- **Ticket C / PR #397 (socio-search → createClient)**: Migração aplicada em
  `services/socio-search/cache.ts` (NÃO neste arquivo). Este god component continua
  usando Google Apps Script + Google Sheets como backend. A Phase 7 (segurança /
  service-role keys) NÃO precisa tocar este arquivo — apenas o sibling
  `services/socio-search/cache.ts`. Confusão é fácil porque ambos os arquivos vivem
  sob `services/` e ambos tratam de "dados de clientes", mas a infra é diferente.

- **Commits relevantes** (branch `stabilize/from-production-fe6c6f9`):
  - `78c919e7` — Fase 3: desgeminização (rename `services/gemini/` → `services/llm/`)
  - Não há commit direto neste arquivo identificável como P0 no handoff v2; estabilidade
    sugere que o arquivo foi afinado incrementalmente ao longo dos sprints sem incidente
    recente.

---

## Histórico de revisão

| Data | Versão | Autor | Nota |
|---|---|---|---|
| 29/06/2026 | 1.0 | IA gestora (ADR author Task ID 7) | Autor — leu 741 LOC, grep 41 declarações top-level + 4 callers produção + 6 arquivos de teste, 10 seções, Princípio 14 aplicado (15 itens em "O que entendo" vs 13 em "O que NÃO entendo") |
| Pendente | — | IA gestora (validação) | Cross-check com ADR-0001, ADR-0002 e ADR-0003 para consistência de estilo e clarificar relação com Ticket C / PR #397 |
| Pendente | — | Bruno | Revisão — confirmação de que não refatorar agora é a decisão correta |
| Pendente | — | Sênior (Fase 9) | Revisão técnica aprofundada antes de iniciar qualquer extração; atenção especial ao algoritmo de ranking (L301-416) e à composição do `_concorrentesSet` (L11-31) |

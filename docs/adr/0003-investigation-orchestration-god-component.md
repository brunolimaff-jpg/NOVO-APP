# ADR-0003: investigation-orchestration.ts como god component

**Data:** 29/06/2026
**Status:** Aceito — débito técnico documentado
**Componente:** `services/llm/investigation-orchestration.ts` (678 LOC)
**Branch de referência:** `stabilize/from-production-fe6c6f9` @ `4e65bb1`
**Decisor:** Bruno + IA gestora

---

## Contexto

O `services/llm/investigation-orchestration.ts` é o **gateway único de comunicação com
LLMs** do Senior Scout 360. Toda interação do usuário com modelos de IA — seja uma
mensagem de chat comum, um dossiê completo (mega prompt), um deep dive temático ou um
benchmark de mercado — passa por uma das três funções públicas exportadas por este
arquivo: `sendMessageToGemini`, `generateDossierModule` e `getIsolatedBenchmark`.

O arquivo vive dentro de `services/llm/`, pasta renomeada a partir de `services/gemini/`
no commit `78c919e7` (Fase 3 — desgeminização). A renomeação sinaliza a intenção de
abstrair o provedor de LLM, mas o conteúdo ainda mantém o nome histórico
`sendMessageToGemini` porque o `message-orchestrator.ts` e os testes já dependem desse
contrato. Internamente, porém, o arquivo **não chama a API do Gemini diretamente**: ele
delega para `proxyChatSendMessage` e `proxyGenerateContent` importados de
`../llmProxy` (linha 7). Esse proxy é o ponto onde o LiteLLM HOMOLOG — promovido a
produção na Fase 3 do plano V3 — é roteado de forma transparente.

No fluxo do waterfall (ADR-0001), este arquivo é chamado em pelo menos 3 pontos
distintos: o `message-orchestrator.ts` usa `sendMessageToGemini` para a primeira
passada (intenção + complexidade), o `waterfall-orchestrator.ts` usa
`generateDossierModule` em loop para os 7 módulos especializados, e o
`benchmark-stage.ts` usa `getIsolatedBenchmark` para o estágio de benchmark entre
módulos. Ou seja: a integrity do dossiê depende deste arquivo.

O arquivo cresceu organicamente ao longo dos sprints de estabilização porque cada nova
capacidade de negócio (deep dive corporate/tech/compliance/rh/logistica, follow-up
cirúrgico, foundation cache, prompt leak shield, grounding fallback, PORTA feeds,
senior evidence constraints, sócio rural research) foi adicionada como mais um bloco
na função pública existente. O resultado é uma função `sendMessageToGemini` de
**~393 linhas** (linhas 151-543) que mistura 12+ responsabilidades, dificilmente
testável de forma isolada.

Por que isto não foi refatorado antes: o piloto de 20 usuários do agronegócio brasileiro
depende da geração de dossiês funcionando. LiteLLM HOMOLOG acabou de estabilizar em
produção (Fase 3 do plano V3) e qualquer refactor que mude a ordem das chamadas ao
proxy ou o formato do systemPrompt pode quebrar silenciosamente a geração de dossiês.
Por Princípio 4 (não refatorar o que não entende), o caminho seguro é documentar como
débito conhecido e planejar extrações para depois que a Fase 5 (testes de carga) e a
Fase 7 (monitoramento) estiverem consolidadas.

---

## Responsabilidades acumuladas

| # | Responsabilidade | Linhas aprox | Deveria estar em |
|---|---|---|---|
| 1 | Roteamento de chat: detecção de CNPJ, mega prompt, deep dive, follow-up cirúrgico | 196-220 | `services/llm/intent-detector.ts` |
| 2 | Lookup cadastral (`lookupCliente`) com AbortSignal + Promise.allSettled + extração de ClienteSeniorData | 232-291 | `services/llm/cadastral-enrichment.ts` |
| 3 | Recuperação de cliente senior do histórico quando lookup atual falha (deep dive / follow-up) | 294-302 | `services/llm/senior-evidence-recovery.ts` |
| 4 | Composição de system prompt com follow-up guard, concorrentes regionais, porta context e extra context | 304-342 | `services/llm/system-prompt-builder.ts` |
| 5 | Construção de conversation history + prompt budget log (chars do user/system/history, threshold 120.000) | 347-389 | `services/llm/prompt-budget.ts` |
| 6 | Inicialização / reset de PORTA state para mega prompt e deep dive | 94-114, 363-369 | `services/portaStateService.ts` (já existe) |
| 7 | Seleção de modelo (`selectMainChatModelId`) com branching por isDeepDive/isMegaPrompt/shouldForceDirectAnswer | 371-375 | `services/llm/config.ts` (já existe) |
| 8 | Chamada LLM principal com retry (maxRetries 5, backoff 2s-30s) via `withAutoRetry` | 398-417 | ✅ no arquivo (correto) |
| 9 | Fallback para TACTICAL_MODEL_ID sem grounding em erros TIMEOUT/NETWORK/MODEL_OVERLOADED/SERVER | 418-444 | `services/llm/grounding-fallback.ts` |
| 10 | Pós-processamento: sanitizeSensitivePersonalData + enforceSeniorEvidenceConstraints + applyPromptLeakShield | 447-463 | `services/llm/response-postprocess.ts` |
| 11 | Processamento de PORTA feeds (adjustments, flags, segments) + emissão de score consolidado | 116-149, 485-491 | `services/llm/porta-feeds-processor.ts` |
| 12 | Detecção de concorrente na resposta final via `isConcorrenteOuPropria` | 493-504 | `services/competitorService.ts` (já existe) |
| 13 | Recuperação de "missed open question" (`looksLikeMissedOpenQuestionAnswer` + `trackOpenQuestionRecoveryAttempt`) | 516-526 | `services/llm/recovery.ts` (já existe) |
| 14 | Normalização de grounding sources + derivação de verification status | 528-531 | `services/llm/sources.ts` (já existe) |
| 15 | Geração de módulo de dossiê (specialist prompt + foundation block + socioRural + cachedContent) | 545-656 | `services/llm/dossier-module-generator.ts` |
| 16 | Benchmark isolado com retry 1x + timeout externo | 658-678 | `services/llm/benchmark-fetcher.ts` |
| 17 | Helper `shouldEmitDeepDiveStatus` (5 labels: corporate/tech/compliance/rh/logistica) | 50-59 | `services/llm/status.ts` (já existe) |
| 18 | Helper `buildExtraContext` (concatena clienteData + comexData + concorrentes + porta) | 72-92 | `services/llm/system-prompt-builder.ts` |
| 19 | Constante `FOLLOW_UP_SYSTEM_INSTRUCTION` (instruction de 9 linhas em PT-BR sem acentos) | 61-70 | `services/llm/prompts/follow-up.ts` |
| 20 | 18+ chamadas a `emitDossieStatus(onStatus, ...)` sequenciando a UI de progresso | disperso | `services/llm/status.ts` (já existe) |

---

## Riscos conhecidos

1. **3 exports públicos são a única porta de entrada para LLMs**: Se este arquivo quebrar,
   nenhum dossiê é gerado, nenhuma mensagem de chat é respondida, nenhum benchmark é produzido.
   O blast radius é total. Consumidores: `features/chat/message-orchestrator.ts:7`
   (`sendMessageToGemini`), `features/dossier/waterfall-orchestrator.ts:16`
   (`generateDossierModule`), `features/dossier/porta-reconciliation.ts:3`
   (`generateDossierModule`), `features/dossier/benchmark-stage.ts:2` (`getIsolatedBenchmark`).
   Evidência confirmada por grep em `services/llmService.ts:13` (barrel re-export).

2. **`sendMessageToGemini` tem ~393 linhas e 12+ responsabilidades misturadas**: Detecção
   de intenção, lookup cadastral, composição de prompt, chamada LLM, fallback,
   pós-processamento, PORTA feeds, detecção de concorrente, recuperação de missed open
   question, normalização de fontes — tudo no mesmo corpo de função. Bug introduzido em
   uma seção pode se manifestar em outra aparentemente não relacionada. Probabilidade de
   regressão silenciosa: alta.

3. **Threshold mágico de 120.000 chars** (linha 383): Se `userChars + systemChars +
   historyChars > 120000`, emite `scoutDiag.warn` mas não bloqueia nem trunca. Não está
   claro se esse número vem da janela de contexto do modelo ou de observação empírica.
   Se o modelo mudar (ex: troca de Gemini por DeepSeek V3.2 via LiteLLM), o threshold
   pode ficar obsoleto sem aviso.

4. **Fallback de grounding com 4 códigos de erro hardcoded** (linha 421):
   `['TIMEOUT', 'NETWORK', 'MODEL_OVERLOADED', 'SERVER']`. Se um novo código for
   adicionado em `normalizeAppError` (ex: `RATE_LIMITED`, `QUOTA_EXCEEDED`), o
   fallback não dispara e o usuário recebe erro ao invés de resposta sem grounding.
   Não há teste que cubra todos os códigos do enum de erro.

5. **`applyPromptLeakShield` chamado em 2 pontos com semântica diferente**:
   Na linha 449 (chat) sem `preserveInternalMarkersWhenSafe`. Na linha 606 (módulo de
   dossiê) COM `preserveInternalMarkersWhenSafe: true`. A diferença não está documentada.
   Se o shield bloquear erroneamente um módulo, o PORTA feed `[[PORTA_FEED_O:...]]`
   pode ser preservado ou descartado dependendo do caminho.

6. **`ghostReason: 'prompt_leak_blocked'` no retorno** (linha 541): Quando o shield
   bloqueia, o resultado volta com `sources: []`, `scorePorta: null`,
   `clienteSeniorData: undefined`, `suggestions: []` e `ghostReason` setado. Não está
   claro sem ler o `message-orchestrator.ts` como a UI trata essa condição — se mostra
   mensagem de erro, se renderiza "ghost" diferente, se faz retry.

7. **`promptBudget` construído em 2 etapas** (linhas 349-361 e 377-378): O objeto é
   inicializado com `modelToUse: null` e `shouldUseGrounding: false` e depois mutado
   após `selectMainChatModelId` retornar. Code smell que indica refactor parcial.

8. **18+ `emitDossieStatus` calls sequenciados na ordem da UI**: A sequência `intent →
   complexity → context → enrichment → cadastral → concorrentes → deepResearch →
   corporate → tech → compliance → rh → logistica → context → prompt → history → model →
   response → validation → synthesis → scoring → consolidando → finalReview → hooks` é
   hardcoded na ordem das chamadas no código. Se a ordem mudar (ex: trocar contexto e
   enrichment), a UI de progresso mostra passos fora de sequência sem erro de compilação.

9. **5 testes em 228 LOC cobrem apenas 3 cenários de `generateDossierModule` + 1 de
   `sendMessageToGemini`**: O teste existente (`tests/services/investigation-orchestration.test.ts`)
   não cobre fallback de grounding, PORTA feeds, deep dive routing, follow-up guard,
   prompt budget threshold, nem `getIsolatedBenchmark`. Refatorar sem ampliar coverage é aposta.

10. **`withAbortSignal` helper duplicado dentro de `sendMessageToGemini`** (linhas 177-194):
    O mesmo padrão existe no `waterfall-orchestrator.ts` (god component #1, ADR-0001
    item 8 do "O que NÃO entendo"). Duplicar lógica de abort entre dois god components
    é código duplicado de baixo nível — extração trivial mas ainda não feita.

---

## O que entendo que faz (Princípio 14)

1. **`sendMessageToGemini`** (linhas 151-543): Função pública assíncrona exportada.
   É o ponto de entrada do chat com o LLM. Recebe `userMessage`, `conversationHistory`,
   `systemPrompt`, `options` (useGrounding, thinkingLevel, signal, callbacks onText/onStatus/
   onScorePorta/onCompetitor, sessionId, hintedCompany, isFollowUp). Retorna
   `SendMessageToGeminiResult` com `text`, `sources`, `webVerificationStatus`,
   `suggestions`, `scorePorta`, `clienteSeniorData`, `ghostReason`. Evidência: assinatura
   linhas 151-157 e return nas linhas 534-542.

2. **Detecção de CNPJ e empresa alvo** (linhas 204-230): Regex
   `\b(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{14})\b` extrai CNPJ do userMessage.
   Se `isMegaPromptMessage`, regex secundário `dossi[eê]\s+completo\s+de\s+\[?([A-ZÀ-Úa-zà-ú][^\]\n]{2,80})\]?`
   extrai nome da empresa. Evidência: linhas 204-205 e 222-230.

3. **Lookup cadastral com Promise.allSettled** (linhas 247-291): Se `targetCompanyForLookup`
   não for null, chama `lookupCliente` envolto em `withAbortSignal` e `Promise.allSettled`.
   Em caso de rejeição, loga erro mas não quebra. Em caso de sucesso, extrai
   `clienteSeniorData` via `extractClienteSeniorData`.

4. **Recuperação de cliente senior do histórico** (linhas 294-302): Se for deep dive ou
   follow-up e o lookup atual não retornou cliente senior, busca no `conversationHistory`
   a última mensagem de bot com `clienteSeniorData?.encontrado`.

5. **Composição do fullSystemPrompt** (linhas 337-342): Se `isRegularFollowUp`, anexa
   `FOLLOW_UP_SYSTEM_INSTRUCTION` ao systemPrompt base. Se houver `extraContext`
   (clienteData + comexData + concorrentes + porta), anexa também. Evidência: linhas
   337-342 + `buildExtraContext` nas linhas 72-92.

6. **Chamada LLM principal com retry** (linhas 398-417): Chama `proxyChatSendMessage` via
   `withAutoRetry` com `maxRetries: 5`, `baseDelayMs: 2000`, `maxDelayMs: 30000`.
   Passa `model: modelToUse`, `systemInstruction: fullSystemPrompt`, `history`,
   `message: userMessage`, `useGrounding`, `thinkingLevel`, `thinkingMode`, `temperature: 0.1`.

7. **Fallback para TACTICAL_MODEL_ID sem grounding** (linhas 418-444): Se a chamada
   principal falhar e o erro normalizado for um de `['TIMEOUT', 'NETWORK',
   'MODEL_OVERLOADED', 'SERVER']`, faz segunda chamada com `model: TACTICAL_MODEL_ID`,
   `useGrounding: false`, `maxRetries: 4`, `maxDelayMs: 20000`. Marca `usedGroundingFallback = true`.

8. **Pós-processamento da resposta** (linhas 447-463): Aplica em sequência
   `sanitizeStreamText` → `sanitizeSensitivePersonalData` →
   `enforceSeniorEvidenceConstraints` → `applyPromptLeakShield`. Se shield bloquear,
   loga warn com `fingerprint`, `indicators`, `modelToUse` e substitui `finalText`
   pelo texto tratado pelo shield.

9. **`generateDossierModule`** (linhas 545-656): Gera um módulo especializado do dossiê.
   Recebe `moduleName`, `empresaAlvo`, `foundationBlock`, `specialistPrompt`, `extraContext`,
   `options`. Constrói `dynamicPrompt` = specialist + socioRural + extraContext. Se
   `options.foundationCacheName` for fornecido, usa `cachedContent` (não passa systemInstruction
   nem tools); caso contrário passa `systemInstruction: finalPrompt` e `tools: [{ googleSearch: {} }]`
   se `useGrounding`. Modelo: `STABLE_RESEARCH_MODEL_ID`. Temperatura: 0.2. maxOutputTokens: 8192.

10. **`getIsolatedBenchmark`** (linhas 658-678): Função pública menor. Valida empresa com
    `isValidEmpresaParaBenchmark`, chama `benchmarkClientes` via `withAutoRetry(maxRetries: 1)`
    envolto em `runWithStepTimeout`. Se `benchmarkResult.ok && benchmarkResult.results?.length`,
    retorna string formatada via `formatarBenchmarkParaPrompt`; caso contrário retorna ''.

11. **`shouldEmitDeepDiveStatus`** (linhas 50-59): Helper que recebe `userMessage` e label
    ('corporate' | 'tech' | 'compliance' | 'rh' | 'logistica') e retorna true se o userMessage
    contém keywords específicas (ex: 'TEIA SOCIETÁRIA', 'M&A' para corporate). Usado para
    emitir o status de UI correto para cada tipo de deep dive nas linhas 322-326.

12. **`processPortaFeeds`** (linhas 116-149): Helper que extrai PORTA feeds (adjustments,
    flags, segments) da resposta via `parsePortaFeeds`, adiciona ao porta state global, e
    retorna score consolidado (ou base score se não houver consolidado).

13. **`initializePortaState`** (linhas 94-114): Helper que reseta e inicializa o porta state
    para mega prompts; para deep dives, só inicializa se o sessionId mudou.

14. **`buildExtraContext`** (linhas 72-92): Helper puro que formata clienteData (via
    `formatarParaPrompt`), comexData (se exportador), concorrentesContext e portaContext em
    uma string única separada por `\n[CONCORRENTES]\n` e `\n[PORTA STATE]\n`.

15. **`FOLLOW_UP_SYSTEM_INSTRUCTION`** (linhas 61-70): Constante string com instrução em
    português (sem acentos) que diz ao modelo para responder só a pergunta atual em modo
    follow-up cirúrgico, sem reexecutar/imitar dossiê anterior. Anexada ao systemPrompt
    base quando `isRegularFollowUp`.

---

## O que NÃO entendo completamente (Princípio 14)

1. **`isMegaPromptRequest` e `isDeepDiveMessage`** (linhas 213-214): Importados de
   `./runtime`. Não li esse arquivo. Sei que `isMegaPromptMessage` é true quando o usuário
   pede "Dossiê completo de [EMPRESA]" e que `isDeepDive` é true em mensagens de
   aprofundamento temático. Mas não sei quais regexes exatos identificam cada caso, nem
   como um deep dive é disparado (parece vir de um botão na UI que prefixa o userMessage).

2. **`selectMainChatModelId`** (linha 371): Importado de `./config`. Recebe `{ isDeepDive,
   isMegaPromptMessage, shouldForceDirectAnswer }`. Existem 3 modelos em jogo: o principal
   (selecionado por esta função), `TACTICAL_MODEL_ID` (fallback sem grounding, linha 432)
   e `STABLE_RESEARCH_MODEL_ID` (módulos de dossiê, linha 585). Não sei qual modelo cada
   constante aponta — presumo DeepSeek V3.2 (LiteLLM HOMOLOG em prod) e Gemini Flash
   (tático), mas não verifiquei.

3. **`looksLikeMissedOpenQuestionAnswer` + `trackOpenQuestionRecoveryAttempt`**
   (linhas 516-526): Importados de `./recovery`. A função detecta se a resposta do LLM
   "parece ter perdido uma pergunta aberta" (não sei o critério — regex? heurística?). O
   que acontece depois de `trackOpenQuestionRecoveryAttempt()` é opaco: não vejo ação
   corretiva (não há retry, não há fallback). Presumo que a recuperação acontece em outro
   ponto do pipeline ou é apenas telemetria.

4. **`ghostReason: 'prompt_leak_blocked'`** (linha 541): Quando o shield bloqueia, o
   retorno carrega `ghostReason` setado e `sources: []`, `scorePorta: null`,
   `clienteSeniorData: undefined`. Não sei como o `message-orchestrator.ts` (consumidor)
   trata essa condição. "Ghost" sugere que a mensagem existe mas é marcada como
   não-exibível, mas o contrato exato com a UI não está documentado aqui.

5. **Por que `temperature: 0.1` no chat (linha 412) e `0.2` no módulo (linha 590)**:
   Diferença de 0.1 ponto não documentada. Imagino que chat seja mais determinístico
   (resposta direta) e módulos aceitem mais variação criativa para a redação do dossiê,
   mas é hipótese. Mudar esses valores sem entender o trade-off pode alterar a qualidade.

6. **Threshold mágico de 120.000 chars** (linha 383): Não sei de onde vem. Poderia ser a
   janela de contexto do DeepSeek V3.2 (64K tokens ≈ 256K chars) dividida por 2 para deixar
   margem, ou um número empírico. Se o modelo principal mudar, o threshold precisa ser
   revisitado mas não há asserção nem teste que cubra isso.

7. **Por que `withAbortSignal` é helper local e não AbortSignal nativo** (linhas 177-194):
   Helper cria nova Promise que adiciona listener ao `sig.addEventListener('abort', ...)`
   e remove depois. Padrão similar existe no `waterfall-orchestrator.ts` (ADR-0001 item 8
   do "O que NÃO entendo"). Provavelmente necessário porque `proxyChatSendMessage` não
   expõe AbortSignal nativo ao fetch interno, mas não confirmei.

8. **`void nomeVendedor;`** (linha 174): O parâmetro `nomeVendedor` é desestruturado de
   options (linha 168) e imediatamente voided. Não é usado em nenhum lugar do corpo da
   função. Presumo que seja compatibilidade com chamadores antigos, mas o porquê da
   remoção do uso (era para personalizar o system prompt?) não está documentado.

9. **Interação entre `isConcorrenteOuPropria` e a UI** (linhas 493-504): Se a resposta do
   LLM mencionar um concorrente, callback `onCompetitor` é disparado com `{ encontrado: true,
   detected: true, names: ['Concorrente Detectado'] }`. Não sei como o `message-orchestrator.ts`
   reage — se mostra warning, rastreia no Sentry, bloqueia a resposta. O `names` sempre é
   `['Concorrente Detectado']` (string fixa), o que sugere perda de informação.

10. **Ordem dos 18+ `emitDossieStatus`** (linhas 200-514): A sequência `intent →
    complexity → context → enrichment → cadastral → ... → finalReview → hooks` é implícita
    na ordem das chamadas no código. Não sei se o consumidor (`onStatus` callback) espera
    uma ordem canônica ou se tolera reordenação. Refatorar pode mudar a ordem acidentalmente.

11. **`enforceSeniorEvidenceConstraints`** (linha 448): Importado de `../../utils/seniorEvidence`.
    Recebe `finalText`, `empresaAlvo`, `clienteSeniorData` e retorna texto possivelmente
    modificado. Não sei quais constraints específicas são aplicadas — parece restringir
    afirmações sobre senioridade do cliente sem evidência cadastral, mas o critério exato
    não é evidente neste arquivo.

12. **`buildSocioRuralInstructionContext`** (linha 553, em `generateDossierModule`):
    Importado de `../../utils/socioRuralResearch`. Recebe `empresaAlvo` e `extraContext` e
    retorna string anexada ao `dynamicPrompt`. Não sei o que ele adiciona — provavelmente
    contexto de pesquisa fundiária/sócio-rural (INCRA, CAR, receita federal), mas o conteúdo
    gerado não é visível aqui.

---

## Plano de refatoração futuro

Nenhuma extração abaixo deve ser executada antes da Fase 5 (testes de carga) e da
Fase 7 (monitoramento) do plano V3. Todas exigem `npm run typecheck` e `npm test`
passando, mais regressão manual: gerar 3 dossiês completos em HOMOLOG com empresas
do agronegócio brasileiro e validar que o output é equivalente ao pré-refactor.

### Triviais (risco baixo, funções puras)

1. **Extrair `shouldEmitDeepDiveStatus`** para `services/llm/status.ts`. ~10 linhas, função pura.
   Pré-requisito: nenhum. Validação: `npm test`.
2. **Extrair `FOLLOW_UP_SYSTEM_INSTRUCTION`** para `services/llm/prompts/follow-up.ts`. ~10 linhas,
   constante. Pré-requisito: nenhum. Validação: `npm test` + inspeção visual.
3. **Extrair `buildExtraContext`** para `services/llm/system-prompt-builder.ts`. ~20 linhas, função
   pura. Pré-requisito: nenhum. Validação: `npm test`.
4. **Extrair `withAbortSignal`** para `utils/abortHelpers.ts` e reutilizar tanto aqui quanto em
   `waterfall-orchestrator.ts` (ADR-0001). ~18 linhas. Pré-requisito: nenhum. Validação:
   `npm test` + teste manual de abort em chat.

### Médio (risco médio, requer testes baseline)

5. **Extrair `initializePortaState` + `processPortaFeeds`** para `services/llm/porta-feeds-processor.ts`.
   ~55 linhas. Depende de `portaStateService` e `parsePortaFeeds`. Pré-requisito: teste cubra caminho
   mega prompt e deep dive. Validação: 2 dossiês em HOMOLOG, comparar score PORTA final.
6. **Extrair lógica de lookup cadastral** (linhas 232-302) para `services/llm/cadastral-enrichment.ts`.
   ~70 linhas. Depende de `lookupCliente`, `extractClienteSeniorData`, `withAbortSignal` (#4).
   Pré-requisito: extração #4 + teste de sucesso/falha/abort. Validação: `npm test` + manual.
7. **Extrair `promptBudget` + threshold de 120.000 chars** (linhas 349-389) para
   `services/llm/prompt-budget.ts`. ~40 linhas, função pura. Pré-requisito: definir com Bruno se
   120.000 deve ser constante nomeada (origem: modelo? empirismo?). Validação: `npm test`.
8. **Extrair fallback de grounding** (linhas 418-444) para `services/llm/grounding-fallback.ts`.
   ~27 linhas. Depende de `normalizeAppError`, `TACTICAL_MODEL_ID`, `withAutoRetry`. Pré-requisito:
   teste cubra cada um dos 4 códigos de erro + 1 não coberto (ex: `RATE_LIMITED`).
   Validação: `npm test` + simulação manual de timeout em HOMOLOG.

### Complexo (risco alto, requer Fase 5 + 7 completas)

9. **Extrair `sendMessageToGemini` em 5 sub-funções**: detectIntent → enrichCadastral →
   buildSystemPrompt → callLLMWithFallback → postProcess. Cada uma em arquivo próprio sob
   `services/llm/chat/`. `sendMessageToGemini` vira orquestrador de ~40 linhas. Pré-requisito:
   extrações #4-#8 + testes E2E (Fase 5) + monitoramento de custos (Fase 7). Validação:
   5 dossiês em HOMOLOG, comparar character count, score PORTA, fontes grounding, presença de
   marcadores `[[PORTA_FEED_*]]` com baseline pré-refactor.
10. **Extrair `generateDossierModule` em 3 sub-funções**: buildModulePrompt → callModuleLLM →
    postProcessModule. Pré-requisito: extração #9 + teste valide ambos os caminhos (com e sem
    `foundationCacheName`). Validação: regressão em 5 dossiês (mesmos do #9).
11. **Mover `getIsolatedBenchmark`** para `services/llm/benchmark-fetcher.ts`. ~21 linhas, mas é
    chamado por `features/dossier/benchmark-stage.ts` (também importado pelo god component #1).
    Pré-requisito: extração #9 + #10 + coordenação com refactor do ADR-0001. Validação:
    regressão em 3 dossiês com benchmark.

---

## Justificativa de não refatorar agora

1. **Princípio 4 (não refatorar o que não entende)**: Após ler o arquivo completamente
   (678 linhas), consigo explicar 15 das 20 responsabilidades acumuladas com evidência
   de file:line. As 5 que não entendo completamente (detecção de intenção em `./runtime`,
   seleção de modelo em `./config`, mecanismo de recovery, contrato de `ghostReason` com
   o consumer, e razão dos thresholds 0.1/0.2/120.000) são pré-requisitos para qualquer
   extração segura.

2. **LiteLLM HOMOLOG recém-estabilizado em produção**: O handoff v2 registra que o
   LiteLLM foi promovido a produção na Fase 3. O roteamento passa por `proxyChatSendMessage`
   e `proxyGenerateContent` (linha 7). Qualquer refactor que mude a ordem das chamadas,
   o conteúdo do systemPrompt ou o formato do `contents` enviado ao proxy pode quebrar
   silenciosamente a geração de dossiês sem erro de compilação.

3. **Piloto de 20 usuários ativo**: Os 3 exports deste arquivo são a única porta de
   entrada para LLMs. Refatorar sem suite de testes de aceitação robusta (5 testes em
   228 LOC cobrem só 3 cenários) arrisca interromper a operação comercial. Princípio 1:
   documentação > refactor arriscado.

4. **Bruno não lê código fluentemente** (Princípio 9): Refatoração puramente técnica,
   sem impacto visível na experiência do usuário, não agrega valor agora. Bruno não
   consegue validar "o dossiê saiu igual" sem antes/depois lado a lado, e a equipe não
   tem testes de golden master para isso. Melhor documentar e esperar a Fase 9 (self-audit).

5. **Dependência com ADR-0001 (waterfall-orchestrator.ts)**: O `waterfall-orchestrator.ts`
   (god component #1) chama `generateDossierModule` (linha 16) em loop. Qualquer refactor
   neste arquivo pode quebrar o contrato que o waterfall espera. Refatorar os dois god
   components simultaneamente sem coordenação é receita para regressão.

6. **Custo de extrair > custo de manter agora**: O arquivo é estável na branch
   `stabilize/from-production-fe6c6f9`. Não há P0 aberto contra ele no Sentry (verificado
   no handoff). A documentação deste ADR já é a mitigação: future engenheiro saberá o
   que cada seção faz, o que NÃO entende, e qual o plano de extração seguro.

---

## Referências

- **Código fonte**:
  - `services/llm/investigation-orchestration.ts` (678 LOC — este ADR)
  - `services/llmService.ts` (14 LOC — barrel re-export)
  - `features/chat/message-orchestrator.ts:7` (consome `sendMessageToGemini`)
  - `features/dossier/waterfall-orchestrator.ts:16` (consome `generateDossierModule`)
  - `features/dossier/porta-reconciliation.ts:3` (consome `generateDossierModule`)
  - `features/dossier/benchmark-stage.ts:2` (consome `getIsolatedBenchmark`)
  - `tests/services/investigation-orchestration.test.ts` (228 LOC, 5 testes)

- **Módulos importados pelo god component** (não lidos neste ADR, listados
  para futura revisão sênior — 16 imports de 11 arquivos):
  - `services/llmProxy.ts` — `proxyChatSendMessage`, `proxyGenerateContent` (roteamento LiteLLM/Gemini)
  - `services/llm/{config,runtime,recovery,sanitization,sources,status,contracts,porta}.ts`
  - `utils/{textCleaners,seniorEvidence,socioRuralResearch,porta,retry,privacy,webVerification,diagnosticLog,errorHelpers}.ts`
  - `config/models.ts` (`STABLE_RESEARCH_MODEL_ID`)
  - `services/{clientLookupService,competitorService,portaStateService}.ts`
  - Notar: `applyPromptLeakShield` é chamado nas linhas 449 (chat) e 606 (módulo de dossiê), confirmado pela Task ID 4 (investigação de prompts)

- **Documentação relacionada**:
  - `docs/adr/0001-waterfall-orchestrator-god-component.md` (god component #1, consome este arquivo)
  - `docs/adr/0002-app-tsx-god-component.md` (god component #2)
  - `handoff/scout360-handoff-v2/PRINCIPLES.md` (Princípios 4, 6, 9, 14)
  - Investigação de prompts duplicados (Task ID 4 no `worklog.md`) — confirmou
    `applyPromptLeakShield` é chamado nas linhas 449 e 606 deste arquivo

- **Commits relevantes** (branch `stabilize/from-production-fe6c6f9`):
  - `78c919e7` — Fase 3: desgeminização (rename `services/gemini/` → `services/llm/`)
  - `aded9714` — Sprint 2: Pipeline híbrido LiteLLM + useDeferredValue anti-freeze
  - Commits P0 do waterfall (citados no ADR-0001) indiretamente afetam este arquivo

---

## Histórico de revisão

| Data | Versão | Autor | Nota |
|---|---|---|---|
| 29/06/2026 | 1.0 | IA gestora (ADR author Task ID 6) | Autor — leu 678 LOC, grep callers/testes, 11 seções, Princípio 14 aplicado (15 itens em "O que entendo" vs 12 em "O que NÃO entendo") |
| Pendente | — | IA gestora (validação) | Cross-check com ADR-0001 e ADR-0002 para consistência de estilo |
| Pendente | — | Bruno | Revisão — confirmação de que não refatorar agora é a decisão correta |
| Pendente | — | Sênior (Fase 9) | Revisão técnica aprofundada antes de iniciar qualquer extração |

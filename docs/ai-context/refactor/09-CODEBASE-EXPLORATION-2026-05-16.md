# Codebase Exploration — 2026-05-16

Varredura somente-leitura com 3 agentes em paralelo (reviewer, vercel:ai-architect, vercel:performance-optimizer) no branch `refactor/code-quality`. Nenhum código foi modificado.

> Nota histórica pós-PR `#259`: achados sobre Mini CRM, `CRMProvider`, `CRMDetail` e `CRMPipeline` refletem o estado auditado em 2026-05-16. Esses itens foram removidos posteriormente com o Mini CRM local e não são próximos trabalhos.

---

## P0 — Crítico (quebra silenciosa ou perda de dados)

### 1. 9+ `catch {}` vazios — engolem erro sem log, fallback ou feedback visual

| Arquivo                                          | Linha(s)      | Contexto                                                                                                  |
| ------------------------------------------------ | ------------- | --------------------------------------------------------------------------------------------------------- |
| `services/gemini/recovery.ts`                    | 8, 20, 56, 66 | debugRecovery, isRecoveryDebugEnabled, shouldRecoverOpenQuestionByJudge, trackOpenQuestionRecoveryAttempt |
| `services/gemini/investigation-orchestration.ts` | 612           | `onCompetitor` — callback nunca chamado se detecção de concorrente lançar exceção                         |
| `api/open-web-search.ts`                         | 61            | `getEnvVar()` — se `process` for undefined, retorna undefined sem aviso                                   |
| `services/gemini/auxiliary.ts`                   | 76, 86, 342   | Fallback de modelo flash, parse de JSON                                                                   |
| `features/dossier/waterfall-orchestrator.ts`     | 103           | `validateInlineSourcesForPromotion`                                                                       |
| `services/competitorService.ts`                  | 92            | Erro silenciado                                                                                           |
| `services/sessionRemoteStore.ts`                 | 62            | Erro silenciado                                                                                           |
| `services/exportService.ts`                      | 149           | Erro silenciado                                                                                           |

**Regra violada**: "ZERO catch vazio — sempre: log + fallback + feedback visual ao usuário"

### 2. Perda silenciosa de dados no IndexedDB

`hooks/useRadar.ts:103,107,111,115` — 4 funções (`persistAlerts`, `persistConfig`, `persistLastScan`, `persistMetaInsight`) engolem falhas de gravação no IndexedDB. Comentário diz `/* IDB unavailable */` mas não há fallback para localStorage. Se IDB falhar seletivamente, alertas do Radar são perdidos.

### 3. Recovery pode ignorar textos recuperáveis

`services/gemini/recovery.ts:56` — `shouldRecoverOpenQuestionByJudge()` retorna false em caso de exceção (parse JSON). Se o judge falhar ao parsear, textos recuperáveis são ignorados sem aviso.

---

## P1 — Alto (impacto direto no usuário)

### 4. Streaming token-a-token NÃO implementado

`api/gemini.ts:273` usa `chat.sendMessage({ message })` — método **batch** do SDK `@google/genai`. A resposta chega como JSON completo. O frontend espera a Promise resolver antes de mostrar qualquer texto.

- `geminiProxy.ts:83-138`: `fetch` POST padrão, espera `response.json()`
- `message-orchestrator.ts:305-325`: callback `onText(finalText)` recebe texto completo
- `investigation-orchestration.ts:622`: `onText(finalText)` — confirmação de batch

**Impacto**: Usuário vê LoadingSmart (skeleton) por 30-180s durante investigações. A regra "Streaming token a token para respostas Gemini" não é cumprida.

### 5. React.memo inútil no MessageRow

`MessageTimeline.tsx:262` + `MessageRow.tsx:51` — `itemData` é recriado a cada mudança de qualquer uma das ~25 dependências no `useMemo`. O `React.memo(MessageRow)` compara o objeto `data` por referência — como é sempre novo, o memo nunca dá cache hit. **Todas as mensagens visíveis no Virtuoso re-renderizam a cada mudança de estado.**

### 6. Prompt Leak Shield duplicado

Duas implementações com lógicas diferentes:

- `api/gemini.ts:43-97` — `applyPromptLeakShieldLocal` com regex hardcoded (`HARD_PROMPT_LEAK_PATTERNS`, `SOFT_PROMPT_LEAK_PATTERNS`)
- `utils/textCleaners.ts` — `applyPromptLeakShield` com outro conjunto de padrões

Um texto que passa por um pode ser bloqueado pelo outro. Comportamento imprevisível.

### 7. Temperatura não segue a regra 0.1/0.7

Regra: "0.1 para outputs factuais (Score PORTA, dados empresa), 0.7 para texto criativo (táticas)"

Realidade:

- `api/gemini.ts:262`: 0.1 (high thinking) ou 0.15 (low thinking) — ambos < 0.7 para criativo
- `investigation-orchestration.ts:694`: `generateDossierModule` → 0.2
- `investigation-orchestration.ts:785`: `getIsolatedBenchmark` → 0.1
- `auxiliary.ts:72,83`: `generateLoadingCuriosities` → 0.6 (OK para criativo)
- `auxiliary.ts:456`: `generateContinuityQuestion` → 0.8 (acima do máximo)
- `war-room/query.ts:140`: 0.15 (tech) ou 0.3 (outros)

**Nenhum lugar usa exatamente 0.7 para texto criativo.**

### 8. Cache sem TTL conforme especificado

Regra: "Cache tipado: dossiê = 24h, CNPJ = 7d"

Realidade:

- `clientLookupService.ts`: Cache permanente (sessão toda) para empresas encontradas. Cache de 30s para não-encontradas. Nenhum segue 7d.
- **Não existe cache de dossiê com 24h de TTL**
- `war-room/retrieval.ts`: Cache de docs Pinecone com 2min de TTL (`Map` em memória) — OK para seu contexto

### 9. Timeout/retry inconsistentes

Regra: "Timeout 30s + retry 3x com backoff exponencial e jitter"

Realidade:

- `investigation-orchestration.ts:526`: `withAutoRetry` → maxRetries=5, baseDelayMs=2000 (potencial 62s total)
- `investigation-orchestration.ts:552`: Fallback sem grounding → maxRetries=4, baseDelayMs=2000 (~30s adicional)
- `war-room/query.ts:150`: maxRetries=2, baseDelayMs=700, maxDelayMs=3000 (~4s total)
- `clientLookupService.ts:98`: Retry manual com backoff 1s/2s/4s — 3 tentativas, sem jitter

**Não há configuração centralizada de retry/timeout.**

### 10. Score PORTA nulo sem alerta ao usuário

`waterfall-orchestrator.ts:368,452` — quando `portaIntegrityHold` é true, `ensureWaterfallScorePorta` retorna null. Esse null é armazenado na mensagem como `scorePorta: waterfallScorePorta ?? undefined`. **Nenhum alerta ao usuário.**

### 11. Feedback nunca enviado

`services/feedbackService.ts:17,26` — buffer `feedbackBuffer` em memória, `console.log` no lugar de endpoint. A própria linha 17 documenta: "No futuro, substituir o console.log por um fetch() para o Google Apps Script."

### 12. LoadingSmart com 766 linhas (>15KB)

`components/LoadingSmart.tsx` — viola a regra "Componentes > 15KB devem ser decompostos". Subcomponentes inline: ClockIcon, StepCheckIcon, StepSpinner, StepPending, RadarAnimation, ProgressBar. Deveriam ser extraídos para arquivos separados.

### 13. 5 Context Providers causam re-render em cascata

`index.tsx:113-124`: `ChatStoreProvider > DossierStoreProvider > OperatorProvider > ModeProvider > CRMProvider`. Qualquer mudança em um contexto (ex.: `useChatStore()` atualiza `isLoading`) força re-render do App + ChatInterface + MessageTimeline + MessageRow.

### 14. Thread-safety do PORTA state global

`portaStateService.ts` — usa módulo singleton (`let currentPortaState: PortaState | null = null`). Em SPA com gerações simultâneas (dossiê + deep dive), o estado global pode ser sobrescrito sem proteção contra condição de corrida.

---

## P2 — Médio (qualidade de código e manutenibilidade)

### 15. framer-motion 5.3MB para animações triviais

Importado em 6 componentes (ScorePorta, ClienteSeniorScore, Tooltip, StatusIndicator, RevenueIntelligence, ChatShell) para animações fade-in. Tailwind `animate-*` + keyframes custom (já existentes em `index.css:22-52`) substituiriam com zero bytes adicionais.

### 16. Prompts inline fora do diretório `prompts/`

Regra: "Todo prompt vive em `prompts/` — versionado, nunca inline no componente"

Infrações:

- `services/gemini/auxiliary.ts:8-22` — `CONTINUITY_SYSTEM` (string longa)
- `services/war-room/prompting.ts:5-71` — `SYSTEM_PROMPTS` com 4 prompts grandes
- `services/gemini/status.ts:1-26` — Mensagens de status são prompts de UX inline

Os prompts em `prompts/mega/` estão corretos (3479 linhas bem organizadas).

### 17. Mock determinístico em produção

`api/comex.ts:53-89` — endpoint `/api/comex` decide exportadores por soma de dígitos do CNPJ (`sumCnpj % 2 === 0`). `investigation-orchestration.ts:344` documenta com `// TODO: A API /api/comex atual usa um mock determinístico`.

### 18. Duas implementações de proxy Gemini

`geminiProxy.ts:83-138` (`proxyChatSendMessage`) e `geminiProxy.ts:190-197` (`proxyGerarDossie`) são quase idênticas. As implementações serverless (`api/gemini.ts` e `api/gerar-dossie.ts`) também compartilham ~90% do código.

### 19. Virtuoso `defaultItemHeight={96}` impreciso

`MessageTimeline.tsx:299` — mensagens com dossiês completos ou mermaid charts têm 1000+ px. O Virtuoso estima 96px e corrige após primeiro render, causando CLS localizado no scroll.

### 20. CRMDetail lazy-loaded com fallback `null`

`App.tsx:532` — `SuspenseWithError` envolve `CRMDetail` mas fallback padrão é `null`. Durante carregamento lazy do chunk de 717 linhas, usuário vê flash de tela vazia.

### 21. `nomeVendedor` declarado mas nunca usado

`investigation-orchestration.ts:286` — `void nomeVendedor;` indica feature inacabada (provavelmente nos prompts de continuidade).

### 22. Stub `features/radar/` vazio

`features/radar/index.ts` só re-exporta types. README diz que é stub para "fechar OI-044". Nenhuma migração de `hooks/useRadar.ts` ou `components/RadarPanel.tsx` foi iniciada.

### 23. `any` sem justificativa — ~27 ocorrências

| Arquivo                            | Linha(s)                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------ |
| `api/gemini.ts`                    | 101 (`globalThis as any`), 255 (`openWebSearchTool as any`), 281-282 (`let response: any`) |
| `api/radar-scan.ts`                | 200, 319, 322, 427                                                                         |
| `components/SystemHealthCheck.tsx` | 66-208 (7x `catch (error: any)`)                                                           |
| `services/clientLookupService.ts`  | 88, 111, 449, 489, 590, 596                                                                |
| `components/CRMDetail.tsx`         | 244 (`const data: any`)                                                                    |
| `components/WarRoom.tsx`           | 196                                                                                        |
| `utils/retry.ts`                   | 43                                                                                         |
| `utils/documentExtractor.ts`       | 195                                                                                        |
| `utils/errorHelpers.ts`            | 9, 106                                                                                     |
| `api/extract-content.ts`           | 45                                                                                         |

**CRMDetail.tsx:244** é particularmente perigoso: `const data: any = await resp.json().catch(() => null)` — se API retornar HTML (erro 502), `data.id` causa TypeError.

---

## P3 — Baixo (polimento e estilo)

### 24. Componentes sem `React.memo`

ScorePorta, SectionalBotMessage, ClienteSeniorScore em `MessageRow.tsx:193-196` — nenhum envolvido por `React.memo`. Cada nova mensagem força parse de markdown e sections novamente.

### 25. `useEffect` no-op

`hooks/useEmailModal.ts:59` e `hooks/useFollowUpModal.ts:45` — `useEffect(() => clearCloseTimer, [clearCloseTimer])` onde `clearCloseTimer` é um `useCallback` estável. Nunca limpa timer ativo. Não quebra, mas é confuso.

### 26. `console.log` residual em produção

- `api/radar-scan.ts:275` — Gemini summary
- `api/radar-scan.ts:414` — Google News + RSS
- `api/radar-scan.ts:488` — raw → after dedup
- `api/gemini.ts:294` — function call debug
- `api/gerar-dossie.ts:95` — `console.warn`

### 27. `scoutDiag.info?.()` com optional chaining

`features/dossier/porta-reconciliation.ts:149,172,221` — `info` sempre existe no `scoutDiag`. Se futura refatoração usar getter que retorna undefined (por log level), a chamada falha silenciosamente.

---

## ✅ Confirmado — Funcionando Corretamente

- **845/845 testes passam** — zero testes quebrados
- **Zero imports quebrados ou circulares** — dependência circular `LastAction` já foi corrigida
- **Search Grounding nunca cacheado** ✅
- **Anti-alucinação em múltiplos níveis** (`enforceSeniorEvidenceConstraints`, `applyPromptLeakShield`, `normalizeGroundingSources`)
- **`scoutDiag` bem distribuído** nas chamadas críticas
- **Lazy loading bem aplicado** em mermaid, pdf-parse, cheerio, mammoth, CRMPipeline, WarRoom, RadarPanel
- **Fluxo do Score PORTA bem estruturado** — markers V2, feeds P/O/R/T/A, pesos por segmento (PRD/AGI/COP), reconciliação em cascata

---

## Resumo Numérico

| Severidade | Contagem | Principais categorias                                                                                                                                                                    |
| ---------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0         | 3        | Catch vazio, perda IDB, recovery silencioso                                                                                                                                              |
| P1         | 11       | Streaming quebrado, memo inútil, temperatura errada, cache sem TTL, retry inconsistente, score null sem alerta, feedback inacabado, componente gigante, re-render cascata, thread-safety |
| P2         | 9        | Bundle inchado, prompts inline, mock em prod, proxy duplicado, Virtuoso impreciso, lazy sem skeleton, feature inacabada, stub vazio, `any` sem justificativa                             |
| P3         | 4        | Sem React.memo, useEffect no-op, console.log, optional chaining                                                                                                                          |
| **Total**  | **27**   |

---

## Leitura Complementar

- `08-PHASE2-MAINTAINABILITY-PLAN.md` — plano de migração `console.*` → `scoutDiag`, catch vazios, e tipos `any`
- `01-MASTER-PLAN.md` — plano macro da refatoração
- `02-BOARD.md` — quadro de tarefas

---

Relatório gerado por 3 agentes: reviewer, vercel:ai-architect, vercel:performance-optimizer.

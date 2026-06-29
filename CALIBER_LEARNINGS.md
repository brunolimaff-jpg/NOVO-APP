# Caliber Learnings — Senior Scout 360

Padroes e anti-padroes aprendidos de sessoes anteriores. Tratados como regras do projeto.

## ARQUITETURA FINAL — Senior Scout 360 (Fase 5, Junho 2026)

### Provedores de IA

- **Modelos críticos (2/7 modulos: Operacao, Caminho de Venda)**: Sonnet 4.6 via Bedrock (`bedrock/us.anthropic.claude-sonnet-4-6`)
- **Modelos operacionais (5/7 modulos: Tech Stack, Riscos, Radar, RH, Decisores)**: DeepSeek V3.2 via Bedrock (`bedrock/deepseek.v3.2`)
- **Provider economico**: DeepSeek direto via `api.deepseek.com` (~$0.06/dossie)
- **Google Gemini**: ELIMINADO como provider principal. `respondWithGeminiFallback` REMOVIDO (commit `322b3d7f`). `isFallbackEnabled = false` hardcoded. Fallback e binario — ou roda ou mostra erro. Foundation Cache do Gemini e Google Search Grounding eram o verdadeiro diferencial — o modelo era secundario. LiteLLM/Bedrock nao oferecem Grounding nativo, exigindo Brave Search externo como substituto (qualidade inferior: 15 CNPJs vs 35, score 69 vs 84). DeepSeek direto via `api.deepseek.com` ($0.27/$0.40 por milhao de tokens) substitui Gemini ($3.50/$10.00). Proxy LiteLLM mantido exclusivamente para Claude via Bedrock (Sonnet 4.6, Haiku 4.5).
- **Proxy LiteLLM Senior Labs**: DEV/HOMOLOG funcionais, PROD bloqueado (`token_not_found_in_db`)

### Tiers de Waterfall

| Tier      | Modelos                    | Chars | Custo | Uso                |
| --------- | -------------------------- | ----- | ----- | ------------------ |
| Premium   | Opus 4.7 + Sonnet 4.6      | 83.3K | $0.60 | Dossies alto valor |
| Padrao    | Sonnet 4.6 + DeepSeek V3.2 | 52.1K | $0.17 | Dossies default    |
| Economico | DeepSeek V4 Pro direto     | ~27K  | $0.06 | Exploracao/Seed    |

### Roteamento (HYBRID_MODEL_MAP)

Implementado em `utils/llm/modelRouter.ts:34`. Sonnet 4.6 para 2/7 modulos criticos, DeepSeek V3.2 para 5/7 operacionais. Modulo nao mapeado = fallback Gemini (a eliminar). Feature flag `VITE_WATERFALL_TIER` para alternar entre tiers.

### UI de Loading

- **Aspiracional**: CofreOverlay substituido por skeleton loading (DossieSkeletonLoader + InlineLoadingBubble) durante geracao
- **Estado atual (feat/litellm-experiment)**: CofreOverlay ainda presente com fixes (isCofreRenderReady leniente, safety-net dissolve 3s, static-fallback estabilizado). O skeleton loading existe em worktree separado (`feature/inline-loading-bubble` em `/Users/brunolima/Documents/NOVO-APP-inline`) mas NAO mergeado.
- `loadingVariant` suporta `'hero' | 'inline'` — inline usa skeleton cards em vez de overlay hero

### Controle de Qualidade

- `checkReportQuality` em `utils/llm/reportQuality.ts` com modo lenient para non-Gemini implementado (commit `164ad5d3`). Aceita provider nao-Gemini sem bloquear renderizacao.

### Fallback

- **Estado atual**: Fallback Gemini REMOVIDO (`respondWithGeminiFallback` removido em `api/gemini.ts`, commit `322b3d7f`). `isFallbackEnabled = false` hardcoded em `_llm-client.ts:79`. Fallback e BINARIO — ou o provider configurado roda, ou mostra erro (502 + diagnostico).

### 19 Modelos Testados — Top 3

1. **Sonnet 4.6** (12.3K chars, 74s) — MELHOR qualidade geral
2. **DeepSeek V3.2** (8.3K chars, 119s) — Melhor custo-beneficio
3. **Nemotron Nano 9B** (8.5K chars, 16s) — Mais barato ($0.001/run)

### 3 Waterfalls Hibridos Validados

Testados via `scripts/test-hybrid-waterfall.ts`. Todos com dados reais (Scheffer, 04.733.767/0001-80).

### Estado LiteLLM por Ambiente

| Ambiente | URL                           | Status                |
| -------- | ----------------------------- | --------------------- |
| DEV      | litellm.dev.seniorlabs.io     | FUNCIONA (Haiku 4.5)  |
| HOMOLOG  | litellm.homolog.seniorlabs.io | FUNCIONA              |
| PROD     | litellm.seniorlabs.io         | token_not_found_in_db |

---

## Licoes Aprendidas (ordem cronologica reversa)

- **Sempre verificar `<vercel-live-feedback>` antes de diagnosticar "UI travada" em previews** [vercel, ui, debug, preview, pr386]
  Widget da Vercel com `z-index: 2147483647` cobre toda a viewport e bloqueia cliques quando quebrado. Solucao: desativar Vercel Toolbar no painel ou `?feedback=0` na URL. Afeta: previews Vercel. Vault: [[DI-2026-06-24-30]].

- **NUNCA confiar em "ja mudei" sem `cat` ou `git diff` para confirmar** [litellm, timeout, debug, pr386, tabbit, licao-dolorosa]
  O bug real da PR #386 (`MAX_LITELLM_REQUEST_TIMEOUT_MS = 38_000` em `api/_llm-client.ts:7`) ficou escondido por 7 dias porque ninguem verificou o arquivo depois de "ter mudado". Mudamos env var, cliente, waterfall — mas o cap de 38s no codigo servidor anulava TUDO (`Math.min(120000, 38000) = 38s`). Tabbit (ferramenta de audit) encontrou em 5 minutos lendo o arquivo. **Licao:** toda vez que afirmar "ja mudei X", rodar `cat <arquivo>` ou `git diff` para confirmar. Para diagnosticos de timeout: verificar TODAS as camadas com `grep -r TIMEOUT` antes de descartar qualquer hipotese. Afeta: `api/_llm-client.ts:7`, PR #386. Vault: [[2026-06-24T23-30-00-pr386-descoberta-38s-cap]], [[LICOES-NUNCA-CONFIAR-JA-MUDEI-SEM-VERIFICAR-ARQUIVO-2026-06-24]].

- **[REFUTADO] LiteLLM fallback_used: true NÃO causa descarte na UI** [litellm, ui, bug, pr386, refutado]
  Diagnóstico anterior ("frontend descarta mensagens com fallback_used: true") foi REFUTADO em 2026-06-23 via adversarial review + auditoria completa de código. NENHUM filtro baseado em fallback_used existe em ChatInterface.tsx, message-orchestrator.ts, MessageTimeline.tsx ou MessageRow.tsx. Causa real da UI vazia: (1) Virtuoso computeItemKey por message.id não força re-render quando message.text muda de '' para 27K chars — bot-message-content fica invisível (height:0) mesmo com texto presente; (2) Cofre dissolve por absolute-max (320s) porque dispatchCofreRenderReady depende de bot-message-content visível no DOM. Fix: computeItemKey com isThinking no key (MessageTimeline.tsx:540). Afeta: components/chat/MessageTimeline.tsx, hooks/useCofreTransition.ts, components/MessageRow.tsx (commit:invisible-bot-content), PR #386.

## Maio 2026 — Licoes portadas

Licoes portadas de 8 obsidian files de Maio 2026. Selecionadas P0/P1 nao duplicadas no CALIBER existente.

### Consolidacao de Prompts (PR #282/#283)

- **Temperature explicita e baixa (0.1) para saida estruturada** [prompts, gemini, alucinacao, arquitetura]
  `proxyChatSendMessage` nao passava `temperature`, usando default da API Gemini = 1.0. Resultado: alta variacao entre execucoes, formatacao inconsistente, alucinacao
  **Solucao:** Alucinacao, formatacao quebrada, dossies diferentes para mesmo CNPJ.
  **Data:** 2026-05-24.

- **Waterfall repete foundation 7-9x** [prompts, gemini, alucinacao, arquitetura]
  Cada especialista no waterfall recebia o foundation completo como prefixo, resultando em ~109K tokens de repeticoes
  **Solucao:** Custo desnecessario de tokens (3-5x mais caro), contexto diluido.
  **Data:** 2026-05-24.

- **Nao remover orquestrador mestre sem golden test** [prompts, gemini, alucinacao, arquitetura]
  `MASTER_INVESTIGATION_ORCHESTRATOR_V5` foi removido por parecer redundante, mas causou REGRESSAO no mapa societario (Mermaid deixou de ser gerado)
  **Solucao:** Dossie sem mapa societario.
  **Data:** 2026-05-24.

- **5 blocos de traducao causam drift entre especialistas** [prompts, gemini, alucinacao, arquitetura]
  Cada especialista tinha seu proprio bloco de traducao com pequenas variacoes, causando interpretacoes diferentes de "receita", "faturamento", etc.
  **Solucao:** Inconsistencia terminologica no dossie.
  **Data:** 2026-05-24.

- **Mapeamento de modulo errado no waterfall-orchestrator** [prompts, gemini, alucinacao, arquitetura]
  `PROMPT_CAMINHO_DE_VENDA` estava mapeado para `PROMPT_RH_SINDICATOS_GOD_MODE` — um prompt de RH/SST! Secao "Caminho de Venda" recebia conteudo sindical
  **Solucao:** Secao completamente errada no dossie (comercial vs sindical).
  **Data:** 2026-05-24.

- **CNPJs ficticios em prompts de exemplo** [prompts, gemini, alucinacao, arquitetura]
  Prompts continham CNPJs inventados como exemplos, que o Gemini aprendia e reproduzia em respostas sobre outras empresas
  **Solucao:** Alucinacao de dados financeiros/societarios.
  **Data:** 2026-05-24.

- **Safra desatualizada ("Safra 2024" em 2026)** [prompts, gemini, alucinacao, arquitetura]
  Prompts referenciavam "Safra 2024" como ano corrente, causando analise temporal incorreta
  **Solucao:** Analise de mercado com dados defasados.
  **Data:** 2026-05-24.

- **Ausencia de protocolo de recusa (refusal protocol)** [prompts, gemini, alucinacao, arquitetura]
  Modelo respondia mesmo sem dados suficientes, fabricando respostas em vez de admitir desconhecimento
  **Solucao:** Alucinacao em secoes sem dados.
  **Data:** 2026-05-24.

- **Ausencia de distincao fato vs inferencia** [prompts, gemini, alucinacao, arquitetura]
  Modelo nao separava o que era dado confirmado de inferencia. Secoes como "evidencias" misturavam dados reais com suposicoes.
  **Solucao:** Dossie com baixa credibilidade.
  **Data:** 2026-05-24.

- **Escopo de evidencia nao delimitado** [prompts, gemini, alucinacao, arquitetura]
  Modelo usava dados de uma empresa para responder sobre outra (ex: dados de CRM de "Pampa" aplicados a "Pampafoods")
  **Solucao:** Confusao entre empresas similares.
  **Data:** 2026-05-24.

- **Entidades internacionais sem cadeia de auditoria** [prompts, gemini, alucinacao, arquitetura]
  Quando o modelo inferia conexao internacional (ex: Scheffer Colombia S.A.S.), nao fornecia comprovacao documental. Output dizia "conexao INFERIDA" sem explicar como.
  **Solucao:** Dossie internacional sem rastro de auditoria.
  **Data:** 2026-05-24.

- **A2 feeds silenciosamente ignorados no parsing** [prompts, gemini, alucinacao, arquitetura]
  O parser de decimal quebrava ao encontrar formato A2 (algarismo + 2 zeros) porque tratava como numero valido mas nao convertia corretamente
  **Solucao:** Dados financeiros corrompidos no dossie.
  **Data:** 2026-05-24.

- **Output contract conflitante com especialistas** [prompts, gemini, alucinacao, arquitetura]
  O contrato de output exigia campos que os especialistas nao preenchiam, e vice-versa. Modelo ficava entre duas instrucoes conflitantes.
  **Solucao:** Dossie com campos ausentes ou extras.
  **Data:** 2026-05-24.

### Revisao de 60 PRs (#239-#306)

- **`signal.aborted` precisa de verificacao sincrona ANTES do async** [code-review, typescript, react, testing]
  PR #289, #303, #305
  **Solucao:** AbortSignal.
  **Data:** 2026-05-28.

- **Cache em memoria sem limite cresce indefinidamente** [code-review, typescript, react, testing]
  PR #296 (Mermaid SVG), PR #243 (CNPJ serverless)
  **Solucao:** Memory/Performance.
  **Data:** 2026-05-28.

- **`import.meta.env` dinâmico retorna `undefined` em build** [code-review, typescript, react, testing]
  PR #239
  **Solucao:** Vite/Build.
  **Data:** 2026-05-28.

- **`Promise.all` em chamadas independentes — `allSettled` + merge parcial** [code-review, typescript, react, testing]
  PR #241
  **Solucao:** Resiliencia.
  **Data:** 2026-05-28.

- **`catch (err: any)` perde `message` — usar `unknown` + type guard** [code-review, typescript, react, testing]
  PR #255 (#2 arquivos)
  **Solucao:** TypeScript.
  **Data:** 2026-05-28.

- **Regex de parsing sem ancora (`^`) causa falso positivo** [code-review, typescript, react, testing]
  PR #245, #248
  **Solucao:** Regex.
  **Data:** 2026-05-28.

- **`console.warn` nao e substituto semantico de `console.log`** [code-review, typescript, react, testing]
  PR #263 (6 endpoints)
  **Solucao:** Logging.
  **Data:** 2026-05-28.

- **Rules of Hooks: hooks dentro de `map`/callback NUNCA funcionam** [code-review, typescript, react, testing]
  PR #286
  **Solucao:** React.
  **Data:** 2026-05-28.

- **`console.error` silenciado globalmente em testes esconde warnings** [code-review, typescript, react, testing]
  PR #258
  **Solucao:** Testing.
  **Data:** 2026-05-28.

- **Mock de Promise que nunca resolve causa memory leak em teste** [code-review, typescript, react, testing]
  PR #258
  **Solucao:** Testing.
  **Data:** 2026-05-28.

### Investigacao Tela Branca (PR #307)

- **Playwright nao basta como prova final para bugs de lifecycle/cache/browser real** [tela-branca, debug, vercel, ui]
  **Problema:** Playwright e Chrome DevTools automatizados sao uteis para coleta inicial, mas bugs que dependem de alternancia real de abas, freeze/thaw do SO, throttle de timers em background (1/min no Chrome) ou IndexedDB corrompido so se manifestam em navegador real com abas reais.
  **Data:** 2026-05-28.

- **Separar sintoma de causa raiz — cada sintoma pode ser um bug diferente** [tela-branca, debug, vercel, ui]
  **Problema:** Tela branca, timeline vazia, overlay residual, bot ausente e 500 no `/api/open-web-search` foram inicialmente agrupados como "a tela branca". Mas cada um pode ter causa independente.
  **Data:** 2026-05-28.

- **Endpoint auxiliar degradavel nunca deve retornar 500** [tela-branca, debug, vercel, ui]
  **Problema:** `/api/open-web-search` e um endpoint de fallback — sua funcao e degradar gracefulmente quando a busca principal falha. Retornar 500 quebra esse contrato e propaga erro em cascata para o waterfall.
  **Data:** 2026-05-28.

- **Serverless pode falhar fora do catch — logs da Vercel sao obrigatorios** [tela-branca, debug, vercel, ui]
  **Problema:** Funcoes serverless podem crashar ANTES do `try/catch` por: import com side effect, timeout da runtime (60s no plano Hobby), dependencia pesada bloqueando event loop, ou fetch pendurado.
  **Data:** 2026-05-28.

- **Persistencia parcial apos reload e risco critico** [tela-branca, debug, vercel, ui]
  **Problema:** Se o dossie esta em andamento e o usuario recarrega ou reabre a aba, a sessao parcial (so mensagem do usuario, sem resposta do bot) pode ser salva e sobrescrever uma sessao completa anterior.
  **Data:** 2026-05-28.

- **Supabase provar backend vivo nao prova UI renderizada** [tela-branca, debug, vercel, ui]
  **Problema:** Diagnosticos persistidos no Supabase provam que o backend e a instrumentacao funcionam. Nao provam que o Virtuoso renderizou, que o portal fechou ou que o usuario viu o dossie.
  **Data:** 2026-05-28.

- **Nao misturar instrumentacao, prompt, waterfall, layout e persistencia na mesma correcao** [tela-branca, debug, vercel, ui]
  **Problema:** PRs com 5+ dominios diferentes (documentExtractor + LoadingSmart + waterfall + MessageTimeline + geminiProxy) dificultam isolamento de regressao.
  **Data:** 2026-05-28.

- **Preview Vercel e por branch/commit, nao soma PRs abertas** [tela-branca, debug, vercel, ui]
  **Problema:** Abrir PR #307 baseada na #306 NAO faz o preview incluir as mudancas da #306. Cada preview e um deploy isolado do commit da branch. Base branch != merge automatico.
  **Data:** 2026-05-28.

- **Debug em hot path precisa ser gated** [tela-branca, debug, vercel, ui]
  **Problema:** console.log, console.time e console.timeEnd em MessageRow, SectionalBotMessage e useMemos de parsing de texto disparam em toda renderizacao de mensagem. Para textos de 39k chars no dossie, isso e ruido extremo.
  **Data:** 2026-05-28.

- **Endpoint externo novo deve ser testado no ambiente real da Vercel** [tela-branca, debug, vercel, ui]
  **Problema:** `html.duckduckgo.com/html/` funciona em maquina local mas e bloqueado por IPs de datacenter da Vercel. Teste local != teste serverless.
  **Data:** 2026-05-28.

- **Nao declarar causa raiz sem stack trace** [tela-branca, debug, vercel, ui]
  **Problema:** "Provavelmente e o endpoint HTML do DDG" nao e diagnostico. Causa raiz exige: erro exato, stack trace, arquivo e linha, condicao que dispara.
  **Data:** 2026-05-28.

- **Dossie em andamento precisa de status explicito** [tela-branca, debug, vercel, ui]
  **Problema:** Sessoes de dossie nao tem status. O cliente nao sabe se o dossie foi interrompido, se esta em andamento, se completou ou se falhou parcialmente.
  **Data:** 2026-05-28.

## Notas de Processo

Notas de processo movidas das secoes principais para organizacao tematica.

### Auditoria por exploracao paralela

- Dividir a auditoria por territorios aumenta a cobertura e reduz a navegacao sequencial.
- Cada explorador deve informar os arquivos efetivamente lidos.
- Resultados paralelos precisam ser consolidados sem duplicidade.
- Toda auditoria deve terminar com uma etapa de autorrefutacao.
- Codigo suspeito nao e automaticamente bug.
- Uma cadeia de concorrencia precisa ser alcancavel, nao apenas teoricamente imagina-
  vel.
- Timer sem cleanup nao e defeito sem efeito colateral demonstravel.
- Documentacao gerada por IA deve ser confrontada com codigo e testes.

### Classificacao de incidentes mitigados

Nao classificar automaticamente como P0 ativo um incidente que:

- ocorreu historicamente;
- possui recovery funcional;
- nao reincidiu apos a mitigacao;
- continua apenas com causa raiz aberta.

A classificacao adequada e `incidente mitigado com causa aberta`, acompanhada de gatilhos objetivos de reabertura.

### Fidelidade dos testes de interface

- jsdom nao reproduz integralmente layout, CSS computado, ResizeObserver e timing do navegador.
- Virtuoso mockado nao comprova comportamento do virtual scroller real.
- RAF sincrono em teste pode esconder condicoes temporais do navegador.
- Incidentes de geometria e renderizacao devem ser confirmados por E2E em navegador real quando houver reincidencia.

## Auth Migration Supabase (12 Jun 2026) — licoes consolidadas

- **Sessao Supabase salva nao exige cache proprio de identidade** [supabase, auth, localstorage, security]
  Depois do login, a persistencia correta fica no token do Supabase Auth. Gravar `operator_id`, nome ou email autenticados no localStorage proprio do app cria alerta de clear-text storage e mistura cache com autoridade. Solucao aplicada na PR #372: remover `scout360:operator_*` para usuarios autenticados e resolver identidade por `auth.uid() -> profiles.operator_id`.

- **RLS de auth precisa cobrir o primeiro saveUserContext pos-login** [supabase, rls, auth, user_context]
  Login bem-sucedido nao prova que o contexto do operador ficou salvo. No preview, a conta autenticava e validava CNPJ, mas `saveUserContext` falhava com row-level security. Solucao: policy authenticated para ler legado pelo proprio email, escrever apenas o `operator_id` do profile e aguardar `link_legacy_operator` antes do upsert.

- **execute_sql do Supabase MCP e stateless** [supabase, migration, execute_sql, mcp]
  Cada chamada do `execute_sql` no Supabase MCP abre uma nova sessao de banco. `CREATE TEMP TABLE` nao sobrevive entre chamadas. Scripts multi-passo precisam usar tabelas REAIS (com prefixo `_migration_`) para manter estado intermediario. Na versao final, criou-se `_migration_canonical` como tabela real + safety net (passo 5) para restaurar canonicos em caso de erro.

- **Migration de dados precisa de safety net pos-DELETE** [supabase, migration, safety-net]
  DELETE em producao sem passo de restauracao e risco critico. O script de consolidacao tinha PASSO 5 que restaurava registros canonicos via `profiles` em caso de remocao incorreta. Toda migracao que remove dados deve ter um passo de rollback automatico.

- **error.code e mais estavel que error.message no Supabase Auth** [supabase, auth, error-handling]
  `error.message` do Supabase pode mudar entre versoes (ex: "User already registered" vs "User already exists"). `error.code` (ex: `user_already_exists`) e estavel e documentado. Sempre preferir `error.code` para identificar erros de autenticacao.

- **AuthGate com graceful fallback sem provider** [react, auth, fallback, component]
  Componente de gate de acesso nao deve assumir que seu contexto sempre existe. Se AuthContext estiver ausente (erro, fallback, loading), o AuthGate deve renderizar `children` em vez de travar ou mostrar modal vazio. OperatorProvider usa `operatorContext.ok || userContext` como fallback.

- **Modelo hibrido de auth equilibra experiencia e seguranca** [auth, saas, strategy]
  Auto-confirm total e conveniente mas nao valida emails. Confirmacao estrita bloqueia usuarios de teste. Modelo hibrido (auto-confirm ativo + cron que remove contas nao confirmadas apos 48h) equilibra os dois. Prazo de migracao (deadline 18/06) com deadline clara forca acao sem quebrar experiencia atual.

- **Fragmentacao de identidade e inevitavel sem auth real** [auth, identity, localStorage, fragmentacao]
  `localStorage` como unica fonte de identidade gera um novo `operator_id` toda vez que o storage e perdido (cache limpo, outro dispositivo). 430 operator_ids para 117 emails unicos (292 IDs para 1 usuario). Auth real (Supabase Auth com UID estavel) elimina a fragmentacao na origem.

## P0 producao travada vs preview OK (Junho 2026) — licoes consolidadas

- **Timeout de operacao termina depois do body + parse** [fetch, timeout, body-read]
  `fetch()` resolver com headers nao significa que a operacao acabou. Qualquer chamada critica deve cobrir conexao, `response.text()`, parse e fallback.

- **Promise.race sem abort real e mitigacao falsa** [abort, gemini, waterfall]
  Encerrar a espera local sem abortar a request deixa Gemini rodando em background e pode manter recursos/telemetria pendentes. Sempre propagar `AbortSignal`.

- **Abort pode nao resolver promise pendente; adicione race local por tentativa** [abort, fallback, resiliencia]
  Mesmo apos abort, uma promise pode nao liquidar na janela esperada. Etapas opcionais como continuity-question precisam de timeout local por tentativa e fallback deterministico.

- **Diagnostics nao pode bloquear finalizacao de UI** [telemetria, loading, supabase]
  `recordDiagnostics` e flush devem ser fire-and-forget. `PostCompletion` precisa persistir, mas a UI nao pode depender da chamada para liberar overlay/input.

- **PostCompletion check:10000ms e gate obrigatorio para loading P0** [observabilidade, supabase, ui]
  Para regressao de overlay/blank panel, validar `PostCompletion=6` com `check:10000ms=1`. Sem isso, a sessao pode ter finalizado cedo demais para provar recuperacao real.

- **Separar IA, controle/cache e diagnostics na telemetria** [observabilidade, gemini]
  Logs de `/api/gemini` precisam carregar `action`, `requestClass` e `phase`; senao uma chamada de diagnostic parece uma chamada de IA travada.

- **Virtuoso renderizado nao prova bot visivel** [virtuoso, blank-panel, ux]
  `itemsRendered` e `rangeChanged` podem existir com painel ainda inutil. Validar `bot-message-content` visivel ou `messages-static-fallback`.

- **Fallback estatico para dossie gigante e safety net de produto** [virtuoso, performance, ux]
  Para bot >=4k chars, preferir static fallback quando a viewport virtualizada esta suspensa evita dossie no DOM porem invisivel.

- **Stage timer usa chave canonica, nao texto da label** [loading, telemetry]
  Labels equivalentes como "Verificando pressoes e compliance..." precisam mapear para chave `compliance`; o timer da etapa deve acompanhar `processing.stage`.

- **Preview OK nao prova producao se SW/cache/deploy divergem** [vercel, producao, pwa]
  Antes de reabrir waterfall, confirmar bundle real, service worker/cache e release em producao. Preview pode estar correto e producao antiga.

- **Sentry vazio nao encerra incidente visual** [sentry, supabase, ui]
  Freeze de main thread, overlay preso e blank panel podem nao gerar evento Sentry. `scout_diagnostics` e browser real sao fonte primaria.

- **E2E de erro controlado e contrato de produto** [playwright, error-recovery]
  Falha controlada de `/api/gemini` deve mostrar `error-message-card`, remover overlay e liberar input. Nao ajustar teste para aceitar estado preso.

- **Modulo opcional deve falhar aberto** [waterfall, resiliencia]
  `validate-inline-sources`, benchmark e continuity-question nao podem bloquear todo o dossier. Timeout retorna fallback seguro.

- **Validacao final deve confirmar intencao de produto** [ux, validacao]
  Checks verdes, Supabase persistido e logs saudaveis nao bastam. Fechamento exige overlay fora, input habilitado, cards/bot visiveis e ausencia de stuck/blank.

### Sessao 2026-06-08 — resolucao PR #347 e investigacao tela branca

- **Nunca commitar codigo visual sem antes commitar as dependencias** [commit, ci, typecheck]
  `MessageTimeline.tsx` importava `debugStaticFallbackDisplay` de `layoutTraceTelemetry.ts`, mas o arquivo de util nao foi commitado. CI quebrou com typecheck. Sempre verificar `git status` antes do commit para garantir que todos os arquivos novos estao inclusos.

- **git merge com working tree sujo contamina o merge commit** [git, merge, working-tree, auto-merge]
  Ao fazer merge com `origin/main`, arquivos modificados no working tree (gemini_usage) vazaram para o merge via `--ours`. `waterfall-orchestrator.ts` ganhou `operatorId` que quebrou typecheck porque `types.ts` nao tinha o campo. Sempre fazer merge com working tree limpa ou usar `git stash`.

- **display:none em flex colapsado foi REFUTADO** [css, layout, debug, flexbox]
  A hipotese de que o browser computa `display:none` automaticamente em flex items com `flex-basis:0%` + `min-h-0` e FALSA. Reproducao minima provou que `getComputedStyle(el).display` permanece `block`/`flex`. O `display:none` real encontrado no Supabase tem origem externa (Vercel preview, injecao de runtime, ou race condition com React hydration).

- **traceFullAncestorChain e superior a trace de culpado unico** [diagnostico, debug, layout]
  `findFirstZeroDimensionAncestor` retorna apenas um no. `traceFullAncestorChain` captura TODOS os ancestrais com `computedStyle` completo (display, width, height, visibility), permitindo identificar exatamente onde `display:none` ou dimensao zero aparece. Preferir cadeia completa sobre busca de culpado unico em diagnosticos de layout.

- **CodeQL nao bloqueia merge quando nao e check obrigatorio** [ci, codeql, merge, pr]
  30 alertas pre-existentes em main nao impediram merge porque CodeQL nao esta na lista de `required status checks`. Ao avaliar bloqueios de merge, verificar a configuracao de branch protection, nao apenas o estado do check.

## Bug P0 overlay hero (Junho 2026) — 14 novos aprendizados

- **Service Worker CacheFirst bloqueia atualizacoes em producao** [pwa, service-worker, cache, deploy]
  CacheFirst para bundles JS/CSS em SPA com deploy frequente prende usuarios em versoes antigas. Preview sem SW nunca reproduz o bug. Solucao: remover PWA/SW ou usar NetworkFirst com asset versioning.

- **Preview sem SW vs Producao com SW cria falsa confianca** [pwa, validacao, homologacao]
  Concluir que "preview funcionou = producao vai funcionar" sem checar configuracao de SW/PWA e enganoso. Toda validacao pre-producao deve verificar se o cache de SW esta ativo.

- **DOM cleanup com .remove() quebra reconciliacao do React** [react, dom, overlay, cleanup]
  Remover elemento do DOM via `.remove()` sem React saber causa desync entre virtual DOM e real DOM. Overlay continua visualmente presente mesmo com `setIsLoading(false)`. Usar `display:none` no elemento raiz.

- **NUNCA nullificar abortControllerRef fora do processMessage:finally** [waterfall, abort, processmessage, bleeding-edge]
  `finalizeWaterfallUI` (chamado no `finally` do `processMessage`) nao deve nullificar `abortControllerRef`. Se o ref e limpo antes do `processMessage:finally` terminar, `isAbort=true` detecta abort falso e `flushDiagnosticsNow` nunca e chamado. O `abortControllerRef` pertence ao ciclo de vida do `processMessage`, nao ao helper de UI.

- **NUNCA usar TreeWalker/document.body scan para DOM cleanup** [performance, dom, treewalker, main-thread]
  `document.createTreeWalker(document.body)` percorre o DOM inteiro em busca de seletores — bloqueia a main thread por dezenas de ms em arvores grandes. Substituir por `querySelector` direto com 3 seletores alvo, sem escanear o body inteiro.

- **DOM cleanup DOM display:none e safety net; React render condition e primario** [react, dom, cleanup, overlay, safety-net]
  O `requestAnimationFrame` + `querySelector` + `style.display='none'` no DOM existe como safety net. Mas o mecanismo PRIMARIO de liberacao do overlay e a condicao de renderizacao React (`shouldShowHeroLoadingOverlay` retornando `false`). DOM cleanup nunca deve ser o fluxo principal.

- **h-full nao funciona em filho de flex item com flex-basis:0%** [css, flexbox, layout, display-none]
  `height:100%` de um pai com `flex-basis:0%` (via `flex-1`) = 0px. Browser colapsa o elemento com `display:none`. O filho deve usar `flex-1` em vez de `h-full` para herdar altura real.

- **absolute inset-0 causa display:none em certos contextos de flex** [css, flexbox, layout, display-none]
  `absolute inset-0` como fallback de layout pode colapsar em contextos de flex container. Testar sempre com conteudo real grande (>20KB). Preferir `h-full w-full` + `flex-col` parent.

- **Preview Vercel revela bugs de layout que testes unitarios nao pegam** [css, layout, testing, vercel]
  Layout rendering, CSS cascata, flex box so aparecem em browser real com dados reais. Smoke visual no preview e gate obrigatorio antes de merge para mudancas de CSS/layout.

- **Mock de scoutDiag precisa incluir debug: vi.fn()** [testing, mock, debug, scoutDiag]
  Se `scoutDiag.debug()` e adicionado ao codigo de producao, os mocks nos testes precisam incluir `debug: vi.fn()` senao a chamada quebra silenciosamente. Toda vez que adicionar `scoutDiag.debug()`, verificar/atualizar os mocks.

- **Sempre incluir hostname em logs de diagnostico** [debug, logging, ambiente]
  Logs de producao e preview parecem identicos sem o hostname. `scoutagro.vercel.app` alias pode servir codigo sem estar no projeto. Incluir `window.location.hostname` em todo log de diagnostico.

- **Vercel alias orfao pode servir codigo sem estar no projeto** [vercel, deploy, domains, alias]
  O alias `scoutagro.vercel.app` servia o mesmo codigo mas nao estava listado nos domains do projeto Vercel. Verificar dashboard Vercel > Domains para confirmar quais alias estao registrados.

- **flushDiagnosticsNow sincrono pos-setState bloqueia React re-render** [react, setstate, render, settimeout, freeze]
  `flushDiagnosticsNow` chamado sincronamente no mesmo tick depois de `setIsLoading(false)` bloqueava o React re-render. O setState dispara render sincrono, mas o flush monopoliza a main thread. Playwright mostrou zero eventos pos-render. Solucao: `setTimeout(0)` com o flush, agendado ANTES do setState.

- **Agendar setTimeout ANTES do setState, nao depois** [react, settimeout, macrotask, event-loop]
  Se o `setTimeout` com `flushDiagnosticsNow` for agendado DEPOIS do `setState`, o callback nunca roda ate o render terminar. Agendando ANTES, o timer ja esta na macrotask queue quando o React comeca a renderizar, e dispara assim que o render sincrono termina. O `setTimeout(0)` vira ponto de handoff entre render sincrono e flush assincrono.

- **createDeferred polyfill para Promise.withResolvers** [node, vitest, compatibilidade, polyfill]
  `Promise.withResolvers()` e API Node 22+. CI do GitHub Actions roda Node 20. Testes que usam `Promise.withResolvers()` quebram em runtime com `TypeError`. Solucao: helper `createDeferred<T>()` local com `new Promise` + resolve/reject manuais. Nao basta `ES2024` no `lib` do tsconfig — isso so resolve typecheck, nao runtime.

---

## Auth Remediation PR #372 (13 Jun 2026) — licoes consolidadas

- **Doc handoff duravel vai para Bruno Vault, nao para mktemp** [handoff, memoria, bruno-vault, agentes]
  Para projeto ativo, `mktemp` e apenas scratch. O artefato duravel deve ir em `Bruno Vault/20-SESSOES/YYYY-MM/...`, o indice mensal precisa ser atualizado, e qualquer correcao de processo deve gerar licao em `30-LICOES/` com ponteiro aqui no Caliber. Licao canonica: `/Users/brunolima/Documents/Bruno Vault/30-LICOES/LICOES-DOC-HANDOFF-BRUNO-VAULT-2026-06-14.md`.

- **Contrato de identidade: auth.uid como autoridade unica, localStorage como cache** [auth, identidade, supabase, react]
  O app autenticava via Supabase mas usava `operator_id` do localStorage como autoridade de dados. Isso criava risco de dossies invisiveis (se o localStorage tivesse um ID diferente do auth.uid) e bypass de autorizacao. A cadeia correta e: `auth.uid() -> profiles.operator_id -> user_context -> dados de negocio`. localStorage deve ser apenas cache, nunca fonte de verdade para identidade. `resolveOperatorFromAuth()` implementa essa cadeia com fallback para user_context por email.

- **profiles.operator_id deve ser imutavel apos criacao** [supabase, rls, seguranca, migration]
  Se `profiles.operator_id` pode ser atualizado, qualquer funcao com acesso a tabela pode alterar o vinculo de identidade de um usuario, permitindo acesso cruzado a dossies. `REVOKE UPDATE on profiles` + `GRANT UPDATE(name) only from auth.users` + RPC `link_legacy_operator` com `SECURITY DEFINER` protege a integridade. Toda migration que toca coluna de identidade deve verificar permissoes.

- **RPC SECURITY DEFINER com anti-IDOR obrigatorio** [supabase, rpc, seguranca, idor]
  `link_legacy_operator` usa `SECURITY DEFINER` (executa como dono da funcao, nao como quem chamou). Sem verificacao explicita de `auth.uid()`, QUALQUER usuario autenticado poderia chamar o RPC com qualquer `target_user_id` e roubar o vinculo de outro operador. A verificacao `auth.uid() = (SELECT id FROM auth.users WHERE email = p_email)` previne ataque IDOR (Insecure Direct Object Reference). Todo RPC com SECURITY DEFINER deve verificar auth.uid() contra o recurso acessado.

- **Vercel Hobby limita serverless functions a 12** [vercel, deploy, limite, hobby]
  O plano Hobby da Vercel permite no maximo 12 serverless functions. NOVO-APP tem 11 apos remover `api/link-status.ts`. Ao adicionar novas rotas em `api/`, e necessario verificar o total atual. Se bater o limite, o deploy falha silenciosamente. Solucoes: consolidar rotas, migrar para plano Pro, ou remover funcoes nao utilizadas.

- **Cron Vercel Hobby: maximo 1 schedule por projeto, 1x/dia** [vercel, cron, hobby, schedule]
  O plano Hobby da Vercel suporta apenas 1 cron job por projeto com frequencia maxima de 1 vez ao dia (`0 0 * * *`). O schedule original `0 */6 * * *` (4x/dia) funciona no plano Pro mas e ignorado no Hobby. A documentacao da Vercel sobre limites do Hobby e pouco explicita — validar no dashboard apos configurar.

- **Handler de cron deve aceitar GET e POST** [vercel, cron, api, handler]
  O Vercel Cron Jobs pode disparar requests como GET ou POST dependendo da configuracao. Se o handler so aceita POST, o cron falha silenciosamente quando o Vercel envia GET. O handler `api/cron-email-confirmation.ts` foi corrigido para aceitar ambos os metodos e validar `CRON_SECRET` via header `Authorization: Bearer`.

- **GRANT EXECUTE ON FUNCTION TO service_role para cron SQL** [supabase, cron, permission, service_role]
  Funcoes chamadas por cron precisam de `GRANT EXECUTE ON FUNCTION ... TO service_role` para executar no contexto do servico. Sem isso, a funcao lancaria `permission denied for function` quando chamada pelo cron mesmo com `SECURITY DEFINER`.

## Sessao 2026-06-15 — PR #376: 4 bugs, Sentry, E2E

- **activeGenerationRef nao pode ser deletado antes dos probes capturarem generationValid** [waterfall, loading, probes, safety-net]
  `finalizeWaterfallUI` deletava `activeGenerationRef.current` no inicio. `scheduleLoadingStuckProbes` (os probes) nunca conseguiam validar geracao porque o ref ja era `null`. A safety net ficou desarmada por 6 dias — o Sentry nunca alertava loading travado. Solucao: capturar `generationValid` como parametro ANTES de limpar o ref, passar para os probes por closure. O observer nao depende mais do ref.

- **"Consolidando informacoes..." e rotulo de UI, nao etapa de loading** [loading, progress, ui, contador]
  `finalizeLoadingProgress` contava "Consolidando informacoes..." como etapa de progresso. Como esse rotulo aparece apos todas as etapas reais, o contador exibia "8/7" (7 etapas + 1 rotulo). Solucao: finalizeLoadingProgress ignora esse rotulo especifico. `Math.min(completed, total)` como safety cap contra overflow.

- **Bolha inline trada deve degradar silenciosamente, nao mostrar erro** [inline-loading, stale-thinking, ux, degradacao]
  Quando o estado de loading fica stale (isThinking=true apos waterfall terminar), a bolha inline mostra "thinking..." para sempre. Em vez de mostrar erro ou mensagem alarmista, o guard `data.isLoading + stale-thinking` retorna `null` (nada renderizado). O `graceExpired` reseta entre ciclos via useEffect. O usuario nunca ve erro falso.

- **OperatorContext deve restaurar operator_id no localStorage apos resolucao de auth** [auth, operator, localStorage, sidebar-vazia]
  `storageRemove()` no inicio do login limpava `scout360:operator_id`. `getOperatorId()` so lia do localStorage. `resolveOperatorFromAuth()` encontrava o operator_id correto pelo Supabase mas nao o escrevia de volta. Resultado: sidebar vazia apos criar conta. Solucao: `storageSet(OPERATOR_ID_KEY, resolved.operatorId)` apos resolucao de auth.

- **Sentry de loading travado precisa de probes funcionais como pre-requisito** [sentry, observabilidade, monitoramento]
  4 novos alertas Sentry foram adicionados (loading stuck timeout, waterfall UI leak, session persist failed, generation ref cleared). Mas o alerta de loading travado so funciona se os probes (`scheduleLoadingStuckProbes`) conseguirem rodar — o que estava quebrado pelo Bug A. Sentry alerta sem probe funcional = falso negativo.

- **E2E auth flow precisa de helper dedicado** [e2e, playwright, auth, supabase]
  `setupE2EAuth` + `loginViaSupabase` no `tests-e2e/helpers/auth.ts` padronizam o fluxo de login E2E. Antes, cada teste lidava com auth de forma diferente. Helper unico com force clicks, timeouts configurados e API stubs reduziu falhas intermitentes. 10 arquivos E2E atualizados, 6/6 passando no preview Vercel.

## Sessao 2026-06-16 — Fix CNPJ limit + consultasocio complementar

- **Testar com dados reais antes de planejar** [debug, planejamento, adversarial, workflow]
  O planner criou um plano complexo de 5 passos (timeout, deadline, paralelizacao, UI truncada, busca incremental), mas o teste com CNPJ real (FGR INCORPORACOES S/A) mostrou que o problema era muito mais simples: limit=50 artificial e consultasocio como fallback apenas. Se tivessemos testado contra a API real antes de planejar, teriamos economizado 2 agentes (planner + adversarial review). O teste real matou o plano.
  Afeta: fluxo de debug de busca societaria, workflow de diagnostico.

- **Adversarial review revela premissas falsas que o planejador nao viu** [adversarial, review, premissas, planejamento]
  O planner sugeriu deadline 9s para o frontend. A adversarial review mostrou que isso era tiro no pe porque as APIs externas (CNPJ Aberto, consultasocio, BrasilAPI) levam 8-15s cada. 9s de deadline significava que a maioria das buscas falharia antes mesmo de completar. A review redirecionou todo o plano para uma abordagem mais simples: ajustar limites e fontes.
  Afeta: qualquer sugestao de timeout/deadline em fluxo com API externa.

- **CNPJ Aberto e consultasocio sao fontes complementares, nao hierarquicas** [cnpj, busca-societaria, fontes, arquitetura]
  O codigo em orchestration.ts:374 tratava CNPJ Aberto como fonte primaria e consultasocio como fallback ("se CNPJ Aberto retornou algo, nao precisa de consultasocio"). Mas as duas fontes tem dados diferentes: CNPJ Aberto tem cobertura ampla, consultasocio tem dados que CNPJ Aberto nao cobre. A condicao correta e rodar ambas sempre (para pessoas fisicas) e consolidar os resultados. Isso aumentou cobertura de descoberta de forma significativa.
  Afeta: `services/socio-search/orchestration.ts`, arquitetura de busca societaria.

- **Limites artificiais de resultado escondem capacidade real** [constantes, limite, configuracao, desempenho]
  limit=50 no documentExtractor.ts e MAX_COMPANIES=60 em types.ts pareciam numeros razoaveis para "protecao contra overflow". Mas para grupos empresariais grandes (construcao civil com 150+ CNPJs), esses limites cortavam ~70% dos dados. O usuario via o Mapa de Poder Societario incompleto sem saber que um teto artificial estava filtrando. Sempre validar constantes de limite contra dados reais do maior caso de uso, nao contra o caso medio.
  Afeta: `utils/documentExtractor.ts:406`, `services/socio-search/types.ts:134`.

- **Cache key version e acoplada a constantes de limite** [cache, versionamento, deploy, invalidacao]
  Mudar MAX_COMPANIES de 60 para 200 (ou limit de 50 para 200) exige invalidar o cache existente porque entries antigas tem dados parciais. A CACHE_KEY_VERSION em types.ts:136 e o mecanismo que faz isso: cada vez que uma constante de limite muda, a cache key precisa ser incrementada. De v7 para v8 neste caso. Sem esse bump, usuarios veriam dados parciais do cache antigo mesmo com o novo codigo.
  Afeta: `services/socio-search/types.ts:136`.

## Sessao 2026-06-15 — 3 bugs de historico apos login

- **RLS policy deve cobrir `authenticated` alem de `anon`** [supabase, rls, auth, authenticated]
  Usuarios logados no Supabase usam role `authenticated`, nao `anon`. Politicas criadas so com `TO anon` bloqueiam silenciosamente qualquer usuario autenticado, retornando `[]` sem erro. `ALTER POLICY ... TO anon, authenticated` corrige. Network request mostra `content-length: 2` com payload `[]` — sinal diagnostico.
  Afeta: `supabase/migrations/20260615_fix_dossies_rls_authenticated.sql`, toda policy RLS futura.

- **`content-length: 2` em resposta Supabase = RLS bloqueando** [supabase, debug, network, rls]
  Quando o body da resposta Supabase e `[]` (2 bytes) mas voce sabe que ha dados, a causa e RLS filtrando as rows. O Supabase nao gera erro HTTP — apenas retorna 0 rows. Verificar content-length no network panel e o primeiro passo diagnostico.
  Afeta: debug de queries Supabase.

- **`window.dispatchEvent` em efeito pai NUNCA alcanca listeners em efeitos filhos** [react, useEffect, evento, dispatch, race-condition]
  React executa useEffect dos pais antes dos efeitos dos filhos. Eventos sincronos (`new CustomEvent`) disparados no useEffect pai sao perdidos porque os listeners dos filhos ainda nao foram registrados. Solucao: `setTimeout(() => window.dispatchEvent(...), 0)` ou `queueMicrotask`.
  Afeta: `contexts/OperatorContext.tsx`, qualquer pai-filho com event dispatch.

- **`getOperatorId()` depende exclusivamente de localStorage** [auth, localStorage, operator, sidebar-vazia]
  `getOperatorId()` so le de `localStorage`. Se o `storageSet` nao for chamado apos resolucao de auth (porque `storageRemove` limpou no inicio do fluxo), toda a camada de storage falha silenciosamente retornando arrays vazios. Toda funcao que le storage precisa de fallback ou reconhecimento de que o dado pode nao estar la.
  Afeta: `contexts/OperatorContext.tsx`.

- **Sidebar vazia com dados intactos = 3 bugs em cadeia** [debug, diagnostico, cadeia, sidebar]
  Nenhum bug individual explica a sidebar vazia. Sao 3 bugs que se mascaram: (1) localStorage vazio porque operator_id nao foi restaurado, (2) query com temp operator_id retorna [], (3) RLS filtra o que restava. Cada um parece inofensivo isoladamente. Debuggar a network layer (nao apenas o state React) e essencial para quebrar a cadeia.
  Afeta: fluxo de diagnostico de sidebar/historico vazio.

## Sessao 2026-06-16 — Sentry-Vercel + incidente de vazamento

- **Env vars manuais tem internal: true e bloqueiam integracao Vercel Marketplace** [vercel, sentry, env-vars, marketplace]
  Env vars adicionadas manualmente no Vercel Dashboard tem `internal: true` por padrao. Isso faz com que integracoes de terceiros (como Sentry Marketplace) nao consigam injetar suas proprias env vars. A integracao falha silenciosamente — o Sentry nunca recebe erros das serverless functions. Solucao: remover env vars manuais relacionadas a integracao (SENTRY_DSN, etc.) e deixar o Marketplace gerenciar.
  Afeta: configuracao de integracoes Vercel Marketplace.

- **Vite define expoe variaveis ao client sem prefixo VITE\_** [vite, build, env, config]
  `define` no `vite.config.ts` substitui strings em tempo de compilacao. Diferente de `import.meta.env.VITE_*`, o `define` expoe o valor SEMPRE, inclusive em testes. Para variaveis que so existem em producao (como SENTRY_DSN), usar condicional `!process.env.VITEST` no define, ou usar `import.meta.env.VITE_SENTRY_DSN` com env var real prefixada.
  Afeta: `vite.config.ts`, build config.

- **Vercel Hobby nao tem log drains — serverless functions nao enviam erros ao Sentry** [vercel, hobby, log-drains, sentry, observabilidade]
  O plano Hobby da Vercel nao suporta log drains. Isso significa que erros lancados dentro de serverless functions (`api/*.ts`) NAO sao capturados pelo Sentry — mesmo com a integracao Marketplace ativa e a DSN configurada. O Sentry so captura erros do lado cliente (browser). Para cobertura completa de server-side, e necessario plano Pro (log drains) ou implementar fallback manual (`scout_diagnostics` Supabase).
  Afeta: observabilidade de serverless functions, planos Vercel.

- **Vercel CLI 54.14.0 Preview --non-interactive bug** [vercel, cli, bug, preview]
  `vercel env add --non-interactive --preview <env>` nao funciona na Vercel CLI 54.14.0 para ambientes Preview. O CLI recusa o valor mesmo com `--non-interactive`. Solucao: usar `--environment preview` (singular, sem `s`) em vez de `--preview`. Para ambientes Production e Development funciona normalmente com `--non-interactive`.
  Afeta: scripts automatizados de env vars para preview deployments.

- **CRITICO: Nunca usar backticks em comandos gh api com -f body — shell expande como comando** [seguranca, shell, gh, github, token, incidente]
  `gh api ... -f body='text with \`command\` backticks'`faz o shell expandir os backticks como`$(comando)` — executando o conteudo e expondo stdout como argumento. Se o corpo contem tokens ou comandos (`gh auth token`, variaveis), eles sao executados e o resultado aparece publicamente no comentario GitHub. A gravidade: tokens do ambiente ficam visiveis em URL publica. **Solucao obrigatoria:** sempre usar heredocs com aspa simples: `cat <<'EOF' | gh api --input -`. A aspa simples no delimitador ('EOF') impede qualquer expansao de shell.
Afeta: qualquer comando `gh api`ou`gh pr` com corpo gerado dinamicamente.

<!-- caliber:managed:learnings -->

_Atualizado automaticamente pelo Caliber apos sessoes de agente._

<!-- /caliber:managed:learnings -->

# Sessao 2026-06-18 - Playbook nao bloqueante e cron fail-safe

- **Roadmap de qualidade nao pode virar trava global de trabalho** [processo, agentes, planejamento]
  Um plano prioritario deve orientar ordem e prova, sem impedir mudanca explicita de objetivo, fechamento documental ou resposta a incidentes. Decisoes substituidas ficam marcadas como `SUPERADA`, preservando o historico.

- **Cron destrutivo deve iniciar em dry-run** [vercel, cron, auth, seguranca operacional]
  Configurar apenas o segredo de autenticacao pode ativar uma versao que exclui dados imediatamente. Primeiro publicar `dry-run` como padrao, revisar candidatos e so depois habilitar uma flag destrutiva separada.

## Marathon Sprint 1 + Sprint 2 — licoes consolidadas (2026-06-26)

- **Multiplos revisores IA capturam significativamente mais bugs que 1 revisor sozinho** [code-review, qualidade, multi-agent]
  Na Sprint 1, revisao por 1 bot (Gemini Code Assist) capturou 11 issues. Na Sprint 2, revisao por 2 bots (Gemini + 7 rodadas Cursor + 1 security Cursor) capturou 64 threads e 10 bugs, incluindo 2 P0 que 1 revisor sozinho nao teria pego (Rules of Hooks, Foundation cache). Cada revisor IA tem pontos cegos diferentes. Rodar multiplos revisores em paralelo antes do merge e barato e eficaz.

- **Roteamento de LLM 100% server-side evita exposicao de provedores no bundle** [seguranca, litellm, api, bundle]
  Roteamento client-side de LLM providers expoe nomes de modelo, provedores e endpoints no bundle JS — visivel no Network do browser e no source maps. `selectModelForModule()` em `api/gemini.ts` mantem a logica de roteamento no backend. O frontend envia request generico e o backend decide qual modelo usar. Nenhum provider exposto.

- **`useDeferredValue` do React 19 resolve freeze de renderizacao em blocos >30KB** [react, performance, freeze]
  Quando o dossie do bot tem >30KB de texto, o React bloqueia a main thread por segundos ao renderizar o SectionalBotMessage. `useDeferredValue` com fallback visual permite que a UI continue responsiva enquanto o React renderiza em background. Nao precisa de virtualization workaround ou chunking manual.

- **Cherry-pick inviavel para commits com >5 arquivos e dependencias cross-cutting** [git, merge, workflow]
  Commits que tocam 25+ arquivos com dependencias de componentes que nao existem no baseline (ex: CofreOverlay, LiteLLM) geram conflito massivo modify/delete. Cherry-pick funciona apenas para commits focados (<5 arquivos, sem dependencias de componentes inexistentes). Para diffs grandes com cross-cutting, reimplementar manualmente e mais rapido que resolver conflito.

- **Gate unico de feature reduz complexidade operacional vs multiplas flags** [arquitetura, config, feature-flag]
  5 gates planejados no design original (feature flag, env var, runtime, modulo, A/B) foram substituidos por 1 gate `LLM_PROVIDER`. Cada gate adicional e um ponto de falha e uma combinacao de estado inconsistente. Um unico gate com valores mutuamente exclusivos (`gemini` | `litellm`) simplifica rollback (remover env var) e debugging.

- **Verificar existencia na branch alvo ANTES de remover "scar tissue"** [cleanup, git, workflow]
  `blankPanelTelemetry.ts` e `useStaticTimelineFallback.ts` foram identificados como possivel scar tissue de refatoracao, mas ambos existem no baseline fe6c6f9 e sao referenciados em producao. A verificacao correta: `git show <baseline>:relative/path/to/file` para confirmar que o arquivo existe na branch alvo antes de remove-lo ou modifica-lo.

- **Retry seletivo: 4xx nunca, 429/5xx sempre** [api, retry, resiliencia]
  Erros 4xx (Bad Request, Forbidden, Not Found) indicam problema do cliente — retentar e inutil e pode agravar rate limit. Erros 429 (Too Many Requests) e 5xx (Server Error) sao transitorios e devem ser retentados com backoff. Implementado em `api/_llm-client.ts` com `shouldRetry()`.

- **ESM no runtime Vercel exige `.js` extension em imports locais** [vercel, esm, deploy, runtime]
  O runtime serverless da Vercel para funcoes TypeScript usa resolucao ESM estrita. Imports de arquivos locais sem extensao `.js` (ex: `from './utils'` em vez de `from './utils.js'`) falham em producao — `ERR_MODULE_NOT_FOUND`. O tipo do erro nao deixa claro que a extensao esta faltando. Sempre adicionar `.js` em imports de arquivos locais em `api/*.ts`.

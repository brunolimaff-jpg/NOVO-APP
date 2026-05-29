# Caliber Learnings — Senior Scout 360

Padrões e anti-padrões aprendidos de sessões anteriores. Tratados como regras do projeto.

## Padrões confirmados

- **Supabase + IDB como cache offline** [react, typescript, supabase, offline]
  Offline-first com sync queue: IDB para leitura/escrita instantanea, Supabase como source of truth.
  Stale-while-revalidate nas leituras, fila com retry exponencial nas escritas.
  Aplicado com sucesso — migracao completa de idb-keyval para Supabase.

- **Validar intencao de produto alem do evento tecnico** [ux, feedback, supabase, produto]
  Ao validar fluxos de produto, confirmar se o comportamento real representa a intencao esperada, nao apenas se o evento chegou no destino tecnico.
  Exemplo: feedback chegou no Supabase, mas cliques repetidos revelaram duplicacao e o clique negativo dependia de motivo + confirmacao.
  Validacao boa cruza banco, UX e semantica esperada antes de concluir que "funcionou".

- Prompts Gemini com XML delimiters têm menor taxa de alucinação
- Score PORTA deve sempre ser gerado com temperatura 0.1 (factual)
- Search Grounding nunca deve ser cacheado — dados de empresa mudam
- Skeleton screens com dimensões fixas eliminam layout shift no streaming
- Validar CNPJ antes de qualquer chamada IA evita desperdício de tokens
- Pool de fontes cumulativo entre módulos do waterfall reduz alucinação de links em módulos sem grounding
- Pipeline único de integridade ao final (não por módulo) é idempotente e evita duplicação de fontes
- Três categorias de fontes (citadas, consultadas, inferidas) dão transparência completa ao usuário

- **Diagnóstico persistente é obrigatório para bugs de UI de longa duração** [react, diagnostic, supabase, debug]
  Buffer em memória + flush para Supabase + fallback localStorage. Quando o console morre junto com a página,
  esta é a única forma de diagnosticar overlays órfãos, telas brancas e deadlocks de estado.

- **Fire-and-forget para instrumentação** [react, diagnostic, debug]
  Diagnóstico nunca deve usar await. Se o flush falhar, o bug que você está tentando encontrar não pode ser
  causado pelo próprio diagnóstico.

- **Timeout em toda operação no finally** [gemini, waterfall, timeout]
  Qualquer chamada de API no finally do waterfall PRECISA de Promise.race com timeout.
  Sem isso, uma operação travada bloqueia o finally e o overlay nunca sai.

- **Fallback visual controlado nunca genérico** [ui, testing, react]
  EmptyStateFallback exige 5 condições simultâneas: sessão ativa AND sem mensagens AND sem loading
  AND sem erro AND scoutDiag com diagnóstico. Fallback genérico esconde bugs — só deve aparecer
  onde não há outro estado (content/loading/error) competindo.
  Aplicado com sucesso — evita que tela branca parcial fique sem diagnóstico.

- **Classificação explícita de estado com prioridade fixa** [ui, testing, typescript]
  `classifyPanelState()` usa prioridade `error > loading > content > empty` para garantir que
  estados de erro/loading nunca são mascarados por estados de ordem inferior.
  A ordem é contratual: qualquer mudança na prioridade quebra os contratos de teste.

- **data-testid padronizados como contrato visual** [testing, e2e, ui]
  13 nomes oficiais de data-testid documentados no spec e contrato. Nenhum testid arbitrário
  permitido sem justificativa no spec. Nomes oficiais permitem que E2E e testes unitários
  referenciem elementos por identificador estável, independente de refatoração de CSS/componente.

- **data-testid valor unico, nunca composto com espaco** [testing, e2e, playwright]
  `data-testid="send-message-button chat-send-button"` — espaco no valor quebra `getByTestId()`
  do Playwright porque `querySelector('[data-testid="a b"]')` interpreta o espaco como
  seletor de filho CSS. Valor unico sempre: `data-testid="send-message-button"`.
  Confirmado por 3 angulos independentes do /code-review (A, B, D).

- **Code review + security review sequenciais antes de commit** [process, qa, workflow]
  Code review (agente reviewer) encontrou 4 P0, 6 P1, 10 P2 em 18 arquivos. Security review
  (tool security-review) encontrou 2 issues adicionais que o code review nao detectou (RLS FOR ALL
  e camelCase em sanitizePayload). Nenhum dos dois sozinho e suficiente. Sequencia:
  code review -> security review -> aplicar -> commit.

- **RLS policies com INSERT+UPDATE separados (nao FOR ALL)** [supabase, security, sql]
  FOR ALL e muito amplo para role anon em tabelas de tracking. INSERT e UPDATE separados
  reduzem superficie de ataque. operator_events so precisa de INSERT; operator_sessions
  precisa de INSERT + UPDATE. Aplicado com sucesso apos security review.

- **sanitizePayload com camelCase detection** [security, typescript, utils]
  Alem do regex word-boundary `\b(key|token|...)\b`, dividir strings camelCase em tokens
  (`apiKey` -> `['api', 'key']`) antes de testar contra a lista de keys sensiveis.
  Word-boundary so nao detecta camelCase. Aplicado com sucesso.

- **E2E com interceptação page.route para simular falha** [e2e, testing, playwright]
  `page.route('**/api/gemini**', route => route.abort())` permite testar loading infinito e erro
  controlado sem depender de conectividade real com API externa. Essencial para testes determinísticos
  de estados de falha.

- **Função utilitária exportada vira contrato** [testing, typescript, contract]
  Quando uma função utilitária (ex: `sanitizeMetadata`) é usada em testes de contrato e em produção,
  ela se torna um contrato. Qualquer mudança em `sanitizeMetadata` quebra ambos os lados.
  Documentar explicitamente no contrato.

- **finally com try/catch em operacoes de cleanup secundarias** [waterfall, gemini, cleanup]
  Qualquer operacao no finally do waterfall (cache delete, log, flush) deve usar try/catch.
  Erro de cleanup NUNCA deve propagar e mascarar o erro principal do waterfall.
  O erro secundario e registrado com scoutDiag.warn, nao lancado.
  Aplicado com sucesso — commit `9137a3c`.

- **void promise sempre com .catch() para fire-and-forget** [react, typescript, async]
  Quando uma funcao muda de void para Promise<void>, callers que nao aguardam devem usar
  `void promise.catch(() => {})`. Sem .catch(), promise rejeitada causa unhandled rejection
  que alerta no console e pode derrubar processos Node.
  Aplicado com sucesso — commit `3cd37ce`.

- **AbortController para timeout previsivel em vez de Promise.race puro** [api, gemini, timeout]
  `withTimeout` refatorado com AbortController interno que aborta a operacao real, nao apenas
  rejeita a promise. Promise.race puro cria timeout que libera a promise mas deixa o fetch/stream
  rodando em background. AbortController corta a conexao real.
  Aplicado com sucesso — commit `d0f1980`.

- **AbortSignal.timeout() built-in para fetch** [api, fetch, timeout]
  Usar `AbortSignal.timeout(ms)` nativo do fetch em vez de Promise.race customizado.
  Mais simples, mais previsivel, corta conexao TCP real no timeout.
  Aplicado com sucesso — commit `d2a3a13`.

- **setupVisibilityTracking retorna cleanup function** [react, diagnostic, cleanup]
  Toda funcao que registra event listeners (visibilitychange, pagehide, freeze) deve retornar
  a funcao de cleanup que os remove. Sem cleanup, cada reconexao acumula listeners,
  causando multiple flush e memory leak.
  Aplicado com sucesso — commit `7700cfd`.

- **useRef para todo setTimeout em componente React** [react, hooks, cleanup]
  setTimeout em useEffect ou callback de componente deve armazenar timerId em useRef
  e limpar no return do useEffect. Timer orfao executa callback em componente desmontado,
  causando setState in unmounted component e possiveis leaks.
  Aplicado com sucesso — commit `15379b0`.

- **Toast como feedback primario para acoes bloqueadas** [ux, feedback, react]
  Quando uma acao do usuario e bloqueada por regra de negocio (ex: Deep Dive sem acesso),
  exibir toast informativo em vez de silencio. Silencio parece bug; toast informa a restricao.
  Nao usar alert() ou console.warn como feedback primario para o operador.
  Aplicado com sucesso — commit `15379b0`.

## Anti-padrões identificados

- **Painel central sem classificação explícita de estado** [ui, anti-pattern]
  Renderizar painel central sem classificar o estado (empty/loading/content/error) leva a tela
  branca parcial sem diagnóstico. Cada estado deve ser mutuamente exclusivo e com fallback explícito.

- **data-testid sem padronização** [testing, e2e, anti-pattern]
  Testids arbitrários em componentes causam duplicação e conflito. Nomes devem ser documentados
  em spec central e revisados em code review.

- **data-testid com espaco no valor** [testing, e2e, playwright, anti-pattern]
  `data-testid="send-message-button chat-send-button"` — espaco no valor quebra `getByTestId()`
  do Playwright, que usa `querySelector('[data-testid="..."]')` — seletor CSS com espaco vira
  seletor de filho. Valor deve ser sempre unico, sem espacos.

- **Stale closure em useCallback por variaveis ausentes do deps array** [react, hooks, anti-pattern]
  operatorId e email usados dentro de processMessage mas nao declarados no array de dependencias
  do useCallback. Stale closure causa perda silenciosa de eventos de tracking. Toda variavel
  referenciada dentro do callback precisa estar no deps array.

- **E2E testando boundary que nunca dispara** [testing, e2e, anti-pattern]
  Erro 500 de API interceptada via page.route e capturado internamente por try/catch no
  processMessage, nunca propagado para React ErrorBoundary. Teste que espera `controlled-error`
  sempre falha. Conhecer o fluxo de erro real do componente antes de escrever o teste.

- **Coluna nova referenciada em codigo antes da migration ser aplicada** [supabase, deploy, anti-pattern]
  Referenciar `email_normalized` em storage.ts quando a coluna so existe apos migration ser
  executada. Codigo deploya primeiro e quebra por schema incompativel. Sempre adicionar
  fallback ou garantir ordering de migration antes do codigo.

- **Parametros fixos (false) em classificador condicional** [typescript, react, anti-pattern]
  `hasDossierContent: false` e `hasError: false` passados fixos para classifyPanelState em
  ChatInterface.tsx. Branch 'error' do classifier vira codigo morto no unico call site de
  producao. Parametros que sao sempre false devem ser removidos ou o branch reavaliado.

- **Fallback genérico do painel central** [ui, anti-pattern]
  Um único fallback "se não tem conteúdo, mostra X" sem verificar loading/error mascara bugs
  de estado real. Fallback só deve aparecer quando nenhum outro estado (loading, error, content)
  está ativo.

- Prompt inline no componente: dificulta versionamento e teste
- catch vazio em chamadas Gemini: vendedor vê tela travada sem saber o motivo
- `any` em tipos de resposta da IA: propaga erros silenciosos para o dossiê
- Cache de Search Grounding: dossiê com dados desatualizados compromete credibilidade na reunião
- `break` em fallback de busca web: um módulo degradado não deve abortar o pipeline inteiro; `continue` preserva resiliência e fontes de módulos anteriores
- `?? 'hero'` em `loadingVariant`: coerção de `undefined` para valor padrão ignora semântica do nulo; comparar explicitamente com `=== 'hero'`
- `keepalive: true` com `AbortSignal`: o browser ignora o signal quando keepalive está ativo; são mutuamente exclusivos
- `innerText` para leitura de DOM em diagnóstico: força reflow completo; `textContent` é suficiente para checagem de presença de texto
- Timers de diagnóstico sem cleanup tracking: criar setTimeout sem armazenar a referência causa acumulação de timers órfãos
- localStorage sem pruning: cada flush falho cria uma nova key sem limite; sempre definir um teto máximo de keys
- `useMemo` para strings primitivas: desnecessário e mais complexo que concatenação direta de string — React já compara `===` em deps de useEffect

- **Fire-and-forget para delete de cache em waterfall** [react, waterfall, cache]
  No finally do waterfall, delete de cache nao pode bloquear o encerramento visual.
  Promise.race com timeout de 15s + catch silencioso + finally com cleanup.
  O cache expira sozinho via TTL — nao justifica delay na UI.

- **Endpoint externo novo precisa ser testado do IP do serverless antes de deploy** [vercel, serverless, deploy]
  DuckDuckGo HTML (`html.duckduckgo.com/html/`) e um endpoint que CDN/datacenter IPs
  podem bloquear. Testar com `curl` de dentro do serverless function ou `vercel dev --listen`
  antes de incluir em PR. Testes unitarios nao cobrem conectividade real de IPs.

- **Nunca assumir causa antes de evidencia em bugs intermitentes** [debug, methodology]
  Erro 500 no console nao significa que esse erro CAUSA a tela branca. Pode ser sintoma
  secundario, ou a tela branca pode ser pre-existing. Documentar hipoteses, testar cada uma,
  so aplicar patch quando confirmar causalidade.

- **Playwright nao basta como prova final para bugs de lifecycle/cache/browser real** [testing, debug, browser]
  Playwright e Chrome DevTools sao uteis para coleta inicial de evidencias, mas bugs que dependem
  de alternancia real de abas, freeze/thaw do SO, throttle de timers em background (1/min no Chrome)
  ou IndexedDB corrompido so se manifestam em navegador real com abas reais.

- **Separar sintoma de causa raiz — cada sintoma pode ser um bug diferente** [debug, methodology]
  Tela branca, timeline vazia, overlay residual, bot ausente e 500 no /api/open-web-search
  podem ser problemas independentes. Agrupar tudo sob "tela branca" sem isolar cada sintoma
  leva a patches que mascaram em vez de corrigir.

- **Endpoint auxiliar degradavel nunca deve retornar 500** [api, serverless, resilience]
  Um endpoint de fallback como /api/open-web-search deve sempre retornar 200 com
  `degraded: true` + `detail`. 500 em endpoint auxiliar quebra o contrato de fallback
  e propaga erro em cascata para o waterfall.

- **Serverless pode falhar fora do catch — logs da Vercel sao obrigatorios** [vercel, serverless, debug]
  Import com side effect, timeout da runtime (60s Hobby), dependencia pesada (cheerio)
  ou fetch pendurado podem crashar a funcao ANTES do try/catch. Sem verificar os logs
  do Vercel Functions, o diagnostico e cego.

- **Persistencia parcial apos reload e risco critico** [offline, persistence, supabase]
  Se o dossie esta em andamento e o usuario recarrega, a sessao parcial (so mensagem do
  usuario, sem resposta do bot) pode ser salva e sobrescrever uma sessao completa anterior.
  Sessao incompleta nunca deve substituir sessao completa.

- **Supabase provar backend vivo nao prova UI renderizada** [debug, supabase, frontend]
  Diagnosticos persistidos no Supabase provam que o backend e a instrumentacao funcionam.
  Nao provam que o Virtuoso renderizou, que o portal fechou ou que o usuario viu o dossie.
  Validacao de UI exige evidencia no cliente (DOM snapshot, console, screenshot).

- **Nao misturar instrumentacao, prompt, waterfall, layout e persistencia na mesma correcao** [scope, methodology]
  PRs com 5+ dominios diferentes (ex: documentExtractor + LoadingSmart + waterfall +
  MessageTimeline + geminiProxy) dificultam isolamento de regressao. Cada dominio
  merece branch e validacao independentes.

- **Preview Vercel e por branch/commit, nao soma PRs abertas** [vercel, deploy]
  Abrir PR #307 baseada na #306 NAO faz o preview incluir as mudancas da #306.
  Cada preview e um deploy isolado do commit da branch. Base branch != merge automatico.

- **Debug em hot path precisa ser gated** [performance, diagnostic]
  console.log, console.time e console.timeEnd em MessageRow, SectionalBotMessage e useMemos
  de parsing de texto disparam em toda renderizacao de mensagem. Para textos de 39k chars
  no dossie, isso polui o console e impacta performance. Diagnostico em hot path so com
  gate explicito (VITE_DEBUG_CONSOLE ou similar).

- **Endpoint externo novo deve ser testado no ambiente real da Vercel** [vercel, deploy, serverless]
  Reforca licao anterior: `html.duckduckgo.com/html/` funcionou em maquina local mas
  foi bloqueado por IPs de datacenter da Vercel. curl de dentro da serverless function
  ou `vercel dev --listen` antes do deploy evita regressao.

- **Nao declarar causa raiz sem stack trace** [debug, methodology]
  "Provavelmente e X" nao e diagnostico. Causa raiz exige: erro exato, stack trace,
  arquivo e linha, condicao que dispara. Sem stack trace, o maximo que se pode afirmar
  e "hipotese principal, pendente de confirmacao".

- **Dossie em andamento precisa de status explicito** [waterfall, ux, persistence]
  Sessoes de dossie devem ter status: `generating`, `completed`, `failed`, `partial`.
  Sem status, o cliente nao sabe se o dossie foi interrompido, se esta em andamento
  ou se o que ve na tela e o resultado final.

- **finally sem try/catch em operacao de cleanup secundaria** [anti-pattern, waterfall, cleanup]
  Operacao no finally sem try/catch: se o cleanup falha (ex: delete de cache expirado),
  o erro propaga e mascara o erro principal do waterfall. Toda operacao secundaria no
  finally precisa de try/catch. O erro secundario e registrado com warn, nunca lancado.
  Corrigido em commit `9137a3c`.

- **void promise sem .catch()** [anti-pattern, react, async]
  Funcao que muda de void para Promise<void> sem que callers adicionem .catch(): qualquer
  rejeicao dispara unhandled rejection. Fire-and-forget intencional sempre usa
  `void promise.catch(() => {})`. Corrigido em commit `3cd37ce`.

- **setTimeout sem cleanup em componente React** [anti-pattern, react, hooks]
  setTimeout em componente sem armazenar timerId e sem cleanup no unmount cria timer orfao
  que executa callback em componente desmontado. Sempre usar useRef + clearTimeout.
  Corrigido em commit `15379b0`.

## Anti-padroes identificados

- **Mergear PR com endpoint externo nao testado em runtime serverless** [anti-pattern, deploy, serverless]
  Incluir `html.duckduckgo.com/html/` sem validar do IP da Vercel. Se o endpoint
  for bloqueado, a funcao serverless crasha (500) e degrada a experiencia do usuario.
  Patch manual removendo o endpoint pode ser necessario.

- **Console.log/console.time em hot paths de renderizacao** [anti-pattern, performance]
  Adicionar console.time em useMemos de MessageRow e SectionalBotMessage para debug
  temporario e deixar chegar numa PR para main. Toda renderizacao de mensagem bot
  (39k chars no dossie) dispara 5+ medicoes de console.time. Diagnostico em hot path
  sem gate polui console e degrada experiencia do usuario final.

- **F5/refresh reentry guard via sessionStorage** [supabase, persistence, react]
  `startOperatorSession` verifica `sessionStorage` em busca de `scout:current_session_id`
  antes de criar nova sessao. Se ja existe, chama `touchOperatorSession()` (só atualiza
  `last_seen_at`). Impede que `started_at` resete no refresh do navegador.
  Aplicado com sucesso — contrato de teste verifica upsert na primeira chamada e
  update (touch) na reentrada.

- **RLS policies explicitas nunca placeholder** [supabase, security, sql]
  Toda migration SQL com RLS deve ter politicas reais, nao comentarios placeholder.
  Sem politicas, a role `anon` nao tem acesso — o que parece "permissivo" na verdade
  bloqueia tudo. Politica permissiva com `USING (true)` e `WITH CHECK (true)` e
  explicita e intencional.

- **Word-boundary regex em sanitizacao** [security, typescript, utils]
  Usar `/\b(token|key|secret|password|auth|credential)\b/i` em vez de `lower.includes()`
  para deteccao de keys sensiveis. Includes generico causa falso-positivo em campos
  como `bodyLen`, `textLen`, `authLength`. Exact-match (`/^(prompt|response|content|text|body)$/i`)
  para campos de conteudo.

- **classifyPanelState params devem ser minimos** [typescript, testing, react]
  `hasActiveSession` nao pertence ao `classifyPanelState`. O classifier so ve estados
  de renderizacao (error, loading, content, empty). A decisao de mostrar EmptyStateFallback
  e do caller, que combina panelState + hasActiveSession + showInitialHome.

- **.claude/ versionado como infra de automacao** [claude-code, automation, dx]
  Hooks (PreToolUse/PostToolUse), skills, agents e MCP config tudo versionado no `.claude/`.
  PreToolUse bloqueia .env/lock e trava commits acima de 8. PostToolUse roda Prettier
  automatico em .ts/.tsx. Automation ad-hoc sem versionamento morre na primeira build.
  Aplicado com sucesso — commit em working tree pendente.

- **check-branch-health com limites 5/8 para acumulo de commits** [git, process, dx]
  `scripts/check-branch-health.sh`: 0-5 silencioso, 6-7 warning, 8+ bloqueia commit.
  Evita PRs com diff gigante (21+ commits). CLAUDE.md regras 10-12 formalizam:
  max 7 commits locais sem push/PR, push diario obrigatorio, checkpoint a cada 5.
  Aplicado com sucesso — `scripts/check-branch-health.sh`.

- **Code review em multi-angulo paralelo descobre mais bugs que revisao linear** [code-review, methodology, qa]
  `/code-review --max` com 9 angulos (seguranca, react, gemini, e2e, tipos, perf,
  sql, UX, automacao) encontrou 18 findings (2 P0, 4 P1, 12 P2). Angulo C (Gemini
  timeout/abort) encontrou P0 que angulo A (seguranca) nao detectou. Multiplos focos
  paralelos aumentam significativamente a taxa de deteccao comparado a revisao linear
  de 1 passada.

- **withTimeout + AbortSignal: criar controller nao basta, precisa PROPAGAR** [gemini, api, timeout, anti-pattern]
  O fix `d0f1980` trocou Promise.race por AbortController, mas a correcao foi
  INCOMPLETA. O `signal` do controller nunca e passado para `chat.sendMessage()`
  (api/gemini.ts:416) nem `sendFunctionResponses()` (api/gemini.ts:491).
  A operacao real nunca e abortada — apenas a Promise e rejeitada.
  Documentado como P0. Precisa corrigir antes de fechar PR #309.

- **Plano de merge com estrategia de rollback obrigatoria** [git, process, merge]
  Antes de soft reset ou rebase, criar branch de backup. `backup/operator-tracking-21-commits`
  permite `git reset --hard` se algo der errado. Merge sem rollback = aposta.

## Anti-padroes identificados

- **Mergear PR com endpoint externo nao testado em runtime serverless** [anti-pattern, deploy, serverless]
  Incluir `html.duckduckgo.com/html/` sem validar do IP da Vercel. Se o endpoint
  for bloqueado, a funcao serverless crasha (500) e degrada a experiencia do usuario.
  Patch manual removendo o endpoint pode ser necessario.

- **Console.log/console.time em hot paths de renderizacao** [anti-pattern, performance]
  Adicionar console.time em useMemos de MessageRow e SectionalBotMessage para debug
  temporario e deixar chegar numa PR para main. Toda renderizacao de mensagem bot
  (39k chars no dossie) dispara 5+ medicoes de console.time. Diagnostico em hot path
  sem gate polui console e degrada experiencia do usuario final.

- **Placeholder RLS sem politica real** [anti-pattern, supabase, security]
  SQL migration com `-- Nao ha politicas RLS restritivas porque...` sem politicas reais.
  Na pratica, sem `CREATE POLICY`, o RLS bloqueia tudo para a role `anon`.
  Sempre criar politicas explicitas, mesmo que sejam permissivas.

- **Parametro de decisao de UI dentro de classificador puro** [anti-pattern, typescript, testing]
  Passar `hasActiveSession` para `classifyPanelState` mistura estado de roteamento
  com estado de renderizacao. O caller (ChatInterface) deve combinar
  `panelState + hasActiveSession + showInitialHome` para decidir fallback.

<!-- caliber:managed:learnings -->

_Atualizado automaticamente pelo Caliber após sessões de agente._

<!-- /caliber:managed:learnings -->

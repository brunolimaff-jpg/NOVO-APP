# Worklog das PRs da Auditoria — 2026-07-07

Este arquivo registra o andamento operacional das PRs abertas para executar o plano final de auditoria. Ele existe para não perdermos o ponto exato do loop entre correção, validação, review, push e monitoramento.

## PR #410 — Baseline CI/Main Verde

- Branch: `fix/main-typecheck-pr408`
- Worktree local: `/Users/brunolima/.config/superpowers/worktrees/NOVO-APP/fix-main-typecheck-pr408`
- Objetivo: destravar baseline de CI herdado do PR #408/#410 antes das próximas PRs de segurança, RLS/Auth e BUG-8.
- Escopo aceito: corrigir dependências faltantes, Node skew, testes quebrados por deadline de auth, contratos stale de RAG/Open Web Search, helper E2E live quebrado e E2E crítico bloqueado pelo AuthGate.
- Fora de escopo: cron/review-cron, RLS/Auth estrutural, Sentry masking, BUG-8 completo, LiteLLM produção, vulnerabilidades npm audit.

### Correções Aplicadas

- CI passou de Node 20 para Node 24 em `.github/workflows/ci.yml`, alinhando com `package.json`.
- Adicionado `test:e2e:golden-live` em `package.json`.
- Declaradas dev dependencies ausentes em instalação limpa: `@testing-library/dom`, `@types/react`, `@types/react-dom`.
- Testes de `AuthGate` congelam relógio antes do deadline quando validam fluxo pré-migração.
- Testes de `App` mockam usuário autenticado para não ficarem bloqueados pelo deadline de 2026-06-18.
- `contexts/AuthContext.tsx` ganhou bypass E2E restrito a `import.meta.env.MODE !== 'production'`, `VITE_E2E_AUTH_BYPASS=true` e `navigator.webdriver`.
- Job `E2E Critical Browser` passa `VITE_E2E_AUTH_BYPASS=true`; runtime normal continua sem bypass.
- `/api/rag` agora preserva modo global sem `namespace` e suporta modo docs consolidado com allowlist de namespace.
- `/api/open-web-search` agora expõe corretamente Brave como provedor primário e DDG como fallback.
- `hooks/useInvestigation` mostra erro visível e registra `scoutDiag.warn` quando dossiê remoto não carrega.
- Removido `console.error('[TRACE] socio-search-batch')` de produção.
- Helpers E2E ganharam `setupRealSupabaseAuthFromEnv`, `startNewInvestigation` e `dismissDuplicateDossierModal`.
- Helper golden ganhou wrapper `evaluateDossierGolden` compatível com o spec live.
- `test:e2e:preview` foi adicionado como alias do critical UX.
- Workflow manual `e2e-preview.yml` roda contra preview Vercel com `E2E_REAL_AUTH=1` e secrets do GitHub; o bypass E2E fica restrito ao CI local/não-production.

### Validação Local

- `npm ci`: passou com warnings esperados de engine local Node 26 vs package Node 24 e 33 vulnerabilidades já conhecidas.
- `npm run typecheck`: passou.
- `npm run test -- --run --reporter=dot`: passou com 158 arquivos e 1476 testes.
- `env -u SENTRY_AUTH_TOKEN npm run build`: passou; Sentry upload foi evitado localmente.
- `VITE_E2E_AUTH_BYPASS=true npm run test:e2e:critical-ux`: passou em rodada anterior com 9/9 testes em ~2 min, mas deixou de ser gate decisivo após decisão do Bruno de validar UX/live somente no Vercel.
- TypeScript focado em E2E live/helpers: passou para `golden-dossier-live`, `report-ready`, `second-investigation` e `litellm-live-parallel`.
- `git diff --check`: passou.
- `npm run lint`: passou sem erros; restam 62 warnings existentes/fora de escopo.
- `review-branch`: achado de segurança no bypass E2E foi mitigado antes do push; verdict local atual: pronto para push após build final.
- Decisão Bruno: validação final de UX/live deve rodar no Vercel preview com auth real; local serve apenas como triagem técnica.
- Ajuste pós-decisão: helpers `setupE2EAuth` usam login real quando `E2E_REAL_AUTH=1`, permitindo rodar critical UX no preview Vercel sem bypass em produção.
- Evidência remota `42b4bc8a`: CI/Build/Tests/E2E Critical/Smoke preview passaram; Golden live e E2E Preview manual travaram no fluxo de auth real. Golden publicou `error-context.md` mostrando tela "Recuperação de acesso / Criar minha senha".
- Correção aplicada: fluxo Scheffer com `E2E_REAL_AUTH=1` não semeia `operator_email` local antes do login; workflows live agora usam `reporter=line`, timeout de comando controlado e upload de artefatos.
- Evidência remota `4cd57e04`: CI completa passou; Golden live falhou em 14 min ainda na tela "Acesso temporariamente bloqueado", indicando que o helper podia pular abertura do modal e ficar aguardando input sem timeout de ação.
- Correção aplicada: `setupRealSupabaseAuthFromEnv` agora espera explicitamente o botão de auth, abre o modal, valida campos de email/senha e falha cedo com mensagem clara se o modal não abrir.
- Evidência remota `1daafa5b`: CI completa passou; Golden live falhou rápido esperando `operator-menu-button`. O seletor existia nos helpers, mas o botão real do `UserMenu` não expunha esse `data-testid`.
- Correção aplicada: botão principal do `UserMenu` agora expõe `data-testid="operator-menu-button"` para estabilizar auth real em gates E2E.
- Evidência remota `d74c9ed2`: Golden live passou pelo login real e falhou em `completeOnboarding`, que esperava `greeting-card`/form de guest mesmo com usuário autenticado.
- Correção aplicada: fluxo Scheffer com auth real agora espera shell/menu autenticado e chama `startNewInvestigation` diretamente, sem passar pelo onboarding guest.
- Evidência remota `df398a72`: CI, Build, Typecheck, Tests, E2E Critical Browser, Smoke preview, CodeQL, CodeRabbit, GitGuardian e Vercel passaram; Golden live falhou após submit porque nenhum overlay de waterfall apareceu em 45s.
- Correção aplicada: helper Scheffer deixou de clicar no submit com `force`, expôs/observa `investigation-location-status` e aguarda por mais tempo o modal de dossiê duplicado antes de exigir o overlay do waterfall.
- Review PR #410: resolvidos comentários pendentes sobre docs-mode do RAG baseado no payload Zod, mensagem real de `PostgrestError`, `@types/node` alinhado ao Node 24 e login E2E com falha clara quando credencial é recusada.
- Correção aplicada: lookup de dossiê duplicado antes do waterfall agora tem teto de 6s e segue com nova investigação se o Supabase não responder, evitando formulário parado sem overlay.
- Evidência remota `624adb35`: CI, E2E Critical Browser, Smoke preview e Vercel passaram; Golden live ainda falhou antes do overlay do waterfall, sem diagnóstico suficiente no artefato padrão.
- Correção aplicada: helper Golden agora coleta diagnóstico não sensível do submit quando a validação/localização ou o overlay não aparecem.
- Evidência remota `63ba125e`: diagnóstico confirmou `duplicateModalVisible=true` após submit; modal de dossiê existente ficava aberto e bloqueava o nascimento do waterfall.
- Correção aplicada: `DuplicateDossierModal` expõe testids estáveis e o Golden agora espera overlay ou modal duplicado; se aparecer modal, clica "Nova Pesquisa do Zero" e volta a aguardar o waterfall.
- Evidência remota `6bf7a44c`: CI completo, E2E Critical Browser, Smoke preview e Vercel passaram; Golden live avançou além do modal duplicado, mas falhou depois em fluxo live longo.
- Decisão Bruno/Codex: Golden Dossier Live fica em quarentena não bloqueante na PR #410 para arrumar a casa primeiro; evidências continuam sendo publicadas como artefato.

### Status Pos-Push

- PR: <https://github.com/brunolimaff-jpg/NOVO-APP/pull/410>.
- Evidencia funcional do baseline: `91eeeb55` validou codigo + workflow da quarentena; `18e74ca3` foi docs-only e repetiu os mesmos gates verdes no rollup da PR.
- Como commits de documentacao geram novo SHA, o rollup atual da PR #410 continua sendo a fonte viva para o HEAD mais recente.
- CI remoto passou: `Typecheck`, `Tests`, `Build`, `Dossier Golden` e `E2E Critical Browser`.
- CodeQL passou nos escopos `actions`, `javascript-typescript` e `python`.
- Vercel preview passou; `Smoke (preview)` passou no deployment do mesmo SHA.
- `Golden Dossier Live (blocking)` passou como check, mas apenas porque esta PR colocou o gate em quarentena: o teste interno falhou com exit code 1, publicou warning e manteve artefatos.
- `gh pr view`: `mergeStateStatus=BLOCKED`; nenhum merge foi feito e continua exigindo comando explicito `MERGE` do Bruno.

### Riscos Remanescentes

- Golden live depende de preview Vercel HTTPS, `E2E_REAL_AUTH=1`, senha Supabase e `E2E_DEPLOYMENT_SHA`; nesta rodada virou evidência/quarentena, não gate de merge.
- BUG-8/UX de dossiê longo permanece fora desta PR; a falha interna do Golden live confirma que esse fluxo precisa ser tratado em PR própria antes de reativar o gate como bloqueante.
- `npm audit` continua fora do gate desta PR por decisão do plano: precisa classificação antes de virar bloqueio.
- O bypass E2E agora falha fechado em `production`, mas qualquer tentativa de configurar `VITE_E2E_AUTH_BYPASS` fora de teste continua sendo erro operacional.

## Watcher

- Automação criada: `novo-app-pr-watcher-auditoria`.
- Frequência: a cada 30 minutos.
- Escopo: checar PRs abertas, checks, reviews/comentários e falhas acionáveis.
- Guardrail: nunca executar merge; merge exige Bruno escrever `MERGE`.
- Removida em 2026-07-08 a pedido do Bruno; acompanhamento passa a ser manual nesta execução.

## PR Hotfix Segurança Pequeno

### Status Local

- Worktree local: `/Users/brunolima/.config/superpowers/worktrees/NOVO-APP/hotfix-security-small`
- Branch: `codex/hotfix-security-small`
- Base empilhada: `fix/main-typecheck-pr408` / PR #410.
- PR: <https://github.com/brunolimaff-jpg/NOVO-APP/pull/411>
- Primeiro commit da PR: `6289adb0`.
- Objetivo: aplicar hotfix pequeno de seguranca sem misturar cron, RLS/Auth ou BUG-8.
- Fora de escopo por decisao do Bruno: cron/review-cron.
- Golden live: permanece em quarentena conforme PR #410; se voltar a bloquear a casa, a prioridade e estabilizar o app antes de reativar o gate como bloqueante.

### Correções Aplicadas

- Sentry Replay passou para `maskAllText: true` e `blockAllMedia: true`.
- `beforeSend` do Sentry ganhou scrubber para CPF, CNPJ e email em eventos antes do envio.
- `/api/gemini` agora valida `recordDiagnostics` com schema Zod estrito antes de gravar diagnosticos.
- Score PORTA passou a clampar notas `P/O/R/T/A` em 0-10 e score bruto/final em 0-100, incluindo marker explicito e estado consolidado.
- Corrigido caractere CJK acidental no contrato de prompt do seller brief.
- CNPJ Aberto agora descarta registros sem CNPJ valido no extractor.
- CNPJ Aberto estruturado so entra no inventario principal se lookup oficial confirmar o mesmo CNPJ e o QSA confirmar o socio; falha/mismatch vira rejeitado.

### Validação Local

- `npm exec vitest run tests/utils/sentryScrubber.test.ts tests/api-gemini.test.ts tests/utils/porta.test.ts tests/services/portaStateService.test.ts tests/utils/documentExtractor.test.ts tests/api-socio-search.test.ts tests/prompts/megaPrompts.test.ts`: passou, 100 testes.
- `npm run typecheck`: passou.
- `npm run lint`: passou sem erros; restam 61 warnings existentes/fora de escopo.
- `npm run validate:prompts`: passou, 71 testes.
- `npm run build`: passou; houve upload local de sourcemaps ao Sentry porque o ambiente local tinha configuracao de Sentry ativa.
- `npm run test`: passou, 159 arquivos e 1486 testes.
- `git diff --check origin/fix/main-typecheck-pr408`: passou.

### Proximos Gates Remotos

- Abrir PR empilhada contra `fix/main-typecheck-pr408`.
- Aguardar Vercel preview e checks GitHub.
- Conferir comentários/reviews da PR e resolver antes de considerar pronta.
- Nenhum merge sem Bruno escrever `MERGE`.

### Rodada de Review da PR #411 — 2026-07-08

- Comentarios recebidos: 5 inline comments.
- Correções aplicadas:
  - Sentry scrubber agora preserva `Error` com `name`, `message`, `stack`, `cause` e propriedades enumeraveis, mantendo scrub em dados sensiveis.
  - `recordDiagnostics` aceita `null` em campos opcionais vindos do cliente e normaliza para `undefined`; `route` e `userAgent` passam por truncamento defensivo em 2048 chars.
  - PORTA usa pesos `PRD` como fallback defensivo se um segmento invalido chegar ao calculo.
- Decisão mantida:
  - CNPJ Aberto estruturado continua rejeitado quando lookup oficial falha; no hotfix de seguranca, evidencia oficial exige confirmacao Receita/lookup + QSA do socio pesquisado.
- Validação local pós-review:
  - `npm exec vitest run tests/utils/sentryScrubber.test.ts tests/api-gemini.test.ts tests/utils/porta.test.ts tests/services/portaStateService.test.ts tests/utils/documentExtractor.test.ts tests/api-socio-search.test.ts tests/prompts/megaPrompts.test.ts`: passou, 103 testes.
  - `npm run typecheck`: passou.
  - `npm run lint`: passou sem erros; restam 61 warnings existentes/fora de escopo.
  - `npm run validate:prompts`: passou, 71 testes.
  - `npm run build`: passou; houve upload local de sourcemaps ao Sentry porque o ambiente local tinha configuracao de Sentry ativa.
  - `npm run test`: passou, 159 arquivos e 1489 testes.
  - `git diff --check`: passou.

### Rodada CI Remoto da PR #411 — 2026-07-08

- Evidência remota `2567d3c3`: `Build`, `Typecheck`, `Dossier Golden`, `Smoke preview`, `Vercel`, `GitGuardian` e `CodeRabbit` passaram; `Tests` falhou apesar de 159 arquivos/1489 testes passarem.
- Causa do job `Tests`: unhandled async timer em `utils/layoutTraceTelemetry.ts` acessava `document` depois do teardown do jsdom (`ReferenceError: document is not defined`), originado durante `tests/components/ChatInterface.test.tsx`.
- Correção aplicada: `debugStaticFallbackDisplay` agora revalida `document`/`getComputedStyle` dentro do `probe` agendado por `requestAnimationFrame`/`setTimeout`, evitando acesso a DOM após teardown.
- Validação local pós-correção:
  - `npm run test`: passou, 159 arquivos e 1489 testes, sem unhandled error.
  - `npm run typecheck`: passou.
  - `npm run lint`: passou sem erros; restam 61 warnings existentes/fora de escopo.
  - `npm run build`: passou; houve upload local de sourcemaps ao Sentry porque o ambiente local tinha configuracao de Sentry ativa.

## PR RLS/Auth

### Status Local — 2026-07-08

- Worktree local: `/Users/brunolima/.config/superpowers/worktrees/NOVO-APP/rls-auth-hardening`
- Branch: `codex/rls-auth-hardening`
- Base empilhada: `codex/hotfix-security-small` / PR #411.
- Objetivo: fechar o vazamento cross-tenant por `operator_id` auto-reportado em tabelas sensíveis e reduzir dependência de `localStorage` como autoridade no storage autenticado.
- Fora de escopo: cron/review-cron, troca de usuário como prioridade de produto, BUG-8/UX, audit/npm vulnerabilities, políticas amplas de analytics write-only.
- Bloqueio esperado: prova multiusuário real depende de Supabase remoto/staging com dois usuários autenticados; contrato local valida SQL, mas não substitui execução no banco remoto.

### Mapeamento Validado

- `profiles`, `user_context` e `radar_*` já tinham policies autenticadas baseadas em `auth.uid() -> profiles.operator_id`.
- `dossies`, `extract_cache` e `feedback_events` mantinham herança fraca baseada em `operator_id IS NOT NULL` no schema legado; `dossies` ainda tinha migration posterior ampliando a policy para `anon, authenticated` sem trocar o predicado.
- `services/storage/_shared.ts` retornava apenas `localStorage['operator_id']`, então `services/storage/dossiers.ts`, `extractCache.ts` e `radar.ts` dependiam desse valor para filtro e escrita.
- Cache persistente server-side de socio-search usa `SUPABASE_SERVICE_ROLE_KEY`, então a restrição de RLS em `extract_cache` não deve quebrar o cache server-side.
- `findExistingDossier` fazia busca por CNPJ/empresa sem filtro de `operator_id`; com RLS forte, a busca fica naturalmente limitada ao tenant autenticado.

### Correções Aplicadas

- Criada migration `20260708213147_rls_auth_hardening_sensitive_tables.sql`.
- `dossies`, `extract_cache` e `feedback_events` passam a revogar `anon`, dropar policies legadas `operator_own_*` e criar policies `authenticated_*_own_*` com `EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = (SELECT auth.uid()) AND p.operator_id = <table>.operator_id)`.
- Escritas em `dossies`, `extract_cache` e `feedback_events` usam `WITH CHECK` com a mesma amarração de profile.
- `services/storage/_shared.ts` ganhou identidade autenticada em memória; `getOperatorId()` agora prefere o `operator_id` resolvido por Auth/profile e só usa `localStorage` como fallback legado/guest.
- `OperatorContext` define a identidade autenticada quando resolve `profiles.operator_id` e limpa essa identidade em logout ou ausência de usuário.
- Removida a regravação de `operator_id` autenticado no localStorage que existia para contornar o sidebar vazio.
- Teste de regressão garante que storage autenticado vence `localStorage` adulterado.

### Validação Local

- `npm ci`: passou com warnings conhecidos de engine local Node 26 vs package Node 24 e 33 vulnerabilidades já inventariadas.
- `npm run test -- tests/contracts/supabaseMigrations.contract.test.ts tests/contexts/OperatorContext.test.tsx tests/services/storage.test.ts tests/services/storage-failure-scenarios.test.ts tests/services/feedbackRemoteStore.test.ts`: passou, 5 arquivos e 102 testes.
- `npm run typecheck`: passou.
- `npm run lint`: passou sem erros; restam 61 warnings existentes/fora de escopo.
- `env -u SENTRY_AUTH_TOKEN npm run build`: passou.
- `npm run test -- tests/contexts/OperatorContext.test.tsx tests/services/storage.test.ts tests/contracts/supabaseMigrations.contract.test.ts`: passou, 3 arquivos e 85 testes, após blindagem de troca de `authUser.id`.
- `npm run test`: primeira repetição pós-ajuste saturou o pool local de forks; os dois testes reportados por timeout passaram focados em 0,7s.
- `npm run test -- --maxWorkers=4 --reporter=dot`: passou, 159 arquivos e 1499 testes.
- `git diff --check`: passou.

### Proximos Gates Remotos

- Abrir PR empilhada contra `codex/hotfix-security-small`.
- Aguardar Vercel preview/checks GitHub e conferir reviews/comentários.
- Gate que precisa ambiente remoto: dois usuários Supabase autenticados, um dossiê/cache/feedback por operador e tentativa cross-tenant negada.

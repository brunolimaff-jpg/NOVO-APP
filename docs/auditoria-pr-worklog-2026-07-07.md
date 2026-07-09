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

### Loop Ultra 2026-07-09

- Causa do `BLOCKED` confirmada na protecao de `main`: `required_conversation_resolution=true`; nao ha status check obrigatorio, regra de aprovacao ou merge queue pendente.
- Duas threads estavam abertas: uma outdated em `services/socio-search/types.ts` e uma ativa em `tests/services/socio-search-cache-key.test.ts`.
- A implementacao atual ja normaliza `operatorId` e omite o sufixo quando o valor normaliza para vazio; o teste existente cobre `---!!!` e evita chave terminada em `::`.
- O teste de isolamento passou a afirmar tambem que a chave de operador difere da chave base, cobrindo a segunda thread de review.
- Validacao local deste delta: `npm run test -- tests/services/socio-search-cache-key.test.ts` (3/3), `npm run typecheck` e `git diff --check` passaram. Lint terminou sem erros e com os 61 warnings conhecidos fora de escopo.
- O ambiente local deste worktree usa Node 26 enquanto o projeto exige Node 24; e um warning de ambiente, nao uma alteracao desta PR.
- Proximo passo: publicar o delta, resolver as duas threads e aguardar os checks/Preview do novo SHA. Nenhum merge foi feito.

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

## PR pendente — Observabilidade do Roteamento LLM

- Branch: `codex/litellm-routing-observability`.
- Base: `fix/main-typecheck-pr408` (PR #410), para manter a cadeia de correções pequena e revisável.
- Objetivo: tornar visível no runtime o provedor e o modelo efetivos de `generateContent`; `LiteLLM enabled=true` sozinho não prova que a chamada saiu pelo LiteLLM.
- Evidência que motivou o card: logs de produção mostraram LiteLLM habilitado, enquanto Foundation Cache e grounding ainda usavam Gemini diretamente. A alteração não muda essa regra; ela a registra.
- Contrato: cada chamada registra somente `event`, `provider`, `reason`, `model` sanitizado, módulo conhecido e duração. Prompt, conteúdo, CNPJ, empresa e mensagem de erro não entram no evento.
- Escopo: `api/gemini.ts` no caminho `generateContent`, o gate LiteLLM e testes de contrato. Chat legado e demais endpoints Gemini continuam fora deste card.
- Invariantes: Foundation Cache e grounding continuam em Gemini; chamadas elegíveis continuam usando LiteLLM; não há env, migration, produção, watcher ou alteração de provedor nesta PR.
- Triagem local executada: testes focados, typecheck, lint, build e `validate:prompts` passaram. Isso não é aceite funcional.
- Aceite obrigatório: Preview Vercel do SHA da PR, com uma chamada controlada e logs `[LlmRoute]` mostrando provider, motivo, modelo e módulo sem PII. Nenhuma chamada em produção será usada como validação.
- PR aberta: <https://github.com/brunolimaff-jpg/NOVO-APP/pull/413>.

### Evidência Preview — SHA `57dd58b1`

- Deployment Vercel: `dpl_Fwjcx5i5HeVxmULbm55iadJdSwZm`, branch `codex/litellm-routing-observability`.
- Chamada controlada no Preview, sem empresa ou CNPJ e com saída limitada a 10 tokens, retornou `OK.` com `_model=bedrock/us.anthropic.claude-sonnet-4-6`.
- Logs de runtime do mesmo deployment registraram `provider:selected` e `provider:completed` com `provider=litellm`, `reason=litellm_enabled`, `module=Caminho de Venda` e `durationMs=1134`.
- Não houve erro de runtime em `/api/gemini` no intervalo da validação.
- CI, build, testes, E2E crítico, smoke e Preview passaram. Golden Live permanece em quarentena e não é aceite deste card.

### Follow-up de review — aceito no Preview

- Um review identificou que o filtro inicial do identificador de modelo ainda aceitaria um CNPJ puro. O caminho de telemetria passou a aceitar somente modelos conhecidos; modelos externos ou malformados agora aparecem como `null`.
- O teste de regressão usa `12.345.678/0001-90` como `model` e exige `model=null` no evento de falha.
- A thread de review foi resolvida após o commit `a4b5f6ee`.
- Deployment Vercel do follow-up: `dpl_6fWz7tdGGmpYjYi9npPiAG2iuo6d`; a mesma chamada controlada retornou Sonnet e registrou `provider=litellm`, `reason=litellm_enabled`, `module=Caminho de Venda` e `durationMs=1200`.
- Não houve erro de runtime em `/api/gemini` no Preview do follow-up. O comportamento de roteamento permaneceu igual; apenas o campo de modelo passou a ser conservador.
- Status do card: aceite de runtime concluído. A PR aguarda somente o término do Golden em quarentena e o comando explícito `MERGE` do Bruno; não houve merge.

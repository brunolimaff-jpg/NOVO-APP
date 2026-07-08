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

### Pendências Antes do Push

- Rodar build final após correções de lint.
- Subagente validator concluiu: achados remotos eram do HEAD antigo; item extra `test:e2e:preview` ausente foi corrigido localmente.
- Commitar e pushar branch `fix/main-typecheck-pr408`.
- Após push: monitorar checks da PR #410, pegar preview Vercel e rodar gates live/remotos.

### Riscos Remanescentes

- Golden live depende de preview Vercel HTTPS, `E2E_REAL_AUTH=1`, senha Supabase e `E2E_DEPLOYMENT_SHA`; local só validou compilação/helper, não execução live.
- `npm audit` continua fora do gate desta PR por decisão do plano: precisa classificação antes de virar bloqueio.
- O bypass E2E agora falha fechado em `production`, mas qualquer tentativa de configurar `VITE_E2E_AUTH_BYPASS` fora de teste continua sendo erro operacional.

## Watcher

- Automação criada: `novo-app-pr-watcher-auditoria`.
- Frequência: a cada 30 minutos.
- Escopo: checar PRs abertas, checks, reviews/comentários e falhas acionáveis.
- Guardrail: nunca executar merge; merge exige Bruno escrever `MERGE`.

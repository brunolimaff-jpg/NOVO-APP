---
grok_wiki: true
page_id: 'page-testes-gates'
title: 'Testes e gates'
description: 'Comandos npm, Vitest, Playwright, contratos, E2E críticos, CI GitHub Actions, setup de Chromium e critérios por tipo de mudança.'
repository: 'local/NOVO-APP'
branch: 'default'
generated_at: '2026-06-08T23:39:43.629Z'
source_files:
  - 'package.json'
  - 'vitest.config.ts'
  - 'playwright.config.ts'
  - 'docs/testing-strategy.md'
  - 'docs/contracts/PR-CHECKLIST.md'
  - '.github/workflows/ci.yml'
  - 'scripts/ensure-playwright.sh'
  - 'tests/setup.ts'
---

A validação do Senior Scout 360 é composta por scripts npm, Vitest em `jsdom`, Playwright em Chromium, contratos de UI/tracking/migrations e dois workflows GitHub Actions: `CI` para pull requests e `push` em `main`, e `Preview Smoke` para deploy previews ou execução manual.

<Info>
O repositório, os workflows de CI e a Vercel usam Node 24. A instalação reprodutível é `npm ci`, com npm `11.11.0` fixado em `package.json`.
</Info>

## Comandos principais

| Comando                    | O que valida                                     | Quando usar                                                         |
| -------------------------- | ------------------------------------------------ | ------------------------------------------------------------------- |
| `npm run typecheck`        | TypeScript com `tsc --noEmit`                    | Antes de qualquer PR que altere `.ts` ou `.tsx`                     |
| `npm run lint`             | ESLint no repositório inteiro                    | Refactors, mudanças amplas e fechamento de PR                       |
| `npm test`                 | Vitest em todos os `tests/**/*.test.ts(x)`       | Gate unitário e integração leve                                     |
| `npm run test:dossier`     | Golden test de dossiê Scheffer                   | Mudanças em dossiê, waterfall, prompts ou saída final               |
| `npm run test:contracts`   | Contratos em `tests/contracts/`                  | UI state, tracking e migrations Supabase                            |
| `npm run test:e2e`         | Todos os specs Playwright em `tests-e2e/`        | Validação completa de browser                                       |
| `npm run test:e2e:blank`   | Anti-painel-branco                               | Chat, timeline, Virtuoso, fallback estático, dossiê longo           |
| `npm run test:e2e:loading` | Recuperação do `LoadingSmart`                    | Loading, waterfall, estado pós-finalização                          |
| `npm run test:e2e:errors`  | Erro controlado após falha de `/api/gemini`      | Tratamento de erro, retry e acessibilidade do input                 |
| `npm run test:e2e:smoke`   | Specs `tests-e2e/smoke.*.spec.ts`                | Presença de testids, shell, sessão, hidratação e falhas silenciosas |
| `npm run test:e2e:cnpj`    | Fluxo CNPJ completo                              | Lookup cadastral, autofill e investigação por CNPJ                  |
| `npm run test:flow`        | `typecheck`, unitários, contratos e E2E blank    | Gate rápido para regressões de painel                               |
| `npm run validate:ci`      | `typecheck`, unitários e contratos               | Ambiente sem browser                                                |
| `npm run validate:release` | `typecheck`, unitários, contratos e todos os E2E | Pré-release local quando Chromium está disponível                   |
| `npm run validate:prompts` | Prompts, parser e grafo societário               | Mudanças em prompt, parser, Teia ou grafo                           |
| `npm run validate:preview` | Health check e `/api/cnpj` via `curl`            | Smoke rápido de localhost ou preview Vercel                         |

<Note>
Rode `npm run test:contracts` diretamente. Flags de Jest como `--runInBand` não fazem parte dos scripts deste repositório.
</Note>

## Vitest

Vitest roda com `globals: true`, ambiente `jsdom`, URL base `http://localhost:3000/`, aliases `@` e `~` apontando para a raiz, e `tests/setup.ts` como setup global. O setup instala `@testing-library/jest-dom/vitest` e garante `localStorage`/`Storage` disponíveis no `globalThis`.

A estratégia documentada separa as suítes assim:

| Pasta                                               | Papel                                                            |
| --------------------------------------------------- | ---------------------------------------------------------------- |
| `tests/utils` e `tests/services`                    | Regras de negócio, transformações e contratos de função isolados |
| `tests/components`, `tests/hooks`, `tests/contexts` | Integração leve de frontend sem backend real                     |
| `tests/api*.test.ts` e `tests/api/`                 | Rotas serverless e comportamento degradado de APIs               |
| `tests/features/dossier`                            | Parser, grafo, PORTA, waterfall e componentes de dossiê          |
| `tests/prompts`                                     | Baselines e regras de prompts                                    |
| `tests/contracts`                                   | Estados visuais, tracking e migrations críticas                  |

```bash
npm test
npm exec vitest run tests/services/storage.test.ts
npm exec vitest run tests/components/ChatInterface.test.tsx tests/utils/blankPanelTelemetry.test.ts
```

## Contratos automatizados

`test:contracts` protege invariantes que não devem depender de revisão manual.

| Contrato                              | Invariante                                                                                                                                                             |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `renderState.contract.test.tsx`       | O painel central só pode classificar `empty`, `loading`, `content` ou `error`; a prioridade é `error > loading > content > empty`; nunca retorna `null` ou `undefined` |
| `operatorTracking.contract.test.ts`   | Só aceita os 7 eventos documentados, remove metadados sensíveis por regex, trunca strings longas e não quebra UX quando Supabase está indisponível                     |
| `supabaseMigrations.contract.test.ts` | `supabase/migrations` existe, migrations críticas estão presentes, índices de diagnóstico existem, e toda `CREATE TABLE` tem RLS ou comentário `-- RLS exception`      |

Os estados visuais válidos do painel central são:

| Estado    | Sinal visual                                                          |
| --------- | --------------------------------------------------------------------- |
| `content` | `message-row`, `bot-message-content` ou `dossier-content` renderizado |
| `loading` | `loading-smart` ou `loading-smart-overlay` visível                    |
| `error`   | `controlled-error` ou `error-message-card` visível                    |
| `empty`   | `empty-state` intencional                                             |

Qualquer sessão ativa com `chat-main-panel` visível e nenhum desses estados é painel branco.

## Playwright e Chromium

Playwright usa `tests-e2e` como `testDir`, Chromium Desktop, `workers: 1`, timeout global de 180 segundos, trace `on-first-retry` e vídeo retido em falha. Em CI há 2 retries; localmente não há retry.

`BASE_URL` muda o modo de execução:

| Modo           | Comportamento                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------ |
| Sem `BASE_URL` | Playwright sobe `npm run dev` em `http://localhost:3000` e reaproveita servidor local fora de CI |
| Com `BASE_URL` | Não sobe web server; os testes rodam contra uma URL externa, como preview Vercel                 |

<Steps>
<Step title="Preparar Chromium">
O comando agregado `npm run test:e2e` aciona `pretest:e2e`, que chama `scripts/ensure-playwright.sh`. Para recortes como `test:e2e:blank`, rode o preparo manual se o cache ainda não existir.

```bash
bash scripts/ensure-playwright.sh
# ou, em Linux com dependências do sistema:
npx playwright install --with-deps chromium
```

</Step>

<Step title="Rodar E2E local">
```bash
npm run test:e2e:blank
npm run test:e2e:loading
npm run test:e2e:errors
```
</Step>

<Step title="Rodar contra preview">
```bash
BASE_URL=https://seu-preview.vercel.app npx playwright test tests-e2e/cnpj-investigation-flow.spec.ts --config=playwright.config.ts
```
</Step>
</Steps>

## E2E críticos

| Script             | O que prova                                                                                                                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `test:e2e:blank`   | O app abre com shell visível, uma sessão ativa renderiza dossiê longo no `chat-main-panel`, o conteúdo do bot não fica `display:none`, não há placeholder/suspended como estado final e não surgem `console.error` inesperados |
| `test:e2e:loading` | `LoadingSmart` aparece, desaparece em até 120 segundos, o dossiê final fica visível, o input continua acessível e não há erro silencioso no console                                                                            |
| `test:e2e:errors`  | Uma falha 500 em `**/api/gemini**` gera `error-message-card`, não deixa loading infinito e mantém `chat-input` habilitado                                                                                                      |
| `test:e2e:smoke`   | Confirma testids essenciais, shell de investigação, onboarding, sessão, hidratação pós-reload, deleção/persistência e falhas silenciosas                                                                                       |
| `test:e2e:cnpj`    | Valida CNPJ Scheffer, espera autofill via Receita Federal, inicia investigação, exige resposta renderizada em `.prose` e rejeita CNPJ inválido                                                                                 |

Os specs de painel branco e loading usam stubs determinísticos para `**/api/gemini**` e forçam um dossiê longo com sentinela `SCHEFFER_E2E_SENTINEL`. Isso mantém o gate de UI portável e independente do provedor de modelo quando o objetivo é testar renderização, Virtuoso, fallback estático e recuperação visual.

## Preview e smoke sem browser

`npm run validate:preview` chama `scripts/validate-preview.sh` e aceita URL e CNPJ opcionais.

```bash
npm run validate:preview
./scripts/validate-preview.sh https://seu-preview.vercel.app 04.733.767/0001-80
```

O script valida:

| Check                    | Critério                                                                 |
| ------------------------ | ------------------------------------------------------------------------ |
| `GET /`                  | HTTP 200 em até 10 segundos                                              |
| `GET /api/cnpj?cnpj=...` | JSON válido com `companyName`; também mostra cidade, UF, CNAE e latência |

Esse smoke não substitui Playwright: ele confirma disponibilidade HTTP e lookup cadastral, mas não prova estado visual, renderização de dossiê, input acessível ou ausência de painel branco.

## GitHub Actions

O workflow `CI` roda em pull requests e em `push` para `main`.

| Job                    | Comando principal                                                                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Typecheck`            | `npm run typecheck`                                                                                                                                            |
| `Dossier Golden`       | `npm run test:dossier`                                                                                                                                         |
| `Tests`                | `npm run test`                                                                                                                                                 |
| `Build`                | `npm run build`                                                                                                                                                |
| `E2E Critical Browser` | Instala Chromium com `npx playwright install --with-deps chromium` e roda `blank-center-panel-regression`, `controlled-error-state` e `loading-smart-recovery` |

O workflow `Preview Smoke` roda em `deployment_status`, `/smoke <url>` em comentário de PR ou `workflow_dispatch`. Ele resolve `PREVIEW_URL`, testa rotas `/,/login,/dashboard` e envia `POST /api/link-status` com uma URL exemplo. Quando `VERCEL_AUTOMATION_BYPASS_SECRET` existe, o smoke adiciona o header `x-vercel-protection-bypass`; quando o preview protegido retorna 401 em `deployment_status` sem secret e `SMOKE_ALLOW_PROTECTED_SKIP=true`, o smoke pode ser ignorado de forma explícita.

## Drift conhecido

Não há baseline operacional Node 20. O repositório usa Node `24.14.1` via `.nvmrc` e npm `11.11.0`; CI e Vercel devem registrar essas versões antes do `npm ci`.

## Critérios por tipo de mudança

| Mudança                                     | Gate mínimo                                                                                               | Gate adicional quando houver risco                                                                     |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Tipos, helpers e refactor pequeno           | `npm run typecheck`, `npm test` focado                                                                    | `npm run build` se tocar imports, bundling ou Vite                                                     |
| Serviços, regras de negócio e APIs          | Vitest focado, `npm test`, `npm run typecheck`                                                            | `npm run validate:preview` se tocar `/api/cnpj` ou rota usada por preview                              |
| Componentes, hooks e contexts               | Teste de componente, `npm test`, `npm run typecheck`                                                      | `npm run test:e2e:smoke` se alterar testids, shell, sessão ou hidratação                               |
| Chat, timeline, loading, waterfall e dossiê | `npm run test:contracts`, `npm run test:e2e:blank`, `npm run test:e2e:loading`, `npm run test:e2e:errors` | Preview Vercel e validação visual real quando a regressão é de UX                                      |
| Prompts, parser, Teia societária e grafo    | `npm run validate:prompts`, `npm run test:dossier`                                                        | `npm run test:e2e:cnpj` ou preview quando o output afeta CNPJ, Teia ou dossiê                          |
| Tracking de operador                        | `npm run test:contracts`, testes de `services/operatorTracking`                                           | Verificar payloads sem `apiKey`, `token`, `password`, `secret`, `prompt`, `gemini` ou `response`       |
| Supabase migrations                         | `npm run test:contracts`                                                                                  | Confirmar RLS para toda tabela nova ou justificar com `-- RLS exception`                               |
| Release ou PR grande                        | `npm run validate:release`                                                                                | Se não houver browser, `npm run validate:ci` local e aguardar `E2E Critical Browser` no GitHub Actions |

<Warning>
Para bugs visuais, logs saudáveis e status de API não bastam. O critério útil é DOM visível: `chat-main-panel` com `bot-message-content`, `dossier-content`, `controlled-error`, `loading-smart` ou `empty-state` coerente com o estado da sessão.
</Warning>

## Falhas comuns

| Sintoma                                                     | Ação                                                                                                                                           |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Chromium ausente                                            | Rode `bash scripts/ensure-playwright.sh` ou `npx playwright install chromium`; em Linux use `--with-deps`                                      |
| Preview protegido retorna 401                               | Use o workflow `Preview Smoke` com `VERCEL_AUTOMATION_BYPASS_SECRET` ou registre skip protegido quando permitido pelo workflow                 |
| `validate:preview` passa no health check, mas falha no CNPJ | Investigue `/api/cnpj`; JSON sem `companyName` é falha funcional                                                                               |
| Contrato de migration falha                                 | Adicione `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` ou comentário `-- RLS exception: <justificativa>`                                         |
| Painel branco intermitente                                  | Rode `test:e2e:blank`, confira `bot-message-content` no `chat-main-panel` e use a página de depuração antes de concluir por telemetria isolada |
| Prompt/parser quebrou snapshot                              | Não atualize baseline automaticamente; verifique vocabulário compartilhado entre prompt, parser, grafo e UI                                    |

## Portabilidade dos gates

Os gates automatizados são baseados em arquivos do repositório, npm, Vitest, Playwright e GitHub Actions. Os testes críticos de renderização isolam o provedor de modelo com stubs de `/api/gemini`; os fluxos que realmente dependem de preview, Vercel, CNPJ ou IA ficam separados em smoke HTTP, Playwright externo por `BASE_URL` e validação manual quando necessário. Isso mantém o fluxo BYOC/BYOK-friendly: o contrato de qualidade continua preso ao comportamento observável do app, não a um conector proprietário.

## Related pages

<CardGroup>
<Card title="Loading e estados visuais" href="/loading-estados-visuais">
Contrato de overlay, timeline, fallback estático, painel branco e sinais de recuperação.
</Card>
<Card title="Gerar dossiê por CNPJ" href="/gerar-dossie-cnpj">
Fluxo CNPJ, lookup cadastral, envio da investigação e validação E2E.
</Card>
<Card title="Preview e deploy Vercel" href="/preview-deploy-vercel">
Preview protegido, smoke de deploy, bypass de automação e limites da validação local.
</Card>
<Card title="Contratos de UI" href="/ui-contracts-reference">
Estados válidos, testids oficiais, composer, timeline e matriz anti-regressão.
</Card>
</CardGroup>

## Source files

- `package.json`
- `vitest.config.ts`
- `playwright.config.ts`
- `docs/testing-strategy.md`
- `docs/contracts/PR-CHECKLIST.md`
- `.github/workflows/ci.yml`
- `scripts/ensure-playwright.sh`
- `tests/setup.ts`

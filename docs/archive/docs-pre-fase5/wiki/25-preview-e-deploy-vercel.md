---
grok_wiki: true
page_id: 'page-preview-deploy-vercel'
title: 'Preview e deploy Vercel'
description: 'Build metadata, `version.json`, proxy local para APIs, smoke de preview, bypass de proteção, deploy preview e limites de validação local.'
repository: 'local/NOVO-APP'
branch: 'default'
generated_at: '2026-06-08T23:39:43.629Z'
source_files:
  - 'vite.config.ts'
  - 'config/localDevApiProxy.ts'
  - 'scripts/validate-preview.sh'
  - 'scripts/smoke-preview.mjs'
  - '.github/workflows/preview-smoke.yml'
  - 'playwright.config.ts'
  - 'public/_headers'
  - 'docs/CHECKLIST-PRODUCAO.md'
---

O runtime de deploy do NOVO-APP combina SPA Vite, Vercel Functions em `api/*.ts`, rewrites de fallback para `index.html`, metadata de build injetada no bundle e validações separadas para build local, smoke HTTP de preview e E2E visual com Playwright.

## Superfícies de deploy

| Superfície                    | Responsabilidade                                                        | Sinal esperado                                                          |
| ----------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `vite.config.ts`              | Build Vite, `version.json`, globals de build, proxy local para `/api/*` | `npm run build` gera `dist/version.json` e sourcemaps                   |
| `vercel.json`                 | Instalação, limites de funções e rewrites SPA/API                       | `/api/*` continua em função serverless; rotas SPA caem em `/index.html` |
| `public/_headers`             | Cache de shell, assets e metadata                                       | `/version.json` sem cache; assets Vite imutáveis                        |
| `scripts/smoke-preview.mjs`   | Smoke HTTP automatizado de preview                                      | rotas 2xx/3xx e `POST /api/link-status` com HTTP 200                    |
| `scripts/validate-preview.sh` | Validação rápida sem browser para app + lookup CNPJ                     | `/` responde 200 e `/api/cnpj` retorna JSON com `companyName`           |
| `playwright.config.ts`        | E2E local ou contra preview externo via `BASE_URL`                      | quando `BASE_URL` existe, não sobe `npm run dev`                        |

<Warning>
`npm run dev` é conveniência de frontend. Ele não prova runtime Vercel, cold start, rewrites reais, headers publicados, proteção de preview, limites de função nem bloqueios por IP de datacenter.
</Warning>

## Build metadata e `version.json`

O build injeta três globals no bundle:

| Global           | Origem                            | Fallback local  |
| ---------------- | --------------------------------- | --------------- |
| `__BUILD_SHA__`  | `VERCEL_GIT_COMMIT_SHA`           | `local`         |
| `__VERCEL_ENV__` | `VERCEL_ENV`                      | `local`         |
| `__BUILD_TS__`   | timestamp ISO no momento do build | timestamp local |

O app registra esses dados no mount com evento `build-info`, incluindo `hostname`. Esse hostname é importante porque preview, produção e aliases Vercel podem parecer iguais em logs se o domínio não for registrado.

Durante `vite build`, o plugin `generate-version` escreve:

```json title="dist/version.json"
{
  "version": "v1.0.0",
  "timestamp": "<timestamp ISO do build>"
}
```

`/version.json` usa `Cache-Control: no-store`. O hook `useUpdateNotification` busca esse arquivo com `cache: "no-store"` e `pragma: "no-cache"`, grava a versão atual em `localStorage`, compara versões no formato `v<major>.<minor>`, aplica snooze de 1 hora e revalida ao focar a aba com throttle de 30 minutos.

<Info>
A comparação de versão é simples: ela olha apenas major/minor. Mudanças que mantêm `package.json.version` igual atualizam o `timestamp`, mas não disparam notificação de versão nova pelo comparador atual.
</Info>

## Cache e shell SPA

| Caminho         | Cache                                                |
| --------------- | ---------------------------------------------------- |
| `/`             | `Cache-Control: no-cache`                            |
| `/index.html`   | `Cache-Control: no-cache`                            |
| `/assets/*`     | `Cache-Control: public, max-age=31536000, immutable` |
| `/version.json` | `Cache-Control: no-store`                            |

O app também remove Service Workers e caches antigos no mount. Essa limpeza existe porque deploys anteriores podiam servir bundles obsoletos em produção ou preview mesmo depois de um build novo.

## Runtime Vercel

`vercel.json` define `npm install` como comando de instalação e configura durações máximas por função:

| Função                   | `maxDuration` |
| ------------------------ | ------------: |
| `api/gemini.ts`          |         `300` |
| `api/gerar-dossie.ts`    |         `300` |
| `api/open-web-search.ts` |          `60` |
| `api/radar-scan.ts`      |         `120` |
| `api/extract-content.ts` |          `60` |

Os rewrites mantêm dois contratos:

```text
/api/(.*)                  -> /api/$1
/((?!api/|.*\..*).*)       -> /index.html
```

Isso preserva chamadas serverless same-origin e permite deep links do SPA sem criar rotas estáticas separadas.

<Note>
Os handlers em `api/*.ts` são a fronteira correta para segredos como `GEMINI_API_KEY`, `GEMINI_API_KEY_FALLBACK`, `SUPABASE_SERVICE_ROLE_KEY` e variáveis de serviço. Chaves sensíveis não devem entrar no bundle do navegador.
</Note>

## Proxy local para APIs

O Vite dev server roda em `0.0.0.0:3000` e monta proxy para rotas serverless. O alvo padrão é `https://scoutagro.vercel.app`, mas pode ser trocado por `.env.local`.

```bash title=".env.local"
LOCAL_DEV_API_PROXY_TARGET=https://seu-preview.vercel.app
VERCEL_AUTOMATION_BYPASS_SECRET=<segredo de bypass da Vercel>
```

Quando `VERCEL_AUTOMATION_BYPASS_SECRET` existe, o proxy adiciona somente:

```text
x-vercel-protection-bypass: <segredo>
```

Rotas cobertas pelo proxy central:

| Rota                   |
| ---------------------- |
| `/api/gemini`          |
| `/api/radar-scan`      |
| `/api/gerar-dossie`    |
| `/api/cnpj`            |
| `/api/comex`           |
| `/api/open-web-search` |
| `/api/link-status`     |
| `/api/extract-content` |
| `/api/rag`             |
| `/api/socio-search`    |

Alguns clientes também aceitam overrides próprios:

| Variável                   | Uso                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------- |
| `VITE_CNPJ_PROXY_URL`      | endpoint completo para CNPJ em dev local, por exemplo `https://preview.vercel.app/api/cnpj` |
| `VITE_GEMINI_PROXY_URL`    | base externa para resolver `/api/gemini` em dev local                                       |
| `VITE_OPEN_WEB_SEARCH_URL` | endpoint completo para `/api/open-web-search`                                               |

## Smoke de preview

O smoke automatizado exige `PREVIEW_URL`. Por padrão ele testa `/`, `/login`, `/dashboard` e depois faz `POST /api/link-status` com `https://example.com`.

```bash title="Smoke manual"
PREVIEW_URL=https://seu-preview.vercel.app \
node scripts/smoke-preview.mjs
```

```bash title="Smoke com rotas customizadas"
PREVIEW_URL=https://seu-preview.vercel.app \
SMOKE_ROUTES=/,/dashboard \
SMOKE_TIMEOUT_MS=15000 \
node scripts/smoke-preview.mjs
```

Critérios de sucesso:

| Check                               | Critério            |
| ----------------------------------- | ------------------- |
| `app carrega`                       | HTTP 200-399 em `/` |
| `rota responde: <rota>`             | HTTP 200-399        |
| `endpoint crítico /api/link-status` | HTTP 200            |

Se todos os checks retornarem 401, `SMOKE_ALLOW_PROTECTED_SKIP=true` estiver ativo e não houver `VERCEL_AUTOMATION_BYPASS_SECRET`, o script trata como preview protegido e ignora o smoke. Esse skip existe para `deployment_status`; para validação forte, configure o segredo.

## Workflow `Preview Smoke`

O workflow `Preview Smoke` roda em três entradas:

| Entrada                                    | Como resolve a URL                              |
| ------------------------------------------ | ----------------------------------------------- |
| `deployment_status` com `state == success` | `environment_url` ou `target_url` do deployment |
| comentário em PR com `/smoke`              | primeira URL no comentário                      |
| `workflow_dispatch`                        | input `preview_url` obrigatório                 |

Exemplo de comentário em PR:

```text
/smoke https://seu-preview.vercel.app
```

Em caso de falha, o workflow comenta no PR quando a execução veio de comentário, deployment associado a PR ou dispatch manual com `pr_number`.

<Warning>
Para automação protegida, use apenas `x-vercel-protection-bypass`. O fluxo do repo não usa `x-vercel-set-bypass-cookie` no smoke de Actions.
</Warning>

## Validação rápida sem browser

`validate:preview` faz um smoke curto de app e CNPJ. Ele não executa investigação completa nem valida DOM final.

```bash title="Defaults: localhost e Scheffer"
npm run validate:preview
```

```bash title="Preview remoto + CNPJ explícito"
npm run validate:preview -- https://seu-preview.vercel.app 04.733.767/0001-80
```

O script remove máscara do CNPJ, chama:

```text
GET /api/cnpj?cnpj=04733767000180
```

e espera JSON válido com `companyName`. Também mede latência e imprime empresa, cidade/UF e CNAE quando disponíveis.

## E2E contra preview

Playwright usa `BASE_URL` para apontar para um deploy externo. Quando `BASE_URL` está definido, o config não sobe `npm run dev`.

```bash title="Fluxo CNPJ contra preview"
BASE_URL=https://seu-preview.vercel.app \
npx playwright test tests-e2e/cnpj-investigation-flow.spec.ts --config=playwright.config.ts
```

O fluxo CNPJ validado nesse teste:

1. abre `/`;
2. espera `Dados do alvo`;
3. preenche `04.733.767/0001-80`;
4. valida CNPJ;
5. espera preenchimento automático;
6. confirma empresa, cidade e UF;
7. inicia investigação completa;
8. espera uma resposta `.prose` visível;
9. exige texto com mais de 50 caracteres.

<Info>
O config Playwright não injeta header de bypass da Vercel. Para preview protegido, use um ambiente desbloqueado, sessão adequada ou o smoke HTTP com `VERCEL_AUTOMATION_BYPASS_SECRET`.
</Info>

## Gates antes de considerar preview pronto

<Steps>
<Step title="Gerar build local">
Rode `npm run build` e confirme que `dist/version.json` foi gerado. Para mudança em chunks, shell, cache ou Vite, confira warnings novos antes de publicar.
</Step>

<Step title="Esperar deploy Vercel">
Use a URL do deploy da branch/PR. Preview Vercel é por commit da branch; ele não soma automaticamente mudanças de outras PRs abertas.
</Step>

<Step title="Rodar smoke HTTP">
Use o workflow `Preview Smoke`, comentário `/smoke <url>` ou `PREVIEW_URL=<url> node scripts/smoke-preview.mjs`.
</Step>

<Step title="Validar API crítica">
Rode `npm run validate:preview -- <url> <cnpj>` para confirmar shell e `/api/cnpj` no ambiente remoto.
</Step>

<Step title="Validar UX quando a mudança toca tela, loading ou waterfall">
Rode Playwright com `BASE_URL=<url>` e, para bugs visuais, confirme DOM e estado final: overlay fora, input habilitado e conteúdo do bot visível.
</Step>
</Steps>

## Limites da validação local

| Validação local                   | O que prova                                   | O que não prova                                         |
| --------------------------------- | --------------------------------------------- | ------------------------------------------------------- |
| `npm run build`                   | bundle compila e `version.json` sai no `dist` | runtime serverless, headers publicados, proteção Vercel |
| `npm run dev`                     | UI local e proxy Vite configurado             | cold start, IP da Vercel, rewrites reais, maxDuration   |
| `validate:preview` em `localhost` | shell local e API via proxy, se configurado   | UX final, resposta do Gemini, layout do dossiê          |
| Vitest                            | contratos unitários e integração simulada     | comportamento real de rede, cache, browser e deploy     |
| Playwright local                  | DOM real em Chromium local                    | runtime Vercel se `BASE_URL` não for usado              |

<Warning>
Para regressões de loading, painel branco, waterfall, layout ou API dependente de provedores externos, checks verdes locais não substituem preview Vercel com fluxo real.
</Warning>

## Checklist de produção

Antes de publicar ou aceitar um deploy, mantenha estes blocos fechados:

| Bloco           | Checks                                                                           |
| --------------- | -------------------------------------------------------------------------------- |
| Ambiente        | `npm install` sem erro, `npm run build` verde, variáveis configuradas no deploy  |
| Segurança       | `.env` fora do Git, chaves sensíveis só no servidor/painel, quota da chave de IA |
| Funcionalidade  | gate de operador, chat com sessão salva, exportações e fluxos principais         |
| Qualidade       | `npm run test` sem falhas críticas, mensagens de erro amigáveis                  |
| Observabilidade | logs ativos no provedor, alertas básicos de falha e uso de API                   |

## Diagnóstico rápido

| Sintoma                                 | Checagem                                                                            |
| --------------------------------------- | ----------------------------------------------------------------------------------- |
| Preview retorna 401 no smoke            | conferir `VERCEL_AUTOMATION_BYPASS_SECRET` ou se o skip protegido está ativo        |
| `/api/cnpj` local retorna HTML          | usar proxy Vite, `vercel dev` ou `VITE_CNPJ_PROXY_URL`                              |
| Preview OK, produção ruim               | comparar `hostname`, `version.json`, build SHA, Service Worker/cache e alias Vercel |
| Smoke HTTP verde, tela ainda quebra     | rodar Playwright/validação visual; smoke HTTP não prova DOM final                   |
| Função funciona local e falha na Vercel | checar logs de Vercel, env vars, bloqueio por IP/rate limit e `maxDuration`         |
| App carrega bundle antigo               | verificar `/version.json`, headers de cache, SW/caches antigos e timestamp de build |

## Related pages

<CardGroup>
<Card title="Instalação" href="/installation">
Setup local, porta Vite e variáveis para rodar o app em checkout limpo.
</Card>
<Card title="Referência de configuração" href="/configuracao-reference">
Variáveis `.env`, overrides Vite, proxy local, Supabase, Sentry e fronteiras frontend/serverless.
</Card>
<Card title="Referência de APIs serverless" href="/api-serverless-reference">
Contratos, timeouts, headers e respostas degradadas das rotas em `api/*.ts`.
</Card>
<Card title="Testes e gates" href="/testes-gates">
Comandos npm, Vitest, Playwright, CI e critérios por tipo de mudança.
</Card>
<Card title="Observabilidade e diagnósticos" href="/observabilidade">
Sentry, `scoutDiag`, diagnósticos Supabase, eventos de operador e traces de layout.
</Card>
<Card title="Depurar painel branco" href="/depurar-painel-branco">
Procedimento para overlay travado, fallback invisível, `PostCompletion` e validação visual final.
</Card>
</CardGroup>

## Source files

- `vite.config.ts`
- `config/localDevApiProxy.ts`
- `scripts/validate-preview.sh`
- `scripts/smoke-preview.mjs`
- `.github/workflows/preview-smoke.yml`
- `playwright.config.ts`
- `public/_headers`
- `docs/CHECKLIST-PRODUCAO.md`

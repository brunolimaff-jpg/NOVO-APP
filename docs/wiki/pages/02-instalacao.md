---
grok_wiki: true
page_id: 'page-installation'
title: 'Instalação'
description: 'Pré-requisitos, instalação npm, variáveis locais, porta Vite, proxy de APIs e sinais esperados de boot em ambiente local.'
repository: 'local/NOVO-APP'
branch: 'default'
generated_at: '2026-06-08T23:39:43.629Z'
source_files:
  - 'README.md'
  - 'package.json'
  - '.env.example'
  - 'DEV_LOCAL_README.md'
  - 'vite.config.ts'
  - 'config/localDevApiProxy.ts'
  - 'docs/GUIA-INICIANTE.md'
---

A instalação local do Senior Scout 360 roda o frontend React 19 pelo Vite em `http://localhost:3000` e encaminha as rotas `/api/*` para um alvo Vercel configurável. O checkout não usa `src/` como raiz da aplicação: `index.html`, `index.tsx`, `App.tsx`, `components/`, `services/`, `api/` e `tests/` ficam na raiz do repositório.

## Pré-requisitos

| Item      | Versão ou contrato atual | Observação                                                                 |
| --------- | ------------------------ | -------------------------------------------------------------------------- |
| Node.js   | `24.x`                   | Declarado em `package.json` via `engines.node`.                            |
| npm       | Compatível com Node 24   | `npm install` é o comando padrão do repo e do deploy Vercel.               |
| Navegador | Chrome ou Chromium       | Necessário para validação Playwright e para depurar DevTools.              |
| Shell     | Bash ou zsh              | Os scripts `.command` são voltados a macOS, mas o fluxo principal é `npm`. |

<Warning>
Alguns guias auxiliares e scripts locais ainda citam `5173`. A configuração executável atual do Vite, dos testes Playwright e do smoke local usa `3000`. Para setup novo, prefira `npm run dev` e abra `http://localhost:3000`.
</Warning>

## Instalação npm

<Steps>
<Step title="Instale as dependências">

```bash
npm install
```

O repositório usa `package-lock.json` com lockfile v3. Em scripts automatizados que removem `node_modules`, `npm ci` também funciona, mas o caminho documentado no repo e em `vercel.json` é `npm install`.

</Step>

<Step title="Crie variáveis locais">

```bash
cp .env.example .env.local
```

`.env`, `.env.local` e `.env.*` são ignorados pelo Git. Use `.env.local` para chaves reais e mantenha `.env.example` apenas como referência.

</Step>

<Step title="Suba o Vite">

```bash
npm run dev
```

O script executa `vite`. A configuração fixa `server.host` como `0.0.0.0`, `server.port` como `3000` e instala o proxy local para rotas `/api/*`.

</Step>
</Steps>

## Variáveis locais

O boot React não exige variáveis obrigatórias no estado atual: a lista `REQUIRED_ENV_VARS` está vazia. A ausência de algumas variáveis degrada fluxos específicos, mas não deve impedir a tela inicial de montar.

| Variável                                            | Escopo                 | Uso local esperado                                                                                                                        |
| --------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `GEMINI_API_KEY`                                    | Servidor/API           | Exigida por rotas como `/api/gemini`, `/api/gerar-dossie`, `/api/rag`, `/api/docs-rag` e Radar quando essas rotas rodam no ambiente alvo. |
| `GEMINI_API_KEY_FALLBACK`                           | Servidor/API           | Chave secundária para handlers Gemini que suportam fallback.                                                                              |
| `PINECONE_API_KEY` ou `PINECONE_DOCS_KEY`           | Servidor/API e scripts | Usada por RAG, docs RAG e ingestões. `check-exports.command` aceita uma das duas.                                                         |
| `PINECONE_DOCS_INDEX`                               | Servidor/API e scripts | Índice de documentação. O exemplo usa `scout-arsenal`; alguns scripts de validação exigem export explícito.                               |
| `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`      | Frontend               | Ativam o cliente Supabase. Sem elas, o app registra aviso e desativa storage remoto.                                                      |
| `VITE_BACKEND_URL` e `VITE_LOOKUP_URL`              | Frontend               | Sobrescrevem os endpoints Apps Script legados usados por `services/apiConfig.ts`.                                                         |
| `VITE_SENTRY_DSN`                                   | Frontend               | Ativa Sentry no navegador. Sem DSN, Sentry fica desabilitado.                                                                             |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | Build/servidor         | Usados pelo plugin Vite de Sentry para sourcemaps quando o token existe. Não use prefixo `VITE_` no token.                                |
| `LOCAL_DEV_API_PROXY_TARGET`                        | Vite local             | Sobrescreve o alvo remoto do proxy local.                                                                                                 |
| `VERCEL_AUTOMATION_BYPASS_SECRET`                   | Vite local             | Quando definido, o proxy envia `x-vercel-protection-bypass` para previews protegidos.                                                     |
| `VITE_GEMINI_PROXY_URL`                             | Frontend local         | Faz o cliente Gemini chamar outro host base em dev local.                                                                                 |
| `VITE_CNPJ_PROXY_URL`                               | Frontend local         | Sobrescreve o endpoint de CNPJ em host local quando necessário.                                                                           |
| `VITE_OPEN_WEB_SEARCH_URL`                          | Frontend               | Sobrescreve o endpoint de busca web aberto.                                                                                               |
| `VITE_DEBUG_CONSOLE` ou `VITE_VERBOSE_LOGS`         | Frontend               | Aumenta logs diagnósticos com prefixo `[Scout360]`.                                                                                       |
| `VITE_SCOUT_DIAGNOSTICS_ENABLED`                    | Frontend               | Ativa envio em lote de diagnósticos para `/api/gemini` com `action: recordDiagnostics`.                                                   |

<Info>
Todo `VITE_*` é embutido no bundle do navegador pelo Vite. Chaves secretas de IA, Pinecone, Supabase service role, Sentry auth token e bypass de preview devem ficar sem prefixo `VITE_` quando forem segredo de servidor.
</Info>

## Porta Vite

| Superfície                    | Porta padrão | Contrato                                                                 |
| ----------------------------- | ------------ | ------------------------------------------------------------------------ |
| `vite.config.ts`              | `3000`       | `server.port: 3000`, `host: "0.0.0.0"`.                                  |
| `playwright.config.ts`        | `3000`       | `baseURL` padrão e `webServer.url` apontam para `http://localhost:3000`. |
| `vitest.config.ts`            | `3000`       | Ambiente JSDOM usa `http://localhost:3000/`.                             |
| `scripts/validate-preview.sh` | `3000`       | Sem argumento, valida `http://localhost:3000`.                           |

Se a porta estiver ocupada, confirme o processo antes de iniciar outro servidor:

```bash
lsof -i :3000
```

Para teste pontual em outra porta, use flag de CLI do Vite:

```bash
npm run dev -- --port 3001
```

Ao mudar a porta, ajuste também `BASE_URL` para E2E e smoke manual. Não dependa de `VITE_PORT=...`: a configuração atual não lê essa variável para `server.port`.

## Proxy local de APIs

O Vite local não executa automaticamente os handlers em `api/*.ts`. Em `npm run dev`, as chamadas de navegador para rotas `/api/*` são proxadas para `LOCAL_DEV_API_PROXY_TARGET`, cujo default é:

```text
https://scoutagro.vercel.app
```

Rotas proxadas no checkout atual:

```text
/api/gemini
/api/radar-scan
/api/gerar-dossie
/api/cnpj
/api/comex
/api/open-web-search
/api/link-status
/api/extract-content
/api/rag
/api/docs-rag
/api/socio-search
```

Isso significa que `http://localhost:3000` pode exibir frontend local com backend remoto. Se uma mudança em `api/*.ts` precisa ser validada localmente, use um alvo que execute esses handlers ou configure o proxy para um preview Vercel da branch:

```bash
LOCAL_DEV_API_PROXY_TARGET=https://seu-preview.vercel.app
VERCEL_AUTOMATION_BYPASS_SECRET=...
npm run dev
```

<Warning>
Quando o comportamento de `/api/*` não bate com o código do checkout, cheque primeiro o alvo do proxy. O frontend local pode estar falando com produção ou com outro preview.
</Warning>

## Sinais esperados de boot

Depois de `npm run dev`, considere o boot local saudável quando estes sinais aparecem:

| Sinal                                | Como verificar                          | Interpretação                                                                             |
| ------------------------------------ | --------------------------------------- | ----------------------------------------------------------------------------------------- |
| Vite mantém o processo ativo         | Terminal mostra URL local e não encerra | Servidor dev está escutando.                                                              |
| `/` responde `200`                   | `curl -I http://localhost:3000`         | O shell HTML está disponível.                                                             |
| React monta em `#root`               | Tela inicial carrega no navegador       | `index.tsx` encontrou o elemento de montagem e renderizou os providers globais.           |
| Aviso opcional de `VITE_BACKEND_URL` | Console em dev                          | Funcionalidades dependentes de backend legado podem degradar, mas o boot não deve travar. |
| Aviso de Supabase ausente            | Console em dev                          | Storage remoto está desativado; o app pode seguir com fallback local onde implementado.   |
| Sem `[Scout360][GlobalError]`        | DevTools console                        | Não houve erro global ou rejeição não tratada durante o boot.                             |

O app também desregistra Service Workers antigos e limpa caches de navegador quando não está em modo standalone. Isso evita servir bundles antigos durante previews e sessões locais.

## Validação rápida

Use estes comandos conforme o tipo de mudança:

```bash
npm run typecheck
npm run test
npm run build
```

Para validar o app e o lookup CNPJ sem abrir browser:

```bash
npm run validate:preview
```

Esse smoke usa `http://localhost:3000` e o CNPJ padrão `04.733.767/0001-80`, checando resposta `200` do app e JSON válido em `GET /api/cnpj`.

Para E2E com browser:

```bash
npx playwright install chromium
npm run test:e2e:smoke
```

O comando completo `npm run test:e2e` sobe `npm run dev` automaticamente quando `BASE_URL` não está definido. Para apontar para preview externo:

```bash
BASE_URL=https://seu-preview.vercel.app npm run test:e2e:smoke
```

## Problemas comuns

### O navegador abriu `5173`

`dev-local.command`, `start-local.command` e `DEV_LOCAL_README.md` ainda citam `5173`. O contrato atual do Vite é `3000`. Abra manualmente `http://localhost:3000` ou ajuste o script antes de usá-lo como launcher.

### `/api/cnpj` retorna HTML ou JSON inválido

Em host local, `services/brasilApiService.ts` espera `/api/cnpj` funcionando por proxy. Se o retorno for HTML, o erro esperado indica proxy ausente ou alvo errado. Verifique `LOCAL_DEV_API_PROXY_TARGET`; para bypass específico de CNPJ, use `VITE_CNPJ_PROXY_URL`.

### Fluxos Gemini falham com `Missing required env var: GEMINI_API_KEY`

A chave precisa existir no ambiente que executa a rota `/api/gemini` ou `/api/gerar-dossie`. Se o Vite está proxando para produção, editar `.env.local` não altera o backend remoto. Configure o alvo remoto ou rode um ambiente que execute os handlers com essa variável exportada.

### RAG degrada ou volta vazio

`/api/rag` e `/api/docs-rag` dependem de `GEMINI_API_KEY` e de `PINECONE_API_KEY` ou `PINECONE_DOCS_KEY`. `docs-rag` usa namespace padrão `senior-erp-docs` quando não há override válido; namespaces aceitos incluem `senior-erp-docs` e `competitor-pdfs`.

### Supabase aparece desativado

Sem `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`, `lib/supabaseClient.ts` cria `supabase = null` e registra aviso. Isso não bloqueia o boot, mas afeta persistência remota, diagnósticos ou cache que dependam de Supabase.

## Next

<CardGroup>
<Card title="Primeira execução" href="/primeira-execucao">
Fluxo inicial do operador, criação de sessão e primeiro estado visível esperado.
</Card>
<Card title="Referência de configuração" href="/configuracao-reference">
Variáveis `.env`, defaults, overrides Vite, flags e fronteiras entre frontend e serverless.
</Card>
<Card title="Referência de APIs serverless" href="/api-serverless-reference">
Contratos das rotas em `api/*.ts`, erros, timeouts e respostas degradadas.
</Card>
<Card title="Testes e gates" href="/testes-gates">
Comandos npm, Vitest, Playwright, contratos e critérios por tipo de mudança.
</Card>
<Card title="Preview e deploy Vercel" href="/preview-deploy-vercel">
Proxy local para APIs, smoke de preview, bypass de proteção e limites da validação local.
</Card>
</CardGroup>

## Related pages

- page-configuracao-reference
- page-preview-deploy-vercel

## Source files

- `README.md`
- `package.json`
- `.env.example`
- `DEV_LOCAL_README.md`
- `vite.config.ts`
- `config/localDevApiProxy.ts`
- `docs/GUIA-INICIANTE.md`

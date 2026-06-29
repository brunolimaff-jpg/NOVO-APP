---
grok_wiki: true
page_id: 'page-overview'
title: 'Visão geral'
description: 'Superfície pública do Senior Scout 360, runtime principal, rotas de maior valor e caminho mínimo para sair de checkout limpo para app validável.'
repository: 'local/NOVO-APP'
branch: 'default'
generated_at: '2026-06-08T23:39:43.629Z'
source_files:
  - 'README.md'
  - 'package.json'
  - 'App.tsx'
  - 'index.tsx'
  - 'ARQUITETURA.md'
  - 'HANDOFF_AI.md'
---

Senior Scout 360 é uma SPA React 19 + TypeScript + Vite, montada em `index.tsx`, orquestrada por `App.tsx` e publicada com funções serverless em `api/*.ts` para IA, RAG, CNPJ, Radar e integrações de apoio. O checkout local roda a UI em `http://localhost:3000`; as rotas `/api/*` podem ser servidas por Vercel em produção/preview ou encaminhadas pelo proxy local configurado no Vite.

## Superfície pública

| Superfície          | Entrada principal                                  | Responsabilidade                                                                                                   |
| ------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| App React           | `index.tsx` → `App.tsx`                            | Providers globais, stores, shell de chat, loading, modais, Radar, War Room, analytics e diagnósticos.              |
| Chat e investigação | `components/ChatInterface.tsx`                     | Onboarding do operador, formulário de alvo, timeline, composer, Deep Dive, exportação, feedback e fallback visual. |
| Dossiê waterfall    | `features/dossier/waterfall-orchestrator.ts`       | Execução modular do dossiê, enriquecimento cadastral, contexto PORTA, Teia, fontes e finalização da UI.            |
| Fachada Gemini      | `services/geminiService.ts`                        | API pública estável para o app; a implementação interna fica em `services/gemini/`.                                |
| APIs Vercel         | `api/*.ts`                                         | Proxy Gemini, RAG, CNPJ, Radar, busca aberta, link status e extração de conteúdo.                                  |
| Persistência        | `services/storage/*`, `hooks/useSessionStorage.ts` | Dossiês, contexto de operador, Radar, favoritos e fallback local quando Supabase não está disponível.              |

<Info>
O repositório não usa um diretório `src/` para a aplicação. Os módulos de runtime ficam diretamente na raiz: `components/`, `features/`, `contexts/`, `hooks/`, `services/`, `stores/`, `api/`, `prompts/`, `utils/`, `tests/` e `tests-e2e/`.
</Info>

## Runtime principal

```text
index.tsx
  -> Sentry, React Query, ChatStoreProvider, DossierStoreProvider
  -> OperatorProvider, ModeProvider
  -> App.tsx
      -> useAppInitialization()
      -> useSessionManager()
      -> useDossierWaterfallOrchestrator()
      -> useChatMessageOrchestrator()
      -> ChatInterface
          -> GreetingWelcomeScreen ou EmptyStateHome
          -> MessageTimeline + Composer
          -> WarRoom, RadarPanel, exportações, feedback
```

`index.tsx` inicializa Sentry quando `VITE_SENTRY_DSN` existe, configura Replay, registra listeners globais de erro, heartbeat e visibility tracking, cria o `QueryClient` e monta a árvore React. O `QueryClient` usa `staleTime` de 5 minutos, `retry: 2` e não refaz fetch ao focar a janela.

`App.tsx` é o orquestrador ativo. Ele lê `useChatStore()` e `useDossierStore()`, calcula quando mostrar `LoadingSmart`, protege o overlay contra estado preso, limpa Service Workers legados, injeta build metadata em diagnóstico e passa os handlers principais para `ChatInterface`.

## Fluxos de maior valor

### Primeira entrada do operador

O app exige nome e email antes do shell de investigação. A tela `GreetingWelcomeScreen` valida:

| Campo             | Regra                                                             |
| ----------------- | ----------------------------------------------------------------- |
| Nome              | Pelo menos duas palavras com 2+ caracteres.                       |
| Email             | Deve terminar com `@senior.com.br`.                               |
| Usuário existente | `storage.findUserByEmail()` pode oferecer vínculo do dispositivo. |

Sinais esperados para automação: `greeting-card`, `greeting-name-input`, `greeting-email-input` e `greeting-submit-button`.

### Investigação de empresa

Depois do onboarding, `EmptyStateHome` exibe o formulário `Dados do alvo`. Empresa, cidade e UF são obrigatórios; CNPJ é opcional, mas melhora o dossiê e o Score PORTA.

| Campo/testid                         | Uso                                                        |
| ------------------------------------ | ---------------------------------------------------------- |
| `investigation-company-input`        | Razão social ou nome fantasia.                             |
| `investigation-cnpj-input`           | CNPJ opcional, validado por `/api/cnpj`.                   |
| `investigation-cnpj-validate-button` | Busca nome, cidade, UF, CNAE e QSA quando o CNPJ é válido. |
| `investigation-city-input`           | Município do alvo.                                         |
| `investigation-uf-input`             | UF de dois caracteres.                                     |
| `investigation-submit-button`        | Inicia a investigação completa.                            |

Antes de enviar, a UI valida cidade/UF via IBGE. Se o lookup de CNPJ falhar, o formulário permite preenchimento manual.

### Dossiê e timeline

`ChatInterface` monta um prompt oculto com `buildInvestigationHiddenPrompt()`, inclui contexto do Radar quando disponível e chama `onDeepDive()`. O envio chega a `useChatMessageOrchestrator()`, que delega a execução de dossiê para `runMegaPromptWaterfall`.

A timeline alterna entre lista virtualizada e fallback estático. Para regressões visuais, os sinais críticos são `chat-main-panel`, `messages-scroller`, `bot-message-content`, `messages-static-fallback`, `loading-smart-overlay`, `PostCompletion`, `BlankPanel` e `LayoutTrace`.

<Warning>
O estado vivo do handoff registra tela branca mitigada com safety net, mas causa raiz ainda aberta. Para regressões de UI, não trate Supabase, logs ou checks verdes como prova final sem validar DOM visível, timeline renderizada e ausência de overlay preso.
</Warning>

### War Room

`components/WarRoom.tsx` usa a fachada `services/warRoomService.ts`, que preserva a API pública e delega a implementação para `services/war-room/`. O fluxo interno separa contratos, configuração, histórico, intenção, retrieval, prompting, fontes e query.

### Radar

`features/radar/` é a fronteira arquitetural do Radar. `useRadar()` concentra estado e persistência; `features/radar/service.ts` concentra o contrato frontend de `/api/radar-scan`. A home mostra estados de Radar não configurado, varrendo, vazio ou com alertas.

## APIs serverless de maior impacto

| Rota                   | Método | Runtime | Papel                                                                                                                 |
| ---------------------- | ------ | ------- | --------------------------------------------------------------------------------------------------------------------- |
| `/api/gemini`          | `POST` | Node.js | Proxy Gemini com ações `health`, `generateContent`, `createCachedContent`, `deleteCachedContent` e `chatSendMessage`. |
| `/api/cnpj`            | `GET`  | Node.js | Lookup cadastral por CNPJ, com CORS para produção, previews Vercel e dev local.                                       |
| `/api/rag`             | `POST` | Node.js | Busca contexto interno no Pinecone usando embedding Gemini.                                                           |
| `/api/docs-rag`        | `POST` | Node.js | Busca documentação técnica em namespaces permitidos, com sinal explícito quando não há documentação.                  |
| `/api/radar-scan`      | `POST` | Node.js | Varredura RSS/Google News, deduplicação e resumo com Gemini.                                                          |
| `/api/socio-search`    | `POST` | Node.js | Busca societária estruturada para Teia e enriquecimento CNPJ.                                                         |
| `/api/open-web-search` | `POST` | Node.js | Busca aberta controlada para fallback web.                                                                            |
| `/api/link-status`     | `POST` | Node.js | Validação de links promovidos como fontes.                                                                            |

No desenvolvimento local, `vite.config.ts` cria proxy para as principais rotas `/api/*` apontando por padrão para `https://scoutagro.vercel.app`. O alvo pode ser sobrescrito por `LOCAL_DEV_API_PROXY_TARGET`; previews protegidos podem usar `VERCEL_AUTOMATION_BYPASS_SECRET`.

## Configuração mínima

<Steps>
<Step title="Instale dependências">
Use npm no checkout limpo.

```bash
npm install
```

</Step>

<Step title="Crie o ambiente local">
O README usa `.env`, e o boot também aceita variáveis Vite no ambiente do processo.

```bash
cp .env.example .env
```

Preencha pelo menos as chaves necessárias ao fluxo que será testado. Para IA/RAG serverless, `GEMINI_API_KEY` e `PINECONE_API_KEY` ficam sem prefixo `VITE_`. Para Supabase no browser, use `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
</Step>

<Step title="Suba a UI local">
```bash
npm run dev
```

A porta esperada é `3000`.
</Step>

<Step title="Abra o app">
```text
http://localhost:3000
```

O primeiro estado visível esperado é o onboarding do operador ou, quando já houver operador local, o formulário `Dados do alvo`.
</Step>
</Steps>

<Note>
`index.tsx` não declara variáveis obrigatórias de frontend no boot atual. Se `VITE_SUPABASE_URL` ou `VITE_SUPABASE_ANON_KEY` estiverem ausentes, o cliente Supabase vira `null` e o storage remoto fica desativado com degradação local.
</Note>

## Comandos de validação

| Comando                    | Quando usar                                             |
| -------------------------- | ------------------------------------------------------- |
| `npm run typecheck`        | Mudanças TypeScript, contratos, props, stores e APIs.   |
| `npm run test`             | Suite Vitest geral.                                     |
| `npm run test:contracts`   | Contratos versionados em `tests/contracts/`.            |
| `npm run build`            | Build Vite com sourcemap e `dist/version.json`.         |
| `npm run test:e2e:smoke`   | Smoke local do onboarding e shell.                      |
| `npm run test:e2e:cnpj`    | Fluxo CNPJ → lookup → investigação → resposta.          |
| `npm run test:e2e:blank`   | Regressão de painel branco.                             |
| `npm run test:e2e:loading` | Recuperação de estados de loading.                      |
| `npm run validate:preview` | Health check e lookup CNPJ contra URL local ou preview. |

Para testar contra preview Vercel, defina `BASE_URL`. O Playwright não sobe `npm run dev` quando `BASE_URL` está presente.

```bash
BASE_URL=https://seu-preview.vercel.app npm run test:e2e:cnpj
```

## Fontes canônicas para agentes

Leia nesta ordem antes de planejar mudanças relevantes:

1. `HANDOFF_AI.md`
2. `.agents/memory/activeContext.md`
3. `.agents/memory/progress.md`
4. `.agents/memory/decisions.md`
5. `docs/obsidian/00-MASTER.md`
6. `ARQUITETURA.md`

A camada `docs/obsidian/` é navegação e índice visual; ela não substitui `HANDOFF_AI.md`, `.agents/memory/*` nem os contratos vivos em `docs/ai-context/refactor/*`.

<Info>
Perfis de conhecimento e skill packs usados por wiki devem ser tratados como fontes portáveis de forma e contexto, não como dependências de runtime. A arquitetura do app continua BYOC/BYOK: chaves e provedores entram por variáveis, serverless ou catálogos versionados, sem exigir um conector proprietário para operar o checkout.
</Info>

## Next

<CardGroup>
<Card title="Instalação" href="/installation">
Pré-requisitos, `.env`, porta Vite, proxy de APIs e sinais esperados de boot local.
</Card>
<Card title="Primeira execução" href="/primeira-execucao">
Fluxo do operador, sessão inicial, input de empresa/CNPJ e primeiro estado visível.
</Card>
<Card title="Arquitetura do app" href="/arquitetura-app">
Bootstrap React, providers, stores, orquestrador principal e fachadas preservadas.
</Card>
<Card title="Gerar dossiê por CNPJ" href="/gerar-dossie-cnpj">
Passos e validação do fluxo CNPJ até resposta renderizada.
</Card>
<Card title="Testes e gates" href="/testes-gates">
Comandos npm, Vitest, Playwright, preview e critérios por tipo de mudança.
</Card>
<Card title="Fontes canônicas" href="/fontes-canonicas">
Ordem de leitura para handoff, memória local, decisões duráveis e governança.
</Card>
</CardGroup>

## Related pages

- page-installation
- page-primeira-execucao
- page-arquitetura-app

## Source files

- `README.md`
- `package.json`
- `App.tsx`
- `index.tsx`
- `ARQUITETURA.md`
- `HANDOFF_AI.md`

---
grok_wiki: true
page_id: "page-primeira-execucao"
title: "Primeira execução"
description: "Fluxo inicial do operador, criação de sessão, shell de investigação, inputs de empresa/CNPJ e primeiro estado visível esperado."
repository: "local/NOVO-APP"
branch: "default"
generated_at: "2026-06-08T23:39:43.629Z"
source_files:
  - "components/GreetingWelcomeScreen.tsx"
  - "components/ChatInterface.tsx"
  - "features/chat/session-controller.ts"
  - "features/chat/message-orchestrator.ts"
  - "tests-e2e/smoke.greeting.spec.ts"
  - "tests-e2e/smoke.investigation-shell.spec.ts"
  - "hooks/useSessionStorage.ts"
---

A primeira execução do Senior Scout 360 passa por `index.tsx` → `App.tsx` → `ChatInterface`: a árvore monta `ChatStoreProvider`, `DossierStoreProvider`, `OperatorProvider` e `ModeProvider`, carrega sessões persistidas, exige operador local quando não há nome salvo e só depois mostra a home de investigação com os inputs de empresa, CNPJ, cidade e UF.

## Estados iniciais

```text
Boot React
  -> "Preparando ambiente..." enquanto sessões carregam
  -> GreetingWelcomeScreen quando não há operador salvo
  -> EmptyStateHome quando há operador e não há sessão ativa
  -> ChatShell quando a primeira investigação cria ou seleciona uma sessão
```

| Estado | Condição principal | Primeiro sinal visível |
| --- | --- | --- |
| Inicialização | `isInitialized === false` | Texto `Preparando ambiente...` |
| Gate do operador | Sem `operator_name` salvo | `greeting-card` |
| Home de investigação | Operador definido e sem sessão/mensagens | `investigation-company-input` |
| Shell do chat | Sessão ativa após envio inicial | `app-header`, `chat-main-panel`, `message-input` |

## Gate do operador

O operador é local ao browser e fica em `localStorage` com prefixo `scout360:`.

| Chave lógica | Chave persistida | Origem |
| --- | --- | --- |
| `operator_name` | `scout360:operator_name` | Nome confirmado no onboarding |
| `operator_email` | `scout360:operator_email` | Email confirmado no onboarding |
| `operator_id` | `scout360:operator_id` | `op_` + UUID reduzido, criado automaticamente |

A tela aceita envio somente quando:

- `Seu nome` tem pelo menos duas palavras com dois ou mais caracteres.
- `Seu email` termina com `@senior.com.br` e tem prefixo antes do domínio.
- Se o email já existir em `user_context`, a UI oferece `Vincular este dispositivo` ou `Criar novo cadastro`.

<Note>
O cadastro remoto em Supabase é best-effort. A falta de Supabase não impede o gate local: o nome, email e `operator_id` continuam salvos no browser.
</Note>

## Home de investigação

Após o operador, `MessageTimeline` renderiza `EmptyStateHome` enquanto `showInitialHome` for verdadeiro. Essa condição vale quando não existe `currentSession` ou quando a sessão atual ainda não tem mensagens e não está carregando.

### Inputs do alvo

| Campo | `data-testid` | Obrigatório | Validação |
| --- | --- | --- | --- |
| Nome da empresa | `investigation-company-input` | Sim | Texto com pelo menos 2 caracteres |
| CNPJ | `investigation-cnpj-input` | Não | 14 dígitos normalizados e CNPJ válido para habilitar lookup |
| Cidade | `investigation-city-input` | Sim | Texto com pelo menos 2 caracteres |
| UF | `investigation-uf-input` | Sim | Sigla presente na lista de UFs brasileiras |

O botão `investigation-submit-button` chama `onStartInvestigation` apenas depois de validar empresa, cidade e UF. Antes do envio, a cidade é conferida via IBGE por `validateCityInState`. Se a API do IBGE falhar, o fluxo não bloqueia o operador e usa a cidade/UF digitadas.

### CNPJ opcional

O CNPJ não é obrigatório, mas muda a qualidade do contexto inicial. Quando válido, o botão `investigation-cnpj-validate-button` chama `fetchCompanyByCnpj`, que consulta `/api/cnpj?cnpj=...` ou `VITE_CNPJ_PROXY_URL` em localhost quando configurado.

| Resultado | Comportamento |
| --- | --- |
| Lookup OK | Preenche nome, cidade e UF quando apropriado, mostra `Dados preenchidos automaticamente via Receita Federal` e trava o CNPJ como validado |
| 404 | Mostra `CNPJ não encontrado na Receita Federal. Preencha os campos manualmente.` |
| Local sem proxy | Mostra `Ambiente local sem proxy para consulta de CNPJ. Rode via vercel dev ou configure o proxy.` |
| Serviço indisponível | Mostra `Serviço de consulta indisponível no momento. Preencha os campos manualmente.` |
| CNPJ inválido | Mantém o botão de validação desabilitado |

<Warning>
Em `npm run dev`, `/api/cnpj` não é uma rota Vite real. Para validar lookup completo em ambiente local, use um proxy em `VITE_CNPJ_PROXY_URL` ou rode com um ambiente que emule as serverless functions.
</Warning>

## Criação da primeira sessão

A primeira investigação não depende do botão lateral `Nova investigação`. O envio inicial cria a sessão no orquestrador se `currentSessionId` estiver vazio.

<Steps>
  <Step title="Enviar payload da home">
    `EmptyStateHome` envia `companyName`, `cnpj`, `city` e `state` para `ChatInterface`.
  </Step>
  <Step title="Montar investigação">
    `ChatInterface` monta a mensagem visível `🔍 Investigando {empresa}...`, tenta enriquecer `segmentHint` pelo CNPJ e gera o prompt oculto com `buildInvestigationHiddenPrompt`.
  </Step>
  <Step title="Checar duplicidade">
    Se existir dossiê para o mesmo CNPJ ou nome, `DuplicateDossierModal` permite abrir o dossiê existente ou sobrescrever com nova investigação.
  </Step>
  <Step title="Criar ChatSession">
    `handleSendMessage` cria uma `ChatSession` com `id`, `title`, `empresaAlvo`, `cnpj`, `modoPrincipal`, `scoreOportunidade`, `resumoDossie`, timestamps e `messages: []`.
  </Step>
  <Step title="Adicionar mensagens iniciais">
    A sessão recebe a mensagem do usuário visível e um placeholder de bot com `isThinking: true`. Como o texto interno contém `DOSSIE COMPLETO`, o fluxo entra no waterfall de dossiê.
  </Step>
</Steps>

Exemplo de payload produzido pela home:

```json
{
  "companyName": "Fazenda Modelo",
  "cnpj": null,
  "city": "Cuiabá",
  "state": "MT"
}
```

Exemplo de sessão criada antes da resposta consolidada:

```json
{
  "title": "Fazenda Modelo",
  "empresaAlvo": "Fazenda Modelo",
  "cnpj": null,
  "modoPrincipal": "investigacao",
  "scoreOportunidade": null,
  "resumoDossie": null,
  "messages": [
    {
      "sender": "user",
      "text": "🔍 Investigando Fazenda Modelo..."
    },
    {
      "sender": "bot",
      "text": "",
      "isThinking": true
    }
  ]
}
```

## Primeiro estado visível esperado

Depois de clicar em `Iniciar investigação completa`, a UI deve sair da home e abrir `ChatShell`.

| Superfície | Sinal esperado |
| --- | --- |
| App | `app-shell` permanece montado |
| Header | `app-header` e `app-breadcrumb` ficam visíveis |
| Painel central | `chat-main-panel` renderiza timeline, placeholder, overlay ou fallback |
| Sidebar | `session-sidebar` existe, aberta ou recolhida conforme viewport |
| Composer | `message-input` e `chat-input` aparecem; durante loading, o campo pode ficar desabilitado |
| Ação de envio | `send-message-button` quando idle ou `chat-stop-button` durante geração |
| Loading | `loading-smart-overlay`, `messages-viewport-suspended` ou placeholder da timeline podem aparecer enquanto não há resposta renderizável |

<Info>
Alguns smokes E2E ainda procuram `chat-header-title`. O header atual expõe o título dentro do breadcrumb (`app-breadcrumb` e `chat-header-breadcrumb-session`). Ao ajustar testes, trate isso como contrato de UI, não como detalhe da página de primeira execução.
</Info>

## Persistência e retomada

`ChatStoreProvider` usa `useSessionStorage` como fonte da lista de sessões. No boot, o hook tenta migrar IDB para Supabase, busca dossiês em `storage.getDossiers()` e só cai para `localStorage` legado (`scout360_sessions_v1`) quando o remoto não retorna sessões.

A persistência de sessões é debounced em 1000 ms por `storage.saveAllDossiers`. Antes de salvar, o storage remove estado transitório de mensagem, como `loadingVariant` e `isSourcesOpen`, e força `isThinking: false`. Se Supabase não estiver disponível, a primeira execução continua, mas a restauração multi-dispositivo fica degradada.

## Verificação rápida

```bash
npm run test:e2e:smoke
npm run test:e2e:cnpj
```

Para validar só o onboarding e a abertura da shell:

```bash
npx playwright test tests-e2e/smoke.greeting.spec.ts tests-e2e/smoke.investigation-shell.spec.ts
```

Critérios mínimos de aceite:

- `greeting-card` aparece quando não há operador salvo.
- Após nome e email válidos, `investigation-company-input` fica visível.
- Com empresa, cidade e UF válidas, o envio abre a shell do chat.
- O primeiro envio cria sessão com `empresaAlvo` e `cnpj` quando informado.
- Durante a geração, a UI mostra composer, stop/loading ou timeline suspensa, nunca painel central vazio sem fallback.

## Troubleshooting

| Sintoma | Verificação |
| --- | --- |
| Continua no onboarding | Confirme `operator_name` e `operator_email` em `localStorage` com prefixo `scout360:` |
| Botão de CNPJ fica desabilitado | O valor precisa normalizar para 14 dígitos e passar em `isValidCnpj` |
| Lookup de CNPJ retorna HTML no local | Configure `VITE_CNPJ_PROXY_URL` ou rode com serverless compatível |
| Envio não abre a shell | Verifique empresa com 2+ caracteres, cidade com 2+ caracteres e UF válida |
| Shell abre sem resposta ainda | Durante waterfall, aceite `loading-smart-overlay`, `messages-viewport-suspended`, `chat-stop-button` ou placeholder da timeline como estados transitórios válidos |
| Sessão some após abortar | O orquestrador descarta a sessão inicial se ela ficou apenas com a mensagem do usuário e a geração foi abortada antes de consolidar resposta |

## Related pages

<CardGroup>
  <Card title="Instalação" href="/installation">
    Pré-requisitos, porta Vite, variáveis locais e proxy de APIs.
  </Card>
  <Card title="Sessões e mensagens" href="/sessoes-mensagens">
    Modelo `ChatSession`, ciclo de sessão, persistência e seleção.
  </Card>
  <Card title="Gerar dossiê por CNPJ" href="/gerar-dossie-cnpj">
    Fluxo completo de lookup cadastral, preenchimento e investigação por CNPJ.
  </Card>
  <Card title="Loading e estados visuais" href="/loading-estados-visuais">
    Contrato de overlay, timeline, fallback estático e recuperação pós-waterfall.
  </Card>
</CardGroup>

## Source files

- `components/GreetingWelcomeScreen.tsx`
- `components/ChatInterface.tsx`
- `features/chat/session-controller.ts`
- `features/chat/message-orchestrator.ts`
- `tests-e2e/smoke.greeting.spec.ts`
- `tests-e2e/smoke.investigation-shell.spec.ts`
- `hooks/useSessionStorage.ts`

---
grok_wiki: true
page_id: "page-usar-war-room"
title: "Usar o War Room"
repository: "local/NOVO-APP"
branch: "default"
generated_at: "2026-06-08T23:39:43.629Z"
source_files:
  - "components/WarRoom.tsx"
  - "services/warRoomService.ts"
  - "services/war-room/query.ts"
  - "services/war-room/intent.ts"
  - "services/war-room/retrieval.ts"
  - "components/war-room/WarRoomComposer.tsx"
  - "tests/services/warRoomService.test.ts"
---

---
title: "Usar o War Room"
description: "Como abrir, consultar, cancelar, repetir, alternar modo técnico ou benchmark, carregar contexto documental e tratar resposta fora de escopo."
---

O War Room é um painel React carregado sob demanda a partir do chat principal, exposto pela fachada `services/warRoomService.ts` e executado pela função `queryWarRoom`. A UI operacional roteia perguntas para dois modos: `tech` para dúvidas técnicas sobre Senior ERP e `benchmark` para comparativos contra concorrentes.

## Superfície operacional

```text
ChatShell
  -> botão "War Room" quando canWarRoom=true
  -> ChatPanels renderiza <WarRoom />
  -> WarRoom envia queryWarRoom(mode, message, history, target, onStatus, options)
  -> loadWarRoomDocsContext()
       -> /api/docs-rag  namespaces: senior-erp-docs, competitor-pdfs
       -> /api/rag       base interna
  -> proxyGerarDossie()
       -> /api/gemini
```

| Área | Contrato atual |
| --- | --- |
| Abertura | Botão com `aria-label="Abrir War Room"` no cabeçalho do chat, visível somente com `canWarRoom=true`. |
| Fechamento | Botão `✕` no painel lateral; ao fechar, a UI aborta requisição em andamento. |
| Envio | `Enter` envia; `Shift+Enter` mantém quebra de linha. O botão `▶` fica desabilitado sem texto ou durante loading. |
| Modos | A rota é automática: `tech` por padrão, `benchmark` quando a mensagem contém intenção comparativa. |
| Cancelamento | O botão `Parar` aborta o `AbortController` da consulta ativa. |
| Repetição | Respostas com erro `retryable` exibem `Tentar novamente`, reenviando a última mensagem de usuário antes do erro. |
| Fontes | Respostas podem exibir bloco `Fontes` com auditoria de link: `CONFIRMADO`, `OFF-LINE`, `AUDITORIA EM CURSO` ou `ANÁLISE INFERIDA`. |

## Abrir e fechar

<Steps>
  <Step title="Abra pelo cabeçalho do chat">
    Use o botão com ícone do War Room no cabeçalho. Ele só aparece quando a sessão recebeu `canWarRoom=true`.
  </Step>
  <Step title="Confira a rota atual">
    O cabeçalho interno mostra `Rota atual: Tira-Dúvidas Técnico` ou `Rota atual: Benchmark Tático`.
  </Step>
  <Step title="Feche pelo painel lateral">
    Use `✕`. Se houver uma consulta em andamento, o componente chama `abort()` e limpa `isLoading` e `status`.
  </Step>
</Steps>

<Note>
`ChatPanels` passa `defaultCompetitorTarget={null}` no fluxo principal. Quando a pergunta comparativa não informa concorrente, o serviço normaliza para `concorrente principal`.
</Note>

## Consultar

Use o campo com placeholder `Pergunte sobre produto, processo, integração ou comparação com concorrentes...`.

Exemplos cobertos pela rota técnica:

```text
Como funciona o processo de compras no ERP Senior?
Como funciona o custo por talhão no SimpleFarm?
Qual o fluxo completo da ordem de serviço até a valorização?
Como configurar integração com NFe?
```

Exemplos que entram em `benchmark`:

```text
Compare Senior vs TOTVS para folha no agronegócio.
Senior versus SAP em integração bancária.
Diferença entre Senior e concorrente para ERP Banking.
Benchmark contra Protheus.
```

A consulta enviada ao serviço inclui:

```ts
queryWarRoom(
  mode: WarRoomMode,
  message: string,
  history: WarRoomMessage[],
  target: string,
  onStatus?: (status: string) => void,
  options?: { signal?: AbortSignal; timeoutMs?: number }
)
```

## Alternar entre técnico e benchmark

Não existe toggle manual. O modo muda por intenção textual.

| Entrada | Modo resolvido |
| --- | --- |
| Sem marcador comparativo | `tech` |
| `benchmark` | `benchmark` |
| `compare`, `comparar`, `comparativo` | `benchmark` |
| `versus`, `vs`, `contra` | `benchmark` |
| `concorr...`, `diferença` | `benchmark` |

No modo `benchmark`, o alvo é extraído de padrões como `Senior vs TOTVS`, `TOTVS vs Senior`, `compare Senior com TOTVS` ou `benchmark contra Protheus`.

## Carregar contexto documental

O carregamento documental é automático para `tech` e `benchmark`.

| Configuração | Valor |
| --- | --- |
| Namespace técnico padrão | `senior-erp-docs` |
| Namespace adicional em benchmark | `competitor-pdfs` |
| Cache de contexto | `120000ms` |
| Corte máximo de docs no prompt | `6000` caracteres |
| Histórico recente | até `8` turnos e `4000` caracteres |
| Pergunta do usuário no prompt | até `1600` caracteres |
| Timeout War Room técnico | `90000ms` |
| Timeout War Room benchmark | `120000ms` |
| Timeout cliente RAG | `15000ms` |
| Score mínimo em `/api/docs-rag` | `0.6` |

O War Room consulta documentação oficial e base interna em paralelo. Para perguntas específicas, ele reforça buscas e priorização de blocos:

| Intenção | Reforço aplicado |
| --- | --- |
| Processo agrícola | Busca termos como `simplefarm`, `ordem de serviço`, `safra`, `monitoramento`, `irrigação`. |
| Fercus | Trata `Fercus` como termo técnico válido e injeta referência oficial se o RAG não trouxer `gatec-modulo-fercus`. |
| Talhão | Prioriza `consulta-analitica-de-talhao`. |
| GAtec agrícola | Prioriza manual agrícola do SimpleFarm quando a pergunta não pede integração. |
| ERP Banking em benchmark | Prioriza `ERP Banking`, `CNAB`, `pagamento eletrônico` e normaliza respostas para evitar termos legados como `Senior Bank`. |

<Warning>
Se Pinecone não responder ou retornar contexto vazio, o War Room continua a resposta e acrescenta aviso de degradação: o contexto documental não respondeu e a resposta usa conhecimento complementar.
</Warning>

## Cancelar uma resposta

Durante loading, o cabeçalho mostra `Parar`.

1. Clique em `Parar`.
2. A UI aborta o `AbortSignal` associado à consulta.
3. O loading é encerrado quando a promise liquida.
4. Se o serviço receber um sinal já abortado antes de executar, retorna uma mensagem de solicitação cancelada com `retryable=false`.

Fechar o painel também aborta a consulta ativa.

## Repetir uma resposta com erro

Quando `queryWarRoom` retorna `isError=true`, a mensagem renderiza:

- `Tentar novamente`, se `retryable` não for `false`.
- `Ver detalhes`, para expandir `technicalDetails`.
- Texto de erro normalizado no corpo da resposta.

A repetição não edita a mensagem antiga. Ela localiza a última mensagem de usuário antes do erro e envia uma nova consulta com o texto original.

## Resposta fora de escopo

No modo técnico, o serviço recusa consultas que pertencem ao chat principal, sem chamar o modelo.

Padrões tratados como fora de escopo:

| Sinal na mensagem | Tratamento |
| --- | --- |
| `CNPJ` | Redireciona para o Chat Principal. |
| `dossiê` | Redireciona para investigação principal. |
| `Score PORTA` | Redireciona para fluxo de dossiê. |
| `prospecção`, `varredura`, `capivara` | Redireciona para fluxo principal. |
| `quadro societário`, `sócios`, `Receita Federal` | Redireciona para investigação principal. |

A resposta explica que o War Room é focado em dúvidas técnicas sobre ERP Senior, módulos, processos e integrações, e orienta fechar o painel para pesquisar no chat principal.

## Frentes bloqueadas

A UI intercepta intents de `kill-script` e análise de objeções por palavras-chave como `kill-script`, `análise de objeções` e `quebrar objeção`. A resposta visível é uma mensagem curta informando que a frente está temporariamente bloqueada e será liberada futuramente.

<Info>
Os tipos `killscript` e `objections` existem no contrato de serviço, mas o fluxo de UI atual só roteia automaticamente para `tech` e `benchmark`; essas frentes comerciais são bloqueadas antes de chamar `queryWarRoom`.
</Info>

## Fontes, cópia e auditoria

Respostas do modelo passam por `MarkdownRenderer` com HTML bruto desabilitado. O botão de cópia fica visível no hover da mensagem do modelo e usa `navigator.clipboard`; em falha, a UI mostra feedback para cópia manual.

O bloco `Fontes` combina fontes retornadas pelo grounding com URLs detectadas no texto. Depois da resposta, a UI chama validação de links e atualiza o status de cada fonte.

| Status | Significado |
| --- | --- |
| `CONFIRMADO` | A URL validou como disponível. |
| `OFF-LINE` | A URL foi classificada como quebrada ou indisponível. |
| `AUDITORIA EM CURSO` | A validação ainda não retornou. |
| `ANÁLISE INFERIDA` | A resposta tem referência inferida sem URL explícita. |

## Pré-condições de ambiente

Para War Room com RAG funcional, as rotas serverless precisam de chaves de geração e Pinecone.

```env
GEMINI_API_KEY=...
PINECONE_API_KEY=...
PINECONE_DOCS_KEY=
PINECONE_DOCS_INDEX=scout-arsenal
```

`/api/docs-rag` aceita apenas os namespaces `senior-erp-docs` e `competitor-pdfs`. Namespace inválido retorna `400` com a lista permitida. Ausência de documentação forte retorna um sinal explícito de sem documentação, tratado no cliente como contexto indisponível.

<Note>
A implementação atual usa nomes concretos como Gemini e Pinecone, mas a fronteira de integração fica na fachada `queryWarRoom`, em `ragService` e nos endpoints `/api/docs-rag`, `/api/rag` e `/api/gemini`. Uma integração Grok-Wiki, BYOC ou BYOK deve manter a UI estável e trocar somente as fontes por arquivos, repositórios ou catálogos atrás dessas fronteiras.
</Note>

## Verificação

Use testes focados quando alterar UI, roteamento, RAG ou contrato de resposta:

```bash
npm test -- tests/components/WarRoom.test.tsx
npm test -- tests/services/warRoomService.test.ts
npm test -- tests/services/war-room/query.test.ts
npm test -- tests/services/war-room/retrieval.test.ts
npm test -- tests/services/war-room/intent.test.ts
npm test -- tests/api-docs-rag.test.ts
npm run typecheck
```

Para regressões de fluxo completo, rode também os gates gerais definidos no projeto:

```bash
npm test
npm run test:contracts
npm run build
```

## Troubleshooting

| Sintoma | Verificação |
| --- | --- |
| Botão War Room não aparece | Confirme `canWarRoom=true` no fluxo que monta `ChatInterface` e `ChatShell`. |
| Resposta sempre técnica | A mensagem não contém marcador de benchmark reconhecido. Use `compare`, `vs`, `versus`, `contra` ou `benchmark`. |
| Benchmark usa alvo genérico | Informe o concorrente na frase, por exemplo `Senior vs TOTVS`. |
| Status fica em Pinecone indisponível | Verifique `/api/docs-rag`, `/api/rag`, `PINECONE_API_KEY`, `PINECONE_DOCS_KEY`, índice e namespaces. |
| Resposta mostra aviso de conhecimento complementar | O RAG retornou vazio, falhou ou respondeu parcialmente. |
| Erro com botão de retry | Expanda `Ver detalhes` para ver `source`, `code`, `status` e mensagem normalizada. |
| Consulta travou visualmente | Use `Parar`; se persistir, feche o War Room para abortar o controller ativo. |

## Related pages

<CardGroup>
  <Card title="Primeira execução" href="/primeira-execucao">
    Fluxo inicial do operador e primeiro estado esperado no shell de investigação.
  </Card>
  <Card title="Referência de RAG" href="/rag-reference">
    Contratos de `/api/rag`, `/api/docs-rag`, namespaces e sinal sem documentação.
  </Card>
  <Card title="Proxy Gemini" href="/gemini-proxy-reference">
    Fachada de geração, timeout, grounding e chamadas via `/api/gemini`.
  </Card>
  <Card title="Testes e gates" href="/testes-gates">
    Comandos de validação para UI, serviços, contratos e E2E.
  </Card>
</CardGroup>

## Related pages

- page-rag-reference
- page-prompts-reference


## Source files

- `components/WarRoom.tsx`
- `services/warRoomService.ts`
- `services/war-room/query.ts`
- `services/war-room/intent.ts`
- `services/war-room/retrieval.ts`
- `components/war-room/WarRoomComposer.tsx`
- `tests/services/warRoomService.test.ts`

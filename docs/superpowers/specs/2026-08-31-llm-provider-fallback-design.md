# LLM Provider Fallback V1 — Design

**Data:** 2026-08-31
**Status:** APROVADO por Bruno
**Repo:** `brunolimaff-jpg/NOVO-APP`
**Branch:** `fix/llm-zen-temporary`
**Baseline de integração:** `main@b6fa24c5ba5e24d723330ad8ff1e01b7c3310e9c`
**Executor:** DeepSeek V4 Flash com contexto amplo para coding
**Método:** Ponytail/YAGNI + TDD

## 1. Objetivo

Transformar o suporte já existente ao OpenCode Zen em um fallback operacional permanente de provider para o Senior Scout 360, preservando LiteLLM como provider primário e OpenCode Zen com `deepseek-v4-flash` pago como provider secundário independente.

O fallback deve aumentar disponibilidade sem transformar o Scout em framework genérico de providers.

## 2. Decisões congeladas

1. LiteLLM é o provider primário.
2. OpenCode Zen é o provider secundário automático, usando `deepseek-v4-flash` pago.
3. `LLM_PROVIDER=zen` permanece como modo operacional forçado para indisponibilidade prolongada do LiteLLM.
4. Zero fallback reverso Zen → LiteLLM.
5. Zero circuit breaker nesta V1.
6. Zero abstração genérica/registry/factory/provider chain.
7. Zen usa `fetch` nativo em `/chat/completions`; sem SDK/dependência nova.
8. Zen faz uma única tentativa; zero retries automáticos.
9. Fallback automático usa allowlist explícita; nunca `catch-all`.
10. Fallback de provider não é fallback de qualidade.
11. Fronteira de dados do Zen está aprovada para uso operacional permanente com `deepseek-v4-flash` pago: mesmas classes de dados autorizadas ao Scout, sem secrets, telemetria allowlist, política vigente de retenção/região, STOP se a política do Zen mudar.
12. Sem migration, mudança de schema ou persistência nova nesta V1.
13. Merge final permanece bloqueado até autorização explícita de Bruno.

## 3. Baseline e estado atual

`main@b6fa24c5` contém o runtime LiteLLM atual, SC-429/SC-429B e o banner de contingência.

A branch `fix/llm-zen-temporary@b74a7d27441a2315452d243f3be3f39268f84850` contém o cliente Zen via `fetch`, envs `OPENCODE_ZEN_*`, zero retry no Zen, testes e modo `LLM_PROVIDER=zen`.

A branch está divergente do main e deve ser rebaseada/sincronizada com `main@b6fa24c5` ou sucessor explicitamente adotado antes de qualquer implementação funcional nova.

## 4. Arquitetura V1

```text
/api/llm
   |
   v
callLLM(input, env)
   |
   +-- LLM_PROVIDER=zen -----------------> callZen() --------> resultado
   |
   +-- LLM_PROVIDER=litellm
          |
          +--> callLiteLLM()
                  |
                  +-- sucesso -----------> resultado
                  |
                  +-- falha elegível ---> callZen() --------> resultado fallback
                  |
                  +-- falha não elegível -------------------> erro
```

### `callLiteLLM`

Implementação concreta do LiteLLM. Não conhece Zen nem decide fallback.

### `callZen`

Implementação concreta do OpenCode Zen. Não conhece LiteLLM nem faz fallback reverso.

### `callLLM`

Única política nova necessária. Deve:

- respeitar `LLM_PROVIDER`;
- usar Zen direto quando forçado;
- usar LiteLLM como primário quando `LLM_PROVIDER=litellm`;
- verificar `LLM_FALLBACK_ENABLED=true`;
- avaliar allowlist após erro terminal do LiteLLM;
- exigir Zen completamente configurado;
- manter um único orçamento total de request;
- chamar Zen no máximo uma vez;
- devolver proveniência do provider efetivamente servido;
- nunca fazer Zen → LiteLLM.

## 5. Configuração

### LiteLLM sem fallback

```env
LLM_PROVIDER=litellm
LLM_FALLBACK_ENABLED=false
```

### LiteLLM com fallback Zen

```env
LLM_PROVIDER=litellm
LLM_FALLBACK_ENABLED=true
OPENCODE_ZEN_BASE_URL=https://opencode.ai/zen/v1
OPENCODE_ZEN_API_KEY=<server-side secret>
OPENCODE_ZEN_MODEL=deepseek-v4-flash
```

### Zen forçado

```env
LLM_PROVIDER=zen
OPENCODE_ZEN_BASE_URL=https://opencode.ai/zen/v1
OPENCODE_ZEN_API_KEY=<server-side secret>
OPENCODE_ZEN_MODEL=deepseek-v4-flash
```

Não criar `LLM_PRIMARY_PROVIDER`, `LLM_SECONDARY_PROVIDER`, provider chain, circuit breaker, percent routing, timeout específico de fallback ou retry de Zen.

## 6. Allowlist de fallback

Fallback automático só ocorre quando:

1. `LLM_PROVIDER=litellm`;
2. `LLM_FALLBACK_ENABLED=true`;
3. Zen está configurado;
4. a falha terminal do LiteLLM é elegível;
5. request não foi abortado externamente;
6. ainda resta orçamento total.

### Elegíveis

- `GATEWAY_BUDGET_EXCEEDED`;
- `GATEWAY_NOT_CONFIGURED` quando Zen estiver explicitamente habilitado e configurado;
- `GATEWAY_TIMEOUT` apenas se ainda houver orçamento total;
- `GATEWAY_INVALID_RESPONSE`;
- `GATEWAY_HTTP_ERROR` sem status (transporte/conectividade);
- `GATEWAY_HTTP_ERROR` 401/403;
- `GATEWAY_HTTP_ERROR` 408;
- `GATEWAY_HTTP_ERROR` 429;
- `GATEWAY_HTTP_ERROR` >= 500.

### Não elegíveis

- `GATEWAY_ABORTED`;
- HTTP 400/404/409/422;
- demais 4xx não allowlisted;
- falha de qualidade semântica após resposta aceita.

A decisão deve ser explícita e testável. Não inferir fallback apenas de `retryable=true`.

## 7. Orçamento total

O fallback reutiliza o orçamento já existente do request.

1. `callLLM` calcula deadline único no início.
2. LiteLLM recebe apenas orçamento restante.
3. Após falha elegível, recalcula o restante.
4. Zen só é chamado se houver tempo restante.
5. Zen recebe apenas o restante.
6. Se o primário consumir todo o budget, Zen não é chamado.

Não criar um segundo timeout independente para Zen.

## 8. Proveniência

Adicionar resultado mínimo de orquestração:

```ts
export type LLMProvider = 'litellm' | 'zen';

export interface LLMCallResult extends LiteLLMCallResult {
  provider: LLMProvider;
  servedModel: string;
  fallbackUsed: boolean;
  fallbackReason?: LiteLLMErrorCode;
}
```

Semântica:

- LiteLLM direto: `provider=litellm`, `fallbackUsed=false`.
- LiteLLM falha e Zen serve: `provider=zen`, `fallbackUsed=true`, `fallbackReason=<erro primário>`.
- Zen forçado: `provider=zen`, `fallbackUsed=false`.

Zen selecionado diretamente não equivale a fallback.

## 9. Telemetria e segurança

Allowlist server-side:

- `correlationId`;
- `runId`;
- `action`;
- `provider`;
- `servedModel`;
- `fallbackUsed`;
- `fallbackReason`;
- `primaryErrorCode` e `secondaryErrorCode` quando aplicáveis;
- duração/status já sanitizados.

Proibido registrar:

- Authorization;
- API keys/tokens;
- prompt/history;
- response body completo;
- conteúdo do dossiê;
- PII/CNPJ como payload específico de fallback.

A resposta pública de `/api/llm` não precisa ganhar novos campos nesta V1.

## 10. Fronteira de dados Zen

Aprovação vigente:

- Zen + `deepseek-v4-flash` pago pode atuar como provider secundário operacional permanente;
- mesmas classes de dados já autorizadas ao Scout;
- sem secrets em prompt/artefatos;
- telemetria allowlist;
- política vigente de retenção/região;
- mudança material da política reabre o gate;
- outro modelo/provider não herda automaticamente a aprovação.

STOP se houver retenção/logging/região/training incompatíveis, modelo efetivamente servido diferente sem explicação aceita, custo/quota inesperados ou necessidade de expandir dados/secrets.

## 11. Erros

- Primário falha e fallback não elegível: preservar erro LiteLLM.
- Primário falha, fallback habilitado, Zen não configurado: preservar erro original e registrar somente metadados seguros.
- Primário falha e Zen também falha: nunca voltar ao LiteLLM; devolver erro terminal do Zen e registrar códigos primário/secundário em telemetria allowlist.
- Zen forçado falha: devolver erro Zen diretamente.

## 12. Superfície de mudança esperada

- `api/_llm-client.ts`
- `api/llm.ts`
- `tests/api/llm-client.test.ts`
- `tests/api-llm.test.ts`
- `.env.example`
- docs de spec/plano

Nenhum arquivo novo de runtime é necessário.

## 13. Testes mínimos obrigatórios

### Cliente/orquestração

1. LiteLLM sucesso → Zen não chamado.
2. Zen forçado → LiteLLM não chamado.
3. budget exceeded → Zen uma vez.
4. 429 → Zen uma vez.
5. 5xx → Zen uma vez.
6. transporte sem status → Zen uma vez.
7. 401/403 → Zen uma vez.
8. 400/404/409/422 → Zen não chamado.
9. abort externo → Zen não chamado.
10. fallback false → Zen não chamado.
11. Zen não configurado → erro primário preservado.
12. Zen falha após fallback → LiteLLM não é chamado novamente.
13. Zen recebe somente orçamento restante.
14. budget esgotado no primário → Zen não chamado.
15. Zen zero retry.
16. `fallbackUsed=true` apenas em failover real.
17. Zen forçado → `fallbackUsed=false`.
18. `servedModel` usa valor upstream quando presente.
19. logs não contêm prompt/key/body sensível.

### Handler

1. `recordDiagnostics` continua independente do gateway.
2. action inválida continua 400.
3. sem provider utilizável continua 503 fail-closed.
4. `generateContent` usa `callLLM` uma vez.
5. `chatSendMessage` usa `callLLM` uma vez.
6. resposta pública segue compatível.
7. `module:end` registra proveniência allowlisted.
8. erro final segue SC-429/SC-429B sem expor upstream body.

### Regressão

```bash
npm run typecheck
npm run test
npm run test:contracts
npm run lint
npm run build
```

## 14. Preview e Golden

Após local/CI green, validar em Preview isolado no SHA exato.

Golden principal desta V1:

```text
LLM_PROVIDER=litellm
LLM_FALLBACK_ENABLED=true
Zen configurado
LiteLLM em budget exceeded ou outra falha elegível controlada
→ Zen/deepseek-v4-flash serve
→ fallbackUsed=true
→ lifecycle terminal correto
→ persistência final no Supabase Preview correto
→ qualidade/contrato PASS
→ UI final sem erro técnico
```

Teto: um run completo autorizado. Não repetir silenciosamente.

Modo Zen forçado deve ter smoke separado: zero request LiteLLM e `fallbackUsed=false`.

## 15. Rollback/failback

Desabilitar fallback automático:

```env
LLM_PROVIDER=litellm
LLM_FALLBACK_ENABLED=false
```

Outage prolongado:

```env
LLM_PROVIDER=zen
```

Retorno para LiteLLM após nova key segue BRU-144: probe 200, `LLM_PROVIDER=litellm`, smoke, `fallbackUsed=false`, zero Zen quando primário saudável.

## 16. Fora do escopo

- circuit breaker;
- health-check periódico;
- estado de saúde persistido;
- 3+ providers;
- weighted routing;
- failback automático por timer;
- dashboard novo;
- SDK OpenCode;
- migration/schema;
- mudança do modelo principal;
- fallback por quality gate;
- refactor amplo de `api/llm.ts`;
- merge automático;
- Golden de produção sem autorização específica.

## 17. Critérios de aceite

`READY FOR MERGE` somente quando:

- branch sincronizada com baseline vigente;
- `callLLM` separa política de `callLiteLLM`/`callZen`;
- LiteLLM permanece primário;
- Zen automático só por allowlist;
- Zen forçado funciona sem LiteLLM;
- zero fallback reverso;
- zero circuit breaker/registry/framework;
- Zen zero retry;
- orçamento total único respeitado;
- proveniência correta;
- telemetria sem secrets/prompt/body/PII;
- resposta pública compatível;
- unit/integration/contract gates PASS;
- Preview prova isolamento/provider;
- Golden autorizado prova fallback real + lifecycle + persistência + qualidade;
- smoke Zen forçado prova `fallbackUsed=false`;
- rollback/failback configurável e auditável;
- nenhum merge sem Bruno.

## 18. STOP

Retornar ao Planejador/Bruno se exigir novo provider, migration/schema, SDK/dependência, circuit breaker, mudança de contrato público, expansão de fronteira de dados, repetição de Golden, produção para provar algo possível no Preview, mudança material na política Zen, perda de reversibilidade ou alteração do objetivo/arquitetura.

## 19. Princípio de implementação

```text
entender fluxo existente
→ reaproveitar callLiteLLM + callZen + LLM_FALLBACK_ENABLED
→ adicionar somente callLLM + allowlist + proveniência mínima
→ TDD RED → GREEN → REFACTOR
→ gates locais/CI
→ Preview/Golden
→ READY FOR MERGE
→ STOP no merge lock
```

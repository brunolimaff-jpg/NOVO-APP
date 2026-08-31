# LLM Provider Fallback V1 — Design (SPEC)

**Status:** CONGELADA (após aprovação do Bruno em 2026-08-31)
**Autor do desenho:** Planejador (chat `6a957742`)
**Executor:** ZCode (DeepSeek V4 Flash)
**Tickets de referência:** BRU-137, BRU-138, BRU-139, BRU-140, BRU-141, BRU-142, BRU-143, BRU-144, BRU-145

---

## 1. Contexto e decisão

O LiteLLM (provider primário) está com a virtual key sem orçamento (`budget_exceeded`, 429
`LLM_BUDGET_EXCEEDED`). A contingência temporária OpenCode Zen (`LLM_PROVIDER=zen`, branch
`fix/llm-zen-temporary`) provou o protocolo [OI]-compatible com HTTP 200, mas **não** foi
desenhada para ser permanente (o `callLiteLLM()` roteia para Zen por `if` — "mentira semântica").

**Decisão do Bruno (2026-08-31):** aprovar o **Fallback V1** como fallback real e permanente de
provider, e **estender a fronteira de dados** para o OpenCode Zen (DeepSeek V4 Flash pago) como
provider secundário operacional permanente.

O desenho é assimétrico, explícito e mínimo (corte Ponytail/YAGNI):

```
LiteLLM continua sendo o primário.
OpenCode Zen/DeepSeek V4 Flash vira o secundário independente.
LLM_PROVIDER=zen permanece como modo operacional forçado para indisponibilidade prolongada.
```

**O que NÃO será construído agora (corte YAGNI):** ProviderRegistry, interface/plugin extensível,
health service, banco de saúde de providers, scheduler, circuit breaker, balanceamento percentual,
fallback multi-provider, dashboard novo, migration, SDK OpenCode, máquina de estados distribuída,
fallback dentro do próprio LiteLLM (fronteira única de falha — inferência arquitetural).

---

## 2. Contrato de configuração

| Configuração | Comportamento |
|---|---|
| `LLM_PROVIDER=litellm` + fallback off | somente LiteLLM |
| `LLM_PROVIDER=litellm` + `LLM_FALLBACK_ENABLED=true` | LiteLLM → Zen quando elegível |
| `LLM_PROVIDER=zen` | Zen direto, sem tocar LiteLLM |
| Zen indisponível/não configurado | nunca inventar terceiro caminho |

Env names:
- `LLM_FALLBACK_ENABLED=true` (liga o fallback automático)
- `OPENCODE_ZEN_BASE_URL=https://opencode.ai/zen/v1`
- `OPENCODE_ZEN_API_KEY` (server-side only; nunca `VITE_*`)
- `OPENCODE_ZEN_MODEL=deepseek-v4-flash`

Não criar `LLM_PRIMARY_PROVIDER`, `LLM_FALLBACK_PROVIDER` nem arrays de providers.

---

## 3. Arquitetura de código

Estrutura mínima em `api/_llm-client.ts`:

```
callLLM()                 ← política/orquestração mínima
├── callLiteLLM()         ← provider LiteLLM (sem if de provider)
└── callZen()             ← provider OpenCode Zen

callLLM() decide:
  provider forçado? (LLM_PROVIDER=zen)
      → callZen()
  senão:
      callLiteLLM()
        ↓ falha elegível (allowlist) + fallback habilitado
      callZen()
```

Regras:
- Remover o `if (env.LLM_PROVIDER === 'zen')` de dentro de `callLiteLLM()`.
- Zen: **1 tentativa, zero retry, zero Zen→LiteLLM**.
- LiteLLM mantém deadline + retry atual para erros elegíveis (orçamento padrão 38s).
- Zero circuit breaker e zero estado persistido de saúde no primeiro lote.

---

## 4. Allowlist de fallback (quando o Zen assume)

**Contrato de referência: BRU-147 (Linear).**

| Falha LiteLLM | Fallback |
|---|---|
| `GATEWAY_BUDGET_EXCEEDED` / 429 budget | ✅ imediato |
| 429 rate limit | ✅ após política existente |
| 401/403 (credencial/auth do primário) | ✅ |
| 408 / timeout upstream com orçamento restante | ✅ |
| 5xx | ✅ |
| falha de transporte/conexão sem status | ✅ |
| resposta inválida/vazia do provider (`GATEWAY_INVALID_RESPONSE`) | ✅ |
| configuração/credencial primária ausente (`GATEWAY_NOT_CONFIGURED`) | ✅ + alerta operacional alto |
| 400/404/409/422 causado pelo request | ❌ |
| demais 4xx não allowlisted | ❌ |
| cancelamento externo/usuário (`GATEWAY_ABORTED`) | ❌ |
| falha de qualidade semântica após output aceito | ❌ (responsabilidade do Gold/quality gate) |

**Orçamento total único por request (BRU-147):** o fallback NÃO dobra o timeout. Se o
primário já exauriu o orçamento (`GATEWAY_TIMEOUT` sem tempo restante), o fallback não
dispara; o Zen recebe apenas o tempo restante do orçamento original.

**Fallback de provider ≠ fallback de qualidade.** Resposta ruim continua sendo rejeitada pelo
Gold/quality gate; nunca reenviar automaticamente a mesma investigação para outro modelo.

**Modo forçado para outage prolongado:** fallback automático → operador identifica condição
persistente → `LLM_PROVIDER=zen` → LiteLLM deixa de receber tráfego.

---

## 5. Proveniência (rastro operacional)

O resultado interno de `callLLM()` (caminho não-legado) carrega:

```
provider: 'litellm' | 'zen'
servedModel: string
fallbackUsed: boolean
fallbackReason?: string (código allowlisted)
```

Invariantes:
- LiteLLM OK → `provider=litellm`, `fallbackUsed=false`
- LiteLLM FAIL → Zen OK → `provider=zen`, `servedModel=deepseek-v4-flash`, `fallbackUsed=true`, `fallbackReason=<código>`
- `LLM_PROVIDER=zen` → Zen OK → `provider=zen`, `fallbackUsed=false`

**`fallbackUsed=true` significa: primário tentado, falhou de forma elegível e o secundário
concluiu.** Usar Zen ≠ usar fallback.

Contrato HTTP público preservado (`{ text, _model, usage, finishReason }`). A correção necessária:
`_model` deve reportar o **modelo servido** (`servedModel`), não o modelo lógico pré-call. A
proveniência completa fica em log/telemetria server-side.

---

## 6. Fronteira de dados (extensão aprovada)

A aprovação anterior (`DATA_BOUNDARY_APPROVED=YES`, BRU-142) era **temporária** (Golden Preview).
A extensão agora aprovada permite o Zen como **provider secundário operacional permanente** com:

- mesmas classes de dados já autorizadas ao Scout;
- sem secrets no cliente;
- telemetria por allowlist;
- política de retenção/região vigente;
- **STOP se a política do Zen mudar**.

O Golden (BRU-143) segue como único Golden Preview reconciliando provider/modelo/lifecycle/
persistência/qualidade. BRU-144 (rollback para LiteLLM) permanece outro gate: nova key → probe 200
→ `LLM_PROVIDER=litellm` → zero tráfego Zen depois da troca.

---

## 7. DeepSeek V4 Flash ilimitado (executor)

Tokens ilimitados valem para o **executor** (ZCode: leitura repo-wide, TDD, implementação,
revisão). O **Zen usado pelo Scout** continua sendo provider operacional com contrato próprio de
custo/dados. Não misturar os dois.

---

## 8. Critérios de aceite (implementação)

1. `callLLM()` decide por política; `callLiteLLM`/`callZen` são blocos provider puros.
2. Fallback dispara somente por allowlist (seção 4).
3. Zen: 1 tentativa; zero retry; zero Zen→LiteLLM.
4. Proveniência presente no resultado interno (provider/servedModel/fallbackUsed/fallbackReason).
5. `_model` HTTP = modelo servido.
6. Gate `/api/llm` aceita: LiteLLM habilitado **ou** Zen forçado **ou** fallback habilitado+Zen configurado.
7. Contrato HTTP público preservado (mesmos campos; `_model` corrigido para modelo servido).
8. Testes: allowlist (todos os casos da tabela), zen sem retry, forçado zen, fallback ligado/desligado,
   proveniência, gate 503, sem vazamento de secret.

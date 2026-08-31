# LLM Provider Fallback V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar fallback permanente LiteLLM → OpenCode Zen/DeepSeek V4 Flash com allowlist, Zen forçado, proveniência e orçamento único, preservando compatibilidade e merge lock.

**Architecture:** `callLLM` será a política mínima sobre dois providers concretos: `callLiteLLM` e `callZen`. LiteLLM permanece primário; Zen é chamado automaticamente somente para falhas allowlisted com fallback habilitado e budget restante, ou diretamente quando `LLM_PROVIDER=zen`.

**Tech Stack:** TypeScript, Vercel serverless, fetch nativo, Vitest, npm, OpenAI-compatible `/chat/completions`.

**Spec:** `docs/superpowers/specs/2026-08-31-llm-provider-fallback-design.md`

## Global Constraints

- LiteLLM primário; Zen secundário automático.
- `LLM_PROVIDER=zen` = Zen direto, `fallbackUsed=false`.
- Zero Zen → LiteLLM.
- Zero circuit breaker.
- Zero registry/factory/provider chain.
- Zero SDK/dependência nova.
- Zen = 1 tentativa, zero retry.
- Fallback somente por allowlist explícita.
- Um orçamento total por request.
- Sem migration/schema.
- Telemetria allowlist; sem secrets/prompt/body/PII.
- Data boundary aprovada somente para Zen pago `deepseek-v4-flash` nas classes já autorizadas ao Scout.
- Merge final proibido sem autorização explícita de Bruno.

---

### Task 1: Sincronizar baseline e preservar delta Zen

**Files:**
- Inspect: `api/_llm-client.ts`
- Inspect: `api/llm.ts`
- Inspect: `tests/api/llm-client.test.ts`
- Inspect: `tests/api-llm.test.ts`
- Inspect: `.env.example`

**Interfaces:**
- Consumes: `main@b6fa24c5ba5e24d723330ad8ff1e01b7c3310e9c` e branch `fix/llm-zen-temporary`.
- Produces: branch sincronizada com o baseline vigente, sem perder o cliente Zen existente nem mudanças posteriores de main.

- [ ] **Step 1: Confirmar identidade antes da mutação**

Run:
```bash
git status --short
git branch --show-current
git rev-parse HEAD
git fetch origin
git rev-parse origin/main
```
Expected: branch `fix/llm-zen-temporary`; worktree limpo; `origin/main` igual ao baseline informado ou sucessor explicitamente aceito pelo Planejador.

- [ ] **Step 2: Inspecionar divergência antes do rebase**

Run:
```bash
git log --oneline --decorate --graph --max-count=20 --all
git diff --stat origin/main...HEAD
```
Expected: delta Zen/documentação identificável; nenhuma mudança inesperada escondida.

- [ ] **Step 3: Rebasear sobre main**

Run:
```bash
git rebase origin/main
```
Expected: rebase concluído. Em conflito, preservar semanticamente SC-429/SC-429B do main + cliente Zen; não escolher silenciosamente conflito material.

- [ ] **Step 4: Confirmar delta pós-rebase**

Run:
```bash
git diff --stat origin/main...HEAD
git status --short
```
Expected: apenas Zen/fallback/docs e deltas correlatos; worktree limpo.

- [ ] **Step 5: Rodar baseline direcionado**

Run:
```bash
npm test -- tests/api/llm-client.test.ts tests/api-llm.test.ts
npm run typecheck
```
Expected: PASS antes de adicionar o fallback novo. Se falhar por rebase, corrigir apenas regressão de integração antes de seguir.

- [ ] **Step 6: Checkpoint**

Run:
```bash
git add -A
git commit -m "chore(llm): sync Zen branch with current main"
```
Expected: commit apenas se houver resolução/materialização pós-rebase ainda não registrada.

---

### Task 2: Criar política mínima `callLLM` por TDD

**Files:**
- Modify: `tests/api/llm-client.test.ts`
- Modify: `api/_llm-client.ts`

**Interfaces:**
- Consumes: `callLiteLLM`, cliente Zen existente, `LLM_FALLBACK_ENABLED`, `LiteLLMRequestError`.
- Produces:
```ts
export type LLMProvider = 'litellm' | 'zen';
export interface LLMCallResult extends LiteLLMCallResult {
  provider: LLMProvider;
  servedModel: string;
  fallbackUsed: boolean;
  fallbackReason?: LiteLLMErrorCode;
}
export function callLLM(input: LiteLLMCallInput, env?: Environment): Promise<LLMCallResult>;
```

- [ ] **Step 1: RED — LiteLLM saudável não chama Zen**

Adicionar teste que configure `LLM_PROVIDER=litellm`, `LLM_FALLBACK_ENABLED=true`, faça LiteLLM responder 200 e afirme `provider='litellm'`, `fallbackUsed=false` e somente uma chamada ao endpoint LiteLLM.

Run:
```bash
npm test -- tests/api/llm-client.test.ts
```
Expected: FAIL porque `callLLM` ainda não existe.

- [ ] **Step 2: GREEN mínimo — introduzir tipos e `callLLM` sem fallback**

Implementar apenas o wrapper para LiteLLM saudável e Zen forçado. Não adicionar allowlist ainda.

Run:
```bash
npm test -- tests/api/llm-client.test.ts
```
Expected: teste do caminho saudável PASS.

- [ ] **Step 3: RED — Zen forçado não toca LiteLLM**

Adicionar teste com `LLM_PROVIDER=zen`, envs Zen completos; afirmar uma chamada Zen, zero LiteLLM, `provider='zen'`, `fallbackUsed=false`.

Run e confirmar FAIL pelo comportamento ainda ausente/incompleto.

- [ ] **Step 4: GREEN — Zen direto**

Ajustar `callLLM` para delegar diretamente a `callZen` quando provider for `zen`. `callZen` permanece 1 tentativa e sem conhecimento de LiteLLM.

Run:
```bash
npm test -- tests/api/llm-client.test.ts
```
Expected: PASS.

- [ ] **Step 5: RED — allowlist de fallback**

Criar casos separados para:
- `GATEWAY_BUDGET_EXCEEDED` → fallback;
- HTTP 429 → fallback;
- HTTP >=500 → fallback;
- erro de transporte sem status → fallback;
- HTTP 401/403 → fallback;
- `GATEWAY_INVALID_RESPONSE` → fallback;
- HTTP 400/404/409/422 → sem fallback;
- `GATEWAY_ABORTED` → sem fallback;
- `LLM_FALLBACK_ENABLED=false` → sem fallback;
- Zen ausente → erro primário preservado.

Cada teste deve primeiro falhar pelo comportamento ausente.

- [ ] **Step 6: GREEN — função local de elegibilidade**

Implementar uma função local explícita, por exemplo:
```ts
function isZenFallbackEligible(error: LiteLLMRequestError): boolean {
  if (error.code === 'GATEWAY_ABORTED') return false;
  if (error.code === 'GATEWAY_BUDGET_EXCEEDED') return true;
  if (error.code === 'GATEWAY_NOT_CONFIGURED') return true;
  if (error.code === 'GATEWAY_TIMEOUT') return true;
  if (error.code === 'GATEWAY_INVALID_RESPONSE') return true;
  if (error.code !== 'GATEWAY_HTTP_ERROR') return false;
  if (error.status === undefined) return true;
  if (error.status === 401 || error.status === 403 || error.status === 408 || error.status === 429) return true;
  return error.status >= 500;
}
```
Não generalizar além desses dois providers.

Run:
```bash
npm test -- tests/api/llm-client.test.ts
```
Expected: PASS dos casos da allowlist.

- [ ] **Step 7: RED — zero fallback reverso**

Simular LiteLLM elegível → Zen falha. Afirmar que fetch total não volta a LiteLLM e o erro final vem de Zen.

Run e confirmar FAIL se necessário.

- [ ] **Step 8: GREEN — erro secundário terminal**

Garantir que `callLLM` não tenha loop e nunca reentre no primário após iniciar Zen.

Run testes direcionados e confirmar PASS.

- [ ] **Step 9: Commit**

```bash
git add api/_llm-client.ts tests/api/llm-client.test.ts
git commit -m "feat(llm): add permanent LiteLLM to Zen fallback policy"
```

---

### Task 3: Preservar um único orçamento total e proveniência

**Files:**
- Modify: `tests/api/llm-client.test.ts`
- Modify: `api/_llm-client.ts`

**Interfaces:**
- Consumes: `callLLM` da Task 2 e helpers de timeout já existentes.
- Produces: deadline único, `servedModel`, `fallbackReason` e `fallbackUsed` semanticamente corretos.

- [ ] **Step 1: RED — Zen recebe somente budget restante**

Usar fake timers/clock controlado. LiteLLM deve consumir parte do timeout antes de falhar elegivelmente; afirmar que a tentativa Zen recebe timeout menor que o inicial e não ganha um segundo budget completo.

Run:
```bash
npm test -- tests/api/llm-client.test.ts
```
Expected: FAIL antes do budget compartilhado.

- [ ] **Step 2: GREEN — deadline calculado em `callLLM`**

Calcular o budget uma vez no wrapper e passar `timeoutMs` restante ao provider primário e secundário. Reutilizar helpers existentes; não criar nova env de timeout.

- [ ] **Step 3: RED — budget esgotado bloqueia Zen**

Teste: primário termina com timeout quando não resta tempo; afirmar zero chamada Zen.

- [ ] **Step 4: GREEN — fail closed no budget**

Se `remaining <= 0`, preservar/emitir timeout sem chamar Zen.

- [ ] **Step 5: RED — proveniência**

Testar:
- LiteLLM direto: `provider=litellm`, `fallbackUsed=false`;
- fallback real: `provider=zen`, `fallbackUsed=true`, `fallbackReason=<primário>`;
- Zen forçado: `provider=zen`, `fallbackUsed=false`;
- upstream fornece `model`: `servedModel` reflete o modelo efetivamente servido.

- [ ] **Step 6: GREEN — metadata mínima**

Extrair `model` da resposta OpenAI-compatible quando presente e retornar metadata no resultado interno. Não alterar resposta pública ainda.

- [ ] **Step 7: RED — logs não vazam conteúdo**

Interceptar `console.*`; provocar fallback e falha secundária com strings marcadoras em prompt/body/key. Afirmar que marcadores não aparecem em payloads estruturados de log.

- [ ] **Step 8: GREEN — telemetry allowlist local**

Logar somente códigos/provider/model/run/action/duração/status sanitizado. Remover qualquer inclusão nova de body/prompt/history.

- [ ] **Step 9: Commit**

```bash
git add api/_llm-client.ts tests/api/llm-client.test.ts
git commit -m "feat(llm): add fallback provenance and shared request budget"
```

---

### Task 4: Integrar `callLLM` ao `/api/llm` sem quebrar contrato público

**Files:**
- Modify: `tests/api-llm.test.ts`
- Modify: `api/llm.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `callLLM`/`LLMCallResult`.
- Produces: handler usando a política única e telemetria allowlisted, sem expor provider novo na API pública.

- [ ] **Step 1: RED — handler chama `callLLM`**

Atualizar mock para `callLLLMMock` e escrever testes que `generateContent` e `chatSendMessage` chamam `callLLM` exatamente uma vez.

Run:
```bash
npm test -- tests/api-llm.test.ts
```
Expected: FAIL enquanto handler ainda usa `callLiteLLM`.

- [ ] **Step 2: GREEN — substituir dependência concreta**

Trocar imports/chamadas para `callLLM`; preservar seleção server-side de modelo, leak shield e contratos existentes.

- [ ] **Step 3: RED — gate aceita primário com fallback ou Zen forçado**

Provar:
- nenhum provider utilizável → 503 fail-closed;
- LiteLLM configurado → permitido;
- Zen forçado configurado → permitido;
- fallback habilitado sem Zen completo não deve fingir disponibilidade secundária.

- [ ] **Step 4: GREEN — gate mínimo**

Reusar `isLiteLLMEnabled`/`isZenEnabled`; não criar registry.

- [ ] **Step 5: RED — contrato público permanece compatível**

Retorno deve continuar contendo `text`, `_model`, `usage`, `finishReason`, sem exigir `provider/fallbackUsed` no payload cliente.

- [ ] **Step 6: GREEN — telemetria server-side**

Em `module:end`, incluir apenas `provider`, `servedModel`, `fallbackUsed`, `fallbackReason` quando disponíveis. Não registrar conteúdo.

- [ ] **Step 7: RED — SC-429/SC-429B preservado quando fallback final falha**

Provocar erro terminal e provar que upstream body não aparece na resposta.

- [ ] **Step 8: Atualizar `.env.example`**

Documentar Zen como fallback permanente, manter nomes atuais e remover linguagem de contingência temporária. Não criar knobs novos.

- [ ] **Step 9: Run**

```bash
npm test -- tests/api-llm.test.ts tests/api/llm-client.test.ts
npm run typecheck
```
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add api/llm.ts api/_llm-client.ts tests/api-llm.test.ts tests/api/llm-client.test.ts .env.example
git commit -m "feat(llm): integrate permanent Zen fallback into API gateway"
```

---

### Task 5: Gates completos e auditoria de delta

**Files:**
- No new runtime files expected.

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: candidato local/CI verificável antes de Preview.

- [ ] **Step 1: Rodar suites direcionadas novamente**

```bash
npm test -- tests/api/llm-client.test.ts tests/api-llm.test.ts
```
Expected: PASS.

- [ ] **Step 2: Rodar regressão completa requerida**

```bash
npm run typecheck
npm run test
npm run test:contracts
npm run lint
npm run build
```
Expected: todos PASS. Não reduzir gates.

- [ ] **Step 3: Auditar diff Ponytail/YAGNI**

```bash
git diff --stat origin/main...HEAD
git diff origin/main...HEAD -- api/_llm-client.ts api/llm.ts .env.example tests/api/llm-client.test.ts tests/api-llm.test.ts
```
Rejeitar: registry/factory/provider array/circuit breaker/SDK/new dependency/refactor lateral.

- [ ] **Step 4: Verificar ausência de segredo**

```bash
git grep -n "OPENCODE_ZEN_API_KEY=" -- . ':!node_modules'
git grep -nE "Bearer [A-Za-z0-9._-]{8,}|sk-[A-Za-z0-9_-]{6,}" -- . ':!node_modules'
```
Expected: somente placeholder/documentação segura; nenhum valor real.

- [ ] **Step 5: Push checkpoint remoto**

```bash
git push --force-with-lease origin fix/llm-zen-temporary
```
Expected: branch remota atualizada. Registrar SHA exato.

- [ ] **Step 6: Abrir/atualizar Draft PR**

Draft PR contra `main`, com spec, plano, Linear parent e filhos, gates e merge lock. Não marcar ready antes dos gates Preview/Golden.

---

### Task 6: Preview isolado e Golden único de fallback real

**Files/Systems:**
- Vercel Preview branch-specific.
- Supabase Preview `xlvsrnbynpawgfapowec`.
- Linear evidence.

**Interfaces:**
- Consumes: candidato exato + BRU-141/145 concluídos + data boundary permanente aprovada.
- Produces: evidência cross-system de fallback real no SHA/deployment exato.

- [ ] **Step 1: Confirmar identidade do Preview**

Registrar branch, SHA, deployment ID, ambiente e Supabase ref. Produção permanece read-only/sem DDL-DML desta missão.

- [ ] **Step 2: Configurar Preview**

```text
LLM_PROVIDER=litellm
LLM_FALLBACK_ENABLED=true
OPENCODE_ZEN_BASE_URL=https://opencode.ai/zen/v1
OPENCODE_ZEN_API_KEY=<secret server-side>
OPENCODE_ZEN_MODEL=deepseek-v4-flash
```
READ-BACK sem expor secrets.

- [ ] **Step 3: Smoke controlado sem Golden**

Confirmar `/api/llm` saudável e telemetria capaz de distinguir provider. Não consumir o único Golden ainda.

- [ ] **Step 4: Golden único autorizado**

Executar exatamente um dossiê completo no cenário em que LiteLLM falha por condição elegível conhecida/controlada e Zen assume.

Provar no mesmo SHA/deployment:
- LiteLLM foi primário;
- fallback abriu uma vez;
- Zen serviu `deepseek-v4-flash`;
- `fallbackUsed=true`;
- `fallbackReason` correto;
- lifecycle terminal correto;
- uma única execução/idempotency flow;
- persistência final no Supabase Preview correto;
- quality/contrato do dossiê PASS;
- UI termina sem erro técnico;
- nenhuma evidência contém body/prompt/key/PII.

Não repetir o Golden sem voltar ao Bruno.

- [ ] **Step 5: Smoke Zen forçado**

Alterar Preview de forma reversível para `LLM_PROVIDER=zen`; provar zero LiteLLM e `fallbackUsed=false`; restaurar configuração aprovada após prova.

- [ ] **Step 6: Registrar evidências**

Registrar SHA/deployment, logs allowlisted, estado terminal, IDs de run sem conteúdo sensível, query/read-back do Supabase Preview e resultado dos gates.

---

### Task 7: Failback/rollback e READY FOR MERGE

**Files/Systems:**
- Vercel env/runtime.
- Linear.
- GitHub PR/CI.

**Interfaces:**
- Consumes: Golden PASS; nova LiteLLM key somente quando disponível.
- Produces: reversibilidade provada e estado `READY FOR MERGE`, nunca merge automático.

- [ ] **Step 1: Confirmar desativação simples do fallback**

Configuração prevista:
```text
LLM_PROVIDER=litellm
LLM_FALLBACK_ENABLED=false
```
Provar em Preview que Zen não recebe tráfego quando LiteLLM saudável.

- [ ] **Step 2: Executar BRU-144 quando nova key existir**

Probe LiteLLM 200 → `LLM_PROVIDER=litellm` → smoke → `fallbackUsed=false` → Zen requests=0. Se não houver key válida, classificar BRU-144 como bloqueado; isso não autoriza inventar credencial.

- [ ] **Step 3: Reconciliar cross-system**

Linear contrato/tickets → GitHub branch/SHA/Draft PR/CI → Vercel deployment/runtime → Supabase Preview → Golden/gates.

- [ ] **Step 4: Classificar gates**

Cada gate: PASS / PASS COM RESSALVAS / FAIL / BLOCKED / NOT VERIFIED / N/A, com evidência.

- [ ] **Step 5: Atualizar Linear**

Registrar realizado, evidências, desvios, riscos restantes e pendências. Não marcar como provado o que estiver apenas alegado.

- [ ] **Step 6: READY FOR MERGE**

Somente se todos os critérios da spec estiverem PASS. Parar no merge lock e solicitar autorização explícita de Bruno para merge final.

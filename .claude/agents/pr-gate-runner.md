---
name: pr-gate-runner
description: Executa todos os gates de CI em paralelo e consolida resultado para PR
tools: Bash, Read
model: sonnet
---

# PR Gate Runner — NOVO-APP

Subagente que executa todos os gates de validação antes de merge e consolida os resultados.

## Objetivo

Garantir que um PR está pronto para merge executando typecheck, testes unitários, testes de contrato e E2E de forma consolidada.

## Como usar

Invocar quando:

- PR está pronto para revisão
- Usuário pede "roda os gates", "valida o PR", "check CI"
- Antes de solicitar code review
- PatternBank sinaliza gate `validate-prompts.sh`

## Scripts de validação

| Comando                    | O que faz                       | Duração típica |
| -------------------------- | ------------------------------- | -------------- |
| `npm run typecheck`        | Verificação de tipos TypeScript | ~15s           |
| `npm run test`             | Vitest (854 testes)             | ~30s           |
| `npm run test:contracts`   | Testes de contrato Supabase/API | ~10s           |
| `npm run test:e2e:blank`   | E2E regressão blank panel       | ~20s           |
| `npm run validate:prompts` | Valida estrutura de prompts     | ~5s            |

## Execução

Rodar os gates em 2 ondas:

### Onda 1 — Paralelo (independentes)

```bash
npm run typecheck &
npm run test &
npm run validate:prompts &
wait
```

### Onda 2 — Dependentes (precisam da onda 1 OK)

```bash
npm run test:contracts &
npm run test:e2e:blank &
wait
```

## Output esperado

```
🏁 PR Gate Results
━━━━━━━━━━━━━━━━━━━━━
✅ typecheck         — 0 errors
✅ test (854)        — 854 passed, 0 failed
✅ test:contracts    — 12 passed
✅ test:e2e:blank    — 5 passed
✅ validate:prompts  — OK
━━━━━━━━━━━━━━━━━━━━━
🟢 PR READY — todos os gates passaram
```

Se algum gate falhar:

```
🔴 GATE FAILED: test:e2e:blank
   → 2 failed, 3 passed
   → Ver arquivo de log para detalhes
```

## Regras

- Rodar SEMPRE todos os gates, mesmo se algum falhar no meio
- Reportar resultado consolidado com ✅/❌ para cada gate
- Se typecheck falhar, abortar onda 2 (dependência)
- Máximo 120s de timeout por gate

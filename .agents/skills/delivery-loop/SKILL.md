---
name: delivery-loop
description: >-
  Orquestrador de entrega NOVO-APP até REPORT_READY (dossiê funcional no preview Vercel).
  Alias /ship-loop. Autonomia inclui commit/push; merge manual com token MERGE.
---

# delivery-loop

Skill canônica do ciclo de entrega Senior Scout 360. **Para em `REPORT_READY`** — dossiê funcional no preview Vercel; merge continua **100% manual** com token **MERGE** na mensagem atual do usuário.

**Spec:** `docs/plans/2026-06-23-delivery-loop-design.md`  
**Decisão:** DI-2026-06-23-01 em `.agents/memory/decisions.md`

## Quando usar

- Bruno diz: "roda o loop", "ship-loop até report-ready", `/ship-loop`, `/delivery-loop`
- Entrega fechável: investigar → implementar → gates → PR → preview → gate live → handoff
- Retomar de fase intermediária com `--from`

## O que NÃO fazer

- **Nunca** `gh pr merge` / squash / auto-merge sem **MERGE** na mensagem atual
- **Nunca** escrever senha em skill, HANDOFF, commits ou chat versionado
- **Nunca** usar localhost como gate final da Fase 6 — só preview Vercel (`BASE_URL` https)
- **Não** tratar `critical-ux` 16/16 como substituto do gate live `report-ready`
- **Não** incluir gate de qualidade Scheffer/golden/PORTA no loop automático
- **Não** automatizar benchmark/rotação LiteLLM (`litellm-experiment-loop` deprecated)

---

## Fases 0–8 e estado terminal

| Fase  | Nome                  | Agente                         | Saída                          | Falha →                     |
| ----- | --------------------- | ------------------------------ | ------------------------------ | --------------------------- |
| **0** | Detectar estado       | Skill                          | `START_PHASE`                  | —                           |
| **1** | Plano / investigação  | `planner` ou `debugger`        | Plano ou RCA                   | Repetir até aprovação       |
| **2** | Implementar           | `implementer`                  | Diff pronto                    | —                           |
| **3** | Gates locais          | `validator` + `validate-gates` | APROVADO                       | Fase 2                      |
| **4** | Review branch         | `reviewer`                     | PRONTO / AJUSTES               | Fase 2 (quick-fix **pula**) |
| **5** | PR + push + preview   | `commit-pr` (global)           | PR URL + SHA deploy            | Fase 2 ou 7                 |
| **6** | **report-ready live** | `validator` (E2E)              | 5 critérios OK                 | Fase 2                      |
| **7** | Comentários PR        | `gh-resolve-pr-comments`       | Threads respondidas            | Fase 2                      |
| **8** | Handoff               | `doc-handoff` (`compact-pr`)   | HANDOFF + memory               | —                           |
| **∞** | **REPORT_READY**      | —                              | Relatório + "digite **MERGE**" | Nunca merge auto            |

### Flags `--from` (comando `/ship-loop`)

| Flag              | Retoma em                 |
| ----------------- | ------------------------- |
| `--from plan`     | Fase 1                    |
| `--from gates`    | Fase 3                    |
| `--from preview`  | Fase 6                    |
| `--from comments` | Fase 7                    |
| _(sem flag)_      | Fase 0 detecta e continua |
| `PR #N`           | Fases 5–7 focadas na PR   |

### Watch Fases 5→6

Antes da Fase 6, rodar:

```bash
./scripts/ship-loop-watch.sh <PR_NUMBER> [EXPECTED_SHA] [PREVIEW_URL]
```

Só avançar quando CI verde **e** preview servir SHA = HEAD da PR. Integrar com skill global `/loop` se o wait for longo.

---

## Variantes

| Variante         | Flag                          | Fases             | Gate Fase 6       |
| ---------------- | ----------------------------- | ----------------- | ----------------- |
| **investigate**  | `--variant investigate`       | 0→1→8             | Nenhum            |
| **quick-fix**    | `--variant quick-fix`         | 0→2→3→**5**→6→8   | report-ready live |
| **feature**      | `--variant feature` (default) | 0→1→2→3→4→5→6→7→8 | report-ready live |
| **pr-gate-only** | `--from preview PR#N`         | 0→5→6→7→8         | report-ready live |

---

## Gate Fase 6: `report-ready` live

### Cinco critérios (todos obrigatórios)

Preview Vercel, IA real, CNPJ Scheffer `04.733.767/0001-80`:

1. **Waterfall iniciou** — `loading-smart-overlay`, `inline-loading-bubble` ou `cofre-overlay` visível
2. **Loading encerrado** — os três overlays **não** visíveis
3. **Relatório visível** — `[data-testid="bot-message-content"]` em `chat-main-panel`
4. **Conteúdo mínimo** — `innerText.length >= 500`
5. **Composer utilizável** — `chat-input` **não** disabled

### Fora do gate

PORTA markers, golden, socio-search metrics, qualidade de redação, LiteLLM fallback.

### Auth e secrets

| Variável                          | Uso               | Origem                                                                   |
| --------------------------------- | ----------------- | ------------------------------------------------------------------------ |
| `E2E_OPERATOR_EMAIL`              | Email operador    | Default: `bruno.ferreira@senior.com.br`; CI: `GOLDEN_E2E_OPERATOR_EMAIL` |
| `E2E_AUTH_PASSWORD`               | Senha Supabase    | Local: env; CI: `GOLDEN_E2E_AUTH_PASSWORD`                               |
| `E2E_REAL_AUTH`                   | `1` obrigatório   | Proíbe bypass localStorage                                               |
| `BASE_URL`                        | Preview https     | Obrigatório                                                              |
| `E2E_DEPLOYMENT_SHA`              | Confirma bundle   | Recomendado                                                              |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Bypass protection | Se preview protegido                                                     |
| `REPORT_READY_TIMEOUT_MS`         | Override timeout  | Default **390000** (330s + 60s buffer)                                   |

### Comando

```bash
BASE_URL=https://...preview.vercel.app \
E2E_REAL_AUTH=1 \
E2E_OPERATOR_EMAIL=bruno.ferreira@senior.com.br \
E2E_AUTH_PASSWORD="$E2E_AUTH_PASSWORD" \
E2E_DEPLOYMENT_SHA=<sha40> \
npm run test:e2e:report-ready
```

Arquivos: `tests-e2e/report-ready.spec.ts`, `tests-e2e/helpers/report-ready.ts`

### critical-ux vs report-ready

| Gate                  | Modo | Prova                  | Uso                                |
| --------------------- | ---- | ---------------------- | ---------------------------------- |
| **critical-ux 16/16** | Stub | UX Cofre/overlay       | Regressão rápida; **complementar** |
| **report-ready**      | Live | Dossiê real no preview | **Fase 6 default**                 |

---

## Dispatch de subagentes

Usar `Task(subagent_type=...)` **sem** parâmetro `model` (Composer inherit):

| Situação                    | Agente                  |
| --------------------------- | ----------------------- |
| Demanda nova, escopo grande | `planner`               |
| Erro / regressão            | `debugger`              |
| Código a escrever           | `implementer`           |
| Validação / E2E             | `validator`             |
| UI explícito                | `ui-ux` + `implementer` |
| Review diff                 | `reviewer`              |
| Fim de sessão               | `doc-handoff`           |

Integrações globais (fora do repo): `commit-pr`, `gh-resolve-pr-comments`, `/loop`, `validate-gates`.

---

## Autonomia

**Autônomo** quando Bruno autoriza ("roda o loop"): investigar, implementar, gates, review, **commit+push+PR**, watch preview, **report-ready live**, responder review, handoff.

**Sempre manual:** merge em `main` (token **MERGE**), validação qualidade Scheffer/golden, benchmark LiteLLM.

### Loop interno

Falha Fase 3, 4 ou 6 → `implementer` corrige → repete fase até verde.

### Git safety

- Máximo 7 commits locais sem push/PR
- Nunca `--no-verify`, force push em main
- Respeitar `git-safety.mdc`

---

## Estado terminal REPORT_READY

Quando Fase 6 passa, reportar:

```
REPORT_READY
- PR: #N <url>
- Preview: <BASE_URL>
- SHA deploy: <sha>
- Gate: report-ready ✅ (N chars, CNPJ Scheffer)
- Próximo passo: digite MERGE na mensagem para mergear em main
```

**Nunca** mergear automaticamente.

---

## Dual environment (Cursor vs Claude Code)

### Cursor IDE

1. Comando: `~/.cursor/commands/ship-loop.md` (alias `/ship-loop`)
2. Ler esta skill com `Read` em `.agents/skills/delivery-loop/SKILL.md`
3. Subagentes via ferramenta nativa `Task(subagent_type=...)` — ver `cursor-subagent-routing.mdc`
4. Não existe `Skill()` nativo — sempre `Read` do SKILL.md

### Claude Code

1. Comando: `~/.claude/commands/delivery-loop.md` (thin wrapper)
2. Invocar `Skill(delivery-loop)` — espelho em `.claude/skills/delivery-loop/SKILL.md`
3. Subagentes via `Agent` / dispatch Claude Code
4. Mesma lógica de fases e REPORT_READY

Ambos ambientes compartilham: spec, gate E2E, `ship-loop-watch.sh`, secrets via env — **nunca em arquivo versionado**.

---

## Referências

- `AGENTS.md` — merge guard, learned preferences
- `tests-e2e/scheffer-research-validation.spec.ts` — live completo + qualidade (**fora do loop**)
- `tests-e2e/litellm-live-parallel.spec.ts` — padrão live parcial
- `features/dossier/waterfall-orchestrator.ts` — `WATERFALL_HARD_CAP_MS = 330_000`
- `docs/ai-context/refactor/loading-panel-contract.md` — contrato painel/loading

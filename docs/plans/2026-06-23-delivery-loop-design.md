# delivery-loop — Design e Spec v1

**Data:** 2026-06-23  
**Status:** Aprovado (Bruno — 3 seções + timeout B)  
**Projeto:** NOVO-APP / Senior Scout 360  
**Alias:** `/ship-loop` (compatível com comando Cursor e `AGENTS.md`)

---

## 1. Contexto e objetivo

O Bruno repete um fluxo de entrega em quase toda sessão: investigar ou planejar → implementar → gates locais → review → commit/push/PR → esperar preview Vercel → validar no preview → responder review → handoff → merge manual.

Hoje esse fluxo está **documentado** em `AGENTS.md` e no comando `~/.cursor/commands/ship-loop.md`, mas a **skill canônica** (`.agents/skills/ship-loop/SKILL.md`) e o script de watch **não existem** no repo. O comando aponta para fonte da verdade ausente.

**Objetivo do delivery-loop:** automatizar o ciclo repetitivo até um critério funcional claro — **dossiê visível no preview Vercel** — sem gate de qualidade de conteúdo e sem amarrar a LiteLLM. Merge continua **100% manual** com token **MERGE** na mensagem do usuário.

**Público:** PM sênior (Bruno) que supervisiona, não codifica. Linguagem e checkpoints pensados para decisão de negócio, não para detalhe de implementação.

---

## 2. Decisões fixas

| #   | Decisão                   | Detalhe                                                                                               |
| --- | ------------------------- | ----------------------------------------------------------------------------------------------------- |
| D1  | **Nome**                  | `delivery-loop` (canônico); alias `/ship-loop`                                                        |
| D2  | **Autonomia**             | Até **`REPORT_READY`** — dossiê funcional no preview; merge manual                                    |
| D3  | **Sem gate de qualidade** | Scheffer/golden/PORTA/CNPJs no texto ficam **fora** do loop automático                                |
| D4  | **Sem LiteLLM no loop**   | Troca de provedor é pontual; `litellm-experiment-loop` **deprecated**                                 |
| D5  | **Gate Fase 6**           | **`report-ready` live** — CNPJ Scheffer fixo, IA real do preview, auth Supabase                       |
| D6  | **CNPJ fixo**             | `04.733.767/0001-80` (Scheffer)                                                                       |
| D7  | **Auth**                  | Email `bruno.ferreira@senior.com.br`; senha **somente** via env/secrets — nunca em arquivo versionado |
| D8  | **Timeout gate**          | Waterfall wait **330s** + buffer **60s** = **390000ms** default; override `REPORT_READY_TIMEOUT_MS`   |
| D9  | **Arquitetura**           | **Híbrida:** skill versionada + comando Cursor + subagentes `Task()` existentes                       |
| D10 | **Commit/push**           | Incluído na autonomia quando Bruno diz “roda o loop” / “ship-loop até report-ready”                   |

---

## 3. Glossário

| Termo                       | Significado                                                                                    |
| --------------------------- | ---------------------------------------------------------------------------------------------- |
| **delivery-loop**           | Orquestrador versionado no repo; fases 0–8 + estado terminal                                   |
| **/ship-loop**              | Comando Cursor que delega à skill `delivery-loop`                                              |
| **REPORT_READY**            | Estado terminal: dossiê passou no gate live no preview; PR aberta; aguardando **MERGE** manual |
| **report-ready**            | Gate funcional da Fase 6 — 5 critérios mensuráveis (sem qualidade)                             |
| **Preview Vercel**          | URL de deploy da PR (`https://…preview.vercel.app`); **nunca** localhost para gate final       |
| **Stub E2E**                | Gemini/CNPJ fake (`installFastGeminiStubs`, `installCNPJStub`) — prova UI, não geração real    |
| **Live E2E**                | BrasilAPI + IA real do preview + Supabase Auth — prova “saiu o relatório lá”                   |
| **critical-ux 16/16**       | Gate UX com stubs (11 + Onda 1); **complementar**, não substitui `report-ready` live           |
| **WATERFALL_HARD_CAP_MS**   | Hard-cap do waterfall no código: **330_000ms** (`waterfall-orchestrator.ts`)                   |
| **REPORT_READY_TIMEOUT_MS** | Timeout total do gate live (default **390_000ms** = 330s wait + 60s buffer)                    |

---

## 4. Gate funcional `report-ready`

### 4.1 Princípio

O sinal confiável de “dossiê gerado” é **DOM + loading encerrado**, não telemetria de backend isolada. Bug P1 documentado: waterfall pode completar no backend (`waterfall:end status: completed`, `botMsgTextLen` alto) com painel vazio na UI — o gate **deve falhar** e reabrir Fase 2.

Referências no codebase:

- `tests-e2e/scheffer-cnpj-blank-panel.spec.ts` — stub, UX painel (~30k chars)
- `tests-e2e/litellm-live-parallel.spec.ts` — live parcial, `text.length > 500`
- `tests-e2e/scheffer-research-validation.spec.ts` R3 — live completo + qualidade (**fora do escopo**)
- `docs/archive/refactor-program/loading-panel-contract.md` — contrato loading/overlay/painel

### 4.2 Cinco critérios (todos obrigatórios)

Executados no **preview Vercel** da PR, com **IA real** e CNPJ Scheffer `04.733.767/0001-80`:

| #   | Critério                | Como medir                                                                                               |
| --- | ----------------------- | -------------------------------------------------------------------------------------------------------- |
| 1   | **Waterfall iniciou**   | Após submit, loading/cofre visível (`loading-smart-overlay`, `inline-loading-bubble` ou `cofre-overlay`) |
| 2   | **Loading encerrado**   | Os três overlays acima **não** visíveis                                                                  |
| 3   | **Relatório visível**   | `[data-testid="bot-message-content"]` visível dentro de `chat-main-panel`                                |
| 4   | **Conteúdo mínimo**     | `innerText.length >= 500` (alinhado a specs live existentes)                                             |
| 5   | **Composer utilizável** | Input do chat **não** disabled                                                                           |

### 4.3 Explicitamente fora do gate

- Marcadores `[[PORTA_*]]`, contagem de CNPJs, Colombia/Paraguai/MT
- Golden dossier, comparação com fixture Scheffer
- Web search, socio-search metrics, `llm_experiment_runs`
- Fallback LiteLLM→Gemini, qualidade de redação

### 4.4 Auth e secrets (live)

| Variável                          | Uso                              | Origem                                                                                   |
| --------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------- |
| `E2E_OPERATOR_EMAIL`              | Email operador                   | Default spec: `bruno.ferreira@senior.com.br`; CI: secret **`GOLDEN_E2E_OPERATOR_EMAIL`** |
| `E2E_AUTH_PASSWORD`               | Senha Supabase Auth              | Local: env; CI: secret **`GOLDEN_E2E_AUTH_PASSWORD`**                                    |
| `E2E_REAL_AUTH`                   | `1` — proíbe bypass localStorage | Obrigatório no gate live                                                                 |
| `BASE_URL`                        | Preview Vercel (`https://…`)     | Obrigatório                                                                              |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Bypass protection                | Se preview protegido                                                                     |
| `E2E_DEPLOYMENT_SHA`              | Confirma SHA do bundle           | Recomendado — preview serviu commit da PR                                                |

**Regras de segurança:**

- **Nunca** escrever senha em skill, spec, HANDOFF, `.agents/memory/*`, commits ou chat versionado
- Spec referencia **apenas nomes** dos GitHub Secrets (padrão `AGENTS.md`)
- Vazamento no histórico git → rotacionar senha no Supabase + atualizar secret no GitHub

### 4.5 Timeout

| Componente                          | Valor                         | Notas                               |
| ----------------------------------- | ----------------------------- | ----------------------------------- |
| Espera waterfall (wait loading off) | **330s**                      | Alinhado a `WATERFALL_HARD_CAP_MS`  |
| Buffer pós-waterfall (cofre/render) | **60s**                       | Timeline estática / Cofre           |
| **Default total**                   | **390_000ms**                 | `REPORT_READY_TIMEOUT_MS`           |
| Override                            | Env `REPORT_READY_TIMEOUT_MS` | Documentar no README E2E e na skill |

**Tempo estimado por execução:** ~5–8 min (CNPJ live até 90s + waterfall até 330s + buffer cofre).

### 4.6 Spec Playwright proposta — `tests-e2e/report-ready.spec.ts`

```
describe('report-ready — dossiê live no preview')
  configure: timeout = REPORT_READY_TIMEOUT_MS + margem setup (~120s)
  beforeAll:
    exigir BASE_URL https
    exigir E2E_REAL_AUTH=1, E2E_AUTH_PASSWORD, E2E_OPERATOR_EMAIL
    opcional: assert E2E_DEPLOYMENT_SHA vs bundle preview

  test('Scheffer — dossiê gerado (funcional, sem qualidade)')
    setupRealSupabaseAuthFromEnv(page, { email: E2E_OPERATOR_EMAIL })
    prepareSchefferInvestigationForm(page)
    validateCnpjInForm(page)          // GET /api/cnpj live
    submitSchefferInvestigation(page)
    assert waterfall started (critério 1)
    wait loading off (timeout 330s + buffer via REPORT_READY_TIMEOUT_MS)
    assert bot-message-content visible + text >= 500
    assert composer not disabled
    log: char count, preview URL, SHA — sem dump de conteúdo sensível
```

**Helper recomendado:** `tests-e2e/helpers/report-ready.ts` — extrair waits/asserts; reutilizar `scheffer-research.ts` onde possível.

**Comando npm proposto:** `npm run test:e2e:report-ready`

**Playwright project:** `report-ready`, `workers=1`, timeout alinhado a `REPORT_READY_TIMEOUT_MS`.

### 4.7 critical-ux vs report-ready

| Gate                  | Modo | O que prova                              | Quando usar                           |
| --------------------- | ---- | ---------------------------------------- | ------------------------------------- |
| **critical-ux 16/16** | Stub | UX Cofre/overlay; painel ~30k chars fake | Regressão UX rápida; complementar     |
| **report-ready**      | Live | Dossiê **real** gerado no preview        | **Fase 6 do delivery-loop** (default) |

---

## 5. Fases 0–8 e estado terminal

| Fase  | Nome                  | Agente / ferramenta            | Entrada                              | Saída                          | Loop interno                           |
| ----- | --------------------- | ------------------------------ | ------------------------------------ | ------------------------------ | -------------------------------------- |
| **0** | Detectar estado       | Skill (orquestrador)           | branch, git status, PR?, último gate | `START_PHASE`                  | —                                      |
| **1** | Plano / investigação  | `planner` ou `debugger`        | Demanda do Bruno                     | Plano ou RCA                   | Repetir até aprovação se escopo grande |
| **2** | Implementar           | `implementer`                  | Plano aprovado                       | Diff pronto                    | Falha gate → volta                     |
| **3** | Gates locais          | `validator` + `validate-gates` | Arquivos alterados                   | APROVADO / REPROVADO           | REPROVADO → Fase 2                     |
| **4** | Review branch         | `reviewer` ou `/review-branch` | diff vs `origin/main`                | PRONTO / AJUSTES               | AJUSTES → Fase 2; **quick-fix pula**   |
| **5** | PR + push + preview   | `commit-pr` (global)           | Autorização “roda o loop”            | PR URL + SHA deploy            | CI vermelho → Fase 2 ou 7              |
| **6** | **report-ready live** | `validator` (E2E)              | `BASE_URL` preview                   | 5 critérios OK                 | Falha → Fase 2                         |
| **7** | Comentários PR        | `gh-resolve-pr-comments`       | PR #                                 | Threads respondidas            | Novo feedback → Fase 2                 |
| **8** | Handoff               | `doc-handoff` (`compact-pr`)   | Estado final                         | HANDOFF + memory               | —                                      |
| **∞** | **REPORT_READY**      | —                              | Gate Fase 6 verde                    | Relatório + “digite **MERGE**” | **Nunca merge automático**             |

### Flags `--from` (comando `/ship-loop`)

| Flag              | Retoma em                 |
| ----------------- | ------------------------- |
| `--from plan`     | Fase 1                    |
| `--from gates`    | Fase 3                    |
| `--from preview`  | Fase 6                    |
| `--from comments` | Fase 7                    |
| _(sem flag)_      | Fase 0 detecta e continua |
| `PR #N`           | Fases 5–7 focadas na PR   |

### Watch entre Fases 5→6

Poll CI + deploy preview via `scripts/ship-loop-watch.sh` integrado à skill global `/loop`. Só avança para Fase 6 quando preview servir SHA = HEAD da PR.

---

## 6. Variantes

| Variante         | Flag / comando          | Fases             | Gate Fase 6       | Estimativa        |
| ---------------- | ----------------------- | ----------------- | ----------------- | ----------------- |
| **investigate**  | `--variant investigate` | 0→1→8             | Nenhum            | ~15–30 min        |
| **quick-fix**    | `--variant quick-fix`   | 0→2→3→**5**→6→8   | report-ready live | ~45–90 min + gate |
| **feature**      | `--variant feature`     | 0→1→2→3→4→5→6→7→8 | report-ready live | 2–4 h + gate      |
| **pr-gate-only** | `--from preview PR#N`   | 0→5→6→7→8         | report-ready live | ~30–60 min + gate |

**Notas:**

- **quick-fix** pula Fase 4 (review branch) — fix pequeno, escopo fechado
- **pr-gate-only** assume PR já aberta; foco em preview + gate + comentários
- ~~**litellm-experiment-loop**~~ — **deprecated**; validação LiteLLM permanece manual e pontual

Comandos thin opcionais v1 (delegam à skill): `quick-fix-loop.md`, `feature-loop.md`, `pr-gate-only-loop.md` em `~/.cursor/commands/`.

---

## 7. Dispatch de subagentes

Matriz situação → agente (`Task()` sem parâmetro `model` — Composer inherit):

| Situação                                                | Agente                       |
| ------------------------------------------------------- | ---------------------------- |
| Demanda nova, escopo > 2 arquivos, decisão arquitetural | `planner`                    |
| Erro, regressão, sintoma em produção/preview            | `debugger`                   |
| Plano aprovado, código a escrever                       | `implementer`                |
| Pós-implementação, pré-PR, pós-fix, E2E                 | `validator`                  |
| UI/UX explícito no escopo                               | `ui-ux` + `implementer`      |
| Review de diff antes de PR                              | `reviewer`                   |
| Fim de sessão ou PR ativa                               | `doc-handoff` (`compact-pr`) |

**Integrações globais (não versionadas no repo):**

- `commit-pr` — Fase 5
- `gh-resolve-pr-comments` — Fase 7
- `/loop` + `scripts/ship-loop-watch.sh` — espera CI/deploy
- `validate-gates` (`.claude/skills/`) — Fase 3

---

## 8. Autonomia e limites

### Dentro da autonomia (“roda o loop” / “ship-loop até report-ready”)

| Ação                                  | Autônomo? |
| ------------------------------------- | --------- |
| Investigar / planejar / implementar   | Sim       |
| Gates locais + review branch          | Sim       |
| **Commit + push + abrir/editar PR**   | **Sim**   |
| Aguardar preview Vercel (watch)       | Sim       |
| Gate **report-ready** live no preview | Sim       |
| Responder threads de review           | Sim       |
| Handoff `compact-pr`                  | Sim       |

### Sempre manual / proibido

| Ação                              | Regra                                            |
| --------------------------------- | ------------------------------------------------ |
| **Merge em main**                 | Token **MERGE** na mensagem **atual** do usuário |
| Gate de qualidade Scheffer/golden | Fora do loop — Bruno valida depois               |
| Benchmark / rotação LiteLLM       | Pontual, manual                                  |
| `gh pr merge`, squash, auto-merge | **Proibido** sem MERGE                           |

### Loop interno de correção

Falha em Fase 3, 4 ou 6 → `implementer` corrige → repete fase até verde → avança.

### Git safety

- Respeitar trava de merge (`git-safety.mdc`)
- Máximo 7 commits locais sem push/PR (branch health)
- Nunca `--no-verify`, force push em main

---

## 9. Artefatos v1

### Criar

| Arquivo                                         | Função                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------- |
| `.agents/skills/delivery-loop/SKILL.md`         | Fonte da verdade: fases, variantes, REPORT_READY, dispatch, timeout |
| `tests-e2e/report-ready.spec.ts`                | Gate Fase 6 live                                                    |
| `tests-e2e/helpers/report-ready.ts`             | Waits/asserts reutilizáveis                                         |
| `scripts/ship-loop-watch.sh`                    | Poll CI + deploy preview                                            |
| `docs/plans/2026-06-23-delivery-loop-design.md` | Este spec                                                           |

### Editar

| Arquivo                           | Mudança                                                 |
| --------------------------------- | ------------------------------------------------------- |
| `~/.cursor/commands/ship-loop.md` | Apontar skill real; `--variant`, `--from`; REPORT_READY |
| `package.json`                    | Script `test:e2e:report-ready`                          |
| `playwright.config.ts`            | Project `report-ready` (workers=1)                      |
| `docs/SKILLS-GOVERNANCE.md`       | Incluir `delivery-loop` em `active`                     |
| `AGENTS.md`                       | Referência corrigida; REPORT_READY; sem LiteLLM no loop |
| `tests-e2e/README.md`             | Gate funcional vs critical-ux stub                      |
| `~/.cursor/commands/comandos.md`  | Menção REPORT_READY                                     |

### Opcional v1

- Comandos thin: `quick-fix-loop.md`, `feature-loop.md`, `pr-gate-only-loop.md`
- `.github/workflows/*.yml` — mapear `GOLDEN_E2E_*` → `E2E_*` para report-ready em CI

### Não criar / deprecated

- `.agents/skills/ship-loop/` — usar `delivery-loop`; ship-loop = alias no comando
- Skill/doc `litellm-experiment-loop`

---

## 10. Fora de escopo (v1 e loop)

- Gate de qualidade: Scheffer R1/R2/R3 completo, golden dossier, PORTA markers
- LiteLLM experiment loop automatizado
- Merge automático ou auto-merge GitHub
- Validação de negócio do conteúdo do dossiê
- Golden Live CI blocking (secrets) — permanece gate separado
- critical-ux 16/16 como substituto do report-ready live
- Implementação mobile/375px no gate (desktop padrão)

---

## 11. Riscos

| Risco                                        | Impacto                               | Mitigação                                                            |
| -------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------- |
| Timeout waterfall > 330s em produção         | Gate falha (falso negativo)           | Default 390s; override `REPORT_READY_TIMEOUT_MS`; monitorar latência |
| Flake E2E live (CNPJ 90s, cold start Vercel) | Loop reabre Fase 2 desnecessariamente | workers=1; retry documentado; `E2E_DEPLOYMENT_SHA`                   |
| Backend completed + painel vazio (bug P1)    | Gate deve falhar — correto            | Critérios DOM; não confiar só em telemetria                          |
| Custo API Gemini no preview                  | ~1 investigação por gate              | Aceito — Bruno prioriza “saiu o relatório”                           |
| Preview protection                           | E2E bloqueado                         | `VERCEL_AUTOMATION_BYPASS_SECRET`                                    |
| Senha em arquivo versionado                  | Vazamento segurança                   | Secrets only; rotação Supabase se vazou                              |
| Skill global `commit-pr` indisponível        | Fase 5 manual                         | Documentar fallback manual                                           |
| Loop autônomo commita sem revisão humana     | Surpresa de escopo                    | quick-fix pula review; feature mantém Fase 4                         |

---

## 12. Critérios de aceite v1

Implementação v1 considerada **pronta** quando:

1. **Spec aprovado** — este documento mergeado ou referenciado na PR piloto
2. **Skill existe** — `.agents/skills/delivery-loop/SKILL.md` legível pelo agente via `Read`
3. **Comando atualizado** — `/ship-loop` aponta para skill real com variantes
4. **Gate E2E passa** — `npm run test:e2e:report-ready` verde no preview de PR piloto com auth via secrets
5. **REPORT_READY demonstrado** — piloto manual: loop para com mensagem “dossiê no preview; digite MERGE”
6. **Handoff gerado** — Fase 8 produz `compact-pr` com link preview + SHA
7. **Zero senha** — grep no diff confirma ausência de credenciais
8. **SKILLS-GOVERNANCE** — `delivery-loop` listado em `active`

**NÃO VALIDADO até implementação:** watch script, comandos thin, CI workflow mapping.

---

## 13. Roadmap v2 (pós-v1)

| Item                           | Descrição                                                          |
| ------------------------------ | ------------------------------------------------------------------ |
| Gate stub rápido               | Variante `--gate stub` para PRs só-docs (sem investigação live)    |
| `pr-gate-runner` no Cursor     | Espelhar `.claude/agents/pr-gate-runner.md` em `~/.cursor/agents/` |
| CI report-ready                | Job GitHub Actions com secrets `GOLDEN_E2E_*` pós-deploy preview   |
| Métricas loop                  | Log estruturado: duração por fase, falhas, retries                 |
| Integração Supabase telemetria | Cruzar gate com `scout_diagnostics` pós-REPORT_READY (opcional)    |
| Variante docs-only             | investigate → gates → PR sem Fase 6                                |

---

## Referências

- `AGENTS.md` — fluxo ship-loop, merge guard, secrets E2E
- `~/.cursor/commands/ship-loop.md` — comando Cursor atual
- `tests-e2e/helpers/scheffer-research.ts` — CNPJ, auth, waits
- `tests-e2e/golden-dossier-live.spec.ts` — padrão auth Supabase live
- `features/dossier/waterfall-orchestrator.ts` — `WATERFALL_HARD_CAP_MS = 330_000`
- `docs/archive/refactor-program/loading-panel-contract.md` — contrato painel/loading
- `.cursor/rules/git-safety.mdc` — token MERGE obrigatório
- `docs/SKILLS-GOVERNANCE.md` — allowlist skills repo

---

## Histórico de aprovação

| Data       | Aprovador | Itens                                                                                                                             |
| ---------- | --------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 2026-06-23 | Bruno     | Seções 1–3 (arquitetura, gate+auth, artefatos); timeout **(B) 330s + 60s buffer**; gate live Scheffer; autonomia até REPORT_READY |

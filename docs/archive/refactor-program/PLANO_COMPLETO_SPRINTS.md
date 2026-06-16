# Plano Completo de Sprints — Fase 2 (Manutenibilidade)

> Criado em 2026-04-30 a partir de auditoria cruzada do estado real do repositório.
> Este documento é a especificação detalhada das Sprints 9–12.
> Para visão estratégica, ver `01-MASTER-PLAN.md`. Para plano conciso de fase, ver `08-PHASE2-MAINTAINABILITY-PLAN.md`.

---

## Contexto e Baseline

| Campo                               | Valor                                                             |
| ----------------------------------- | ----------------------------------------------------------------- |
| **Fase anterior**                   | Sprints 1–8 — concluída e mergeada em `main` (PR #241)            |
| **Commit pós-Sprint-8**             | `ccd2001518367961637b1a9488c2319aa83d0a21`                        |
| **Baseline de execução desta fase** | HEAD `49068ff` na branch `codex/piccini-dossier-pdf` (2026-04-30) |
| **Divergência vs pós-Sprint-8**     | +4.280 / −3.083 LOC em 71 arquivos                                |
| **Política**                        | Fachadas públicas congeladas; refactor interno incremental        |

> **Nota de re-ancoragem:** O baseline ativo para rollback e métricas é o HEAD acima, não o commit ccd2001. Tags de rollback devem ser criadas imediatamente antes da primeira PR de cada sprint (ex.: `pre-sprint-9`).

---

## Inventário Atual (Auditado em 2026-04-30)

| Domínio         | Arquivos (aprox.) | Hotspots                                                                       |
| --------------- | ----------------- | ------------------------------------------------------------------------------ |
| `components/`   | 51                | LoadingSmart (766 ln), WarRoom (552 ln); CRMDetail removido com Mini CRM local |
| `features/`     | 13                | chat/ (8), dossier/ (4), radar/ (stub: 2)                                      |
| `hooks/`        | 11                | useRadar (291 ln) — **fora do boundary**                                       |
| `services/`     | 35                | radarService (234 ln) — **fora do boundary**; gemini/ e war-room/ OK           |
| `stores/`       | 2                 | chatStore (246 ln), dossierStore (133 ln)                                      |
| `utils/`        | 32                | idbStorage.ts (warning de build — ver OI-003)                                  |
| `prompts/mega/` | 4                 | foundation (1359 ln), specialist-prompts (1801 ln)                             |
| `tests/`        | 110 arq.          | Cobertura concentrada em features estabilizadas (Fase 1)                       |
| `App.tsx`       | 1                 | 772 linhas, 46 imports                                                         |

### Boundaries Estabilizadas (Fase 1)

```
✅ services/gemini/*        (fachada: geminiService.ts)
✅ services/war-room/*      (fachada: warRoomService.ts)
✅ features/chat/*          (8 arquivos)
✅ features/dossier/*       (4 arquivos — mas com leak; ver Problema #3)
✅ features/radar/*         (stub: index.ts + types.ts)
✅ stores/chatStore.tsx, dossierStore.tsx
```

---

## Problemas Verificados (Evidências do Código)

### 1. App.tsx Monolítico

**Estado real:** 772 linhas, 46 imports, 16+ hooks de estado/efeito.
**Responsabilidades:** orquestração de chat, dossiê, CRM, Radar, modais de export.
**Nota:** `EmailModal` e `FollowUpModal` já são _importados_ (não inline). O problema é o **wiring de estado** (`showEmailModal`, handlers `onSend/onClose`, lógica de export) embutido diretamente em `App.tsx`.

### 2. Componentes Grandes

| Componente                    | Linhas   | Problema Principal                             |
| ----------------------------- | -------- | ---------------------------------------------- |
| `components/LoadingSmart.tsx` | 766      | Timeline, modelo e render acoplados            |
| `components/CRMDetail.tsx`    | removido | Mini CRM local removido por decisão de produto |
| `components/WarRoom.tsx`      | 552      | Complexidade de UI ainda alta                  |

**Cobertura de testes:** `LoadingSmart` tem `tests/components/LoadingSmart.test.tsx`; `WarRoom` recebeu teste de caracterização na Sprint 11 Onda 0; `CRMDetail` é histórico porque foi removido com o Mini CRM local.

### 3. Boundary Leak: `features/dossier` → `features/chat`

**Evidência:**

```
features/dossier/waterfall-orchestrator.ts:31  → '../chat/message-helpers'
features/dossier/waterfall-orchestrator.ts:32  → '../chat/message-orchestrator' (tipo)
features/dossier/porta-reconciliation.ts:7     → '../chat/message-helpers'
features/dossier/benchmark-stage.ts:4          → '../chat/message-helpers'
```

A Fase 1 foi declarada "estabilizada", mas `dossier` depende de internos de `chat`. Isso precisa ser resolvido antes de adicionar Radar ao boundary em Sprint 10.

### 4. Radar Runtime Fora do Boundary

`hooks/useRadar.ts` (291 ln) e `services/radarService.ts` (234 ln) estão fora de `features/radar/`. Há 29+ referências diretas a esses módulos em código de produção (incluindo `App.tsx`). `features/radar/` é apenas stub de tipos.

### 5. Prompts Hardcoded Gigantes

`prompts/mega/specialist-prompts.ts` (1801 ln) e `foundation.ts` (1359 ln) são strings de template. Exist tests em `tests/prompts/` (`megaPrompts.test.ts`, `constantsPromptRules.test.ts`) — usar como base para golden tests antes de mover para `.md` externos (Sprint 13+).

### 6. Uso de `any` em Produção

61 ocorrências verificadas (excluindo testes, dist, node_modules). Top infratores: `services/clientLookupService.ts` (7), `components/SystemHealthCheck.tsx` (7), `scripts/*.ts` (CLI — menor urgência).

### 7. Segurança: Gemini (Controlada) e Pinecone (Risco Latente)

**Gemini:** `GEMINI_API_KEY` é lida apenas em Vercel Functions (`api/gemini.ts`, `api/gerar-dossie.ts`, etc.) e scripts CLI. Frontend usa proxy em `services/geminiProxy.ts`. **Situação: OK.**

**Pinecone:** `index.tsx:17` declara `VITE_PINECONE_API_KEY` em `OPTIONAL_ENV_VARS` com lookup via `import.meta.env`. Vite inlinea variáveis `VITE_*` no bundle final. Em 2026-05-16, o owner aceitou esse risco porque o app é interno/fechado. **Situação: risco aceito; reavaliar se o app virar externo.**

`api/docs-rag.ts` e `api/rag.ts` são Vercel Functions (server-only — OK). O problema está somente na validação de env em `index.tsx`.

### 8. OI-003 tem Implicação de PWA

`vite.config.ts` usa VitePWA com `registerType: 'autoUpdate'`, `cleanupOutdatedCaches: true`, `clientsClaim: true`. Qualquer mudança no chunking de `utils/idbStorage.ts` altera hashes do bundle e invalida o service worker em produção — usuários ativos recebem estado misto durante o deploy. Não é "warning trivial": exige janela de deploy controlada.

### 9. Ferramentas de Análise Não Instaladas

O plano cita `npx madge --circular` e `npx ts-prune` na Sprint 12, mas nenhum está em `package.json`. Descobrir circulares pela primeira vez em Sprint 12 é surpresa cara.

### 10. Branches Paralelas Ativas

Durante a janela de ~9 semanas de Fase 2, há branches ativas: `codex/obsidian-clipper-docs`, `codex/obsidian-repo-graph`, `codex/test-gap-package-post-schemart`, `fix/cnpj-proxy-fallback`. Sem política de integração, há risco de merge conflicts nos alvos da refatoração.

---

## Política de Branches — Fase 2

- Cada sprint vira uma branch `refactor/sprint-N` criada a partir de `main`.
- PRs de feature paralelos devem rebasear de `refactor/sprint-N` antes de mergear, enquanto a sprint estiver aberta.
- Arquivos com freeze (não podem ter PRs paralelas durante a sprint): `App.tsx` (Sprint 9), `hooks/useRadar.ts` e `services/radarService.ts` (Sprint 10), componentes-alvo (Sprint 11).
- Tag `pre-sprint-N` criada no commit de `main` imediatamente antes da PR da sprint.

---

## Sprint 9 — App Shell Decoupling + Governança

**Duração:** 2 semanas | **Branch:** `refactor/sprint-9`

### Objetivo

Reduzir responsabilidade de wiring em `App.tsx` e estabelecer guardrails formais para a fase.

### Pré-requisito (antes de abrir PR da sprint)

- [x] Criar tag `pre-sprint-9` no HEAD de `main`.
- [x] Instalar `madge` e `ts-prune` como devDeps e rodar baseline: `npm run analyze:circular` — registrar resultado em `docs/ai-context/refactor/PLANO_COMPLETO_SPRINTS.md` (Apêndice B).

### Tarefas

**1. Extrair estado e handlers dos modais de export para hooks dedicados**

> Os componentes `EmailModal` e `FollowUpModal` já são importados. O que sai de `App.tsx` é o wiring: `showEmailModal`, `showFollowUpModal`, handlers `onSend`, `onSchedule`, `onClose`.

```typescript
// hooks/useEmailModal.ts
// hooks/useFollowUpModal.ts
// App.tsx perde ~100 linhas de wiring
```

**2. Mover lógica de exportação para service**

```typescript
// services/exportService.ts
// - exportToPDF()
// - buildEmailPayload()
// - buildFollowUpPayload()
```

**3. Criar error boundaries globais**

```typescript
// components/ErrorBoundaries/
// ├── GlobalErrorBoundary.tsx
// └── index.ts
```

**4. Definir modelo de feature flags**

> Antes de criar o módulo, documentar em `docs/ai-context/refactor/PLANO_COMPLETO_SPRINTS.md` (ou `ARQUITETURA.md`): (a) build-time vs runtime; (b) como sobrescrever em produção; (c) política de TTL com `removeBy: 'Sprint X'`.

```typescript
// utils/featureFlags.ts (criar APÓS decisão documentada)
export const FEATURE_FLAGS = {
  deepDive: true,
  warRoom: true,
  newExportFlow: false,
  radarV2: false,
} as const;
```

**5. Resolver boundary leak `dossier → chat`**
Mover `isAbortLikeError` e os tipos compartilhados para `features/_shared/` ou `utils/`:

```typescript
// utils/errorUtils.ts  (ou features/_shared/abortHelpers.ts)
// export isAbortLikeError
// export type RunMegaPromptWaterfallArgs  (→ types compartilhados)
```

Atualizar imports em `features/dossier/*`.

**6. Segurança — Pinecone**

- Decisão Sprint 9: manter `VITE_PINECONE_API_KEY` e `VITE_PINECONE_INDEX_HOST` em `index.tsx` porque o app é interno/fechado.
- Registrar OI-055 como risco aceito e reavaliar se o app virar externo.
- Não mover Pinecone para server-only nesta sprint.

**7. Adicionar `validateServerEnv()` nas Vercel Functions**

```typescript
// utils/envValidation.ts
export function validateServerEnv() {
  const required = ['GEMINI_API_KEY', 'PINECONE_API_KEY'];
  for (const key of required) {
    if (!process.env[key]) throw new Error(`Missing env: ${key}`);
  }
}
```

### Critérios de Aceite

- [x] `App.tsx` < 700 linhas (`622` linhas em `refactor/sprint-9`).
- [x] Zero wiring de modal de export em `App.tsx` (consumidos via hook).
- [x] `utils/featureFlags.ts` criado com TTL documentado por flag.
- [x] `features/dossier/*` sem imports de `features/chat/*` (leak resolvido).
- [x] OI-055 documentado como risco aceito; `VITE_PINECONE_*` permanece por decisão operacional.
- [x] Baseline de circulares (`madge`) registrado.
- [x] Gates técnicos verdes: `test`, `typecheck`, `build`, `lint`.

### Rollback

Tag `pre-sprint-9` — reverter se gate vermelho > 24h sem resolução.

---

## Sprint 10 — Radar Boundary Completion

**Duração:** 2 semanas | **Branch:** `refactor/sprint-10`

### Objetivo

Mover todo o runtime do Radar para `features/radar/*`, mantendo compatibilidade.

### Pré-requisito

- [ ] Sprint 9 mergeada. Boundary leak `dossier → chat` resolvido.
- [ ] Criar tag `pre-sprint-10`.

### Tarefas

**1. Mover hook e service para o boundary**

```bash
# Mover (não copiar):
hooks/useRadar.ts        → features/radar/useRadar.ts
services/radarService.ts → features/radar/radarService.ts
```

Manter re-exports temporários nos paths originais durante a sprint (remover na PR final).

**2. Criar orchestrator interno**

```typescript
// features/radar/orchestrator.ts
// - scanForAlerts()
// - processRadarEntry()
```

**3. Mover componentes de Radar**
Identificar componentes com "Radar" no nome em `components/` e movê-los para `features/radar/components/`.

**4. Atualizar App.tsx**
Importar Radar apenas de `features/radar/index.ts`. Remover wiring residual.

**5. Atualizar barrel `features/radar/index.ts`**
Exportar tudo que era previamente importado diretamente de `hooks/useRadar.ts` ou `services/radarService.ts`.

### Critérios de Aceite

- [ ] `features/radar/` contém toda lógica de negócio do Radar.
- [ ] `hooks/useRadar.ts` é apenas re-export vazio (ou removido).
- [ ] `services/radarService.ts` é apenas re-export vazio (ou removido).
- [ ] Zero imports diretos de `hooks/useRadar.ts` / `services/radarService.ts` fora de `features/radar/`.
- [ ] Validação manual: Radar Panel, Settings, Alerts funcionando.
- [ ] Gates técnicos verdes.

### Rollback

Tag `pre-sprint-10`.

---

## Sprint 11 — Componentes Grandes + Tipagem Forte

**Duração:** 3 semanas | **Branch:** `refactor/sprint-11`

### Objetivo

Remover Mini CRM local por decisão de produto, sanear planos duplicados/stale, atacar `LoadingSmart` e `WarRoom` em PRs separados e eliminar `any` críticos remanescentes.

### Pré-requisito

- [x] Sprint 10 mergeada.
- [ ] **Criar tag `pre-sprint-11` ou registrar rollback equivalente da branch ativa.**
- [x] **Onda 0:** testes de caracterização criados via PR `#258`; cobertura de `CRMDetail` virou histórica após remoção do Mini CRM.
  ```typescript
  // tests/components/WarRoom.test.tsx     ← ativo como rede de refatoração
  // tests/components/CRMDetail.test.tsx   ← histórico; componente removido na Onda 0.5
  ```

### Onda 0.5: Mini CRM local removido (superseded)

`CRMDetail`, `CRMView`, `CRMPipeline`, `CRMProvider`/`useCRM`, contratos e testes dedicados foram removidos por decisão de produto. Não reintroduzir nem refatorar esses arquivos. Referências ao CRM interno Senior seguem válidas em prompts, evidências e dossiês.

### Onda 1A: Saneamento documental

- Atualizar `02-BOARD.md`, `03-OPEN-ITEMS.md`, `06-HANDOFF.md`, `sprints/00-INDEX.md`, `SPRINT-11-EXECUTION.md`, `HANDOFF_AI.md`, memória local e roadmap Obsidian.
- Garantir que planos antigos com `CRMDetail` estejam claramente históricos/superseded.
- Próximas ondas devem ser `LoadingSmart` e `WarRoom`, em PRs separados.

### Onda 1B: LoadingSmart.tsx (766 linhas)

**Separar fases (Split Phase Pattern)**

```typescript
// components/loading/
// ├── LoadingPhases.ts        (modelo de estados)
// ├── LoadingTimeline.tsx     (render da timeline)
// └── LoadingSmartShell.tsx   (orquestrador)
```

**Extrair constantes mágicas** (expandir `constants/loadingStages.ts` já existente)

### Onda 1C: WarRoom.tsx (552 linhas)

**Extrair blocos visuais**

```typescript
// components/WarRoom/
// ├── TechnicalQuestionBlock.tsx
// ├── BenchmarkComparison.tsx
// ├── SourceCitations.tsx
// └── CancellationHandler.tsx
```

### Onda 4: Eliminar `any` críticos

Prioridade: código de produção (não scripts CLI, não testes):

- `services/clientLookupService.ts` (7 ocorrências)
- `components/SystemHealthCheck.tsx` (7 ocorrências)
- `utils/errorHelpers.ts` — substituir `error: any` por `error: unknown`

### Critérios de Aceite

- [x] Mini CRM local removido; `CRMDetail.tsx` não é mais alvo.
- [ ] `LoadingSmart.tsx` < 400 linhas.
- [ ] `WarRoom.tsx` < 300 linhas.
- [ ] Zero `any` em código de produção (exceto testes e scripts CLI).
- [ ] Cobertura de testes nos arquivos editados ≥ 60% (linhas alteradas).
- [ ] Testes de caracterização de `WarRoom` verdes.
- [ ] Gates técnicos verdes.

### Rollback

Tag `pre-sprint-11`.

---

## Sprint 12 — Hardening Final e Fechamento

**Duração:** 2 semanas | **Branch:** `refactor/sprint-12`

### Objetivo

Fechar warnings operacionais, consolidar documentação e preparar Sprint 13+ (modularização de prompts).

### Pré-requisito

- [ ] Sprint 11 mergeada.
- [ ] Criar tag `pre-sprint-12`.

### Onda 1: Fechar OI-003 (Build Warning — com cautela de PWA)

`vite.config.ts` usa VitePWA com `skipWaiting: true` e `cleanupOutdatedCaches: true`. Qualquer mudança de chunk invalida o SW em produção.

**Protocolo:**

1. Reproduzir o warning em ambiente local com `npm run build`.
2. Aplicar fix em `utils/idbStorage.ts` (lazy load explícito ou reorganização de import).
3. Verificar SW em ambiente de staging antes de mergear.
4. Deploy em janela de baixo tráfego.
5. Manter SW anterior como rollback por 24h.

### Onda 2: Fechar OI-004 (Test Warning)

```typescript
// tests/components/SessionsSidebar.test.tsx
// Ajustar mock de render-prop em ConfirmPopover:
// ❌ render={<Function />}
// ✅ children={<ConfirmPopover {...mockProps} />}
```

### Onda 3: Fechar OI-005 (Lint Backlog)

```bash
npm run lint -- --fix
# Revisar warnings residuais manualmente
# Documentar "won't fix" com justificativa se aplicável
```

### Onda 4: Baseline de Golden Tests para Sprint 13

> Sprint 13–16 planeja mover prompts de strings hardcoded para arquivos `.md`. Criar o golden test _depois_ da migração só registra o estado novo, sem garantia de equivalência.

**Antes de mergear Sprint 12:**

- Capturar baseline de outputs do LLM para o conjunto de testes em `tests/prompts/megaPrompts.test.ts`.
- Documentar inputs fixos e estrutura esperada para comparação futura.
- Expandir `tests/prompts/constantsPromptRules.test.ts` com casos de controle.

### Onda 5: Documentação Final e Handoff

- Atualizar `08-PHASE2-MAINTAINABILITY-PLAN.md` com "Status: CONCLUÍDA".
- Atualizar `01-MASTER-PLAN.md`: marcar Fase 2 como concluída.
- Atualizar `HANDOFF_AI.md`: estado arquitetural pós-Fase-2.
- Gerar relatório de qualidade:
  ```bash
  npx madge --circular src/ --extensions ts,tsx  # zero circulares esperado
  npx ts-prune                                    # código morto residual
  ```
- Criar `docs/ai-context/refactor/POST-MORTEM-FASE2.md` com aprendizados.

### Critérios de Aceite

- [ ] OI-003, OI-004, OI-005 fechados ou documentados como "won't fix".
- [ ] Zero warnings novos introduzidos.
- [ ] Baseline de golden tests para prompts registrado.
- [ ] Madge: zero circulares (ou circulares conhecidos documentados).
- [ ] Documentação 100% atualizada.
- [ ] Gates técnicos verdes.

### Rollback

Tag `pre-sprint-12`.

---

## Métricas de Sucesso — Fase 2

| Métrica                                  | Atual (2026-04-30) | Target                         |
| ---------------------------------------- | ------------------ | ------------------------------ |
| `App.tsx` linhas                         | 772                | < 400                          |
| Componentes > 500 linhas                 | 3                  | 0                              |
| `any` em produção                        | 61                 | 0                              |
| Radar dentro do boundary                 | 0%                 | 100%                           |
| Boundary leak dossier→chat               | 4 imports          | 0                              |
| Warnings abertos (OI-003/4/5)            | 3                  | 0                              |
| Cobertura de testes em alvos refatorados | ~0%                | ≥ 60%                          |
| Circulares (madge)                       | não medido         | baseline + redução             |
| `VITE_PINECONE_API_KEY` no bundle        | risco latente      | aceito por app interno/fechado |

---

## Checklist de Validação por Sprint

### Gates Técnicos (obrigatórios)

```bash
npm run test        # zero falhas (contagem atual: verificar no HEAD)
npm run typecheck   # zero erros TypeScript
npm run build       # build limpo (warnings OI-003 aceito até Sprint 12)
npm run lint        # zero erros (warnings em redução)
```

### Cobertura Mínima dos Alvos (Sprint 11+)

- Linhas alteradas com cobertura de teste ≥ 60%.

### Validação Manual (por sprint)

1. [ ] Criar nova sessão e enviar mensagem.
2. [ ] Enviar follow-up com contexto.
3. [ ] Rodar dossiê completo.
4. [ ] Testar deep dive.
5. [ ] Salvar sessão e recarregar.
6. [ ] Exportar conversa e dossiê.
7. [ ] Abrir CRM e validar Score PORTA.
8. [ ] Validar War Room.
9. [ ] Validar Radar Panel e Settings.

### Governance de Handoff

Ao final de cada sprint, atualizar `HANDOFF_AI.md` com:

- (a) O que foi feito (resumo de PR).
- (b) Decisões pendentes (débito intencional).
- (c) Números atualizados de hotspots.

### Critério de Rollback

Se qualquer gate técnico falhar e não for resolvido em **24h**, reverter para a tag `pre-sprint-N`.

---

## Plano de Longo Prazo (Fase 3+, pós-Sprint 12)

| Sprint | Objetivo                                                 | Pré-requisito                                 |
| ------ | -------------------------------------------------------- | --------------------------------------------- |
| 13–16  | Modularização de Prompts (strings → arquivos `.md`)      | Golden tests de baseline criados em Sprint 12 |
| 17–20  | Design System (Storybook, tokens, componentes base)      | —                                             |
| 21–24  | Observability & Monitoring (Sentry, dashboards, alertas) | —                                             |

---

## Apêndice A — Auditoria do Documento Original (2026-04-30)

### Inconsistências Corrigidas nesta Versão

| #   | Alegação original                                                        | Realidade verificada                                                               | Correção aplicada                                                                       |
| --- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1   | Baseline = `ccd2001` (Pós-Sprint 8)                                      | HEAD = `49068ff` (+4.280/−3.083 LOC vs ccd2001)                                    | Baseline re-ancorado no HEAD atual                                                      |
| 2   | "Extrair Modals para Hooks Dedicados" — implica modais inline em App.tsx | EmailModal/FollowUpModal já são importados; problema é o wiring de estado          | Tarefa reformulada: "Extrair estado e handlers dos modais"                              |
| 3   | `.env.example` ambíguo sobre Gemini                                      | Gemini está protegido via proxy; risco real é Pinecone via `VITE_PINECONE_API_KEY` | Seção de segurança reformulada; Gemini como "controlado"; Pinecone como "risco latente" |

### Alegações Confirmadas ✅

App.tsx (772 ln), LoadingSmart (766 ln), WarRoom (552 ln), useRadar (291 ln), radarService (234 ln), boundaries `services/gemini/*` e `services/war-room/*`, features/chat/ e features/dossier/ existentes, stores OK, OI-003/004/005 abertos, specialist-prompts (1801 ln) — todos verificados contra o código real. `CRMDetail` constava na auditoria original, mas foi removido depois com o Mini CRM local.

### Lacunas Adicionadas a Esta Versão

| #   | Lacuna                                                           | Sprint impactada                                                                            |
| --- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1   | `VITE_PINECONE_API_KEY` expõe chave no bundle                    | Sprint 9 — risco aceito pelo owner                                                          |
| 2   | Cobertura ausente nos hotspots originais                         | Sprint 11 — Onda 0 criou cobertura de WarRoom; CRMDetail removido depois com Mini CRM local |
| 3   | Boundary leak `dossier → chat` (4 imports)                       | Sprint 9 — tarefa adicionada                                                                |
| 4   | OI-003 tem risco de PWA (chunking → SW invalidation)             | Sprint 12 — protocolo de deploy adicionado                                                  |
| 5   | `madge`/`ts-prune` não instalados                                | Sprint 9 — devDeps adicionados como pré-requisito                                           |
| 6   | 5 branches paralelas ativas durante 9 semanas                    | Política de branches adicionada                                                             |
| 7   | Cobertura concentrada fora dos alvos de Fase 2                   | Critério de aceite ≥ 60% adicionado                                                         |
| 8   | Golden tests de prompts precisam ser criados _antes_ da migração | Sprint 12 — Onda 4 adicionada                                                               |
| 9   | Sem governance de `HANDOFF_AI.md` entre sprints                  | Checklist de validação atualizado                                                           |
| 10  | Feature flags sem modelo de runtime/TTL                          | Sprint 9 — tarefa de modelagem adicionada                                                   |

### Apêndice B — Baseline de Circulares (preencher em Sprint 9)

```
Data: 2026-05-16
Comando: npm run analyze:circular
Resultado: 1 circular dependency existente

1) `stores/chatStore.tsx` > `features/chat/message-orchestrator.ts`
```

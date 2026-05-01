# Sprint 11 — Execução

**Objetivo:** Quebrar componentes gigantes (CRMDetail, LoadingSmart, WarRoom), eliminar `any` críticos em produção, instalar tipos explícitos.

**Branch principal:** `refactor/sprint-11` (derivada de `main`, após Sprint 10 mergeada)
**Duração:** 3 semanas
**PRs estimadas:** 5 (Onda 0 + 4 ondas)

> Para contexto completo, ver `../PLANO_COMPLETO_SPRINTS.md`.
> **CRÍTICO:** Esta sprint começa com **Onda 0 obrigatória** de testes. Sem ela, não há rede de proteção.

---

## Pré-flight

- [ ] Sprint 10 mergeada em `main`.
- [ ] `git checkout main && git pull origin main && git tag pre-sprint-11 && git push origin pre-sprint-11`.
- [ ] Gates verdes.
- [ ] Inventário inicial:
  ```bash
  wc -l components/CRMDetail.tsx components/LoadingSmart.tsx components/WarRoom.tsx
  grep -rn ": any" --include="*.ts" --include="*.tsx" . | grep -v node_modules | grep -v dist | grep -v "\.test\." | grep -v "scripts/" | wc -l
  ```
  Esperado: 717 / 766 / 552 ; ~50 ocorrências de `any` em produção (excluindo CLI).

---

## Onda 0 — Testes de caracterização (BLOQUEANTE)

**PR:** `refactor/sprint-11-onda-0-tests` → `refactor/sprint-11`
**Risco:** zero (apenas adiciona testes contra código atual)

> **Sem esta PR mergeada, nenhuma das ondas 1–4 pode iniciar.**
> Quebrar componentes de 700+ linhas sem testes = risco inaceitável.

### Mudanças

**1. Criar `tests/components/CRMDetail.test.tsx`** com no mínimo:

```typescript
describe('CRMDetail', () => {
  it('renders client header with mocked card', () => { /* snapshot */ });
  it('expands interaction timeline on click', () => { /* user-event click */ });
  it('calls onAction handler when action button clicked', () => { /* spy */ });
  it('displays score correctly', () => { /* assert score visible */ });
  it('handles empty interactions list gracefully', () => { /* edge case */ });
});
```

Cobertura alvo: ≥ 60% das linhas de `CRMDetail.tsx`.

**2. Criar `tests/components/WarRoom.test.tsx`** com no mínimo:

```typescript
describe('WarRoom', () => {
  it('renders with mocked WarRoomContext', () => { /* snapshot */ });
  it('submits technical question and triggers orchestrator', () => { /* spy on orchestrator */ });
  it('cancels in-flight query on cancel button', () => { /* abort signal assertion */ });
  it('displays grounding sources when present', () => { /* assert citations */ });
  it('handles benchmark comparison render', () => { /* assert benchmark UI */ });
});
```

Cobertura alvo: ≥ 60% das linhas de `WarRoom.tsx`.

**3. Documentar baseline de cobertura no PR description:**
```bash
npx vitest run --coverage tests/components/CRMDetail.test.tsx tests/components/WarRoom.test.tsx
```
Capturar e colar no PR.

### Aceite
- [ ] `tests/components/CRMDetail.test.tsx` existe e passa.
- [ ] `tests/components/WarRoom.test.tsx` existe e passa.
- [ ] Cobertura ≥ 60% em ambos.
- [ ] Zero modificação em `CRMDetail.tsx` ou `WarRoom.tsx` (apenas testes).

### Rollback
Reverter; nada quebra (só remove testes novos).

---

## Onda 1 — CRMDetail (717 → < 400 linhas)

**PR:** `refactor/sprint-11-onda-1-crmdetail` → `refactor/sprint-11`
**Risco:** alto (componente central; depende da rede de Onda 0)
**Pré-requisito:** Onda 0 mergeada.

### Mudanças

**1. Criar `types/crm.ts`:**
```typescript
export interface CRMCard {
  id: string;
  clientName: string;
  cnpj?: string;
  score: number;
  scoreBreakdown?: ScoreBreakdown;
  interactions: InteractionEntry[];
  metadata: CRMCardMetadata;
}

export interface ScoreBreakdown { /* ... */ }
export interface InteractionEntry { /* ... */ }
export interface CRMCardMetadata { /* ... */ }
export interface Client { /* ... */ }
```

Eliminar todas as ocorrências de `card: any` em `CRMDetail.tsx`.

**2. Criar `components/CRM/transformers.ts`:**
```typescript
import { CRMCard, Client } from '../../types/crm';

export function transformCardToClient(card: CRMCard): Client { /* ... */ }
export function formatScore(score: number): string { /* ... */ }
export function groupInteractionsByMonth(items: InteractionEntry[]): Map<string, InteractionEntry[]> { /* ... */ }
```

**3. Extrair sub-componentes em `components/CRM/cards/`:**

| Arquivo | Responsabilidade | Linhas estimadas |
|---|---|---|
| `ClientHeader.tsx` | Nome, CNPJ, status badge | ~60 |
| `ScoreDisplay.tsx` | Score + breakdown visual | ~80 |
| `InteractionTimeline.tsx` | Timeline de interações | ~120 |
| `ActionButtons.tsx` | Botões de export/ação | ~50 |

**4. `CRMDetail.tsx` vira shell:**
```tsx
export function CRMDetail({ card, onAction }: { card: CRMCard; onAction: ActionHandler }) {
  const client = useMemo(() => transformCardToClient(card), [card]);
  return (
    <div className="crm-detail">
      <ClientHeader client={client} />
      <ScoreDisplay score={client.score} breakdown={card.scoreBreakdown} />
      <InteractionTimeline items={card.interactions} />
      <ActionButtons onAction={onAction} />
    </div>
  );
}
```

**5. Criar testes unitários por sub-componente:**
- `tests/components/CRM/cards/ClientHeader.test.tsx`
- `tests/components/CRM/cards/ScoreDisplay.test.tsx`
- `tests/components/CRM/cards/InteractionTimeline.test.tsx`
- `tests/components/CRM/cards/ActionButtons.test.tsx`

Mínimo 1 teste de render + 1 de interação por arquivo.

### Aceite
- [ ] `wc -l components/CRMDetail.tsx` < 400.
- [ ] `grep -n ": any" components/CRMDetail.tsx` retorna 0.
- [ ] Os 4 sub-componentes existem em `components/CRM/cards/`.
- [ ] `types/crm.ts` exporta `CRMCard`, `Client`, `InteractionEntry`, `ScoreBreakdown`.
- [ ] Testes da Onda 0 (`CRMDetail.test.tsx`) continuam verdes.
- [ ] Testes unitários novos passam.
- [ ] Cobertura geral do componente ≥ 60%.
- [ ] Validação manual: abrir CRM, ver score, expandir timeline, clicar em ação.

### Rollback
Reverter PR; tag `pre-sprint-11` continua válida.

---

## Onda 2 — LoadingSmart (766 → < 400 linhas)

**PR:** `refactor/sprint-11-onda-2-loadingsmart` → `refactor/sprint-11`
**Risco:** médio (já há `LoadingSmart.test.tsx` como rede)

### Mudanças

**1. Expandir `constants/loadingStages.ts`** (atualmente 31 linhas):
```typescript
// adicionar:
export const LOADING_STAGE_DURATION_MS: Record<ModularDossierStage, number> = {
  'Mapeando inteligência operacional...': 2000,
  'Investigando tech stack...': 3000,
  'Investigando riscos & compliance...': 3000,
  'Investigando estratégia & expansão...': 3000,
  'Investigando RH & decisores...': 2500,
  'Cruzando referências de mercado...': 2500,
  'Finalizando dossiê modular...': 1500,
};

export const STAGE_TO_CATEGORY: Record<ModularDossierStage, 'discovery' | 'analysis' | 'synthesis'> = { /* ... */ };
```

**2. Criar `components/loading/LoadingPhases.ts`** — modelo de estados (state machine):
```typescript
export type LoadingPhase = 'idle' | 'preparing' | 'running' | 'finalizing' | 'done' | 'error';

export interface PhaseTransition { /* ... */ }
export const PHASE_TRANSITIONS: PhaseTransition[] = [ /* ... */ ];
export function nextPhase(current: LoadingPhase, event: PhaseEvent): LoadingPhase { /* ... */ }
```

**3. Criar `components/loading/LoadingTimeline.tsx`** — render puro (sem lógica):
```tsx
export function LoadingTimeline({ stages, currentStageIndex }: LoadingTimelineProps) {
  return ( /* render-only */ );
}
```

**4. `components/LoadingSmart.tsx` vira shell** (orquestrador):
- Importa `LoadingPhases`, `LoadingTimeline`, constantes.
- Mantém apenas a coordenação top-level.
- Ou renomear para `LoadingSmartShell.tsx` se ficar muito enxuto (decisão: manter nome para compat de imports).

**5. Criar `tests/components/loading/LoadingPhases.test.ts`** com casos de transição.

**6. Criar `tests/components/loading/LoadingTimeline.test.tsx`** com snapshot + um caso de progressão.

### Aceite
- [ ] `wc -l components/LoadingSmart.tsx` < 400.
- [ ] `components/loading/LoadingPhases.ts` e `LoadingTimeline.tsx` existem.
- [ ] `constants/loadingStages.ts` exporta `LOADING_STAGE_DURATION_MS`.
- [ ] `tests/components/LoadingSmart.test.tsx` (existente) continua verde.
- [ ] Testes novos passam.
- [ ] Validação manual: gerar dossiê e ver timeline animar fase a fase.

### Rollback
Reverter PR.

---

## Onda 3 — WarRoom (552 → < 300 linhas)

**PR:** `refactor/sprint-11-onda-3-warroom` → `refactor/sprint-11`
**Risco:** alto (depende da Onda 0 para WarRoom)
**Pré-requisito:** Onda 0 mergeada.

### Mudanças

**1. Criar `components/WarRoom/types.ts`:**
```typescript
export interface WarRoomParams { question: string; context: WarRoomContext; }
export interface WarRoomContext { /* ... */ }
export interface GroundingSource { url: string; title: string; snippet?: string; }
export interface BenchmarkData { /* ... */ }
```

**2. Extrair sub-componentes em `components/WarRoom/`:**

| Arquivo | Responsabilidade | Linhas estimadas |
|---|---|---|
| `TechnicalQuestionBlock.tsx` | Input + submit da pergunta | ~80 |
| `BenchmarkComparison.tsx` | Tabela comparativa | ~100 |
| `SourceCitations.tsx` | Lista de fontes/grounding | ~70 |
| `CancellationHandler.tsx` | Lógica de cancelamento (hook + UI) | ~60 |

**3. `WarRoom.tsx` vira shell** que compõe os blocos.

**4. Atualizar testes existentes:**
- `tests/components/WarRoom.test.tsx` (Onda 0) — pode precisar de pequenos ajustes em queries.
- `tests/components/warRoomTargetExtract.test.ts` — verificar se ainda faz sentido após extração.

**5. Criar testes unitários por sub-componente:**
- `tests/components/WarRoom/TechnicalQuestionBlock.test.tsx`
- `tests/components/WarRoom/BenchmarkComparison.test.tsx`
- `tests/components/WarRoom/SourceCitations.test.tsx`
- `tests/components/WarRoom/CancellationHandler.test.tsx`

### Aceite
- [ ] `wc -l components/WarRoom.tsx` < 300.
- [ ] Os 4 sub-componentes existem em `components/WarRoom/`.
- [ ] `components/WarRoom/types.ts` exporta tipos do feature.
- [ ] Teste da Onda 0 (`WarRoom.test.tsx`) continua verde.
- [ ] `warRoomTargetExtract.test.ts` continua verde.
- [ ] Testes unitários novos passam.
- [ ] Cobertura ≥ 60% nas linhas alteradas.
- [ ] Validação manual: pergunta técnica → resposta com fontes + benchmark; cancelar funciona.

### Rollback
Reverter PR.

---

## Onda 4 — Eliminar `any` críticos em produção

**PR:** `refactor/sprint-11-onda-4-no-any` → `refactor/sprint-11`
**Risco:** médio (toca múltiplos arquivos)

### Mudanças por arquivo

**1. `services/clientLookupService.ts` (7 ocorrências):**

Substituir `any` por interfaces explícitas:
```typescript
interface ClientLookupQuery { cnpj: string; tipo?: 'pf' | 'pj'; }
interface ClientLookupResponse { id: string; nome: string; /* ... */ }
interface ClientLookupRawResponse { /* shape vindo da API externa */ }

// Para entradas de API externa não validadas: usar `unknown` + type guard
function isClientLookupResponse(value: unknown): value is ClientLookupResponse { /* ... */ }
```

**2. `components/SystemHealthCheck.tsx` (7 ocorrências):**
```typescript
interface HealthCheckResult {
  status: 'ok' | 'warning' | 'error';
  message: string;
  metric?: HealthMetric;
}
interface HealthMetric { name: string; value: number; threshold?: number; }
```

**3. `utils/printExport.ts` (3 ocorrências):**

Tipar payloads e nodes do jsPDF:
```typescript
import type { jsPDF } from 'jspdf';

interface ExportPayload { /* ... */ }
function renderToCanvas(node: HTMLElement, pdf: jsPDF): void { /* ... */ }
```

**4. `api/radar-scan.ts` (3 ocorrências):**
```typescript
interface RadarScanRequest { /* ... */ }
interface RadarScanResponse { /* ... */ }
// Server-side: aceitar `unknown` em entradas mas tipar saídas e validar com Zod se já houver.
```

**5. `utils/errorHelpers.ts` (se aplicável):**
```typescript
// ❌ function normalizeAppError(error: any, context: ErrorContext): AppError
// ✅ function normalizeAppError(error: unknown, context: ErrorContext): AppError {
//      if (error instanceof Error) { /* narrow */ }
//      // ...
//    }
```

### Aceite
- [ ] `grep -rn ": any" --include="*.ts" --include="*.tsx" . | grep -v node_modules | grep -v dist | grep -v "\.test\." | grep -v "scripts/" | grep -v "\.agent/" | wc -l` retorna **0**.
- [ ] Tipos novos exportados de locais consistentes (`types/` ou local ao módulo).
- [ ] `npm run typecheck` continua verde.
- [ ] Testes existentes continuam verdes.

### Rollback
Reverter PR.

---

## Critérios de Aceite Finais (gate de merge para `main`)

- [ ] `wc -l components/CRMDetail.tsx` < 400.
- [ ] `wc -l components/LoadingSmart.tsx` < 400.
- [ ] `wc -l components/WarRoom.tsx` < 300.
- [ ] Zero `any` em produção (excluindo `tests/`, `scripts/`, `.agent/`).
- [ ] Cobertura de Onda 0 ≥ 60% mantida em `CRMDetail` e `WarRoom` após todas as ondas.
- [ ] Tipos explícitos em `types/crm.ts`, `components/loading/LoadingPhases.ts`, `components/WarRoom/types.ts`.
- [ ] OI-051, OI-052, OI-053, OI-059 movidos para "Histórico" em `03-OPEN-ITEMS.md`.
- [ ] `04-ARCHITECTURE-TARGET.md` atualizado: linha "Componentes < 500 linhas" sai da tabela de violações.
- [ ] `HANDOFF_AI.md` atualizado com novos números.
- [ ] Gates verdes: `npm test`, `typecheck`, `build`, `lint`.
- [ ] Validação manual completa.

## Estimativa de redução

| Métrica | Antes | Depois (target) |
|---|---|---|
| `CRMDetail.tsx` | 717 ln, `card: any` | < 400 ln, tipado |
| `LoadingSmart.tsx` | 766 ln | < 400 ln |
| `WarRoom.tsx` | 552 ln | < 300 ln |
| `any` em produção | ~50 | 0 |
| Componentes > 500 linhas | 3 | 0 |
| Testes para alvos | apenas `LoadingSmart` | 3 + sub-componentes |

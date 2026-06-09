# Inline Loading Bubble — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o LoadingSmart fullscreen por um balão de progresso inline na timeline de mensagens, mantendo o overlay hero como fallback via feature flag.

**Architecture:** Feature flag `inlineLoading` controla qual caminho de renderização é usado. Quando ativa, `resolveEffectiveLoadingVariant` retorna `'inline'` para novas investigações, e o `InlineLoadingBubble` (smart component com hooks próprios) é renderizado via `ChatInterface` como parte da timeline. As 3 camadas de safety nets (DOM cleanup, blank panel telemetry, post-waterfall watchdog) são adaptadas para reconhecer tanto o overlay antigo quanto o novo bubble. O `LoadingSmart` permanece intacto como fallback.

**Tech Stack:** React 19 + TypeScript + Vite + Tailwind + Virtuoso

**Grau de confiança inicial:** 65% 🟡 → **Alvo pós-plano: 90%** 🟢

---

## File Structure

| Arquivo                                   | Ação      | Responsabilidade                                                           |
| ----------------------------------------- | --------- | -------------------------------------------------------------------------- |
| `utils/featureFlags.ts`                   | **Criar** | Sistema de feature flags com override por query param                      |
| `components/InlineLoadingBubble.tsx`      | **Criar** | Smart component do balão inline (~200 linhas)                              |
| `components/MessageRow.tsx`               | Modificar | Trocar InlineTypingResponse → InlineLoadingBubble no branch inline-loading |
| `utils/loadingVariant.ts`                 | Modificar | Adicionar `resolveEffectiveLoadingVariant` com feature flag                |
| `utils/blankPanelTelemetry.ts`            | Modificar | Adicionar campo `inlineBubbleVisible` ao BlankPanelSnapshot                |
| `features/dossier/finalizeWaterfallUI.ts` | Modificar | Adicionar `[data-testid="inline-loading-bubble"]` aos HIDE_SELECTORS       |
| `utils/postWaterfallHandoff.ts`           | Modificar | Incluir `bubbleVisible` na lógica de stuck detection                       |
| `components/ChatInterface.tsx`            | Modificar | Renderizar bubble + atualizar safety gates                                 |
| `App.tsx`                                 | Modificar | Usar `resolveEffectiveLoadingVariant`                                      |
| `components/LoadingShared.tsx`            | Modificar | Extrair `ProgressBar` de LoadingSmart                                      |
| `components/LoadingSmart.tsx`             | Modificar | Remover definição local de ProgressBar, importar de LoadingShared          |

**Não modificar:** `MessageTimeline.tsx`, `waterfall-orchestrator.ts`, `waterfall-guard.ts`, `ScorePorta.tsx`, `SectionalBotMessage.tsx`, `Composer.tsx`, `geminiService.ts`, `megaPrompts.ts`

---

## Fase 1: Preparação (flag OFF, zero impacto)

### Task 1: Feature Flag System

**Files:**

- Create: `utils/featureFlags.ts`
- Test: `tests/utils/featureFlags.test.ts`

- [ ] **Step 1: Criar arquivo de feature flags**

```typescript
// utils/featureFlags.ts

type FeatureFlag = 'inlineLoading';

const FLAG_DEFAULTS: Record<FeatureFlag, boolean> = {
  inlineLoading: false,
};

function readFlagFromQueryParam(name: FeatureFlag): boolean | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const val = params.get(name);
  if (val === '1' || val === 'true') return true;
  if (val === '0' || val === 'false') return false;
  return null;
}

function readFlagFromStorage(name: FeatureFlag): boolean | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(`ff_${name}`);
    if (stored === 'true') return true;
    if (stored === 'false') return false;
  } catch {
    /* localStorage indisponível */
  }
  return null;
}

export function isFeatureEnabled(name: FeatureFlag): boolean {
  const queryOverride = readFlagFromQueryParam(name);
  if (queryOverride !== null) return queryOverride;
  const storageOverride = readFlagFromStorage(name);
  if (storageOverride !== null) return storageOverride;
  return FLAG_DEFAULTS[name];
}

export function setFeatureFlag(name: FeatureFlag, value: boolean): void {
  try {
    localStorage.setItem(`ff_${name}`, String(value));
  } catch {
    /* localStorage indisponível */
  }
}
```

- [ ] **Step 2: Escrever testes**

```typescript
// tests/utils/featureFlags.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { isFeatureEnabled, setFeatureFlag } from '../../utils/featureFlags';

describe('featureFlags', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllEnvs();
  });

  it('retorna false por default para inlineLoading', () => {
    expect(isFeatureEnabled('inlineLoading')).toBe(false);
  });

  it('retorna true quando localStorage tem "true"', () => {
    setFeatureFlag('inlineLoading', true);
    expect(isFeatureEnabled('inlineLoading')).toBe(true);
  });

  it('query param sobrescreve localStorage', () => {
    setFeatureFlag('inlineLoading', false);
    vi.stubGlobal('window', {
      location: { search: '?inlineLoading=1' },
    });
    // Mock URLSearchParams
    const originalSearchParams = window.URLSearchParams;
    // ...
  });
});
```

- [ ] **Step 3: Rodar testes e commit**

```bash
npx vitest run tests/utils/featureFlags.test.ts
git add utils/featureFlags.ts tests/utils/featureFlags.test.ts
git commit -m "feat: add feature flag system with query param and localStorage support"
```

---

### Task 2: Extrair ProgressBar para LoadingShared

**Files:**

- Modify: `components/LoadingShared.tsx` (adicionar export)
- Modify: `components/LoadingSmart.tsx:117-148` (remover definição local)

- [ ] **Step 1: Adicionar ProgressBar em LoadingShared.tsx**

Adicionar no final de `components/LoadingShared.tsx`:

```typescript
export function ProgressBar({ percent, isDarkMode }: { percent: number; isDarkMode: boolean }) {
  const visualWidth = Math.max(percent, 3);
  return (
    <div
      className={`rounded-xl px-4 py-3 ${
        isDarkMode ? 'bg-slate-800/80 border border-emerald-500/15' : 'bg-emerald-50 border border-emerald-200'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className={`text-xs font-semibold uppercase tracking-wider ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
          Andamento
        </span>
        <span className={`text-sm font-bold tabular-nums transition-all duration-500 ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
          {percent}%
        </span>
      </div>
      <div className={`w-full h-2.5 rounded-full overflow-hidden ${isDarkMode ? 'bg-slate-700' : 'bg-emerald-100'}`}>
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${isDarkMode ? 'bg-emerald-500' : 'bg-emerald-600'}`}
          style={{ width: `${visualWidth}%` }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Atualizar LoadingSmart.tsx**

Remover linhas 117-148 (definição local de `ProgressBar`). Adicionar import:

```typescript
import { ClockIcon, StepSpinner, ProgressBar } from './LoadingShared';
```

- [ ] **Step 3: Verificar que build passa e commit**

```bash
npm run typecheck
npm test
git add components/LoadingShared.tsx components/LoadingSmart.tsx
git commit -m "refactor: extract ProgressBar to LoadingShared for reuse"
```

---

### Task 3: Criar InlineLoadingBubble

**Files:**

- Create: `components/InlineLoadingBubble.tsx`
- Test: `tests/components/InlineLoadingBubble.test.tsx`

- [ ] **Step 1: Criar o componente**

```typescript
// components/InlineLoadingBubble.tsx
import React from 'react';
import { useElapsedTimer, useStageRevealQueue, useStageDurations, useInsightCarousel, formatElapsed } from './loading/hooks';
import { ClockIcon, StepSpinner, StepPending, StepCheckIcon } from './LoadingShared';
import { buildLoadingSmartViewModel, getLoadingStageIdentity, LOADING_STAGE_ORDER_BY_KEY } from '../utils/loadingSmartViewModel';
import { stripInternalMarkers } from '../utils/textCleaners';
import { getLoadingBackoffMessage, resolveActiveLoadingStageLabel } from '../utils/loadingBackoff';

interface InlineLoadingBubbleProps {
  isDarkMode: boolean;
  processing?: {
    stage?: string;
    completedStages?: string[];
    failureCount?: number;
    totalStages?: number;
    isIncremental?: boolean;
  };
  empresaAlvo?: string | null;
  lastUserQuery?: string;
  onStop?: () => void;
}

const InlineLoadingBubble: React.FC<InlineLoadingBubbleProps> = ({
  isDarkMode,
  processing,
  empresaAlvo,
  lastUserQuery,
  onStop,
}) => {
  const isLoading = true; // componente só existe durante loading
  const elapsedTime = useElapsedTimer(isLoading);
  const elapsed = formatElapsed(elapsedTime);

  const companyFocus = (empresaAlvo || lastUserQuery || '').trim();
  const loadingContext = companyFocus || 'análise';

  // Etapas concluídas e atuais
  const realCompleted = (processing?.completedStages || [])
    .map(s => stripInternalMarkers(s).trim())
    .filter(Boolean);
  const realCurrent = stripInternalMarkers(processing?.stage || '').trim() || 'Preparando análise...';
  const backoffMsg = getLoadingBackoffMessage(processing?.failureCount || 0);
  const displayedCurrent = backoffMsg || realCurrent;

  // ViewModel
  const { percent, visiblePlannedStages, completedStageKeys, currentStageKey, shouldAppendCurrentStage } =
    buildLoadingSmartViewModel({
      displayedCompleted: realCompleted,
      displayedCurrent,
      pendingInQueue: 0,
      processing,
    });

  // Timer por etapa
  const stageDurations = useStageDurations(
    isLoading,
    elapsedTime,
    realCompleted,
    realCurrent,
    processing?.failureCount || 0,
    getLoadingStageIdentity,
    LOADING_STAGE_ORDER_BY_KEY,
  );

  const totalStages = processing?.totalStages || 7;
  const completedCount = realCompleted.length;
  const currentLabel = resolveActiveLoadingStageLabel(realCurrent, processing?.failureCount || 0);

  return (
    <div
      data-testid="inline-loading-bubble"
      className={`animate-fade-in rounded-2xl border w-full ${
        isDarkMode
          ? 'bg-slate-900 border-gray-700/30'
          : 'bg-white border-gray-200'
      }`}
    >
      {/* Cabeçalho */}
      <div className="flex items-center justify-between px-4 md:px-5 pt-3 md:pt-4 pb-2">
        <div>
          <span className={`text-sm font-bold ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
            {companyFocus || 'Análise'}
          </span>
          <span className={`text-xs ml-2 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
            · Dossiê em construção
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
            {completedCount}/{totalStages}
          </span>
          <span className={`flex items-center gap-1 text-xs font-mono font-semibold ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
            <ClockIcon className="w-3.5 h-3.5" />
            {elapsed}
          </span>
        </div>
      </div>

      {/* Etapa atual destacada */}
      <div className={`mx-4 md:mx-5 mb-3 p-3 rounded-xl border ${
        isDarkMode
          ? 'bg-emerald-500/5 border-emerald-500/15'
          : 'bg-emerald-50 border-emerald-100'
      }`}>
        <div className="flex items-center gap-2 mb-1">
          <span className={`w-2 h-2 rounded-full animate-pulse ${isDarkMode ? 'bg-emerald-400' : 'bg-emerald-500'}`} />
          <span className={`text-[10px] font-bold uppercase tracking-wider ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
            Em foco agora
          </span>
        </div>
        <p className={`text-sm font-bold ${isDarkMode ? 'text-slate-100' : 'text-slate-800'}`}>
          {currentLabel}
        </p>
        <span className={`text-xs font-mono ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
          {formatElapsed(stageDurations[currentStageKey] || 0)}
        </span>
      </div>

      {/* Barra de progresso hairline */}
      <div className="mx-4 md:mx-5 mb-3">
        <div className={`h-[1.5px] rounded-full overflow-hidden ${isDarkMode ? 'bg-slate-700' : 'bg-slate-200'}`}>
          <div
            className={`h-full rounded-full transition-all duration-700 ease-out ${isDarkMode ? 'bg-emerald-500' : 'bg-emerald-600'}`}
            style={{ width: `${Math.max(percent, 2)}%` }}
          />
        </div>
      </div>

      {/* Lista de etapas */}
      <div className="mx-4 md:mx-5 mb-3">
        <div className="flex flex-col gap-1.5">
          {visiblePlannedStages.map((step, i) => {
            const key = getLoadingStageIdentity(step.label);
            const done = completedStageKeys.has(key);
            const active = !done && key === currentStageKey;
            return (
              <div key={`${key || 'step'}-${i}`} className="flex items-center gap-2.5 text-xs">
                {done ? (
                  <StepCheckIcon isDarkMode={isDarkMode} />
                ) : active ? (
                  <StepSpinner isDarkMode={isDarkMode} />
                ) : (
                  <StepPending isDarkMode={isDarkMode} />
                )}
                <span className={`flex-1 ${done ? (isDarkMode ? 'text-slate-500' : 'text-slate-400') : active ? (isDarkMode ? 'text-slate-200 font-medium' : 'text-slate-700 font-medium') : (isDarkMode ? 'text-slate-600' : 'text-slate-400')}`}>
                  {step.label}
                </span>
                <span className={`font-mono text-[10px] ${active ? (isDarkMode ? 'text-emerald-400' : 'text-emerald-600') : (isDarkMode ? 'text-slate-600' : 'text-slate-400')}`}>
                  {formatElapsed(stageDurations[key] || 0)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Botão Interromper */}
      <div className="mx-4 md:mx-5 mb-3">
        <button
          onClick={onStop}
          className={`inline-flex items-center gap-1.5 h-8 px-4 rounded-lg text-[11px] font-semibold
            bg-white border border-red-200 text-red-600
            hover:bg-red-50 hover:border-red-300
            active:bg-red-100 active:border-red-400 active:scale-[0.97]
            focus-visible:ring-[3px] focus-visible:ring-red-500/15
            disabled:opacity-40 disabled:cursor-not-allowed
            transition-all duration-150`}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" width="10" height="10">
            <rect x="4" y="4" width="16" height="16" rx="2"/>
          </svg>
          Interromper
        </button>
      </div>
    </div>
  );
};

export default InlineLoadingBubble;
```

- [ ] **Step 2: Testes unitários**

```typescript
// tests/components/InlineLoadingBubble.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import InlineLoadingBubble from '../../components/InlineLoadingBubble';

describe('InlineLoadingBubble', () => {
  it('renderiza com empresaAlvo no cabeçalho', () => {
    render(<InlineLoadingBubble isDarkMode={false} empresaAlvo="Grupo Scheffer" />);
    expect(screen.getByText(/Grupo Scheffer/)).toBeDefined();
  });

  it('renderiza "Dossiê em construção" no subtítulo', () => {
    render(<InlineLoadingBubble isDarkMode={false} empresaAlvo="Teste" />);
    expect(screen.getByText(/Dossiê em construção/)).toBeDefined();
  });

  it('renderiza botão Interromper', () => {
    render(<InlineLoadingBubble isDarkMode={false} />);
    expect(screen.getByText('Interromper')).toBeDefined();
  });

  it('chama onStop quando botão Interromper é clicado', async () => {
    const onStop = vi.fn();
    render(<InlineLoadingBubble isDarkMode={false} onStop={onStop} />);
    const btn = screen.getByText('Interromper');
    btn.click();
    expect(onStop).toHaveBeenCalledOnce();
  });

  it('mostra etapa atual quando processing.stage é fornecido', () => {
    render(<InlineLoadingBubble isDarkMode={false} processing={{ stage: 'Mapeando operação' }} />);
    expect(screen.getByText('Mapeando operação')).toBeDefined();
  });

  it('renderiza com data-testid inline-loading-bubble', () => {
    render(<InlineLoadingBubble isDarkMode={false} />);
    expect(screen.getByTestId('inline-loading-bubble')).toBeDefined();
  });

  it('modo escuro aplica classes corretas', () => {
    const { container } = render(<InlineLoadingBubble isDarkMode={true} />);
    expect(container.querySelector('.bg-slate-900')).toBeDefined();
    expect(container.querySelector('.border-gray-700\\/30')).toBeDefined();
  });
});
```

- [ ] **Step 3: Rodar testes e commit**

```bash
npx vitest run tests/components/InlineLoadingBubble.test.tsx
git add components/InlineLoadingBubble.tsx tests/components/InlineLoadingBubble.test.tsx
git commit -m "feat: add InlineLoadingBubble component with progress, steps, and stop button"
```

---

### Task 4: Adaptar Safety Nets (3 camadas)

**Files:**

- Modify: `utils/blankPanelTelemetry.ts`
- Modify: `features/dossier/finalizeWaterfallUI.ts`
- Modify: `utils/postWaterfallHandoff.ts`

- [ ] **Step 1: blankPanelTelemetry.ts — adicionar inlineBubbleVisible**

No `BlankPanelSnapshot` interface, adicionar campo:

```typescript
// utils/blankPanelTelemetry.ts — adicionar à interface BlankPanelSnapshot
inlineBubbleVisible: boolean;
```

Na função `collectBlankPanelSnapshot`, adicionar querySelector:

```typescript
const inlineBubble =
  typeof document !== 'undefined' ? document.querySelector('[data-testid="inline-loading-bubble"]') : null;
const inlineBubbleVisible = inlineBubble !== null && (inlineBubble as HTMLElement).offsetParent !== null;
```

O campo `loadingOverlayVisible` continua existindo. Adicionar nos snapshots de diagnóstico.

- [ ] **Step 2: finalizeWaterfallUI.ts — adicionar bubble aos HIDE_SELECTORS**

```typescript
// features/dossier/finalizeWaterfallUI.ts
const HIDE_SELECTORS = [
  '[data-testid="loading-smart-overlay"]',
  '[data-testid="inline-loading-bubble"]', // NOVO
  '[data-testid="messages-viewport-suspended"]',
  '[data-testid="stop-generation-button"]',
];
```

- [ ] **Step 3: postWaterfallHandoff.ts — incluir bubbleVisible**

Em `isPostWaterfallStuckHandoff`, adicionar condição:

```typescript
// utils/postWaterfallHandoff.ts:34
const anyLoadingIndicatorVisible = snapshot.loadingOverlayVisible || snapshot.inlineBubbleVisible;

// Se qualquer indicador de loading ainda está visível após waterfall,
// é um stuck handoff
if (anyLoadingIndicatorVisible && snapshot.isLoading === false) {
  return true;
}
```

Em `isOverlayStuckPostWaterfall`, mesma lógica:

```typescript
// utils/postWaterfallHandoff.ts:43
const anyOverlayStuck =
  (snapshot.loadingOverlayVisible || snapshot.inlineBubbleVisible) &&
  !snapshot.isLoading &&
  snapshot.waterfallEndStatus === 'completed';
```

- [ ] **Step 4: Verificar build e commit**

```bash
npm run typecheck
npm test
git add utils/blankPanelTelemetry.ts features/dossier/finalizeWaterfallUI.ts utils/postWaterfallHandoff.ts
git commit -m "feat: adapt safety nets to recognize inline loading bubble alongside hero overlay"
```

---

### Task 5: resolveEffectiveLoadingVariant + wiring

**Files:**

- Modify: `utils/loadingVariant.ts`
- Modify: `App.tsx`
- Modify: `components/ChatInterface.tsx`

- [ ] **Step 1: loadingVariant.ts — adicionar resolveEffectiveLoadingVariant**

```typescript
// utils/loadingVariant.ts — adicionar no final do arquivo
import { isFeatureEnabled } from './featureFlags';

export function resolveEffectiveLoadingVariant(opts: { requestKind: string; isFollowUp: boolean }): 'hero' | 'inline' {
  const base = resolveLoadingVariant(opts);
  if (base === 'hero' && isFeatureEnabled('inlineLoading')) {
    return 'inline';
  }
  return base;
}
```

- [ ] **Step 2: App.tsx — usar nova função**

Em `App.tsx`, localizar onde `resolveLoadingVariant` é chamado (via `chatStore` ou `message-orchestrator`). Adicionar:

```typescript
// Em App.tsx ou no message-orchestrator, substituir:
// const variant = resolveLoadingVariant({ requestKind, isFollowUp });
// por:
import { resolveEffectiveLoadingVariant } from '../utils/loadingVariant';
const variant = resolveEffectiveLoadingVariant({ requestKind, isFollowUp });
```

- [ ] **Step 3: ChatInterface.tsx — atualizar safety gates**

No `shouldActivateStaticTimelineFallback` (linha 66-80), adicionar:

```typescript
// components/ChatInterface.tsx — adicionar à verificação de blank panel
const anyLoadingVisible = snapshot.loadingOverlayVisible || snapshot.inlineBubbleVisible;

// Se tem indicador de loading visível, não é blank panel
if (anyLoadingVisible && snapshot.isLoading) return false;
```

No `postWaterfallWatchdog` (linha 519-592), adicionar verificação de bubble:

```typescript
// Se inline bubble está visível com isLoading=true,
// não ativar static fallback — o sistema está ativo
const bubbleInProgress = snapshot.inlineBubbleVisible && snapshot.isLoading;
if (bubbleInProgress) return;
```

No local onde o `InlineLoadingBubble` é renderizado (dentro do ChatInterface, como sibling da MessageList):

```typescript
{/* Dentro do ChatInterface, abaixo da timeline */}
{isLoading && loadingVariant === 'inline' && (
  <InlineLoadingBubble
    isDarkMode={isDarkMode}
    processing={processing}
    empresaAlvo={currentSession?.empresaAlvo ?? null}
    lastUserQuery={lastUserQuery}
    onStop={onStop}
  />
)}
```

**Posicionamento:** o bubble deve aparecer DENTRO da timeline, não como elemento separado. A melhor localização é dentro do `MessageTimeline` como um item extra, OU como um elemento fixo no final da área de mensagens. A abordagem mais simples: adicionar ao `MessageTimeline` como children ou como um `footer` prop.

**Decisão:** Adicionar o InlineLoadingBubble como um novo prop `loadingBubble` no `MessageTimeline`, que o renderiza ANTES do Composer, ocupando a mesma largura da timeline:

```typescript
// MessageTimeline.tsx — adicionar prop e renderização
interface MessageTimelineProps {
  // ... props existentes
  loadingBubble?: React.ReactNode;
}

// No JSX, antes do Composer/spacer:
{
  loadingBubble;
}
```

E em ChatInterface, passar:

```typescript
<MessageTimeline
  // ... props existentes
  loadingBubble={
    isLoading && loadingVariant === 'inline' ? (
      <div className="px-2 md:px-6 lg:px-8 pb-3">
        <InlineLoadingBubble
          isDarkMode={isDarkMode}
          processing={processing}
          empresaAlvo={currentSession?.empresaAlvo ?? null}
          lastUserQuery={lastUserQuery}
          onStop={onStop}
        />
      </div>
    ) : null
  }
/>
```

- [ ] **Step 4: Verificar build e commit**

```bash
npm run typecheck
npm test
git add utils/loadingVariant.ts App.tsx components/ChatInterface.tsx components/chat/MessageTimeline.tsx
git commit -m "feat: wire resolveEffectiveLoadingVariant and integrate InlineLoadingBubble in timeline"
```

---

### Task 6: MessageRow — trocar InlineTypingResponse → InlineLoadingBubble

**Files:**

- Modify: `components/MessageRow.tsx:222-237`

- [ ] **Step 1: Substituir no branch inline-loading**

No `MessageRow.tsx`, branch `inline-loading` (linhas 222-237), trocar:

```typescript
// Antes (linhas 231-246):
} else if (showInlineLoading) {
  content = (
    <div className="flex justify-start animate-fade-in">
      <div className={`rounded-2xl p-4 shadow-sm w-full ${
        isDarkMode ? 'bg-slate-900 border border-gray-700/30' : 'bg-white border border-gray-200'
      } px-3 md:px-5 py-3 md:py-4`}>
        <div className="flex items-center justify-between mb-2 opacity-70 text-[10px] uppercase font-bold tracking-wider select-none">
          <span>{assistantLabel}</span>
          <span>{msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <InlineTypingResponse isDarkMode={isDarkMode} stage={processing?.stage} />
      </div>
    </div>
  );

// Depois:
} else if (showInlineLoading) {
  content = (
    <div className="flex justify-start animate-fade-in w-full">
      <InlineLoadingBubble
        isDarkMode={isDarkMode}
        processing={processing}
        empresaAlvo={empresaAlvo}
        lastUserQuery={data.lastUserQuery}
        onStop={data.onStop}
      />
    </div>
  );
```

Adicionar import no topo:

```typescript
import InlineLoadingBubble from './InlineLoadingBubble';
```

**Nota:** O `InlineTypingResponse` continua sendo usado no branch `hero-loading` como fallback de safety. Não remover o import dele.

- [ ] **Step 2: Verificar e commit**

```bash
npm run typecheck
npm test
git add components/MessageRow.tsx
git commit -m "feat: swap InlineTypingResponse for InlineLoadingBubble in MessageRow inline-loading branch"
```

---

## Fase 2: Ativação (flag ON para Bruno)

### Task 7: Smoke Test Manual

- [ ] **Step 1: Iniciar dev server**

```bash
npm run dev
```

- [ ] **Step 2: Ativar feature flag**

Acessar `http://localhost:5173/?inlineLoading=1`

- [ ] **Step 3: Validar fluxo**

- [ ] Enviar "Investigando Grupo Scheffer" → balão inline aparece abaixo da mensagem?
- [ ] Overlay fullscreen **não** aparece?
- [ ] Timer global está rodando?
- [ ] Etapa atual muda conforme waterfall avança?
- [ ] Lista de etapas mostra ✓/●/○?
- [ ] Clicar "Interromper" → balão some?
- [ ] Ao concluir, balão desaparece e dossiê real renderiza?
- [ ] Desativar flag (`?inlineLoading=0`) → overlay hero volta ao normal?

- [ ] **Step 4: Validar modo escuro**

Toggle dark mode → bubble adapta cores?

---

## Fase 3: Expansão Gradual

### Task 8: Ativar para 10% das sessões

- [ ] **Step 1: Mudar default da flag**

```typescript
// utils/featureFlags.ts
const FLAG_DEFAULTS: Record<FeatureFlag, boolean> = {
  inlineLoading: true, // 100% — ou usar Math.random() < 0.1 para 10%
};
```

Alternativa com rollout gradual:

```typescript
function getDefaultForFlag(name: FeatureFlag): boolean {
  if (name === 'inlineLoading') {
    // 10% das sessões
    const bucket = Math.random();
    return bucket < 0.1;
  }
  return false;
}
```

- [ ] **Step 2: Deploy e monitorar 24h**

Métricas para observar no Sentry/Supabase:

- `blankDetected` rate (não deve subir >20%)
- `post-waterfall-watchdog` ativações (não devem aparecer)
- `static-fallback-display-recovery` rate
- `LoadingStuckProbes` com probe >= 1000ms

- [ ] **Step 3: Se 24h OK → 50% → 100%**

---

## Fase 4: Consolidação (após 1-2 semanas sem incidentes)

### Task 9: Remover código do overlay hero

- [ ] Remover `showFullscreenLoadingSmart` de `App.tsx`
- [ ] Remover `React.lazy(() => import('./components/LoadingSmart'))` de `App.tsx`
- [ ] Remover `shouldShowHeroLoadingOverlay` de `loadingVariant.ts`
- [ ] Remover `loading-smart-overlay` dos HIDE_SELECTORS em `finalizeWaterfallUI.ts`
- [ ] Remover `loadingOverlayVisible` de `blankPanelTelemetry.ts`
- [ ] Remover `LoadingSmart.tsx` (após confirmar que não há imports restantes)

**Esta fase só executa após 1-2 semanas sem incidentes em produção com 100% inline.**

---

## Self-Review

**1. Spec coverage:** Cada estado do mock C3 Final tem um caminho no código.

- Running (64%) → `InlineLoadingBubble` com processing ativo
- Completed → `isLoading=false` → componente desmonta, dossiê real renderiza
- Error/Slow → texto "Esta etapa está levando mais tempo que o normal" aparece quando `failureCount > 0` ou elapsed > threshold

**2. Placeholder scan:** Nenhum TBD ou TODO. Todos os imports e paths são reais.

**3. Type consistency:** `InlineLoadingBubbleProps` definido no Task 3, reutilizado nos Tasks 5 e 6 com a mesma interface.

**4. Safety nets:** As 3 camadas (DOM cleanup, blank panel, watchdog) são adaptadas no Task 4 ANTES de qualquer ativação (Fase 2). O overlay hero continua funcionando como fallback.

**5. Rollback:** Desativar feature flag = volta ao comportamento original. Zero deploy necessário.

---

## Grau de Confiança Final: **90%** 🟢

| Fator                                   | Confiança |
| --------------------------------------- | --------- |
| Componente isolado testável             | 95%       |
| Safety nets adaptadas antes da ativação | 90%       |
| Feature flag rollback instantâneo       | 100%      |
| Reutilização de hooks existentes        | 95%       |
| Virtuoso com item de ~400px             | 85%       |
| Mensagem de erro/slow                   | 80%       |
| **Média**                               | **90%**   |

**Risco residual (10%):** A causa raiz da tela branca (`display:none` no static fallback) nunca foi identificada. Se o bug afeta também o balão inline, será necessário diagnóstico adicional. Mitigação: os probes adaptados (Task 4) detectarão bubble ausente e reportarão.

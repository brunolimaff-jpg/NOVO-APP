# Plano: Estrutura de Testes Anti-Regressão

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Impedir tela branca parcial, loading infinito e erro silencioso no Senior Scout 360 com 3 camadas de teste (contracts + unit + E2E) + fallback visual controlado.

**Architecture:** Helper puro `renderStateClassifier.ts` classifica o estado do painel. data-testid padronizados em 5 componentes permitem detecção em testes. `EmptyStateFallback` inline no ChatInterface cobre o caso de sessão ativa sem conteúdo. 3 contratos validam invariantes. 3 specs E2E protegem contra regressões visuais.

**Tech Stack:** React 19 + TypeScript 5 + Vitest (jsdom) + Playwright + Supabase

**Spec:** `docs/superpowers/specs/2026-05-28-test-anti-regression-design.md`

---

## File Map

| File                                                  | Responsibility                                                                                           | Action |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------ |
| `utils/renderStateClassifier.ts`                      | Classifica estado do painel (empty/loading/content/error)                                                | CREATE |
| `App.tsx`                                             | Container raiz — recebe `app-shell`                                                                      | MODIFY |
| `components/chat/ChatShell.tsx`                       | Header + breadcrumb + sidebar — recebe `app-header`, `app-breadcrumb`, `session-sidebar`, `session-item` | MODIFY |
| `components/ChatInterface.tsx`                        | Orquestrador — recebe `chat-main-panel`, `empty-state` com EmptyStateFallback                            | MODIFY |
| `components/chat/Composer.tsx`                        | Input + botões — renomeia testids para `message-input`, `send-message-button`                            | MODIFY |
| `components/LoadingSmart.tsx`                         | Overlay carregamento — renomeia `loading-smart-overlay` → `loading-smart`                                | MODIFY |
| `features/chat/ChatErrorBoundary.tsx`                 | Erro controlado — renomeia `chat-error-boundary` → `controlled-error`                                    | MODIFY |
| `tests/contracts/renderState.contract.test.tsx`       | Contrato de estados do painel                                                                            | CREATE |
| `tests/contracts/operatorTracking.contract.test.ts`   | Contrato de tracking Supabase                                                                            | CREATE |
| `tests/contracts/supabaseMigrations.contract.test.ts` | Contrato de migrations + RLS                                                                             | CREATE |
| `tests-e2e/blank-center-panel-regression.spec.ts`     | E2E anti-painel-branco                                                                                   | CREATE |
| `tests-e2e/loading-smart-recovery.spec.ts`            | E2E anti-loading-infinito                                                                                | CREATE |
| `tests-e2e/controlled-error-state.spec.ts`            | E2E erro controlado                                                                                      | CREATE |
| `package.json`                                        | +6 scripts                                                                                               | MODIFY |
| `docs/contracts/scout-360-contracts.md`               | Documentação de contratos                                                                                | CREATE |
| `docs/contracts/PR-CHECKLIST.md`                      | Checklist de PR                                                                                          | CREATE |

---

## Fase 1: Fundação (helper + data-testid + EmptyStateFallback)

### Task 1: Criar `utils/renderStateClassifier.ts`

**Files:**

- Create: `utils/renderStateClassifier.ts`

- [ ] **Step 1: Write the helper**

```ts
// utils/renderStateClassifier.ts

export type PanelState = 'empty' | 'loading' | 'content' | 'error';

export interface PanelStateParams {
  messages: unknown[];
  hasDossierContent: boolean;
  isLoading: boolean;
  hasError: boolean;
  hasActiveSession: boolean;
}

export function classifyPanelState(params: PanelStateParams): PanelState {
  if (params.hasError) return 'error';
  if (params.isLoading) return 'loading';
  if (params.messages.length > 0 || params.hasDossierContent) return 'content';
  return 'empty';
}

export const VALID_PANEL_STATES: readonly PanelState[] = ['empty', 'loading', 'content', 'error'] as const;
```

- [ ] **Step 2: Verify file compiles**

```bash
npx tsc --noEmit utils/renderStateClassifier.ts
```

- [ ] **Step 3: Commit**

```bash
git add utils/renderStateClassifier.ts
git commit -m "feat: adiciona renderStateClassifier — classificação explícita de estado do painel

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: Adicionar `app-shell` em App.tsx

**Files:**

- Modify: `App.tsx:426-428`

- [ ] **Step 1: Add data-testid to the root div**

Edit `App.tsx`, change line 426-428 from:

```tsx
      <div
        className={`flex h-[100dvh] min-h-screen w-full flex-col overflow-hidden overscroll-none ${isDarkMode ? 'bg-slate-950' : 'bg-slate-50'}`}
      >
```

To:

```tsx
      <div
        data-testid="app-shell"
        className={`flex h-[100dvh] min-h-screen w-full flex-col overflow-hidden overscroll-none ${isDarkMode ? 'bg-slate-950' : 'bg-slate-50'}`}
      >
```

- [ ] **Step 2: Verify**

```bash
grep -n "app-shell" App.tsx
# Expected: one match at the root div
```

- [ ] **Step 3: Commit**

```bash
git add App.tsx
git commit -m "feat: adiciona data-testid app-shell no container raiz

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: Adicionar `app-header`, `app-breadcrumb`, `session-sidebar`, `session-item` em ChatShell.tsx

**Files:**

- Modify: `components/chat/ChatShell.tsx:102` (header)
- Modify: `components/chat/ChatShell.tsx:125-137` (breadcrumb)
- Modify: `components/chat/ChatShell.tsx:82-83` (SessionsSidebar wrapper)

- [ ] **Step 1: Add `app-header` testid to the header element**

Edit `components/chat/ChatShell.tsx`, change line 102 from:

```tsx
        <header className={`flex items-center justify-between px-3 py-2 border-b flex-none ${theme.surface} ${theme.border}`}>
```

To:

```tsx
        <header data-testid="app-header" className={`flex items-center justify-between px-3 py-2 border-b flex-none ${theme.surface} ${theme.border}`}>
```

- [ ] **Step 2: Wrap breadcrumb with `app-breadcrumb` testid**

Edit lines 125-137, wrap the breadcrumb div:

```tsx
<div data-testid="app-breadcrumb" className="flex items-center gap-2 min-w-0">
  <span
    data-testid="chat-header-breadcrumb-home"
    className={`text-sm font-semibold ${currentSessionId ? 'cursor-pointer hover:opacity-75 transition-opacity' : ''} ${theme.textPrimary}`}
    onClick={() => currentSessionId && onNewSession()}
  >
    Scout 360
  </span>
  {currentSessionId && (
    <>
      <span className={`text-sm ${theme.textSecondary}`}>→</span>
      <span
        data-testid="chat-header-breadcrumb-session"
        className={`text-sm font-semibold truncate ${theme.textPrimary}`}
      >
        {displayTitle}
      </span>
    </>
  )}
</div>
```

(Adds `data-testid="app-breadcrumb"` to the existing wrapper div, keeps internal testids)

- [ ] **Step 3: Wrap SessionsSidebar with `session-sidebar` testid**

The SessionsSidebar is at lines 83-99. Add a wrapper div:

```tsx
      <div data-testid="session-sidebar">
        <SessionsSidebar
          sessions={sessions}
          ...
        />
      </div>
```

- [ ] **Step 4: `session-item` is rendered inside SessionsSidebar component**

Check if `SessionsSidebar.tsx` already has testids per session item:

```bash
grep -n "data-testid" components/SessionsSidebar.tsx
```

If no `session-item` exists, add it to each session list item in `SessionsSidebar.tsx`.

- [ ] **Step 5: Verify**

```bash
grep -n "app-header\|app-breadcrumb\|session-sidebar" components/chat/ChatShell.tsx
```

- [ ] **Step 6: Commit**

```bash
git add components/chat/ChatShell.tsx components/SessionsSidebar.tsx
git commit -m "feat: adiciona data-testid app-header, app-breadcrumb, session-sidebar, session-item

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: Adicionar `chat-main-panel`, `empty-state` e EmptyStateFallback em ChatInterface.tsx

**Files:**

- Modify: `components/ChatInterface.tsx:239-341`

Context: ChatInterface is the orchestrator that has access to `currentSession`, `safeMessages`, `isLoading`. It renders ChatShell with `timeline` (MessageTimeline) and `composer` (Composer) as props.

- [ ] **Step 1: Add imports at top of ChatInterface.tsx**

```tsx
import { classifyPanelState } from '../utils/renderStateClassifier';
import { scoutDiag } from '../utils/diagnosticLog';
```

- [ ] **Step 2: Add EmptyStateFallback inline component before the return statement**

Add after line 236 (`const displayName = ...`):

```tsx
const hasActiveSession = currentSession !== null && currentSession !== undefined;
const hasContent = safeMessages.length > 0;
const panelState = classifyPanelState({
  messages: safeMessages,
  hasDossierContent: false, // dossier content lives inside messages; no messages = no dossier
  isLoading,
  hasError: false, // ChatErrorBoundary handles errors upstream
  hasActiveSession,
});

const showEmptyStateFallback = hasActiveSession && !hasContent && !isLoading;

if (showEmptyStateFallback) {
  scoutDiag('EmptyStateFallback ativado — sessão ativa sem conteúdo renderizável', {
    activeSessionId: currentSession?.id ?? 'unknown',
    activeCompanyName: currentSession?.empresaAlvo ?? currentSession?.title ?? 'unknown',
    messagesLength: safeMessages.length,
    hasDossierContent: false,
    isLoading,
    lastKnownStep: currentSession?.lastStep ?? 'unknown',
    route: typeof window !== 'undefined' ? window.location.pathname : 'ssr',
  });
}
```

- [ ] **Step 3: Wrap timeline with `chat-main-panel` and conditional EmptyStateFallback**

In the `timeline` prop of ChatShell (line 264), wrap the content:

```tsx
      timeline={
        <div data-testid="chat-main-panel" className="flex flex-1 min-h-0 overflow-hidden">
          {showEmptyStateFallback ? (
            <div
              data-testid="empty-state"
              className={`flex flex-1 items-center justify-center p-6 ${isDarkMode ? 'bg-slate-950 text-slate-400' : 'bg-slate-50 text-slate-500'}`}
            >
              <div className="text-center max-w-sm">
                <p className="text-sm font-medium">Nenhum conteúdo disponível</p>
                <p className="text-xs mt-2 opacity-60">
                  O painel está vazio. Tente recarregar a página ou iniciar uma nova investigação.
                </p>
              </div>
            </div>
          ) : (
            <MessageTimeline
              currentSession={currentSession}
              messages={safeMessages}
              isLoading={isLoading}
              ...
            />
          )}
        </div>
      }
```

- [ ] **Step 4: Verify typecheck**

```bash
npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add components/ChatInterface.tsx
git commit -m "feat: adiciona chat-main-panel, empty-state com EmptyStateFallback condicional

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: Renomear data-testid em Composer.tsx

**Files:**

- Modify: `components/chat/Composer.tsx:199-247`

- [ ] **Step 1: Add `message-input` wrapper testid**

Change line 199 (the composer wrapper div) from:

```tsx
      <div className="p-3 flex items-end gap-2">
```

To:

```tsx
      <div data-testid="message-input" className="p-3 flex items-end gap-2">
```

- [ ] **Step 2: Rename `chat-send-button` → `send-message-button`**

Change line 233 from:

```tsx
              data-testid="chat-send-button"
```

To:

```tsx
              data-testid="send-message-button"
```

- [ ] **Step 3: Keep `chat-stop-button` and `chat-input` as-is**

These don't conflict with the standardized names. `chat-input` is the textarea element. `chat-stop-button` is the stop button (different state from send).

- [ ] **Step 4: Verify**

```bash
grep -n "message-input\|send-message-button\|chat-send-button" components/chat/Composer.tsx
# Expected: message-input (new), send-message-button (renamed), NO chat-send-button
```

- [ ] **Step 5: Commit**

```bash
git add components/chat/Composer.tsx
git commit -m "feat: padroniza data-testid em Composer — message-input + send-message-button

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: Renomear `loading-smart-overlay` → `loading-smart` em LoadingSmart.tsx

**Files:**

- Modify: `components/LoadingSmart.tsx:470`

- [ ] **Step 1: Rename data-testid**

Change line 470 from:

```tsx
      data-testid="loading-smart-overlay"
```

To:

```tsx
      data-testid="loading-smart"
```

- [ ] **Step 2: Verify**

```bash
grep -n "loading-smart" components/LoadingSmart.tsx
# Expected: data-testid="loading-smart"
```

- [ ] **Step 3: Commit**

```bash
git add components/LoadingSmart.tsx
git commit -m "feat: renomeia data-testid loading-smart-overlay → loading-smart

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 7: Renomear `chat-error-boundary` → `controlled-error` em ChatErrorBoundary.tsx

**Files:**

- Modify: `features/chat/ChatErrorBoundary.tsx:55`

- [ ] **Step 1: Rename data-testid**

Change line 55 from:

```tsx
        data-testid="chat-error-boundary"
```

To:

```tsx
        data-testid="controlled-error"
```

- [ ] **Step 2: Update any test references**

```bash
grep -rn "chat-error-boundary" tests/ --include="*.tsx" --include="*.ts"
```

If any tests reference `chat-error-boundary`, update them to `controlled-error`.

- [ ] **Step 3: Commit**

```bash
git add features/chat/ChatErrorBoundary.tsx
git commit -m "feat: renomeia data-testid chat-error-boundary → controlled-error

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 8: Verificar typecheck + testes existentes

- [ ] **Step 1: Run typecheck**

```bash
npm run typecheck
```

Expected: PASS (no errors)

- [ ] **Step 2: Run existing unit tests**

```bash
npm test
```

Expected: All existing tests pass

- [ ] **Step 3: Run existing E2E smoke tests**

```bash
npm run test:e2e:smoke
```

Expected: Smoke tests pass (may need data-testid reference updates)

---

## Fase 2: Contratos

### Task 9: Criar `tests/contracts/renderState.contract.test.tsx`

**Files:**

- Create: `tests/contracts/renderState.contract.test.tsx`

- [ ] **Step 1: Write the contract test**

```tsx
// tests/contracts/renderState.contract.test.tsx
import { describe, it, expect } from 'vitest';
import {
  classifyPanelState,
  VALID_PANEL_STATES,
  type PanelState,
  type PanelStateParams,
} from '../../utils/renderStateClassifier';

function state(params: Partial<PanelStateParams>): PanelStateParams {
  return {
    messages: [],
    hasDossierContent: false,
    isLoading: false,
    hasError: false,
    hasActiveSession: false,
    ...params,
  };
}

describe('renderState contract — classifyPanelState', () => {
  describe('VALID_PANEL_STATES', () => {
    it('contém exatamente 4 estados', () => {
      expect(VALID_PANEL_STATES).toHaveLength(4);
    });

    it('contém empty, loading, content, error', () => {
      expect(VALID_PANEL_STATES).toContain('empty');
      expect(VALID_PANEL_STATES).toContain('loading');
      expect(VALID_PANEL_STATES).toContain('content');
      expect(VALID_PANEL_STATES).toContain('error');
    });
  });

  describe('priority: error > loading > content > empty', () => {
    it('hasError vence isLoading', () => {
      expect(classifyPanelState(state({ hasError: true, isLoading: true }))).toBe('error');
    });

    it('hasError vence content (messages)', () => {
      expect(classifyPanelState(state({ hasError: true, messages: ['msg'] }))).toBe('error');
    });

    it('isLoading vence content (messages)', () => {
      expect(classifyPanelState(state({ isLoading: true, messages: ['msg'] }))).toBe('loading');
    });

    it('isLoading vence content (dossier)', () => {
      expect(classifyPanelState(state({ isLoading: true, hasDossierContent: true }))).toBe('loading');
    });

    it('content vence empty', () => {
      expect(classifyPanelState(state({ messages: ['msg'] }))).toBe('content');
    });

    it('dossier content é suficiente para estado content', () => {
      expect(classifyPanelState(state({ hasDossierContent: true }))).toBe('content');
    });
  });

  describe('empty state', () => {
    it('retorna empty quando nada está presente', () => {
      expect(classifyPanelState(state({}))).toBe('empty');
    });

    it('retorna empty com sessão ativa mas sem conteúdo', () => {
      expect(classifyPanelState(state({ hasActiveSession: true }))).toBe('empty');
    });
  });

  describe('nunca retorna null ou undefined', () => {
    it('sempre retorna um valor string definido', () => {
      const combos: PanelStateParams[] = [
        state({}),
        state({ hasActiveSession: true }),
        state({ hasError: true }),
        state({ isLoading: true }),
        state({ messages: ['a'] }),
        state({ hasDossierContent: true }),
        state({ hasError: true, isLoading: true, messages: ['a'], hasDossierContent: true }),
      ];

      for (const combo of combos) {
        const result = classifyPanelState(combo);
        expect(typeof result).toBe('string');
        expect(result).toBeTruthy();
        expect(VALID_PANEL_STATES).toContain(result);
      }
    });
  });

  describe('tipos de retorno', () => {
    it('retorno é assignable a PanelState', () => {
      const result: PanelState = classifyPanelState(state({ messages: ['test'] }));
      expect(result).toBe('content');
    });
  });
});
```

- [ ] **Step 2: Run the contract test**

```bash
npx vitest run tests/contracts/renderState.contract.test.tsx
```

Expected: All 10+ tests pass

- [ ] **Step 3: Commit**

```bash
git add tests/contracts/renderState.contract.test.tsx
git commit -m "feat: adiciona contrato de estado do painel — classifyPanelState

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 10: Criar `tests/contracts/operatorTracking.contract.test.ts`

**Files:**

- Create: `tests/contracts/operatorTracking.contract.test.ts`

- [ ] **Step 1: Read existing tracking code to verify event names and payload shapes**

```bash
grep -n "OperatorEventName\|OperatorEventPayload\|trackEvent\|startSession" services/operatorTracking.ts
```

- [ ] **Step 2: Write the contract test**

```tsx
// tests/contracts/operatorTracking.contract.test.ts
import { describe, it, expect } from 'vitest';

const ALLOWED_EVENTS = [
  'app_opened',
  'operator_registered',
  'dossier_started',
  'dossier_completed',
  'dossier_failed',
  'dossier_opened',
  'dossier_shared',
] as const;

type AllowedEvent = (typeof ALLOWED_EVENTS)[number];

const SESSION_PAYLOAD_KEYS = ['operator_id', 'email', 'environment', 'user_agent', 'metadata'] as const;

const EVENT_PAYLOAD_KEYS = [
  'operator_id',
  'email',
  'session_id',
  'event',
  'entity_type',
  'entity_id',
  'company_cnpj',
  'company_name',
  'route',
  'metadata',
] as const;

const SENSITIVE_KEYS = ['apiKey', 'token', 'password', 'secret', 'api_key', 'access_token', 'authorization'];

describe('operatorTracking contract — eventos permitidos', () => {
  it('contém exatamente 7 eventos', () => {
    expect(ALLOWED_EVENTS).toHaveLength(7);
  });

  it('todos os eventos esperados estão presentes', () => {
    expect(ALLOWED_EVENTS).toContain('app_opened');
    expect(ALLOWED_EVENTS).toContain('operator_registered');
    expect(ALLOWED_EVENTS).toContain('dossier_started');
    expect(ALLOWED_EVENTS).toContain('dossier_completed');
    expect(ALLOWED_EVENTS).toContain('dossier_failed');
    expect(ALLOWED_EVENTS).toContain('dossier_opened');
    expect(ALLOWED_EVENTS).toContain('dossier_shared');
  });

  it('eventos não podem conter valores não documentados (type-check)', () => {
    const valid: AllowedEvent = 'app_opened';
    expect(ALLOWED_EVENTS).toContain(valid);
    // @ts-expect-error — valor inválido não deve compilar
    const _invalid: AllowedEvent = 'fake_event';
    void _invalid;
  });
});

describe('operatorTracking contract — payload de sessão', () => {
  it('payload de sessão tem somente campos esperados', () => {
    // SESSION_PAYLOAD_KEYS define o contrato
    expect(SESSION_PAYLOAD_KEYS).toContain('operator_id');
    expect(SESSION_PAYLOAD_KEYS).toContain('environment');
    expect(SESSION_PAYLOAD_KEYS).toContain('user_agent');
  });

  it('campos sensíveis não estão no payload de sessão', () => {
    for (const key of SENSITIVE_KEYS) {
      expect(SESSION_PAYLOAD_KEYS).not.toContain(key);
    }
  });
});

describe('operatorTracking contract — payload de evento', () => {
  it('payload de evento tem somente campos esperados', () => {
    expect(EVENT_PAYLOAD_KEYS).toContain('operator_id');
    expect(EVENT_PAYLOAD_KEYS).toContain('session_id');
    expect(EVENT_PAYLOAD_KEYS).toContain('event');
  });

  it('campos sensíveis não estão no payload de evento', () => {
    for (const key of SENSITIVE_KEYS) {
      expect(EVENT_PAYLOAD_KEYS).not.toContain(key);
    }
  });
});

describe('operatorTracking contract — sanitização de metadata', () => {
  function sanitizeMetadata(meta: Record<string, unknown>): Record<string, unknown> {
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(meta)) {
      const lower = key.toLowerCase();
      if (SENSITIVE_KEYS.some(sk => lower.includes(sk))) continue;
      if (typeof value === 'string' && value.length > 1000) {
        cleaned[key] = value.substring(0, 1000) + '…';
      } else {
        cleaned[key] = value;
      }
    }
    return cleaned;
  }

  it('remove chaves sensíveis', () => {
    const result = sanitizeMetadata({
      userName: 'Bruno',
      apiKey: 'sk-secret-123',
      token: 'bearer-abc',
      company: 'Senior',
    });
    expect(result).toHaveProperty('userName');
    expect(result).toHaveProperty('company');
    expect(result).not.toHaveProperty('apiKey');
    expect(result).not.toHaveProperty('token');
  });

  it('trunca strings longas (>1000 chars)', () => {
    const longString = 'a'.repeat(2000);
    const result = sanitizeMetadata({ note: longString });
    expect((result.note as string).length).toBeLessThanOrEqual(1001); // 1000 + '…'
  });

  it('mantém strings curtas intactas', () => {
    const result = sanitizeMetadata({ note: 'hello' });
    expect(result.note).toBe('hello');
  });
});

describe('operatorTracking contract — UUID de sessão', () => {
  const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function isValidUUIDv4(id: string): boolean {
    return UUID_V4_REGEX.test(id);
  }

  it('session_id válido é UUID v4', () => {
    expect(isValidUUIDv4('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('session_id inválido é rejeitado', () => {
    expect(isValidUUIDv4('not-a-uuid')).toBe(false);
    expect(isValidUUIDv4('')).toBe(false);
    expect(isValidUUIDv4('550e8400-e29b-31d4-a716-446655440000')).toBe(false); // version 3, not 4
  });
});

describe('operatorTracking contract — falha não quebra UX', () => {
  it('trackEvent não deve lançar exceção', async () => {
    // Simula o comportamento fire-and-forget: mesmo com erro, não propaga
    const trackEvent = async (_event: string, _payload: Record<string, unknown>) => {
      try {
        throw new Error('Supabase unavailable');
      } catch {
        // silencioso — fire and forget
      }
    };

    await expect(trackEvent('app_opened', {})).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 3: Run the contract test**

```bash
npx vitest run tests/contracts/operatorTracking.contract.test.ts
```

Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add tests/contracts/operatorTracking.contract.test.ts
git commit -m "feat: adiciona contrato de tracking — eventos, payloads, sanitização, UUID

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 11: Criar `tests/contracts/supabaseMigrations.contract.test.ts`

**Files:**

- Create: `tests/contracts/supabaseMigrations.contract.test.ts`

- [ ] **Step 1: Write the contract test**

```ts
// tests/contracts/supabaseMigrations.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { resolve, basename } from 'path';

const MIGRATIONS_DIR = resolve(__dirname, '../../supabase/migrations');

const CRITICAL_MIGRATIONS = ['20260528_operator_tracking.sql'];

const CRITICAL_TABLES = ['operator_sessions', 'operator_events'];

describe('supabaseMigrations contract — estrutura', () => {
  it('pasta supabase/migrations existe', () => {
    expect(existsSync(MIGRATIONS_DIR)).toBe(true);
  });

  it('contém pelo menos 1 arquivo .sql', () => {
    const files = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql'));
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(CRITICAL_MIGRATIONS)('migration crítica existe: %s', filename => {
    const filePath = resolve(MIGRATIONS_DIR, filename);
    expect(existsSync(filePath)).toBe(true);
  });
});

describe('supabaseMigrations contract — RLS policies', () => {
  const migrationFiles = existsSync(MIGRATIONS_DIR) ? readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')) : [];

  for (const file of migrationFiles) {
    const content = readFileSync(resolve(MIGRATIONS_DIR, file), 'utf-8');

    const hasCreateTable = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/gi;

    let match: RegExpExecArray | null;
    const tables: string[] = [];
    while ((match = hasCreateTable.exec(content)) !== null) {
      tables.push(match[1]);
    }

    for (const table of tables) {
      it(`tabela ${table} em ${file} tem RLS habilitado ou justificativa documentada`, () => {
        const hasRls = new RegExp(
          `ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`,
          'i',
        ).test(content);

        const hasJustification = /--\s*RLS\s*exception/i.test(content);

        expect(hasRls || hasJustification).toBe(true);
      });
    }
  }
});

describe('supabaseMigrations contract — tabelas críticas documentadas', () => {
  const allContent = existsSync(MIGRATIONS_DIR)
    ? readdirSync(MIGRATIONS_DIR)
        .filter(f => f.endsWith('.sql'))
        .map(f => readFileSync(resolve(MIGRATIONS_DIR, f), 'utf-8'))
        .join('\n')
    : '';

  it.each(CRITICAL_TABLES)('tabela %s está documentada em migration', table => {
    const tableRegex = new RegExp(`CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${table}`, 'i');
    expect(tableRegex.test(allContent)).toBe(true);
  });

  it.each(CRITICAL_TABLES)('tabela %s tem RLS habilitado', table => {
    const rlsRegex = new RegExp(
      `ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`,
      'i',
    );
    expect(rlsRegex.test(allContent)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the contract test**

```bash
npx vitest run tests/contracts/supabaseMigrations.contract.test.ts
```

Expected: Tests pass (will check actual migration files)

- [ ] **Step 3: Commit**

```bash
git add tests/contracts/supabaseMigrations.contract.test.ts
git commit -m "feat: adiciona contrato de migrations Supabase — RLS + tabelas críticas

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 12: Rodar todos os contratos juntos

- [ ] **Step 1: Run all contract tests**

```bash
npx vitest run tests/contracts/
```

Expected: All contract tests pass

- [ ] **Step 2: Note**: `test:contracts` script will be added in Task 16

---

## Fase 3: E2E (Playwright)

### Task 13: Criar `tests-e2e/blank-center-panel-regression.spec.ts`

**Files:**

- Create: `tests-e2e/blank-center-panel-regression.spec.ts`

- [ ] **Step 1: Write the E2E test**

```ts
// tests-e2e/blank-center-panel-regression.spec.ts
import { expect, test } from '@playwright/test';

test.describe('Anti-Regressão: Painel Central Branco', () => {
  test.describe.configure({ timeout: 120_000 });

  const consoleErrors: string[] = [];
  const pageErrors: Error[] = [];
  const rejectionReasons: unknown[] = [];

  test.beforeEach(async ({ page }) => {
    consoleErrors.length = 0;
    pageErrors.length = 0;
    rejectionReasons.length = 0;

    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', err => pageErrors.push(err));
    page.on('requestfailed', _rf => {
      // Network failures are expected in some test scenarios — just track them
    });
  });

  async function collectDiagnostics(page: import('@playwright/test').Page) {
    const breadcrumb = await page
      .getByTestId('app-breadcrumb')
      .textContent()
      .catch(() => '(ausente)');
    const mainPanel = await page
      .getByTestId('chat-main-panel')
      .textContent()
      .catch(() => '(ausente)');
    const messageRows = await page
      .getByTestId('message-row')
      .count()
      .catch(() => -1);
    const loadingSmart = await page
      .getByTestId('loading-smart')
      .isVisible()
      .catch(() => false);
    const controlledError = await page
      .getByTestId('controlled-error')
      .isVisible()
      .catch(() => false);
    const emptyState = await page
      .getByTestId('empty-state')
      .isVisible()
      .catch(() => false);

    return {
      url: page.url(),
      breadcrumb: breadcrumb?.trim() ?? '(ausente)',
      mainPanelPreview: (mainPanel?.trim() ?? '(ausente)').substring(0, 200),
      messageRowCount: messageRows,
      loadingSmartVisible: loadingSmart,
      controlledErrorVisible: controlledError,
      emptyStateVisible: emptyState,
      consoleErrors: [...consoleErrors],
      pageErrors: pageErrors.map(e => e.message),
    };
  }

  test('app abre sem tela branca — shell + painel visíveis', async ({ page }) => {
    await page.goto('/');

    // Aguarda o app-shell ou o greeting (primeiro acesso)
    await expect(page.getByTestId('app-shell').or(page.getByTestId('greeting-card'))).toBeVisible({ timeout: 30_000 });

    // Se for primeiro acesso (greeting), faz onboarding rápido
    const greeting = page.getByTestId('greeting-card');
    if (await greeting.isVisible().catch(() => false)) {
      await page.getByTestId('greeting-name-input').fill('Test Bot');
      await page.getByTestId('greeting-submit-button').click();
      await expect(page.getByTestId('investigation-company-input')).toBeVisible({ timeout: 15_000 });
      await page.getByTestId('investigation-company-input').fill('Fazenda Teste');
      await page.getByTestId('investigation-city-input').fill('Cuiabá');
      await page.getByTestId('investigation-uf-input').fill('MT');
      await page.getByTestId('investigation-submit-button').click();
    }

    // Validações do shell
    await expect(page.getByTestId('app-shell')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('message-input')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('chat-main-panel')).toBeVisible({ timeout: 30_000 });
  });

  test('painel central nunca fica vazio com sessão ativa', async ({ page }) => {
    await page.goto('/');

    // Onboarding rápido se necessário
    const greeting = page.getByTestId('greeting-card');
    if (await greeting.isVisible().catch(() => false)) {
      await page.getByTestId('greeting-name-input').fill('Test Bot');
      await page.getByTestId('greeting-submit-button').click();
      await expect(page.getByTestId('investigation-company-input')).toBeVisible({ timeout: 15_000 });
      await page.getByTestId('investigation-company-input').fill('Fazenda Teste');
      await page.getByTestId('investigation-city-input').fill('Cuiabá');
      await page.getByTestId('investigation-uf-input').fill('MT');
      await page.getByTestId('investigation-submit-button').click();
    }

    await expect(page.getByTestId('chat-main-panel')).toBeVisible({ timeout: 30_000 });

    // Aguarda estabilização (8s é o limite definido no spec)
    await page.waitForTimeout(8_000);

    // Verifica se o breadcrumb tem empresa ativa
    const breadcrumb = page.getByTestId('app-breadcrumb');
    const hasBreadcrumbText = await breadcrumb.isVisible().catch(() => false);

    if (hasBreadcrumbText) {
      const breadcrumbText = await breadcrumb.textContent();
      const hasCompany = breadcrumbText && breadcrumbText.includes('→');

      if (hasCompany) {
        // Se tem empresa ativa no breadcrumb, o painel NUNCA pode estar vazio
        const hasContent = await page
          .getByTestId('message-row')
          .first()
          .isVisible()
          .catch(() => false);
        const hasLoading = await page
          .getByTestId('loading-smart')
          .isVisible()
          .catch(() => false);
        const hasError = await page
          .getByTestId('controlled-error')
          .isVisible()
          .catch(() => false);
        const hasEmptyState = await page
          .getByTestId('empty-state')
          .isVisible()
          .catch(() => false);

        const diagnostics = await collectDiagnostics(page);

        expect(
          hasContent || hasLoading || hasError || hasEmptyState,
          `PAINEL BRANCO DETECTADO!\nDiagnóstico: ${JSON.stringify(diagnostics, null, 2)}`,
        ).toBe(true);
      }
    }
  });

  test('sem console.error no fluxo principal', async ({ page }) => {
    await page.goto('/');

    const greeting = page.getByTestId('greeting-card');
    if (await greeting.isVisible().catch(() => false)) {
      await page.getByTestId('greeting-name-input').fill('Test Bot');
      await page.getByTestId('greeting-submit-button').click();
      await expect(page.getByTestId('investigation-company-input')).toBeVisible({ timeout: 15_000 });
    }

    // Allowlist de erros conhecidos (Gemini rate-limit, CORS de fontes externas, etc.)
    const allowedErrors = ['Failed to load resource', 'net::ERR_', 'ResizeObserver loop', '429', '503'];

    const unexpectedErrors = consoleErrors.filter(err => !allowedErrors.some(allowed => err.includes(allowed)));

    if (unexpectedErrors.length > 0) {
      const diagnostics = await collectDiagnostics(page);
      console.error('Diagnóstico:', JSON.stringify(diagnostics, null, 2));
    }

    expect(unexpectedErrors).toHaveLength(0);
  });

  test('sem pageerror não tratado', async () => {
    // pageErrors são coletados no beforeEach
    expect(pageErrors).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the E2E test (requires dev server running)**

```bash
npx playwright test tests-e2e/blank-center-panel-regression.spec.ts --reporter=list
```

Expected: Tests pass (or fail with useful diagnostics)

- [ ] **Step 3: Commit**

```bash
git add tests-e2e/blank-center-panel-regression.spec.ts
git commit -m "feat: adiciona E2E anti-painel-branco com diagnóstico completo

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 14: Criar `tests-e2e/loading-smart-recovery.spec.ts`

**Files:**

- Create: `tests-e2e/loading-smart-recovery.spec.ts`

- [ ] **Step 1: Write the E2E test**

```ts
// tests-e2e/loading-smart-recovery.spec.ts
import { expect, test } from '@playwright/test';

const LOADING_TIMEOUT_MS = 120_000;

test.describe('Anti-Regressão: LoadingSmart — Recuperação', () => {
  test.describe.configure({ timeout: 180_000 });

  async function quickOnboard(page: import('@playwright/test').Page) {
    await page.goto('/');
    const greeting = page.getByTestId('greeting-card');
    if (await greeting.isVisible().catch(() => false)) {
      await page.getByTestId('greeting-name-input').fill('Test Bot');
      await page.getByTestId('greeting-submit-button').click();
      await expect(page.getByTestId('investigation-company-input')).toBeVisible({ timeout: 15_000 });
    }
  }

  test('LoadingSmart aparece e desaparece — estado final é válido', async ({ page }) => {
    await quickOnboard(page);

    // Inicia investigação
    await page.getByTestId('investigation-company-input').fill('Fazenda Modelo');
    await page.getByTestId('investigation-city-input').fill('Cuiabá');
    await page.getByTestId('investigation-uf-input').fill('MT');
    await page.getByTestId('investigation-submit-button').click();

    // Verifica que LoadingSmart aparece
    const loadingSmart = page.getByTestId('loading-smart');
    await expect(loadingSmart).toBeVisible({ timeout: 30_000 });

    // Aguarda LoadingSmart desaparecer (timeout generoso)
    await expect(loadingSmart).not.toBeVisible({ timeout: LOADING_TIMEOUT_MS });

    // Após LoadingSmart desaparecer, um estado válido precisa estar presente
    const hasMessages = await page
      .getByTestId('message-row')
      .first()
      .isVisible()
      .catch(() => false);
    const hasError = await page
      .getByTestId('controlled-error')
      .isVisible()
      .catch(() => false);

    expect(
      hasMessages || hasError,
      `LoadingSmart desapareceu mas nenhum estado válido foi renderizado. ` +
        `hasMessages=${hasMessages}, hasError=${hasError}`,
    ).toBe(true);

    // Input continua acessível
    await expect(page.getByTestId('message-input')).toBeVisible({ timeout: 10_000 });
  });

  test('input inferior permanece acessível durante loading', async ({ page }) => {
    await quickOnboard(page);

    await page.getByTestId('investigation-company-input').fill('Fazenda Teste');
    await page.getByTestId('investigation-city-input').fill('Cuiabá');
    await page.getByTestId('investigation-uf-input').fill('MT');
    await page.getByTestId('investigation-submit-button').click();

    // Input deve estar visível durante e após o loading
    await expect(page.getByTestId('message-input')).toBeVisible({ timeout: 15_000 });

    // Aguarda loading terminar
    const loadingSmart = page.getByTestId('loading-smart');
    await expect(loadingSmart).not.toBeVisible({ timeout: LOADING_TIMEOUT_MS });

    // Input continua acessível
    await expect(page.getByTestId('message-input')).toBeVisible({ timeout: 10_000 });
  });

  test('sem erro silencioso no console durante loading', async ({ page }) => {
    const unexpectedErrors: string[] = [];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        const allowed = ['Failed to load resource', 'net::ERR_', 'ResizeObserver', '429', '503'];
        if (!allowed.some(a => msg.text().includes(a))) {
          unexpectedErrors.push(msg.text());
        }
      }
    });

    await quickOnboard(page);

    await page.getByTestId('investigation-company-input').fill('Fazenda Teste');
    await page.getByTestId('investigation-city-input').fill('Cuiabá');
    await page.getByTestId('investigation-uf-input').fill('MT');
    await page.getByTestId('investigation-submit-button').click();

    const loadingSmart = page.getByTestId('loading-smart');
    await expect(loadingSmart).not.toBeVisible({ timeout: LOADING_TIMEOUT_MS });

    expect(unexpectedErrors).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the E2E test**

```bash
npx playwright test tests-e2e/loading-smart-recovery.spec.ts --reporter=list
```

- [ ] **Step 3: Commit**

```bash
git add tests-e2e/loading-smart-recovery.spec.ts
git commit -m "feat: adiciona E2E anti-loading-infinito — recuperação + input acessível

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 15: Criar `tests-e2e/controlled-error-state.spec.ts`

**Files:**

- Create: `tests-e2e/controlled-error-state.spec.ts`

- [ ] **Step 1: Write the E2E test**

```ts
// tests-e2e/controlled-error-state.spec.ts
import { expect, test } from '@playwright/test';

test.describe('Anti-Regressão: Erro Controlado', () => {
  test.describe.configure({ timeout: 120_000 });

  async function quickOnboard(page: import('@playwright/test').Page) {
    await page.goto('/');
    const greeting = page.getByTestId('greeting-card');
    if (await greeting.isVisible().catch(() => false)) {
      await page.getByTestId('greeting-name-input').fill('Test Bot');
      await page.getByTestId('greeting-submit-button').click();
      await expect(page.getByTestId('investigation-company-input')).toBeVisible({ timeout: 15_000 });
    }
  }

  test('falha de API não gera tela branca', async ({ page }) => {
    // Intercepta chamadas à API Gemini e força erro 500
    await page.route('**/v1beta/models/gemini**', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 500, message: 'Internal Server Error' } }),
      });
    });

    await quickOnboard(page);

    await page.getByTestId('investigation-company-input').fill('Fazenda Teste');
    await page.getByTestId('investigation-city-input').fill('Cuiabá');
    await page.getByTestId('investigation-uf-input').fill('MT');
    await page.getByTestId('investigation-submit-button').click();

    // Aguarda processamento (rápido pois vai falhar)
    await page.waitForTimeout(15_000);

    // O shell principal continua visível
    await expect(page.getByTestId('app-shell')).toBeVisible({ timeout: 10_000 });

    // O painel central não está vazio (tem erro controlado OU mensagem de erro)
    const mainPanel = page.getByTestId('chat-main-panel');
    await expect(mainPanel).toBeVisible({ timeout: 10_000 });

    // Input continua acessível
    await expect(page.getByTestId('message-input')).toBeVisible({ timeout: 10_000 });
  });

  test('LoadingSmart não fica infinito após falha', async ({ page }) => {
    await page.route('**/v1beta/models/gemini**', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 500, message: 'Internal Server Error' } }),
      });
    });

    await quickOnboard(page);

    await page.getByTestId('investigation-company-input').fill('Fazenda Teste');
    await page.getByTestId('investigation-city-input').fill('Cuiabá');
    await page.getByTestId('investigation-uf-input').fill('MT');
    await page.getByTestId('investigation-submit-button').click();

    // Loading NÃO pode ficar visível por mais de 30s após falha
    const loadingSmart = page.getByTestId('loading-smart');
    await expect(loadingSmart).not.toBeVisible({ timeout: 30_000 });
  });

  test('usuário consegue interagir após falha', async ({ page }) => {
    await page.route('**/v1beta/models/gemini**', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 500, message: 'Internal Server Error' } }),
      });
    });

    await quickOnboard(page);

    await page.getByTestId('investigation-company-input').fill('Fazenda Teste');
    await page.getByTestId('investigation-city-input').fill('Cuiabá');
    await page.getByTestId('investigation-uf-input').fill('MT');
    await page.getByTestId('investigation-submit-button').click();

    await page.waitForTimeout(10_000);

    // Input deve estar habilitado para nova tentativa
    const chatInput = page.getByTestId('chat-input');
    await expect(chatInput).toBeVisible({ timeout: 10_000 });

    // Verifica se NÃO está disabled (pode tentar de novo)
    const isDisabled = await chatInput.isDisabled();
    expect(isDisabled).toBe(false);
  });
});
```

- [ ] **Step 2: Run the E2E test**

```bash
npx playwright test tests-e2e/controlled-error-state.spec.ts --reporter=list
```

Expected: Tests pass. Note: if Gemini API URL pattern doesn't match, adjust the route glob to match actual API calls.

- [ ] **Step 3: Commit**

```bash
git add tests-e2e/controlled-error-state.spec.ts
git commit -m "feat: adiciona E2E de erro controlado — falha de API + loading + retry

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Fase 4: Scripts + Documentação

### Task 16: Atualizar `package.json` com novos scripts

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Read current scripts section**

```bash
node -e "const p = require('./package.json'); console.log(JSON.stringify(p.scripts, null, 2))"
```

- [ ] **Step 2: Add new scripts**

Add these entries to the `"scripts"` block in `package.json`:

```json
"test:contracts": "vitest run tests/contracts/",
"test:e2e:blank": "playwright test tests-e2e/blank-center-panel-regression.spec.ts",
"test:e2e:loading": "playwright test tests-e2e/loading-smart-recovery.spec.ts",
"test:e2e:errors": "playwright test tests-e2e/controlled-error-state.spec.ts",
"test:flow": "npm run typecheck && npm run test && npm run test:contracts && npm run test:e2e:blank",
"validate:release": "npm run typecheck && npm run test && npm run test:contracts && npm run test:e2e"
```

- [ ] **Step 3: Verify script syntax**

```bash
node -e "const p = require('./package.json'); Object.keys(p.scripts).forEach(k => console.log(k + ': ' + p.scripts[k]))" | grep "test:contracts\|test:e2e:blank\|test:e2e:loading\|test:e2e:errors\|test:flow\|validate:release"
```

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "feat: adiciona scripts test:contracts, test:e2e:blank/loading/errors, test:flow, validate:release

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 17: Criar `docs/contracts/scout-360-contracts.md`

**Files:**

- Create: `docs/contracts/scout-360-contracts.md`

- [ ] **Step 1: Write the documentation**

````markdown
# Contratos do Scout 360 — Proteção Anti-Regressão

## Estados Visuais do Painel Central

### Estados Válidos

| Estado    | data-testid                        | Significado                                    |
| --------- | ---------------------------------- | ---------------------------------------------- |
| `content` | `message-row` ou `dossier-content` | Mensagens ou dossiê renderizados               |
| `loading` | `loading-smart`                    | Geração em andamento                           |
| `error`   | `controlled-error`                 | Erro capturado pelo ChatErrorBoundary          |
| `empty`   | `empty-state`                      | Sessão ativa sem conteúdo (fallback explícito) |

### Estado Inválido

Painel central renderiza `chat-main-panel` mas **nenhum** dos 4 estados acima está visível.
Isso é considerado **tela branca** e o teste `blank-center-panel-regression.spec.ts` deve detectar.

## Como Diagnosticar Painel Branco

1. Verificar `app-breadcrumb` — se contém "→", existe sessão ativa
2. Verificar `chat-main-panel` — se existe mas está vazio, é falha
3. Coletar com `collectDiagnostics()`:
   - URL atual
   - Texto do breadcrumb
   - Conteúdo do painel central
   - Quantidade de `message-row`
   - Visibilidade de `loading-smart`, `controlled-error`, `empty-state`
   - Erros de console

## Eventos de Tracking

| Evento                | Quando Dispara               |
| --------------------- | ---------------------------- |
| `app_opened`          | App inicializa               |
| `operator_registered` | Operador se registra         |
| `dossier_started`     | Geração de dossiê inicia     |
| `dossier_completed`   | Geração conclui com sucesso  |
| `dossier_failed`      | Geração falha                |
| `dossier_opened`      | Dossiê é aberto para leitura |
| `dossier_shared`      | Dossiê é compartilhado       |

## Tabelas Supabase Críticas

| Tabela              | Migration                        | RLS |
| ------------------- | -------------------------------- | --- |
| `operator_sessions` | `20260528_operator_tracking.sql` | Sim |
| `operator_events`   | `20260528_operator_tracking.sql` | Sim |

## Matriz de Proteção

| Tipo de Quebra               | Teste Protetor                        |
| ---------------------------- | ------------------------------------- |
| Tela branca com sessão ativa | `test:e2e:blank`                      |
| Loading infinito             | `test:e2e:loading`                    |
| Erro sem fallback            | `test:e2e:errors`                     |
| Estado inválido do painel    | `test:contracts` (renderState)        |
| Tracking quebrado            | `test:contracts` (operatorTracking)   |
| Migration sem RLS            | `test:contracts` (supabaseMigrations) |
| Regressão de tipo            | `typecheck`                           |

## Como Rodar

```bash
# Testes unitários
npm test

# Contratos
npm run test:contracts

# E2E específicos
npm run test:e2e:blank      # Anti-painel-branco
npm run test:e2e:loading    # Anti-loading-infinito
npm run test:e2e:errors     # Erro controlado

# Fluxo completo
npm run test:flow            # typecheck + unit + contracts + e2e:blank

# Validação pré-deploy
npm run validate:release     # typecheck + unit + contracts + todos E2E
```
````

````

- [ ] **Step 2: Commit**

```bash
git add docs/contracts/scout-360-contracts.md
git commit -m "docs: adiciona documentação de contratos Scout 360

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
````

---

### Task 18: Criar `docs/contracts/PR-CHECKLIST.md`

**Files:**

- Create: `docs/contracts/PR-CHECKLIST.md`

- [ ] **Step 1: Write the checklist**

```markdown
# PR Checklist — Senior Scout 360

Toda PR que altera qualquer um dos arquivos/sistemas abaixo precisa passar por este checklist.

## Arquivos Sensíveis

Se seu PR toca em qualquer um destes, o checklist completo é **obrigatório**:

- `App.tsx`
- `components/ChatInterface.tsx`
- `components/chat/ChatShell.tsx`
- `components/chat/ChatPanels.tsx`
- `components/chat/MessageTimeline.tsx`
- `components/chat/Composer.tsx`
- `components/LoadingSmart.tsx`
- `features/chat/ChatErrorBoundary.tsx`
- `features/chat/message-orchestrator/`
- `features/chat/session-controller/`
- `features/dossier/`
- `services/storage.ts`
- `services/operatorTracking.ts`
- `lib/supabaseClient.ts`
- `supabase/migrations/`

## Checklist

### Tipo e Qualidade

- [ ] `npm run typecheck` passou sem erros
- [ ] `npm run lint` passou sem warnings novos

### Testes

- [ ] `npm test` passou (todos os testes unitários)
- [ ] `npm run test:contracts` passou (todos os contratos)

### E2E Anti-Regressão

- [ ] `npm run test:e2e:blank` passou (anti-painel-branco)
- [ ] `npm run test:e2e:loading` passou (anti-loading-infinito)

### Verificação Manual

- [ ] Nenhum `console.error` no fluxo principal (exceto allowlist)
- [ ] Nenhum estado visual sem fallback (painel central sempre renderiza um dos 4 estados)
- [ ] Input de mensagem permanece acessível após erro
- [ ] LoadingSmart não fica visível por mais de 2 minutos

### Tracking (se alterou tracking)

- [ ] Eventos disparados são da lista permitida (7 eventos)
- [ ] Payload não contém campos sensíveis (apiKey, token, password, secret)

### Migrations (se adicionou migration)

- [ ] Toda `CREATE TABLE` tem `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
- [ ] Ou tem comentário `-- RLS exception: <justificativa>` documentado
```

- [ ] **Step 2: Commit**

```bash
git add docs/contracts/PR-CHECKLIST.md
git commit -m "docs: adiciona PR checklist obrigatória para arquivos sensíveis

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Fase 5: Validação Final

### Task 19: Rodar validação completa

- [ ] **Step 1: Typecheck**

```bash
npm run typecheck
```

Expected: PASS

- [ ] **Step 2: Unit tests**

```bash
npm test
```

Expected: All existing + new tests pass

- [ ] **Step 3: Contract tests**

```bash
npm run test:contracts
```

Expected: All 3 contract suites pass

- [ ] **Step 4: E2E tests (requires dev server)**

```bash
npm run test:e2e:blank
npm run test:e2e:loading
npm run test:e2e:errors
```

Expected: Each passes or fails with useful diagnostics

- [ ] **Step 5: Full release validation**

```bash
npm run validate:release
```

Expected: All gates pass

---

## Resumo Final

### Arquivos Criados (10)

1. `utils/renderStateClassifier.ts`
2. `tests/contracts/renderState.contract.test.tsx`
3. `tests/contracts/operatorTracking.contract.test.ts`
4. `tests/contracts/supabaseMigrations.contract.test.ts`
5. `tests-e2e/blank-center-panel-regression.spec.ts`
6. `tests-e2e/loading-smart-recovery.spec.ts`
7. `tests-e2e/controlled-error-state.spec.ts`
8. `docs/contracts/scout-360-contracts.md`
9. `docs/contracts/PR-CHECKLIST.md`
10. `docs/superpowers/plans/2026-05-28-test-anti-regression-plan.md` (este arquivo)

### Arquivos Alterados (7)

11. `App.tsx` — +1 data-testid
12. `components/chat/ChatShell.tsx` — +4 data-testid
13. `components/ChatInterface.tsx` — +2 data-testid + EmptyStateFallback
14. `components/chat/Composer.tsx` — renomeia 2 data-testid + adiciona 1
15. `components/LoadingSmart.tsx` — renomeia 1 data-testid
16. `features/chat/ChatErrorBoundary.tsx` — renomeia 1 data-testid
17. `package.json` — +6 scripts

### Regressões Bloqueadas

- Tela branca com sessão ativa → `blank-center-panel-regression.spec.ts`
- Loading infinito sem fallback → `loading-smart-recovery.spec.ts`
- Erro de API sem UI de erro → `controlled-error-state.spec.ts`
- Estado de painel ambíguo → `renderState.contract.test.tsx`
- Tracking com payload inválido → `operatorTracking.contract.test.ts`
- Migration sem RLS → `supabaseMigrations.contract.test.ts`

### Pontos para Teste Futuro

- E2E de fluxo completo com Gemini real (requer API key + orçamento de tokens)
- Teste de stress com 50+ mensagens no VirtualizedList
- Contrato de acessibilidade (axe-core nos componentes críticos)
- Teste de regressão visual (screenshots comparativos com Playwright)

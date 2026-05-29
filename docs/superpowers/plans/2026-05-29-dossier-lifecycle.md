# Ciclo de Vida do Dossiê — Plano de Implementação (TDD)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir criação prematura de dossiês, adicionar trava de CNPJ duplicado e compartilhamento via Teams ao finalizar a geração.

**Architecture:** Check de duplicação antes do waterfall (`findExistingDossier`), modal no `ChatInterface`, compartilhamento via token existente (`storage.shareDossier`) com botão Teams ao final do waterfall.

**Tech Stack:** React 19, TypeScript 5, Vitest + @testing-library/react, Supabase (dossies + shared_dossiers), Tailwind CSS 3

**Método:** Test-Driven Development — RED → GREEN → REFACTOR → Commit. Nenhum código de produção sem teste falhando antes.

---

## Estrutura de Arquivos

| Arquivo                                      | Ação          | Teste                                                   |
| -------------------------------------------- | ------------- | ------------------------------------------------------- |
| `lib/supabase/dossierDuplicate.ts`           | **Criar**     | `tests/lib/supabase/dossierDuplicate.test.ts`           |
| `components/DuplicateDossierModal.tsx`       | **Criar**     | `tests/components/DuplicateDossierModal.test.tsx`       |
| `components/DossierShareBar.tsx`             | **Criar**     | `tests/components/DossierShareBar.test.tsx`             |
| `components/ChatInterface.tsx`               | **Modificar** | `tests/components/ChatInterface.test.tsx`               |
| `features/dossier/waterfall-orchestrator.ts` | **Modificar** | `tests/features/dossier/waterfall-orchestrator.test.ts` |
| `services/storage.ts`                        | **Modificar** | `tests/services/storage.test.ts`                        |

---

### Task 1: findExistingDossier — TDD

**Files:**

- Create: `tests/lib/supabase/dossierDuplicate.test.ts`
- Create: `lib/supabase/dossierDuplicate.ts`

- [ ] **Step 1: RED — Escrever o teste e ver falhar**

Criar o arquivo de teste primeiro:

```typescript
// tests/lib/supabase/dossierDuplicate.test.ts
import { describe, it, expect, vi } from 'vitest';

const mockFrom = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockIs = vi.fn();
const mockLimit = vi.fn();
const mockMaybeSingle = vi.fn();

vi.mock('../../lib/supabase/supabaseClient', () => ({
  get supabase() {
    return {
      from: mockFrom,
    };
  },
  isSupabaseAvailable: vi.fn(() => true),
}));

describe('findExistingDossier', () => {
  it('retorna null quando Supabase indisponível', async () => {
    const { isSupabaseAvailable } = await import('../../lib/supabase/supabaseClient');
    vi.mocked(isSupabaseAvailable).mockReturnValueOnce(false);
    const { findExistingDossier } = await import('../../lib/supabase/dossierDuplicate');
    const result = await findExistingDossier('123', 'Empresa X', 'op-1');
    expect(result).toBeNull();
  });

  it('retorna null quando operatorId é vazio', async () => {
    const { findExistingDossier } = await import('../../lib/supabase/dossierDuplicate');
    const result = await findExistingDossier('123', 'Empresa X', '');
    expect(result).toBeNull();
  });

  it('retorna dossiê existente quando encontra por CNPJ', async () => {
    const { isSupabaseAvailable } = await import('../../lib/supabase/supabaseClient');
    vi.mocked(isSupabaseAvailable).mockReturnValueOnce(true);

    const chain = {
      eq: mockEq.mockReturnThis(),
      is: mockIs.mockReturnThis(),
      limit: mockLimit.mockReturnThis(),
      maybeSingle: mockMaybeSingle.mockResolvedValueOnce({
        data: {
          id: 'dossier-1',
          title: 'Empresa Teste',
          empresa_alvo: 'Empresa Teste',
          created_at: '2026-05-29T10:00:00Z',
          score_oportunidade: 82,
        },
        error: null,
      }),
    };
    mockSelect.mockReturnValueOnce(chain);
    mockFrom.mockReturnValueOnce({ select: mockSelect });

    const { findExistingDossier } = await import('../../lib/supabase/dossierDuplicate');
    const result = await findExistingDossier('45.543.915/0001-81', 'Empresa Teste', 'op-1');

    expect(result).toEqual({
      id: 'dossier-1',
      title: 'Empresa Teste',
      empresaAlvo: 'Empresa Teste',
      createdAt: '2026-05-29T10:00:00Z',
      scoreOportunidade: 82,
    });
  });

  it('faz fallback por razão social quando CNPJ não retorna resultado', async () => {
    const { isSupabaseAvailable } = await import('../../lib/supabase/supabaseClient');
    vi.mocked(isSupabaseAvailable).mockReturnValueOnce(true);

    // Primeira chamada: CNPJ retorna null (não encontrado)
    const chainCnpj = {
      eq: mockEq.mockReturnThis(),
      is: mockIs.mockReturnThis(),
      limit: mockLimit.mockReturnThis(),
      maybeSingle: mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null }),
    };
    // Segunda chamada: razão social encontra
    const chainRazao = {
      eq: mockEq.mockReturnThis(),
      is: mockIs.mockReturnThis(),
      limit: mockLimit.mockReturnThis(),
      maybeSingle: mockMaybeSingle.mockResolvedValueOnce({
        data: {
          id: 'dossier-2',
          title: 'Empresa Filial',
          empresa_alvo: 'Empresa Filial',
          created_at: '2026-05-28T08:00:00Z',
          score_oportunidade: 60,
        },
        error: null,
      }),
    };
    mockSelect.mockReturnValueOnce(chainCnpj).mockReturnValueOnce(chainRazao);
    mockFrom.mockReturnValueOnce({ select: mockSelect }).mockReturnValueOnce({ select: mockSelect });

    const { findExistingDossier } = await import('../../lib/supabase/dossierDuplicate');
    const result = await findExistingDossier('00000000000000', 'Empresa Filial', 'op-1');

    expect(result).toEqual({
      id: 'dossier-2',
      title: 'Empresa Filial',
      empresaAlvo: 'Empresa Filial',
      createdAt: '2026-05-28T08:00:00Z',
      scoreOportunidade: 60,
    });
  });

  it('retorna null quando nenhum CNPJ nem razão social fornecidos', async () => {
    const { findExistingDossier } = await import('../../lib/supabase/dossierDuplicate');
    const result = await findExistingDossier(null, null, 'op-1');
    expect(result).toBeNull();
  });
});
```

Rodar e confirmar que falha:

```bash
npx vitest run tests/lib/supabase/dossierDuplicate.test.ts
# Esperado: FAIL — Cannot find module '../../lib/supabase/dossierDuplicate'
```

- [ ] **Step 2: GREEN — Implementar código mínimo para passar**

```typescript
// lib/supabase/dossierDuplicate.ts
import { supabase, isSupabaseAvailable } from './supabaseClient';

export interface ExistingDossier {
  id: string;
  title: string;
  empresaAlvo: string;
  createdAt: string;
  scoreOportunidade: number | null;
}

export async function findExistingDossier(
  cnpj: string | null | undefined,
  empresaAlvo: string | null | undefined,
  operatorId: string,
): Promise<ExistingDossier | null> {
  if (!isSupabaseAvailable() || !operatorId) return null;

  const cnpjDigits = cnpj?.replace(/\D/g, '') || '';

  if (cnpjDigits.length >= 11) {
    const { data, error } = await supabase!
      .from('dossies')
      .select('id, title, empresa_alvo, created_at, score_oportunidade')
      .eq('operator_id', operatorId)
      .eq('cnpj', cnpjDigits)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      return {
        id: data.id,
        title: data.title,
        empresaAlvo: data.empresa_alvo,
        createdAt: data.created_at,
        scoreOportunidade: data.score_oportunidade,
      };
    }
  }

  if (empresaAlvo?.trim()) {
    const { data, error } = await supabase!
      .from('dossies')
      .select('id, title, empresa_alvo, created_at, score_oportunidade')
      .eq('operator_id', operatorId)
      .eq('empresa_alvo', empresaAlvo.trim())
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      return {
        id: data.id,
        title: data.title,
        empresaAlvo: data.empresa_alvo,
        createdAt: data.created_at,
        scoreOportunidade: data.score_oportunidade,
      };
    }
  }

  return null;
}
```

Rodar e confirmar que passa:

```bash
npx vitest run tests/lib/supabase/dossierDuplicate.test.ts
# Esperado: 5 passed
```

- [ ] **Step 3: REFACTOR — Extrair helper de mapeamento**

```typescript
// Dentro de dossierDuplicate.ts, extrair:
function mapDossierRow(row: Record<string, unknown>): ExistingDossier {
  return {
    id: row.id as string,
    title: row.title as string,
    empresaAlvo: row.empresa_alvo as string,
    createdAt: row.created_at as string,
    scoreOportunidade: (row.score_oportunidade as number) ?? null,
  };
}
```

Rodar testes novamente para garantir que continuam verdes:

```bash
npx vitest run tests/lib/supabase/dossierDuplicate.test.ts
# Esperado: 5 passed
```

- [ ] **Step 4: Commit**

```bash
git add tests/lib/supabase/dossierDuplicate.test.ts lib/supabase/dossierDuplicate.ts
git commit -m "feat: adiciona findExistingDossier — busca por CNPJ e razão social"
```

---

### Task 2: DuplicateDossierModal — TDD

**Files:**

- Create: `tests/components/DuplicateDossierModal.test.tsx`
- Create: `components/DuplicateDossierModal.tsx`

- [ ] **Step 1: RED — Escrever o teste e ver falhar**

```typescript
// tests/components/DuplicateDossierModal.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DuplicateDossierModal } from '../../components/DuplicateDossierModal';

const existingFixture = {
  id: 'dossier-1',
  title: 'Empresa Teste',
  empresaAlvo: 'Empresa Teste',
  createdAt: '2026-05-29T10:00:00Z',
  scoreOportunidade: 75,
};

describe('DuplicateDossierModal', () => {
  it('renderiza nome da empresa e score', () => {
    render(
      <DuplicateDossierModal
        existing={existingFixture}
        companyName="Empresa Teste"
        onAccessExisting={vi.fn()}
        onNewResearch={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText(/Empresa Teste/)).toBeDefined();
    expect(screen.getByText(/75\/100/)).toBeDefined();
  });

  it('renderiza "data desconhecida" quando createdAt ausente', () => {
    render(
      <DuplicateDossierModal
        existing={{ ...existingFixture, createdAt: '' }}
        companyName="Empresa Teste"
        onAccessExisting={vi.fn()}
        onNewResearch={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.getByText(/data desconhecida/)).toBeDefined();
  });

  it('chama onAccessExisting ao clicar no botão principal', () => {
    const onAccess = vi.fn();
    render(
      <DuplicateDossierModal
        existing={existingFixture}
        companyName="Empresa Teste"
        onAccessExisting={onAccess}
        onNewResearch={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Acessar Dossiê Existente'));
    expect(onAccess).toHaveBeenCalledOnce();
  });

  it('chama onNewResearch ao clicar em Nova Pesquisa', () => {
    const onNew = vi.fn();
    render(
      <DuplicateDossierModal
        existing={existingFixture}
        companyName="Empresa Teste"
        onAccessExisting={vi.fn()}
        onNewResearch={onNew}
        onDismiss={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Nova Pesquisa do Zero'));
    expect(onNew).toHaveBeenCalledOnce();
  });

  it('chama onDismiss ao clicar em Cancelar', () => {
    const onDismiss = vi.fn();
    render(
      <DuplicateDossierModal
        existing={existingFixture}
        companyName="Empresa Teste"
        onAccessExisting={vi.fn()}
        onNewResearch={vi.fn()}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(screen.getByText('Cancelar'));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('chama onDismiss ao clicar no overlay (fora do modal)', () => {
    const onDismiss = vi.fn();
    render(
      <DuplicateDossierModal
        existing={existingFixture}
        companyName="Empresa Teste"
        onAccessExisting={vi.fn()}
        onNewResearch={vi.fn()}
        onDismiss={onDismiss}
      />,
    );
    // O overlay é a div externa com backdrop
    fireEvent.click(screen.getByText(/Já existe um dossiê/).parentElement!.parentElement!);
    expect(onDismiss).toHaveBeenCalled();
  });

  it('não renderiza score quando ausente', () => {
    render(
      <DuplicateDossierModal
        existing={{ ...existingFixture, scoreOportunidade: null }}
        companyName="Empresa Teste"
        onAccessExisting={vi.fn()}
        onNewResearch={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(screen.queryByText(/Score PORTA/)).toBeNull();
  });
});
```

Rodar e confirmar que falha:

```bash
npx vitest run tests/components/DuplicateDossierModal.test.tsx
# Esperado: FAIL — Cannot find module '../../components/DuplicateDossierModal'
```

- [ ] **Step 2: GREEN — Implementar o modal**

```typescript
// components/DuplicateDossierModal.tsx
import type { ExistingDossier } from '../lib/supabase/dossierDuplicate';

interface DuplicateDossierModalProps {
  existing: ExistingDossier;
  companyName: string;
  onAccessExisting: () => void;
  onNewResearch: () => void;
  onDismiss: () => void;
}

export function DuplicateDossierModal({
  existing,
  companyName,
  onAccessExisting,
  onNewResearch,
  onDismiss,
}: DuplicateDossierModalProps) {
  const createdAt = existing.createdAt
    ? new Date(existing.createdAt).toLocaleDateString('pt-BR')
    : 'data desconhecida';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onDismiss}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl p-6 max-w-md w-full mx-4 border border-gray-200 dark:border-gray-700"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          Dossiê existente
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Já existe um dossiê para <strong>{companyName}</strong>, gerado em {createdAt}.
        </p>

        {existing.scoreOportunidade != null && (
          <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-amber-50 dark:bg-amber-900/30 rounded-lg">
            <span className="text-sm text-amber-700 dark:text-amber-300">
              Score PORTA: {existing.scoreOportunidade}/100
            </span>
          </div>
        )}

        <div className="flex flex-col gap-3">
          <button
            onClick={onAccessExisting}
            className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
          >
            Acessar Dossiê Existente
          </button>
          <button
            onClick={onNewResearch}
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 font-medium rounded-lg transition-colors"
          >
            Nova Pesquisa do Zero
          </button>
        </div>

        <button
          onClick={onDismiss}
          className="mt-3 w-full text-sm text-gray-400 hover:text-gray-500 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
```

Rodar e confirmar que passa:

```bash
npx vitest run tests/components/DuplicateDossierModal.test.tsx
# Esperado: 7 passed
```

- [ ] **Step 3: Commit**

```bash
git add tests/components/DuplicateDossierModal.test.tsx components/DuplicateDossierModal.tsx
git commit -m "feat: adiciona modal de dossiê duplicado com opções de acesso e nova pesquisa"
```

---

### Task 3: Integrar check de duplicação no ChatInterface — TDD

**Files:**

- Modify: `tests/components/ChatInterface.test.tsx`
- Modify: `components/ChatInterface.tsx`

- [ ] **Step 1: RED — Escrever teste para o comportamento integrado**

Adicionar ao `tests/components/ChatInterface.test.tsx`:

```typescript
import { findExistingDossier } from '../../lib/supabase/dossierDuplicate';
import { DuplicateDossierModal } from '../../components/DuplicateDossierModal';

vi.mock('../../lib/supabase/dossierDuplicate', () => ({
  findExistingDossier: vi.fn(),
}));

describe('ChatInterface — duplicate dossier check', () => {
  it('exibe modal quando CNPJ já tem dossiê', async () => {
    vi.mocked(findExistingDossier).mockResolvedValueOnce({
      id: 'dossier-1',
      title: 'Empresa Existente',
      empresaAlvo: 'Empresa Existente',
      createdAt: '2026-05-29T10:00:00Z',
      scoreOportunidade: 80,
    });

    // Dispara StartInvestigation com CNPJ existente
    // ... renderizar ChatInterface e disparar o fluxo

    // Modal deve aparecer
    expect(await screen.findByText('Dossiê existente')).toBeDefined();
    expect(screen.getByText(/Empresa Existente/)).toBeDefined();
  });

  it('não exibe modal quando CNPJ é novo', async () => {
    vi.mocked(findExistingDossier).mockResolvedValueOnce(null);

    // Dispara StartInvestigation com CNPJ novo
    // ...

    // Modal NÃO deve aparecer
    expect(screen.queryByText('Dossiê existente')).toBeNull();
  });

  it('chama onSelectSession ao acessar dossiê existente', async () => {
    vi.mocked(findExistingDossier).mockResolvedValueOnce({
      id: 'dossier-1',
      title: 'Empresa Existente',
      empresaAlvo: 'Empresa Existente',
      createdAt: '2026-05-29T10:00:00Z',
      scoreOportunidade: 80,
    });

    const onSelectSession = vi.fn();
    // renderizar com onSelectSession mock

    fireEvent.click(await screen.findByText('Acessar Dossiê Existente'));
    expect(onSelectSession).toHaveBeenCalledWith('dossier-1');
  });
});
```

Rodar e confirmar que falha:

```bash
npx vitest run tests/components/ChatInterface.test.tsx
# Esperado: FAIL — novos testes falham (modal não renderiza)
```

- [ ] **Step 2: GREEN — Implementar no ChatInterface**

Adicionar imports no topo de `ChatInterface.tsx`:

```typescript
import { findExistingDossier, type ExistingDossier } from '../lib/supabase/dossierDuplicate';
import { DuplicateDossierModal } from './DuplicateDossierModal';
```

Adicionar estado e ref:

```typescript
const [duplicateDossier, setDuplicateDossier] = useState<ExistingDossier | null>(null);
const pendingPayloadRef = useRef<StartInvestigationPayload | null>(null);
```

Extrair `executeInvestigation` do `handleStartInvestigation` atual e modificar para incluir o check:

```typescript
const executeInvestigation = useCallback(
  async (payload: StartInvestigationPayload) => {
    // Corpo original de handleStartInvestigation (linhas 151-185)
    const prompt = `🔍 Investigando ${payload.companyName}...`;
    const promptMode = resolvePromptMode(mode, canWarRoom);

    let segmentHint: string | undefined;
    if (payload.cnpj) {
      try {
        const signal = AbortSignal.timeout(8000);
        const companyData = await fetchCompanyByCnpj(payload.cnpj, signal);
        if (companyData.cnaeDescricao) {
          segmentHint = companyData.cnaeDescricao;
        }
      } catch (error) {
        scoutDiag.warn('ChatInterface', 'Falha ao buscar CNAE', { cnpj: payload.cnpj, error });
      }
    }

    const hiddenPromptBase = buildInvestigationHiddenPrompt(
      {
        companyName: payload.companyName,
        cnpj: payload.cnpj || undefined,
        city: payload.city,
        state: payload.state,
        segmentHint,
      },
      {
        includeBudget: shouldIncludeBudgetPrompt(payload, promptMode, radar),
        mode: promptMode,
        strictAudit: true,
        enableDiscrepancyHunter: true,
        enableCostOfDelay: true,
        promptVersion: PROMPT_VERSION,
      },
    );
    const hiddenPrompt = [hiddenPromptBase, buildRadarContextBlock(radar)].filter(Boolean).join('\n\n');
    await onDeepDive(prompt, hiddenPrompt, payload.companyName, payload.cnpj);
  },
  [mode, canWarRoom, onDeepDive, radar],
);

const handleStartInvestigation = useCallback(
  async (payload: StartInvestigationPayload) => {
    if (operatorId) {
      void storage.touchUserContext(operatorId);
    }

    if (payload.cnpj || payload.companyName) {
      const existing = await findExistingDossier(payload.cnpj, payload.companyName, operatorId || '');
      if (existing) {
        pendingPayloadRef.current = payload;
        setDuplicateDossier(existing);
        return;
      }
    }

    await executeInvestigation(payload);
  },
  [mode, canWarRoom, operatorId, radar, onDeepDive, executeInvestigation],
);

const handleAccessExistingDossier = useCallback(async () => {
  if (!duplicateDossier || !operatorId) return;
  const dossier = await storage.getDossier(duplicateDossier.id);
  if (dossier) {
    onSelectSession?.(duplicateDossier.id);
  }
  setDuplicateDossier(null);
  pendingPayloadRef.current = null;
  trackOperatorEvent('dossier_reopened', {
    operatorId,
    entityId: duplicateDossier.id,
    entityType: 'dossier',
    companyName: duplicateDossier.empresaAlvo,
  });
}, [duplicateDossier, operatorId, onSelectSession]);

const handleNewResearchOverride = useCallback(
  async (payload: StartInvestigationPayload) => {
    setDuplicateDossier(null);
    pendingPayloadRef.current = null;
    if (duplicateDossier) {
      await storage.deleteDossier(duplicateDossier.id);
    }
    await executeInvestigation(payload);
    trackOperatorEvent('dossier_override', {
      operatorId: operatorId || '',
      previousDossierId: duplicateDossier?.id,
      entityType: 'dossier',
      companyName: payload.companyName,
    });
  },
  [duplicateDossier, executeInvestigation, operatorId],
);
```

Renderizar o modal condicionalmente no JSX:

```typescript
{duplicateDossier && pendingPayloadRef.current && (
  <DuplicateDossierModal
    existing={duplicateDossier}
    companyName={pendingPayloadRef.current.companyName}
    onAccessExisting={handleAccessExistingDossier}
    onNewResearch={() => handleNewResearchOverride(pendingPayloadRef.current!)}
    onDismiss={() => { setDuplicateDossier(null); pendingPayloadRef.current = null; }}
  />
)}
```

Rodar e confirmar que passa:

```bash
npx vitest run tests/components/ChatInterface.test.tsx
# Esperado: todos passam (novos + existentes)
```

- [ ] **Step 3: Rodar typecheck**

```bash
npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add tests/components/ChatInterface.test.tsx components/ChatInterface.tsx
git commit -m "feat: adiciona trava de CNPJ duplicado antes de nova investigação"
```

---

### Task 4: DossierShareBar — TDD

**Files:**

- Create: `tests/components/DossierShareBar.test.tsx`
- Create: `components/DossierShareBar.tsx`

- [ ] **Step 1: RED — Escrever o teste e ver falhar**

```typescript
// tests/components/DossierShareBar.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('../../services/storage', () => ({
  storage: {
    shareDossier: vi.fn(),
  },
}));

Object.defineProperty(window, 'location', {
  value: { origin: 'https://scoutagro.app' },
  writable: true,
});

Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: vi.fn().mockResolvedValue(undefined) },
  writable: true,
});

describe('DossierShareBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renderiza estado inicial com botão Copiar link e Teams desabilitado', async () => {
    const { DossierShareBar } = await import('../../components/DossierShareBar');
    render(<DossierShareBar dossierId="dossier-1" companyName="Empresa X" />);

    expect(screen.getByText('Dossiê concluído')).toBeDefined();
    expect(screen.getByText('Copiar link')).toBeDefined();
    const teamsBtn = screen.getByText('Teams');
    expect(teamsBtn).toBeDefined();
    expect((teamsBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('copia link e habilita Teams ao clicar em Copiar', async () => {
    const { storage } = await import('../../services/storage');
    vi.mocked(storage.shareDossier).mockResolvedValueOnce('token-abc-123');

    const { DossierShareBar } = await import('../../components/DossierShareBar');
    render(<DossierShareBar dossierId="dossier-1" companyName="Empresa X" />);

    fireEvent.click(screen.getByText('Copiar link'));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        'https://scoutagro.app/dossie/token-abc-123',
      );
    });

    // Teams deve estar habilitado após copiar
    const teamsBtn = screen.getByText('Teams');
    expect((teamsBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it('mostra "Copiado" após clique bem-sucedido', async () => {
    const { storage } = await import('../../services/storage');
    vi.mocked(storage.shareDossier).mockResolvedValueOnce('token-456');

    const { DossierShareBar } = await import('../../components/DossierShareBar');
    render(<DossierShareBar dossierId="dossier-1" companyName="Empresa X" />);

    fireEvent.click(screen.getByText('Copiar link'));

    await waitFor(() => {
      expect(screen.getByText('Copiado')).toBeDefined();
    });
  });

  it('abre deep link do Teams com URL codificada', async () => {
    const { storage } = await import('../../services/storage');
    vi.mocked(storage.shareDossier).mockResolvedValueOnce('token-789');

    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    const { DossierShareBar } = await import('../../components/DossierShareBar');
    render(<DossierShareBar dossierId="dossier-1" companyName="Empresa X" />);

    fireEvent.click(screen.getByText('Copiar link'));

    await waitFor(() => {
      const teamsBtn = screen.getByText('Teams');
      expect((teamsBtn as HTMLButtonElement).disabled).toBe(false);
    });

    fireEvent.click(screen.getByText('Teams'));

    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('https://teams.microsoft.com/l/message/'),
      '_blank',
      'noopener',
    );
    openSpy.mockRestore();
  });
});
```

Rodar e confirmar que falha:

```bash
npx vitest run tests/components/DossierShareBar.test.tsx
# Esperado: FAIL — Cannot find module
```

- [ ] **Step 2: GREEN — Implementar o componente**

```typescript
// components/DossierShareBar.tsx
import { useCallback, useState } from 'react';

interface DossierShareBarProps {
  dossierId: string;
  companyName: string;
}

export function DossierShareBar({ dossierId, companyName }: DossierShareBarProps) {
  const [copied, setCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const handleCopyLink = useCallback(async () => {
    const { storage } = await import('../services/storage');
    const token = await storage.shareDossier(dossierId);
    if (!token) return;

    const url = `${window.location.origin}/dossie/${token}`;
    setShareUrl(url);
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }, [dossierId]);

  const handleShareTeams = useCallback(() => {
    if (!shareUrl) return;
    const text = encodeURIComponent(`Dossiê ${companyName}: ${shareUrl}`);
    window.open(`https://teams.microsoft.com/l/message/0/0?message=${text}`, '_blank', 'noopener');
  }, [shareUrl, companyName]);

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-900/20 dark:to-blue-900/20 border border-green-200 dark:border-green-800 rounded-xl">
      <span className="text-sm font-medium text-green-800 dark:text-green-200 flex-1">
        Dossiê concluído
      </span>

      <button
        onClick={handleCopyLink}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
      >
        {copied ? (
          <>
            <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Copiado
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            Copiar link
          </>
        )}
      </button>

      <button
        onClick={handleShareTeams}
        disabled={!shareUrl}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white rounded-lg transition-colors shadow-sm disabled:cursor-not-allowed"
        style={{ backgroundColor: shareUrl ? '#6264A7' : '#9CA3AF' }}
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12.43 6.2c0-.57-.43-1-.97-1H4.97c-.54 0-.97.43-.97 1v5.17c0 .58.43 1 .97 1h2.27v3.06c0 .58.43 1 .97 1h3.25c.54 0 .97-.42.97-1V6.2zM8.97 11.37H5.93V8.13h3.04v3.24z" />
          <path d="M20.03 6.2c0-.57-.43-1-.97-1h-3.55c-.54 0-.97.43-.97 1v5.31l5.49 3.4V6.2z" />
          <path d="M14.54 12.84v2.69c0 .57.43 1 .97 1h2.59c.54 0 .97-.43.97-1v-7.72l-4.53 2.8v2.23z" />
        </svg>
        Teams
      </button>
    </div>
  );
}
```

Rodar e confirmar que passa:

```bash
npx vitest run tests/components/DossierShareBar.test.tsx
# Esperado: 5 passed
```

- [ ] **Step 3: Commit**

```bash
git add tests/components/DossierShareBar.test.tsx components/DossierShareBar.tsx
git commit -m "feat: adiciona barra de compartilhamento com link e botão Teams"
```

---

### Task 5: Evento dossier:completed + tracking — TDD

**Files:**

- Modify: `tests/features/dossier/waterfall-orchestrator.test.ts`
- Modify: `features/dossier/waterfall-orchestrator.ts`
- Modify: `tests/services/storage.test.ts`
- Modify: `services/storage.ts`

- [ ] **Step 1: RED — Escrever teste para o evento customizado**

Adicionar ao `tests/features/dossier/waterfall-orchestrator.test.ts`:

```typescript
it('dispara evento dossier:completed após saveDossier bem-sucedido', async () => {
  const handler = vi.fn();
  window.addEventListener('dossier:completed', handler);

  // Configurar mock para saveDossier resolver com sucesso
  vi.mocked(storage.saveDossier).mockResolvedValueOnce(undefined);

  // Executar waterfall
  // ...

  await waitFor(() => {
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({
          dossierId: expect.any(String),
          companyName: expect.any(String),
        }),
      }),
    );
  });

  window.removeEventListener('dossier:completed', handler);
});

it('não dispara evento dossier:completed quando saveDossier falha', async () => {
  const handler = vi.fn();
  window.addEventListener('dossier:completed', handler);

  vi.mocked(storage.saveDossier).mockRejectedValueOnce(new Error('Supabase offline'));

  // Executar waterfall
  // ...

  await waitFor(() => {
    // O catch loga via scoutDiag mas não dispara o evento
    expect(handler).not.toHaveBeenCalled();
  });

  window.removeEventListener('dossier:completed', handler);
});
```

Rodar e confirmar que falha:

```bash
npx vitest run tests/features/dossier/waterfall-orchestrator.test.ts
# Esperado: FAIL — evento não disparado
```

- [ ] **Step 2: GREEN — Implementar evento no waterfall**

No `waterfall-orchestrator.ts`, substituir o bloco após `saveDossier` (linha 1009-1018):

```typescript
if (sessionToPersist) {
  try {
    await storage.saveDossier(sessionToPersist);
    window.dispatchEvent(
      new CustomEvent('dossier:completed', {
        detail: {
          dossierId: sessionToPersist.id,
          companyName: resolvedMegaCompany || normalizedCompany || '',
          cnpj: sessionToPersist.cnpj,
        },
      }),
    );
  } catch (error) {
    scoutDiag.warn('ModularDossier', 'falha ao persistir dossiê final; mantendo sessão em memória', {
      sessionId,
      company: resolvedMegaCompany || normalizedCompany || null,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
```

Adicionar `shareChannel` ao tracking existente em `storage.ts` linha 585:

```typescript
trackOperatorEvent('dossier_shared', {
  operatorId,
  email: localStorage.getItem('scout360:operator_email') || undefined,
  entityType: 'shared_dossier',
  entityId: dossierId,
  companyCnpj: dossier.cnpj || undefined,
  companyName: dossier.empresaAlvo || undefined,
  shareChannel: 'link',
});
```

Rodar e confirmar que passa:

```bash
npx vitest run tests/features/dossier/waterfall-orchestrator.test.ts tests/services/storage.test.ts
# Esperado: todos passam
```

- [ ] **Step 3: Rodar typecheck**

```bash
npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add tests/features/dossier/waterfall-orchestrator.test.ts features/dossier/waterfall-orchestrator.ts tests/services/storage.test.ts services/storage.ts
git commit -m "feat: emite evento dossier:completed pós-persistência e adiciona shareChannel ao tracking"
```

---

### Task 6: Integrar DossierShareBar na UI — TDD

**Files:**

- Modify: `tests/components/MessageRow.test.tsx`
- Modify: `components/MessageRow.tsx`

- [ ] **Step 1: RED — Escrever teste para o listener do evento**

Adicionar ao `tests/components/MessageRow.test.tsx`:

```typescript
import { DossierShareBar } from '../../components/DossierShareBar';

vi.mock('../../components/DossierShareBar', () => ({
  DossierShareBar: vi.fn(() => <div data-testid="share-bar" />),
}));

describe('MessageRow — dossier share integration', () => {
  it('renderiza DossierShareBar quando evento dossier:completed é disparado', async () => {
    render(<MessageRow {...defaultProps} />);

    expect(screen.queryByTestId('share-bar')).toBeNull();

    window.dispatchEvent(
      new CustomEvent('dossier:completed', {
        detail: { dossierId: 'dossier-1', companyName: 'Empresa X' },
      }),
    );

    await waitFor(() => {
      expect(screen.getByTestId('share-bar')).toBeDefined();
    });
  });

  it('limpa DossierShareBar quando um novo dossiê inicia', async () => {
    // Simula cleanup ao receber novo evento
    render(<MessageRow {...defaultProps} />);

    window.dispatchEvent(
      new CustomEvent('dossier:completed', {
        detail: { dossierId: 'dossier-1', companyName: 'Empresa X' },
      }),
    );
    await waitFor(() => expect(screen.getByTestId('share-bar')).toBeDefined());

    // Novo waterfall inicia — share bar deve sumir
    window.dispatchEvent(new CustomEvent('dossier:started'));
    await waitFor(() => expect(screen.queryByTestId('share-bar')).toBeNull());
  });
});
```

Rodar e confirmar que falha:

```bash
npx vitest run tests/components/MessageRow.test.tsx
# Esperado: FAIL — share bar não renderiza
```

- [ ] **Step 2: GREEN — Implementar listener no MessageRow**

No `MessageRow.tsx`, adicionar imports e estado:

```typescript
import { DossierShareBar } from './DossierShareBar';
import { useEffect, useState } from 'react';

const [completedDossier, setCompletedDossier] = useState<{
  dossierId: string;
  companyName: string;
} | null>(null);

useEffect(() => {
  const handleCompleted = (event: Event) => {
    setCompletedDossier((event as CustomEvent).detail);
  };
  const handleStarted = () => {
    setCompletedDossier(null);
  };
  window.addEventListener('dossier:completed', handleCompleted);
  window.addEventListener('dossier:started', handleStarted);
  return () => {
    window.removeEventListener('dossier:completed', handleCompleted);
    window.removeEventListener('dossier:started', handleStarted);
  };
}, []);
```

Renderizar no JSX após a última mensagem de bot:

```typescript
{completedDossier && isLast && !isLoading && (
  <DossierShareBar
    dossierId={completedDossier.dossierId}
    companyName={completedDossier.companyName}
  />
)}
```

Rodar e confirmar que passa:

```bash
npx vitest run tests/components/MessageRow.test.tsx
# Esperado: todos passam
```

- [ ] **Step 3: Commit**

```bash
git add tests/components/MessageRow.test.tsx components/MessageRow.tsx
git commit -m "feat: integra DossierShareBar ao fluxo de mensagens via evento dossier:completed"
```

---

### Task 7: Verificação final

- [ ] **Step 1: Rodar suite completa de testes**

```bash
npm test
# Esperado: todos passam (0 falhas)
```

- [ ] **Step 2: Rodar typecheck**

```bash
npm run typecheck
# Esperado: 0 erros
```

- [ ] **Step 3: Rodar build**

```bash
npm run build
# Esperado: build bem-sucedido
```

- [ ] **Step 4: Testar fluxos no preview**

```
Fluxo 1: CNPJ novo → investigação normal (sem trava)
Fluxo 2: CNPJ com dossiê existente → modal aparece
Fluxo 3: Clicar "Acessar Existente" → carrega dossiê existente
Fluxo 4: Clicar "Nova Pesquisa" → soft-delete + novo waterfall
Fluxo 5: Dossiê concluído → barra de share aparece
Fluxo 6: Copiar link → token válido, link funcional
Fluxo 7: Botão Teams → abre deep link do Microsoft Teams
```

- [ ] **Step 5: Commit final (se ajustes no preview)**

```bash
git add -A
git commit -m "chore: ajustes finais pós-verificação no preview"
```

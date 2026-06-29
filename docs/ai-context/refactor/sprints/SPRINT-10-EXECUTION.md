# Sprint 10 — Execução

**Objetivo:** Mover runtime do Radar para `features/radar/*`, preservar facades de compatibilidade e instalar guard test arquitetural.

**Branch principal:** `codex/sprint-10-radar-boundary` (derivada de `origin/main@66591f1`, após PR `#256`)
**Duração:** entrega curta
**PRs estimadas:** 1

> Para contexto completo, ver `../PLANO_COMPLETO_SPRINTS.md`.

## Nota de execução 2026-05-16

O plano original abaixo previa três ondas e deleção dos arquivos legados no final. A execução aprovada para esta PR é mais conservadora:

- mover somente o runtime (`useRadar` + service) para `features/radar/*`;
- manter `hooks/useRadar.ts` e `services/radarService.ts` como facades públicas;
- atualizar `App.tsx` e testes de App para o barrel `features/radar`;
- adicionar guardrail para bloquear novos imports de produção dos caminhos legados;
- deixar componentes visuais `Radar*` e remoção das facades para uma fatia posterior.

---

## Pré-flight

- [ ] Sprint 9 mergeada em `main`.
- [ ] `git checkout main && git pull origin main && git tag pre-sprint-10 && git push origin pre-sprint-10`.
- [ ] Gates verdes: `npm test`, `typecheck`, `build`, `lint`.
- [ ] Levantar inventário atual:
  ```bash
  grep -rn "from.*hooks/useRadar\|from.*services/radarService" --include="*.ts" --include="*.tsx" . | grep -v node_modules > /tmp/radar-imports-baseline.txt
  ```
  Esperado: ~29 ocorrências.

---

## Onda 1 — Mover hook + service para o boundary

**PR:** `refactor/sprint-10-onda-1-move` → `refactor/sprint-10`
**Risco:** baixo (`git mv` + re-exports temporários)

### Mudanças

```bash
git mv hooks/useRadar.ts                      features/radar/useRadar.ts
git mv services/radarService.ts               features/radar/radarService.ts
git mv tests/hooks/useRadar.test.ts           tests/features/radar/useRadar.test.ts
git mv tests/services/radarService.test.ts    tests/features/radar/radarService.test.ts
```

Atualizar imports internos (cruzados entre o hook e o service) — o hook deve passar a importar o service de `'./radarService'` em vez de `'../services/radarService'`.

### Re-exports temporários (compat)

**Criar `hooks/useRadar.ts` (novo arquivo de re-export):**

```typescript
export * from '../features/radar/useRadar';
```

**Criar `services/radarService.ts` (novo arquivo de re-export):**

```typescript
export * from '../features/radar/radarService';
```

> Estes re-exports são deletados na Onda 3.

### Aceite

- [ ] Arquivos físicos estão em `features/radar/` (verificar com `ls features/radar/`).
- [ ] `tests/features/radar/*` passa.
- [ ] `tests/hooks/useRadar.test.ts` e `tests/services/radarService.test.ts` não existem mais (foram movidos).
- [ ] `App.tsx` e demais consumidores ainda compilam (graças aos re-exports).
- [ ] Gates verdes.

### Rollback

Reverter PR; os 4 arquivos voltam às posições originais via `git revert`.

---

## Onda 2 — Orchestrator + barrel + atualizar consumidores

**PR:** `refactor/sprint-10-onda-2-orchestrator` → `refactor/sprint-10`
**Risco:** médio (atualiza ~29 imports)

### Mudanças

**1. Criar `features/radar/orchestrator.ts`:**

Identificar funções de alto nível atualmente em `features/radar/radarService.ts` ou `features/radar/useRadar.ts` que fazem orquestração entre múltiplas chamadas. Candidatos típicos:

- `scanForAlerts`
- `processRadarEntry`
- Wrapper de `api/radar-scan.ts`

Mover essas funções para `orchestrator.ts`. O `radarService.ts` deve ficar como camada de I/O pura (HTTP/storage); o `orchestrator.ts` é a camada de regra de negócio.

**2. Atualizar `features/radar/index.ts` (barrel):**

```typescript
export { useRadar } from './useRadar';
export { scanForAlerts, processRadarEntry } from './orchestrator';
export type { RadarAlert, RadarCategory, RadarEntry } from './types';
```

**3. Atualizar consumidores** (incluindo `App.tsx`):

```bash
# Estimativa: ~29 ocorrências
grep -rln "from.*hooks/useRadar\|from.*services/radarService" --include="*.ts" --include="*.tsx" . | grep -v node_modules
```

Substituir por `import { ... } from 'features/radar';` (ou caminho relativo equivalente).

> Os re-exports da Onda 1 ainda existem como rede de segurança durante esta PR — só são deletados na Onda 3.

### Aceite

- [ ] `features/radar/orchestrator.ts` criado.
- [ ] `features/radar/index.ts` exporta tudo público do feature.
- [ ] `grep -rn "from.*hooks/useRadar\|from.*services/radarService" --include="*.ts" --include="*.tsx" . | grep -v node_modules | grep -v "features/radar/" | grep -v "/test"` retorna 0.
- [ ] `App.tsx` importa Radar **apenas** de `features/radar`.
- [ ] Validação manual: Radar Panel, Settings, Bell funcionando.
- [ ] Gates verdes.

### Rollback

Reverter PR; consumidores voltam a usar imports antigos via re-exports.

---

## Onda 3 — Mover componentes + guard test + deletar legados

**PR:** `refactor/sprint-10-onda-3-components-guard` → `refactor/sprint-10`
**Risco:** médio (mover componentes + atualização de imports)

### Mudanças

**1. Mover componentes:**

```bash
mkdir -p features/radar/components
git mv components/RadarBell.tsx       features/radar/components/RadarBell.tsx
git mv components/RadarPanel.tsx      features/radar/components/RadarPanel.tsx
git mv components/RadarSettings.tsx   features/radar/components/RadarSettings.tsx
```

**2. Adicionar exports ao barrel `features/radar/index.ts`:**

```typescript
export { RadarBell } from './components/RadarBell';
export { RadarPanel } from './components/RadarPanel';
export { RadarSettings } from './components/RadarSettings';
```

**3. Atualizar imports em todos os consumidores** (estimativa: 5–10 arquivos):

```bash
grep -rln "from.*components/Radar" --include="*.ts" --include="*.tsx" . | grep -v node_modules
```

Substituir por `import { RadarBell } from 'features/radar';` (ou caminho equivalente).

**4. Deletar re-exports temporários da Onda 1:**

```bash
rm hooks/useRadar.ts
rm services/radarService.ts
```

**5. Criar guard test `tests/architecture/useRadarImportGuard.test.ts`** clonando o padrão de `tests/architecture/useChatImportGuard.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(CURRENT_DIR, '../..');
const PRODUCTION_DIRS = ['components', 'contexts', 'features', 'hooks', 'services', 'utils', 'api'];

const FORBIDDEN_PATHS = [
  path.join(REPO_ROOT, 'hooks/useRadar.ts'),
  path.join(REPO_ROOT, 'services/radarService.ts'),
  path.join(REPO_ROOT, 'components/RadarBell.tsx'),
  path.join(REPO_ROOT, 'components/RadarPanel.tsx'),
  path.join(REPO_ROOT, 'components/RadarSettings.tsx'),
];

const FORBIDDEN_IMPORT_PATTERNS = [
  /from\s+['"][^'"]*hooks\/useRadar['"]/,
  /from\s+['"][^'"]*services\/radarService['"]/,
  /from\s+['"][^'"]*components\/RadarBell['"]/,
  /from\s+['"][^'"]*components\/RadarPanel['"]/,
  /from\s+['"][^'"]*components\/RadarSettings['"]/,
];

// Coletar arquivos em PRODUCTION_DIRS, excluindo features/radar/ (que é a localização correta).
// Descrições de teste: "removes legacy radar paths" + "blocks new imports of legacy radar paths".
```

### Aceite

- [ ] `hooks/useRadar.ts` e `services/radarService.ts` não existem mais.
- [ ] `components/RadarBell.tsx`, `components/RadarPanel.tsx`, `components/RadarSettings.tsx` não existem mais (estão em `features/radar/components/`).
- [ ] `features/radar/index.ts` exporta os 3 componentes + hook + tipos + funções de orchestrator.
- [ ] `tests/architecture/useRadarImportGuard.test.ts` passa.
- [ ] Validação manual: Radar Panel abre, Bell mostra count, Settings persiste.
- [ ] Gates verdes.

### Rollback

Reverter PR; restaurar componentes e arquivos legados.

---

## Critérios de Aceite Finais (gate de merge para `main`)

- [ ] Estrutura final de `features/radar/`:
  ```
  features/radar/
  ├── components/
  │   ├── RadarBell.tsx
  │   ├── RadarPanel.tsx
  │   └── RadarSettings.tsx
  ├── orchestrator.ts
  ├── radarService.ts
  ├── useRadar.ts
  ├── types.ts
  ├── index.ts
  └── README.md
  ```
- [ ] Arquivos deletados: `hooks/useRadar.ts`, `services/radarService.ts`, `components/Radar*.tsx`.
- [ ] Guard test `useRadarImportGuard.test.ts` ativo.
- [ ] OI-054 movido para "Histórico de Itens Resolvidos" em `03-OPEN-ITEMS.md`.
- [ ] `04-ARCHITECTURE-TARGET.md` atualizado: linha "Radar runtime fora do boundary" sai da tabela "Estado Atual vs Alvo".
- [ ] `HANDOFF_AI.md` atualizado: estado arquitetural reflete Radar como feature completa.
- [ ] Gates verdes.

## Estimativa de redução

| Métrica                         | Antes         | Depois                     |
| ------------------------------- | ------------- | -------------------------- |
| Arquivos Radar fora do boundary | 5             | 0                          |
| `hooks/useRadar.ts`             | 291 ln        | deletado                   |
| `services/radarService.ts`      | 234 ln        | deletado                   |
| Imports legados                 | ~29           | 0                          |
| `features/radar/`               | stub (2 arq.) | runtime completo (8+ arq.) |

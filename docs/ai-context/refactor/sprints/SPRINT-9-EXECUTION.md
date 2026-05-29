# Sprint 9 — Execução

**Objetivo:** App shell decoupling, governança de fase, hardening de segurança Pinecone, fim do boundary leak `dossier → chat`.

**Branch principal:** `refactor/sprint-9` (derivada de `main`)
**Duração:** 2 semanas
**PRs estimadas:** 4 (+ 1 opcional)

> Para contexto completo, ver `../PLANO_COMPLETO_SPRINTS.md`.

---

## Pré-flight (commit 0 — pode ser PR única ou commit direto na branch da sprint)

### Tag de rollback

```bash
git checkout main && git pull origin main
git tag pre-sprint-9 && git push origin pre-sprint-9
```

### DevDeps de análise

```bash
npm install --save-dev madge ts-prune
```

Adicionar scripts em `package.json`:

```json
{
  "scripts": {
    "analyze:circular": "madge --circular . --extensions ts,tsx --exclude '^(node_modules|dist|\\.next|public)'",
    "analyze:deadcode": "ts-prune"
  }
}
```

### Baseline de circulares

```bash
npm run analyze:circular > /tmp/madge-baseline.txt
```

Registrar resultado em `../PLANO_COMPLETO_SPRINTS.md` (Apêndice B): data, comando, número de circulares.

### Confirmar baseline limpo

```bash
npm test && npm run typecheck && npm run build && npm run lint
```

---

## Onda 1 — Resolver boundary leak `dossier → chat`

**PR:** `refactor/sprint-9-onda-1-leak` → `refactor/sprint-9`
**Risco:** baixo (movimento interno)
**Pré-requisito:** Pré-flight concluído.

### Problema verificado

`features/chat/message-helpers.ts:68` define `isAbortLikeError`. Importadores em `features/dossier/`:

- `waterfall-orchestrator.ts:29` (também importa `RunMegaPromptWaterfallArgs` da `message-orchestrator.ts:32`)
- `porta-reconciliation.ts:7`
- `benchmark-stage.ts:4`

Importador interno em `features/chat/message-orchestrator.ts:21` (mantém — está dentro do mesmo feature).

### Mudanças

**1. Criar `utils/abortHelpers.ts`** com a implementação de `isAbortLikeError`:

```typescript
// utils/abortHelpers.ts
export function isAbortLikeError(error: unknown): boolean {
  // (mover implementação de features/chat/message-helpers.ts:68)
}
```

**2. Atualizar `features/chat/message-helpers.ts`**: substituir a definição local por `export { isAbortLikeError } from '../../utils/abortHelpers';` (re-export para não quebrar importadores internos no mesmo PR — remover na onda 4 ou em PR de cleanup).

**3. Atualizar imports em `features/dossier/*`**:

- `waterfall-orchestrator.ts:29` → `import { isAbortLikeError } from '../../utils/abortHelpers';`
- `porta-reconciliation.ts:7` → idem
- `benchmark-stage.ts:4` → idem

**4. Mover `RunMegaPromptWaterfallArgs`**:

- Localizar a interface em `features/chat/message-orchestrator.ts`.
- Decisão: se for usada apenas por dossier, mover para `features/dossier/types.ts`. Se for compartilhada, mover para `types.ts` (root).
- Atualizar `features/dossier/waterfall-orchestrator.ts:32` para apontar à nova localização.

### Aceite

- [ ] `grep -rn "from '\.\./chat" features/dossier/` retorna 0 resultados.
- [ ] `npm test` verde (especialmente `tests/features/chat/*` e `tests/features/dossier/*`).
- [ ] `npm run typecheck` verde.

### Rollback

Reverter PR; `pre-sprint-9` continua válida como rede de segurança da sprint inteira.

---

## Onda 2 — Modelo de feature flags + módulo

**PR:** `refactor/sprint-9-onda-2-flags` → `refactor/sprint-9`
**Risco:** baixo (módulo novo isolado)

### Decisão prévia (documental, antes da PR)

Atualizar `ARQUITETURA.md` com seção **"Feature Flags"**:

- Avaliação: runtime, via `import.meta.env.VITE_FF_*` com fallback hardcoded.
- Override em produção: variáveis de ambiente Vercel `VITE_FF_<NAME>`.
- Sem remote config nesta fase.
- Cada flag deve declarar `removeBy: 'Sprint X'`. Flags vencidas viram OI no próximo close-out.

### Mudanças

**1. Criar `utils/featureFlags.ts`:**

```typescript
export type FeatureFlagName = 'deepDive' | 'warRoom' | 'newExportFlow' | 'radarV2';

interface FeatureFlagConfig {
  default: boolean;
  removeBy: string; // ex.: 'Sprint 12'
  envOverride?: string; // ex.: 'VITE_FF_DEEP_DIVE'
}

const FLAGS: Record<FeatureFlagName, FeatureFlagConfig> = {
  deepDive: { default: true, removeBy: 'Sprint 14', envOverride: 'VITE_FF_DEEP_DIVE' },
  warRoom: { default: true, removeBy: 'Sprint 14', envOverride: 'VITE_FF_WAR_ROOM' },
  newExportFlow: { default: false, removeBy: 'Sprint 12', envOverride: 'VITE_FF_NEW_EXPORT' },
  radarV2: { default: false, removeBy: 'Sprint 13', envOverride: 'VITE_FF_RADAR_V2' },
};

export function getFlag(name: FeatureFlagName): boolean {
  const cfg = FLAGS[name];
  const override = cfg.envOverride ? import.meta.env[cfg.envOverride] : undefined;
  if (override === 'true') return true;
  if (override === 'false') return false;
  return cfg.default;
}
```

**2. Criar `tests/utils/featureFlags.test.ts`** com 3 casos:

- Leitura padrão retorna `default`.
- Override `VITE_FF_<NAME>=true` retorna `true`.
- Override inválido (`'maybe'`) cai no `default`.

### Aceite

- [ ] `utils/featureFlags.ts` existe e exporta `getFlag` + tipo `FeatureFlagName`.
- [ ] Testes passam com cobertura ≥ 90% nas linhas novas.
- [ ] `ARQUITETURA.md` tem seção "Feature Flags".

### Rollback

Reverter PR. Não há consumidores ainda.

---

## Onda 3 — Extrair wiring de modais para hooks

**PR:** `refactor/sprint-9-onda-3-modal-hooks` → `refactor/sprint-9`
**Risco:** médio (toca `App.tsx` extensamente)

### Problema verificado

`App.tsx` tem wiring de modal espalhado:

- Estado: linhas 141, 147 (`useState`).
- Efeito de Esc: linhas 161–169.
- Setters: linhas 451, 471, 622–632.
- Render: linhas 695–703.

### Mudanças

**1. Criar `hooks/useEmailModal.ts`:**

```typescript
export interface UseEmailModalReturn {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  handleSend: (payload: EmailPayload) => Promise<void>;
}

export function useEmailModal(deps: UseEmailModalDeps): UseEmailModalReturn {
  // - useState para isOpen
  // - useEffect para Esc (ver lógica em App.tsx:161-169)
  // - handleSend que orquestra envio (delegar para services/exportService.ts na Onda 4)
}
```

**2. Criar `hooks/useFollowUpModal.ts`** análogo para FollowUp.

**3. Refatorar `App.tsx`:**

- Substituir `useState(false)` em 141, 147 por `const email = useEmailModal({ ... });` e `const followUp = useFollowUpModal({ ... });`.
- Remover efeito de Esc (linhas 161–169) — agora vive nos hooks.
- Substituir `setShowEmailModal(true/false)` por `email.open()`/`email.close()` (linhas 451, 622–628).
- Substituir `setShowFollowUpModal` análogo (linhas 471, 631–632).
- No render (linhas 695–703), passar `isOpen={email.isOpen}` e `onClose={email.close}`.

**4. Criar `tests/hooks/useEmailModal.test.tsx`:**

- Caso 1: `open()` define `isOpen=true`.
- Caso 2: tecla Esc dispara `close()` quando `isOpen=true`.
- Caso 3: `handleSend` chama callback de envio passado em `deps`.

**5. Criar `tests/hooks/useFollowUpModal.test.tsx`** análogo.

### Aceite

- [ ] `App.tsx` < 700 linhas (queda mínima de ~70).
- [ ] `grep -n "setShowEmailModal\|setShowFollowUpModal" App.tsx` retorna 0.
- [ ] Testes novos passam com cobertura ≥ 80%.
- [ ] Validação manual: abrir e fechar EmailModal e FollowUpModal funciona; Esc fecha.

### Rollback

Reverter PR; sem efeito em outros consumidores (hooks isolados).

---

## Onda 4 — Service de export + hardening de segurança Pinecone

**PR:** `refactor/sprint-9-onda-4-export-pinecone` → `refactor/sprint-9`
**Risco:** médio (toca `index.tsx` e Vercel Functions)

### Mudanças — `services/exportService.ts`

Criar `services/exportService.ts` com:

```typescript
export interface EmailPayload {
  /* ... */
}
export interface FollowUpPayload {
  /* ... */
}

export function buildEmailPayload(session: Session, dossier: Dossier): EmailPayload {
  /* ... */
}
export function buildFollowUpPayload(session: Session): FollowUpPayload {
  /* ... */
}
export async function exportToPDF(node: HTMLElement): Promise<Blob> {
  /* delegar a utils/printExport.ts */
}
```

Migrar lógica embutida em `App.tsx` para o service. Atualizar hooks da Onda 3 para chamar `buildEmailPayload`/`buildFollowUpPayload` em `handleSend`.

### Mudanças — `index.tsx` (remover risco Pinecone)

Em `index.tsx:7-19`, remover do array `OPTIONAL_ENV_VARS`:

```typescript
{ key: 'VITE_PINECONE_API_KEY', label: 'Chave Pinecone (RAG)' },         // ← remover
{ key: 'VITE_PINECONE_INDEX_HOST', label: 'Host do índice Pinecone' },   // ← remover
```

A validação "Pinecone está configurado?" deve ser feita server-side em `api/docs-rag.ts` e `api/rag.ts` (próxima mudança).

### Mudanças — `.env.example`

Adicionar comentário antes de cada chave server-only:

```
# SERVER-ONLY — nunca prefixar com VITE_ (risco de exposição no bundle)
GEMINI_API_KEY=
PINECONE_API_KEY=
PINECONE_INDEX_HOST=
BRAVE_SEARCH_API_KEY=
```

### Mudanças — `utils/envValidation.ts`

Criar:

```typescript
export function validateServerEnv(required: string[]): void {
  const missing = required.filter(k => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(`Missing required env: ${missing.join(', ')}`);
  }
}
```

Importar e chamar no início de:

- `api/gemini.ts` → `validateServerEnv(['GEMINI_API_KEY']);`
- `api/gerar-dossie.ts` → idem
- `api/pulse-news.ts` → idem
- `api/radar-scan.ts` → idem
- `api/docs-rag.ts` → `validateServerEnv(['PINECONE_API_KEY', 'PINECONE_INDEX_HOST']);`
- `api/rag.ts` → idem

### Auditoria documental (sem mudança de código se OK)

Confirmar que `api/docs-rag.ts` e `api/rag.ts` leem apenas `process.env.PINECONE_*` (não `import.meta.env`). Documentar resultado no PR description. Se houver leitura via `import.meta.env`, é bug de segurança a ser corrigido nesta mesma PR.

### Aceite

- [ ] `services/exportService.ts` criado e usado pelos hooks da Onda 3.
- [ ] `grep -rn "VITE_PINECONE" --include="*.ts" --include="*.tsx" .` retorna 0 (excluindo node_modules/dist).
- [ ] `npm run build` produz bundle sem string `VITE_PINECONE_API_KEY` (verificar com `grep VITE_PINECONE dist/assets/*.js`).
- [ ] `utils/envValidation.ts` criado e importado nas 6 Vercel Functions listadas.
- [ ] `.env.example` tem comentário `# SERVER-ONLY` nas 4 chaves.
- [ ] Validação manual: deploy em preview Vercel não falha; `/api/gemini` continua respondendo.

### Rollback

Reverter PR; chaves Pinecone server-only continuam funcionando porque `api/*.ts` já usa `process.env`.

---

## Onda 5 — Error Boundary global (opcional)

**PR:** `refactor/sprint-9-onda-5-error-boundary` → `refactor/sprint-9`
**Risco:** baixo

### Mudanças

**1. Criar `components/ErrorBoundaries/GlobalErrorBoundary.tsx`** — fallback de último recurso (mensagem genérica + botão "recarregar").

**2. Atualizar `index.tsx`:**

```tsx
<GlobalErrorBoundary>
  <ChatStoreProvider>
    <DossierStoreProvider>
      <App />
    </DossierStoreProvider>
  </ChatStoreProvider>
</GlobalErrorBoundary>
```

**3. Manter `ChatErrorBoundary` e `DossierErrorBoundary`** existentes — são feature-level, este novo é o último firewall.

### Aceite

- [ ] Boundary global engloba `<App />`.
- [ ] Erro propositalmente lançado em dev mostra a UI de fallback global.

### Rollback

Reverter; nada depende disso.

---

## Critérios de Aceite Finais (gate de merge para `main`)

- [ ] `App.tsx` < 600 linhas, < 40 imports.
- [ ] `grep -n "setShowEmailModal\|setShowFollowUpModal" App.tsx` retorna 0.
- [ ] `grep -rn "from '\.\./chat" features/dossier/` retorna 0.
- [ ] `grep -rn "VITE_PINECONE" .` (sem node_modules/dist) retorna 0.
- [ ] `utils/featureFlags.ts`, `services/exportService.ts`, `utils/envValidation.ts`, `utils/abortHelpers.ts` existem com cobertura.
- [ ] Baseline madge registrado em `Apêndice B do PLANO_COMPLETO_SPRINTS.md`.
- [ ] Gates: `npm test`, `typecheck`, `build`, `lint` verdes.
- [ ] Validação manual completa (9 itens — ver `../PLANO_COMPLETO_SPRINTS.md`).
- [ ] `HANDOFF_AI.md` atualizado com novos números e baseline.
- [ ] OI-055, OI-056, OI-058, OI-061 movidos para "Histórico de Itens Resolvidos" em `03-OPEN-ITEMS.md`.

## Estimativa de redução

| Métrica                             | Antes         | Depois (target) |
| ----------------------------------- | ------------- | --------------- |
| `App.tsx` linhas                    | 772           | < 600           |
| `App.tsx` imports                   | 46            | < 40            |
| Boundary leak `dossier→chat`        | 4 imports     | 0               |
| `VITE_PINECONE_*` no código         | 2 referências | 0               |
| Vercel Functions sem env validation | 6             | 0               |

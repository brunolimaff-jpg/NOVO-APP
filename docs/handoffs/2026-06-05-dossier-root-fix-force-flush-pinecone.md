# 2026-06-05 — Root Fix Local: overlay pós-waterfall + remoção Pinecone do dossiê

## Objetivo

Aplicar localmente o plano aprovado para:

1. corrigir a perda de `PostCompletion` quando `flushDiagnosticsNow(..., true)` disputa com flush em andamento;
2. remover Pinecone apenas do fluxo do dossiê;
3. manter War Room usando `/api/rag` e `/api/docs-rag`;
4. ajustar o health check para não maquiar RAG vazio como sucesso do fluxo principal.

## Escopo implementado

### 1. Telemetria / overlay

- `utils/diagnosticLog.ts`
  - adicionado `pendingForceFlush`;
  - `force=true` durante `diagFlushing=true` não abre flush concorrente;
  - o `finally` agenda dreno mesmo sem buffer imediato, preservando a janela em que `PostCompletion` entra depois.

- `tests/utils/diagnosticLog.test.ts`
  - novo teste cobrindo `force flush` durante flush ativo + dreno posterior do evento `check:0ms`.

### 2. Pinecone removido do dossiê

- `features/dossier/waterfall-orchestrator.ts`
  - `buildTeiaResearchContext` não consulta mais `buscarContextoPinecone` nem `buscarContextoDocsPinecone`;
  - o contexto societário fica restrito a QSA oficial, concorrentes e PORTA.

- `services/gemini/investigation-orchestration.ts`
  - `sendMessageToGemini` não injeta mais `[CONTEXTO RAG]` / `[DOCS RAG]` em trilhas de dossiê;
  - removido o passo `emitDossieStatus(onStatus, 'rag')` desse fluxo.

- testes:
  - `tests/features/dossier/waterfall-orchestrator.test.ts`
  - `tests/services/investigation-orchestration.test.ts`
  - ambos agora provam ausência de chamadas Pinecone no dossiê.

### 3. War Room preservado

- nenhum código do War Room foi removido;
- suíte do War Room continuou verde;
- validação local de browser confirmou que o War Room ainda dispara:
  - `/api/rag`
  - `/api/docs-rag`

### 4. Health check honesto

- `components/SystemHealthCheck.tsx`
  - RAG virou check opcional do War Room;
  - resultado vazio/degradado agora aparece como `error`, não `success`;
  - `overallStatus` continua baseado só nos checks críticos do fluxo principal.

- `tests/components/SystemHealthCheck.test.tsx`
  - novo teste cobrindo RAG vazio como degradação opcional, sem falsificar sucesso do dossiê.

## Validação executada

### Vitest focado

```bash
npx vitest run tests/utils/diagnosticLog.test.ts tests/features/dossier/waterfall-orchestrator.test.ts tests/services/investigation-orchestration.test.ts tests/components/SystemHealthCheck.test.tsx
```

Resultado: `43/43` testes passando.

### Regressão expandida

```bash
npx vitest run tests/services/warRoomService.test.ts tests/services/war-room/retrieval.test.ts tests/services/warRoomCanary.test.ts tests/services/geminiService.test.ts
```

Resultado: `80/80` testes passando.

### Tipagem

```bash
npm run typecheck
```

Resultado: sem erros.

### Build

```bash
npm run build
```

Resultado: build OK; sourcemaps enviados ao Sentry.

### Browser local

Servidor local:

```bash
npm run dev -- --host 127.0.0.1 --port 4173
```

Checagem com Playwright:

- War Room local:
  - continuou emitindo `/api/rag` e `/api/docs-rag`;
  - captura observada: `6` eventos para `/api/rag` e `6` para `/api/docs-rag` no disparo técnico.

- Dossiê local (`04.733.767/0001-80`):
  - CNPJ validou e preencheu `SCHEFFER & CIA LTDA / Sapezal / MT`;
  - rede observada após iniciar investigação:
    - `/api/cnpj`: presente
    - `/api/gemini`: presente
    - `/api/rag`: ausente
    - `/api/docs-rag`: ausente

## O que ainda falta

- validação em preview Vercel;
- validação em produção com Supabase `scout_diagnostics`:
  - `processMessage:finally = 1`
  - `PostCompletion >= 6`
  - ausência da assinatura ruim (`overlay=true`, `PostCompletion=0`);
- auditoria operacional do Sentry continua separada deste fix.

## Referências

- plano/incidente base:
  - `docs/handoffs/2026-06-05-prod-scheffer-stuck-compliance-consolidando.md`
- fix anterior em prod:
  - `docs/handoffs/2026-06-05-pr332-merge-prod-validation.md`
- achados do incidente hero:
  - `docs/investigation/2026-06-04-hero-stuck-findings.md`

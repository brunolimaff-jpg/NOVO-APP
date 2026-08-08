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

## Pré-requisitos de Ambiente

- **E2E é manual e NÃO bloqueia PR** (BRU-13): use o workflow `e2e-critical-manual.yml` (workflow_dispatch) ou `npm run test:e2e:critical-ux:safe` como diagnóstico, nunca como gate de CI.
- **CI sem browser**: use `npm run validate:ci` (typecheck + unit + contracts + contrato de CI, sem E2E)
- **Pretest:e2e**: o script `pretest:e2e` verifica e instala Chromium automaticamente antes de rodar E2E manual

## Checklist

### Tipo e Qualidade

- [ ] `npm run typecheck` passou sem erros
- [ ] `npm run lint` passou sem warnings novos

### Testes

- [ ] `npm test` passou (todos os testes unitários)
- [ ] `npm run test:contracts` passou (todos os contratos)
- [ ] `npm run validate:ci-contract` passou (contrato estático de CI — E2E fora do gate obrigatório)

### E2E Anti-Regressão (diagnóstico manual, NÃO bloqueador)

- [ ] (opcional) `npm run test:e2e:blank` rodou (anti-painel-branco)
- [ ] (opcional) `npm run test:e2e:loading` rodou (anti-loading-infinito)
- [ ] (opcional) `npm run test:e2e:errors` rodou (anti-erro-silencioso)
- [ ] (opcional) `npm run test:e2e:smoke` rodou (presença de data-testid)
- [ ] Ou: workflow `e2e-critical-manual.yml` executado com artefatos preservados

### Verificação Manual

- [ ] Nenhum `console.error` no fluxo principal (exceto allowlist)
- [ ] Nenhum estado visual sem fallback (painel central sempre renderiza um dos 4 estados)
- [ ] Input de mensagem permanece acessível após erro
- [ ] LoadingSmart não fica visível por mais de 2 minutos
- [ ] 13 data-testid oficiais presentes nos componentes

### Tracking (se alterou tracking)

- [ ] Eventos disparados são da lista permitida (7 eventos)
- [ ] Payload não contém campos sensíveis (apiKey, token, password, secret)

### Migrations (se adicionou migration)

- [ ] Toda `CREATE TABLE` tem `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
- [ ] Ou tem comentário `-- RLS exception: <justificativa>` documentado

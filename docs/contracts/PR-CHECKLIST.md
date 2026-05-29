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

- **E2E precisa de Chromium**: `npx playwright install chromium` (Linux: `--with-deps`)
- **CI sem browser**: use `npm run validate:ci` (typecheck + unit + contracts, sem E2E)
- **Pretest:e2e**: o script `pretest:e2e` verifica e instala Chromium automaticamente antes de rodar E2E

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
- [ ] `npm run test:e2e:errors` passou (anti-erro-silencioso)
- [ ] `npm run test:e2e:smoke` passou (presença de data-testid)

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

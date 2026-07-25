# Runbook: Sentry Privacy / PII Scrubbing

## Objetivo
Garantir que nenhum PII (email, CNPJ, CPF) chegue ao Sentry.

## Implementação Atual
- `utils/sentryScrubber.ts`: `scrubSentryEvent()` remove email/CNPJ/CPF de strings e objetos
- Hook `beforeSend` no Sentry SDK (ver `main.tsx` ou `App.tsx`)

## Verificação
```bash
# Local: simular erro e checar payload
npm run dev
# Trigger erro → Network tab → sentry.io/api/.../envelope/ → inspecionar JSON
```

## Checklist de Release
- [ ] `scrubSensitiveText()` cobre novos campos sensíveis
- [ ] `isSensitiveKey()` inclui novas chaves (ex: `cnpj`, `cpf`, `email`, `phone`)
- [ ] Testes `utils/sentryScrubber.test.ts` passam

## Incident Response
Se PII vazar no Sentry:
1. `Settings > Projects > Scout 360 > Data Scrubbing` → adicionar regex customizado
2. `Issues > [issue] > Delete` → purge event
3. Rotacionar `SENTRY_DSN` se necessário

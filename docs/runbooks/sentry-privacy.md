# Runbook: Sentry Privacy / PII Scrubbing

> **Estado atual (Jul/2026):** NÃO HÁ scrubber de PII implementado no código.
> Este runbook descreve o estado real e o plano para fechar a lacuna.

## Objetivo
Garantir que nenhum PII (email, CNPJ, CPF) chegue ao Sentry.

## Implementação Atual (real)

- **`index.tsx` inicializa o Sentry SDK** (`Sentry.init`):
  - `dsn`: `import.meta.env.VITE_SENTRY_DSN`
  - `enabled`: `Boolean(import.meta.env.VITE_SENTRY_DSN)`
  - `beforeSend`: **apenas** filtra `ChunkLoadError` (não faz scrubbing de PII).
  - `replayIntegration({ maskAllText: false, blockAllMedia: false })`: **Replays NÃO mascaram texto**. Se PII estiver visível em tela durante um erro, ele é capturado sem proteção.

- **NÃO existe** `utils/sentryScrubber.ts`, `scrubSentryEvent()`, `scrubSensitiveText()`, `isSensitiveKey()` ou testes correspondentes. Não confiar em documentação anterior que sugeria o contrário.

## Verificação (apenas após implementar scrubber)
```bash
# Local: simular erro e checar payload
npm run dev
# Trigger erro → Network tab → sentry.io/api/.../envelope/ → inspecionar JSON
```

## Plano de mitigação (PR futura, NÃO implementada nesta PR)

Para fechar a lacuna de privacidade, uma PR futura deve:

1. Criar `utils/sentryScrubber.ts` com:
   - `scrubSentryEvent(event)`: recursivamente remove email/CNPJ/CPF de strings e objetos.
   - `isSensitiveKey(key)`: identifica chaves sensíveis (`cnpj`, `cpf`, `email`, `phone`).
2. Hook em `Sentry.init({ beforeSend: (event) => scrubSentryEvent(filterChunkErrors(event)) })`.
3. `replayIntegration({ maskAllText: true })` (recomendado para qualquer app que manipule PII).
4. Testes em `utils/sentryScrubber.test.ts`.

Até lá, **assumir que PII pode estar sendo capturado pelo Sentry**.

## Incident Response (se PII vazar no Sentry)
1. `Settings > Projects > Scout 360 > Data Scrubbing` → adicionar regex customizado (email, CNPJ `\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}`, CPF).
2. `Issues > [issue] > Delete` → purge event.
3. Considerar rotacionar `SENTRY_DSN` e revisar Replays que possam conter PII.
   **Nota:** A retenção padrão de Replays no Sentry varia por plano. Verificar
   a configuração real em `Settings > Projects > Scout 360 > Replay` antes de
   assumir qualquer período de retenção.
4. Acelerar a implementação do scrubber (plano acima).

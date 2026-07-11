# Runbook - Privacidade Sentry

## Quando usar

Use ao investigar evento com dado pessoal, ao habilitar Replay ou quando houver suspeita de captura de conteudo de dossie.

## Objetivo

Sentry deve ajudar a diagnosticar falhas sem se tornar copia de dados comerciais ou pessoais. O masking do cliente precisa ser validado no ambiente remoto, pois configuracao de build e Replay podem divergir por deployment.

## Verificacao segura

1. Confirme no Preview a configuracao carregada pelo `index.tsx` e gere apenas um erro sintetico, sem CNPJ, email, anotacao ou dossie real.
2. No Sentry, revise evento e Replay desse teste e confirme que campos sensiveis estao mascarados ou removidos.
3. Verifique se sourcemaps e release apontam para a SHA correta sem expor `SENTRY_AUTH_TOKEN`.

## Se houver vazamento

1. Pare novas coletas/replays da superficie afetada por mudanca autorizada de configuracao.
2. Preserve ID do evento, horario, release e escopo; nao replique o dado sensivel em ticket ou chat.
3. Acione a avaliacao de exclusao/retencao no Sentry e registre quais dados podem ter sido capturados.
4. Corrija em PR pequena, valide no Preview com dado sintetico e so entao considere reativar a coleta.

## Guardrails

- `VITE_SENTRY_DSN` e publico por desenho; `SENTRY_AUTH_TOKEN` e secreto e nao pode aparecer em browser, log ou documento.
- Nunca usar dossie real ou credenciais para testar mascaramento.
- Sentry vazio nao prova ausencia de freeze de main thread; cruze com `scout_diagnostics` e logs Vercel.

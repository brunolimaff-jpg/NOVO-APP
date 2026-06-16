# Validation Protocol

## Regra de Parada

Se qualquer um destes comandos falhar, o sprint nao avanca:

- `npm run test`
- `npm run typecheck`
- `npm run build`
- `npm run lint`

## Checklist Automatizado por Sprint

1. Rodar `npm run test`
2. Rodar `npm run typecheck`
3. Rodar `npm run build`
4. Rodar `npm run lint`
5. Registrar resultado no `02-BOARD.md`
6. Se houver warning novo, abrir item em `03-OPEN-ITEMS.md`

## Protocolo PWA/Chunking

Use este protocolo quando uma PR mudar hashes de chunks ou tocar `vite.config.ts`, PWA, service worker, `utils/sessionExport.ts` ou imports que antes geravam warning de chunking.

1. Rodar `npm run build` e confirmar se há warnings novos.
2. Confirmar que o warning específico de dynamic import de `utils/idbStorage.ts` não voltou.
3. Confirmar que `dist/sw.js` e `dist/manifest.webmanifest` são gerados no build.
4. Em preview Vercel, validar carregamento inicial e reload forçado em uma aba já aberta.
5. Para smoke automatizado protegido, usar somente o header `x-vercel-protection-bypass`.
6. Se houver erro de asset/chunk em preview, bloquear merge e revisar `manualChunks` antes de tentar novo deploy.

## Checklist Manual por Sprint

1. Abrir o app
2. Criar nova sessao
3. Enviar primeira mensagem
4. Enviar follow-up
5. Rodar um dossie completo
6. Testar deep dive
7. Salvar sessao
8. Recarregar a pagina
9. Exportar conversa ou dossie
10. Abrir CRM
11. Confirmar Score PORTA quando aplicavel
12. Validar War Room (pergunta tecnica + benchmark + cancelamento + fontes)
13. Validar abertura de Radar Panel e Radar Settings

## Definition of Done por Sprint

Um sprint so pode ser marcado como `done` se:

- os checks automatizados estiverem verdes
- o checklist manual estiver completo
- o board estiver atualizado
- riscos residuais estiverem registrados
- o proximo passo seguro estiver claro no handoff

## Baseline Inicial Conhecido

- `npm run test`: verde em 2026-04-11
- `npm run typecheck`: verde em 2026-04-11
- `npm run build`: verde em 2026-04-11

Warnings aceitos no baseline:

- `fetch('/version.json')` em testes de update notification
- warnings de `act(...)` nos testes de `App`
- warning geral de chunks grandes; o warning específico de dynamic import de `utils/idbStorage.ts` foi resolvido na Sprint 12

# Validation Protocol

## Regra de Parada

Se qualquer um destes comandos falhar, o sprint nao avanca:

- `npm run test`
- `npm run typecheck`
- `npm run build`

A partir do Sprint 7, adicionar:

- `npm run lint`

## Checklist Automatizado por Sprint

1. Rodar `npm run test`
2. Rodar `npm run typecheck`
3. Rodar `npm run build`
4. Registrar resultado no `02-BOARD.md`
5. Se houver warning novo, abrir item em `03-OPEN-ITEMS.md`

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
- warning de build sobre `utils/idbStorage.ts`

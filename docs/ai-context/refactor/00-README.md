# Refactor Program Context

Este pacote e a fonte de verdade da refatoracao estrutural do Senior Scout 360.
Ele existe para permitir continuidade entre IAs e humanos sem depender de contexto
de chat.

## Ordem de Leitura

Leia nesta ordem:

1. [`01-MASTER-PLAN.md`](./01-MASTER-PLAN.md)
2. [`02-BOARD.md`](./02-BOARD.md)
3. [`03-OPEN-ITEMS.md`](./03-OPEN-ITEMS.md)
4. [`05-VALIDATION.md`](./05-VALIDATION.md)
5. [`06-HANDOFF.md`](./06-HANDOFF.md)

Consulte estes arquivos quando necessario:

- [`04-ARCHITECTURE-TARGET.md`](./04-ARCHITECTURE-TARGET.md)
- [`07-SPRINT-LOG.md`](./07-SPRINT-LOG.md)

## Regra de Ouro

- Status vivo mora **somente** em `02-BOARD.md`.
- Pendencias, riscos e gates moram **somente** em `03-OPEN-ITEMS.md`.
- Historico de execucao mora **somente** em `07-SPRINT-LOG.md`.
- Se algum chat divergir dos arquivos acima, siga o repositorio.

## Convencoes de Status

- `planned`: ainda nao iniciado
- `active`: sprint ou frente em execucao
- `blocked`: existe impedimento concreto
- `done`: concluido e validado
- `deferred`: adiado por decisao explicita

## Como Atualizar

Ao encerrar qualquer sessao de trabalho deste programa:

1. Atualize `02-BOARD.md`.
2. Atualize `03-OPEN-ITEMS.md` se houver risco novo, warning novo ou decisao adiada.
3. Atualize `06-HANDOFF.md` com o proximo passo seguro.
4. Adicione uma entrada em `07-SPRINT-LOG.md`.
5. Atualize `04-ARCHITECTURE-TARGET.md` apenas se a estrutura alvo mudar.

## Escopo Deste Pacote

Este pacote cobre apenas o programa de refatoracao estrutural. Planos pontuais de
features ou correcoes locais podem continuar fora daqui.

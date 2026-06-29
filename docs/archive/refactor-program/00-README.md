# Refactor Program Context

Este pacote e a fonte de verdade da refatoracao estrutural do Senior Scout 360.
Ele existe para permitir continuidade entre IAs e humanos sem depender de contexto
de chat.

## Ordem de Leitura

Leia nesta ordem:

1. [`01-MASTER-PLAN.md`](./01-MASTER-PLAN.md)
2. [`08-PHASE2-MAINTAINABILITY-PLAN.md`](./08-PHASE2-MAINTAINABILITY-PLAN.md)
3. [`PLANO_COMPLETO_SPRINTS.md`](./PLANO_COMPLETO_SPRINTS.md) ← especificação detalhada de Sprint 9–12 (com auditoria e correções)
4. [`sprints/00-INDEX.md`](./sprints/00-INDEX.md) ← specs executáveis das próximas sprints (PR/onda/arquivo)
5. [`02-BOARD.md`](./02-BOARD.md)
6. [`sprints/SPRINT-11-EXECUTION.md`](./sprints/SPRINT-11-EXECUTION.md) ← plano ativo de Sprint 11
7. [`10-WAVE-0-1-CLEANUP-PLAN-2026-05-16.md`](./10-WAVE-0-1-CLEANUP-PLAN-2026-05-16.md) ← cleanup pós-Sprint 9 concluído
8. [`03-OPEN-ITEMS.md`](./03-OPEN-ITEMS.md)
9. [`05-VALIDATION.md`](./05-VALIDATION.md)
10. [`06-HANDOFF.md`](./06-HANDOFF.md)
11. [`11-SPRINT-10-RADAR-BOUNDARY-2026-05-16.md`](./11-SPRINT-10-RADAR-BOUNDARY-2026-05-16.md) ← plano histórico de Sprint 10

Consulte estes arquivos quando necessario:

- [`04-ARCHITECTURE-TARGET.md`](./04-ARCHITECTURE-TARGET.md)
- [`07-SPRINT-LOG.md`](./07-SPRINT-LOG.md)
- [`09-CODEBASE-EXPLORATION-2026-05-16.md`](./09-CODEBASE-EXPLORATION-2026-05-16.md) ← auditoria completa 2026-05-16 (27 problemas, 3 agentes)

## Regra de Ouro

- Status vivo mora **somente** em `02-BOARD.md`.
- Pendencias, riscos e gates moram **somente** em `03-OPEN-ITEMS.md`.
- Historico de execucao mora **somente** em `07-SPRINT-LOG.md`.
- Plano executável da sprint atual mora no arquivo correspondente em `sprints/`.
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

# decisions.md — NOVO-APP

## Decisoes Ativas

### DI-2026-06-08-01: Nao alterar fluxo visual sem reincidencia

- **Decisao:** Manter recovery atual. Nao implementar nova correcao funcional.
- **Condicao:** Reabrir somente se gatilho objetivo disparar (ver HANDOFF_AI.md).
- **Motivo:** Incidente mitigado, recovery funcional, sem evidencia de reincidencia.

### DI-2026-06-08-02: Manter recovery enquanto causa raiz nao for comprovada

- **Decisao:** `static-fallback-display-recovery` permanece ativo.
- **Motivo:** Remover sem causa raiz identificada e arriscado. O recovery e um airbag — nao atrapalha o fluxo normal.

### DI-2026-06-08-03: Wiki e indice arquitetural, nao fonte superior ao codigo

- **Decisao:** A Wiki (docs/wiki/) serve como mapa de navegacao e ponto de entrada.
- **Hierarquia:** Codigo atual > Testes > Configuracao > Logs > Handoff > Memoria > Wiki.
- **Motivo:** Wiki gerada por IA a partir de "branch: default" sem SHA exato. Pode divergir.

### DI-2026-06-08-04: Auditorias devem conter autorrefutacao obrigatoria

- **Decisao:** Toda auditoria de codigo deve incluir etapa de validacao adversarial.
- **Motivo:** A auditoria inicial encontrou 7 achados "graves"; a autorrefutacao derrubou 6 como falsos positivos.

### DI-2026-06-08-05: Documentacao e runtime em PRs distintas

- **Decisao:** Separar alteracoes documentais de alteracoes funcionais.
- **Motivo:** Working tree atual tem 3 frentes misturadas (wiki, gemini_usage, handoff). Cada uma deve ir para branch/PR separada.

## Decisoes Historicas

### 2026-06-08 — Handoff final precisa apontar repo + Bruno Vault (APLICADO na PR #346)

Decision: fechar o incidente P0 em duas camadas: repo canonico (`HANDOFF_AI.md`, `.agents/memory/*`, `docs/handoffs/*`, `CALIBER_LEARNINGS.md`) e espelho navegavel no Bruno Vault (`40-HANDOFFS`, `20-SESSOES`, `30-LICOES`).

Reason: o incidente levou quase duas semanas e misturou bugs de body-read, abort, diagnostics, loading, Virtuoso e diferenca preview/producao. Sem handoff duravel, agentes futuros tendem a reabrir hipoteses ja fechadas ou validar so evento tecnico.

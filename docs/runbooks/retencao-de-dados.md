# Politica de Retencao de Dados - Proposta Pendente

## Estado

Esta politica ainda nao esta aplicada no Supabase ou Sentry. Ela define a decisao necessaria antes de criar purge, cron ou migration. Cron permanece fora desta rodada de auditoria.

## Proposta inicial

| Dado | Prazo sugerido | Justificativa | Decisao necessaria |
| --- | --- | --- | --- |
| `scout_diagnostics` bruto | 30 dias | diagnostico de incidentes sem crescimento indefinido | Bruno aprova prazo e responsavel |
| `operator_events` tecnico | 90 dias | comparacao de jornadas e falhas recentes | Bruno aprova finalidade e acesso |
| `feedback_events` | 180 dias | analise de produto agregada | definir minimizacao e dono de analise |
| `extract_cache` | 30 dias desde ultimo acesso | cache recuperavel, nao registro permanente | definir coluna de expiracao e impacto de custo |
| dossies e mensagens | sem prazo automatico | conteudo comercial exige regra de negocio | Bruno define retencao, exclusao e base legal |
| eventos/Replays Sentry | configuracao minima do plano | observabilidade, nao arquivo comercial | responsavel valida configuracao remota |

## Antes de implementar

1. Confirmar tabelas, chaves de tempo, volume e dependencia de cada consumidor.
2. Definir dono, base de acesso e fluxo de exclusao por operador/cliente.
3. Fazer preview de impacto somente leitura e plano de rollback.
4. Implementar purge em PR separada, com migration reversivel ou corretiva e validacao remota.

## Guardrails

- Nao apagar dados por job ad hoc, console ou script local.
- Nao usar uma politica de cache para apagar dossies sem decisao de negocio.
- Registrar em worklog a data de aprovacao, migration e evidencia de volume apos cada implantacao.

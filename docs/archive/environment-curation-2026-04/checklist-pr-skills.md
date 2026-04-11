# Checklist de PR com Skills

Use este checklist antes de abrir PR.

## Checklist obrigatório

- [ ] Escopo e decisão de implementação validados (`super-brainstorm`) para mudanças não triviais.
- [ ] Contratos/API revisados (`api-design`) quando há alteração de request/response.
- [ ] Impactos de UI e responsividade revisados (`frontend-developer`) quando há tela/componente.
- [ ] Estratégia de testes definida (`test-strategy`) e executada.
- [ ] E2E criado/atualizado (`playwright-testing`) em fluxo crítico de usuário.
- [ ] Revisão de qualidade de código (`clean-code`) aplicada.

## Checklist recomendado

- [ ] Investigação de bug registrada com evidências (`debugging-tools`).
- [ ] Sinais de monitoramento/log definidos (`observability`) para falhas críticas.
- [ ] Auditoria de segurança das skills usadas (`skill-audit`) quando houver automações novas.
- [ ] Documentação técnica atualizada (`codedocs`) quando arquitetura/fluxo mudar.

## Critério de saída

PR só deve ser aprovado quando:

1. Fluxos críticos alterados tiverem evidência de teste.
2. Contratos impactados estiverem explícitos na descrição do PR.
3. Não houver regressão visual/funcional conhecida sem plano de correção.

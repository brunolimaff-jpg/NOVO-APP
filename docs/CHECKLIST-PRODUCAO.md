# Checklist de Produção (simples e objetivo)

Marque os itens antes de publicar:

## Ambiente

- [ ] `npm install` executado sem erros
- [ ] `npm run build` gerando build com sucesso
- [ ] Variáveis configuradas no ambiente de deploy

## Segurança

- [ ] `.env` NÃO está no Git
- [ ] Chaves sensíveis só no servidor/painel do deploy
- [ ] Chave da IA com limite de uso/quota

## Funcionalidade

- [ ] Gate inicial de nome do operador funcionando e persistindo localmente
- [ ] Chat responde e salva sessão
- [ ] Exportação PDF/MD/DOC funcionando

## Qualidade

- [ ] `npm run test` sem falhas críticas
- [ ] Mensagens de erro amigáveis para usuário final

## Observabilidade mínima

- [ ] Logs de erro ativos no provedor de deploy
- [ ] Alertas básicos de falha e uso de API

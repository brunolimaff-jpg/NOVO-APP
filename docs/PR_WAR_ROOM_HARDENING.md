# PR Description — War Room Hardening

## Contexto

O War Room técnico estava respondendo dúvidas sobre ERP Senior com uma combinação frágil de:

- contexto oficial parcial via Pinecone
- base global adicional fora da doc oficial
- grounding aberto com Google Search em modos competitivos
- prompt permissivo para “complementar” quando a documentação não cobria a pergunta

Na prática, isso criava zona cinza: respostas plausíveis, mas não contratualmente ancoradas em `documentacao.senior.com.br`.

## Problema

Esta PR fecha os vazamentos que permitiam alucinação no War Room e reposiciona o contrato do recurso:

- no modo `tech`, a resposta só sai quando existe contexto oficial suficiente
- quando o contexto oficial não cobre a pergunta, o sistema recusa responder e oferece rota alternativa
- `googleSearch` deixa de fazer parte do contrato operacional do War Room nesta iteração

## Decisões tomadas

1. **Google Search**
   O SDK Gemini não oferece `allowedDomains` nativo hoje. Em vez de manter busca aberta com falsa sensação de restrição, esta PR desliga `googleSearch` no War Room.

2. **Modo técnico**
   O modo `tech` deixa de consultar `/api/rag` e passa a depender apenas de contexto oficial indexado e validado por domínio.

3. **Fallback**
   Quando não há contexto útil, o War Room não responde a pergunta original. Ele retorna recusa estruturada com sugestões de reformulação e link para o portal oficial.

4. **Roadmap**
   O modo `concorrentes` entra apenas como placeholder visível. A ativação real fica para iteração posterior, com cobertura documental e allowlist apropriadas.

## O que mudou

### Ancoragem técnica obrigatória

- remoção da licença para “usar conhecimento próprio” no prompt técnico
- exigência de ancoragem inline por afirmação factual
- bloqueio explícito a respostas sem chunk documental relevante

### Hardening de RAG

- `RAG_SCORE_THRESHOLD` elevado para `0.6`
- `topK` ampliado para capturar mais candidatos antes do filtro
- corte final de chunks reduzido para privilegiar contexto mais forte
- telemetria simples de matches aprovados após o filtro

### Validação de domínio

- apenas URLs de `documentacao.senior.com.br` entram no contexto oficial
- chunks com domínio fora da allowlist são descartados antes de chegar ao modelo
- a allowlist fica parametrizada via `RAG_ALLOWED_DOMAINS`

### Fallback seguro

- `WarRoomResult` passa a carregar `fallbackReason?: 'no_context'`
- sem contexto suficiente, o fluxo retorna recusa estruturada
- a resposta orienta reformulação e aponta para o portal oficial

### Separação de fontes

- o modo `tech` deixa de consultar `/api/rag`
- War Room competitivo segue sem grounding aberto e com dependência de Pinecone
- `WarRoomMode` inclui `'concorrentes'` apenas como placeholder visível na UI

### Configuração operacional

Novos envs documentados:

```env
RAG_SCORE_THRESHOLD=0.6
RAG_ALLOWED_DOMAINS=documentacao.senior.com.br
```

## Impacto

### Para o vendedor

- reduz o risco de levar informação inventada para reunião
- aumenta a previsibilidade: ou há resposta ancorada, ou há recusa clara
- cria uma rota segura quando a documentação oficial não cobre a dúvida

### Para engenharia

- remove acoplamento do War Room com grounding aberto
- separa melhor fonte oficial de base global
- deixa explícito o backlog para modo `concorrentes` e busca custom por domínio

## Riscos

- a taxa de recusa pode subir inicialmente se a cobertura do namespace `senior-erp-docs` estiver insuficiente
- benchmark competitivo fica mais dependente da qualidade da indexação atual
- o placeholder de `concorrentes` comunica direção, mas ainda não entrega comparativo dedicado

## Checklist de validação

- [ ] pergunta técnica existente retorna resposta com fontes inline de `documentacao.senior.com.br`
- [ ] pergunta sem cobertura documental retorna recusa estruturada, sem responder a pergunta original
- [ ] módulo inexistente retorna recusa estruturada
- [ ] erro de Pinecone no modo técnico retorna erro retryable, sem resposta inventada
- [ ] chunk com domínio hostil é descartado
- [ ] aba `Concorrentes` aparece desabilitada com “Em breve”
- [ ] benchmark competitivo não usa Google Search
- [ ] `npm run typecheck` permanece verde
- [ ] `npm run build` permanece verde

## Referências canônicas

- `docs/ai-context/ROADMAP_WAR_ROOM.md`
- `docs/ai-context/ARCHITECTURE_MAP.md`

## Observação sobre escopo da abertura

Esta mudança deve ser apresentada como **War Room hardening**.
Se a branch ainda carregar um commit de Mermaid, ele deve ser separado da abertura principal ou tratado explicitamente como escopo residual fora do tema central desta PR.

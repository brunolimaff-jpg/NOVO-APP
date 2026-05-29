# Roadmap War Room — Senior Scout 360

> Última atualização: 2026-04-17

---

## Iteração atual — War Room Hardening (concluída)

**Problema resolvido:** o War Room alucinava e inventava informações sobre o ERP Senior.
Nesta iteração, a resposta técnica passou a obedecer uma regra simples: ou ela está ancorada em fonte oficial indexada, ou vira recusa explícita com rota alternativa.

### O que foi fechado nesta entrega

| Frente | Área                 | Resultado                                                                                              |
| ------ | -------------------- | ------------------------------------------------------------------------------------------------------ |
| A      | Prompt técnico       | Removida a permissão de usar conhecimento próprio quando a doc não cobre a pergunta.                   |
| B      | Hardening de RAG     | Threshold elevado para `0.6`, `topK` ampliado e corte final menor para reduzir contexto fraco.         |
| C      | Validação de domínio | Apenas chunks com URL de `documentacao.senior.com.br` entram no contexto oficial.                      |
| D      | Fallback seguro      | Quando não há contexto suficiente, o War Room recusa responder a pergunta e sugere reformulações.      |
| E      | Google Search        | `googleSearch` desligado em todos os modos do War Room.                                                |
| F      | Separação de fontes  | O modo `tech` deixou de consultar `/api/rag`; a base global não participa mais das respostas técnicas. |
| G      | Continuidade         | Placeholder visível de `concorrentes` e roadmap explícito para a próxima fase.                         |

### Contratos e configuração

```env
RAG_SCORE_THRESHOLD=0.6
RAG_ALLOWED_DOMAINS=documentacao.senior.com.br
```

- `WarRoomMode` inclui `'concorrentes'` apenas como placeholder visível.
- `WarRoomResult` inclui `fallbackReason?: 'no_context'` para a UI diferenciar recusa por falta de contexto.
- O contrato operacional do War Room nesta iteração é: **Pinecone + allowlist de domínio + recusa segura**.

### Decisão arquitetural central

O SDK Gemini **não oferece `allowedDomains` nativo** para grounding com Google Search neste momento.
Por isso, a iteração atual **não** tenta “restringir a web”; ela remove a consulta aberta e passa a depender exclusivamente do contexto indexado e validado.

### Monitoramento recomendado

Acompanhar a taxa de respostas com `fallbackReason: 'no_context'`.
Se a taxa ficar consistentemente alta no modo técnico, o problema a investigar primeiro é cobertura/indexação no namespace `senior-erp-docs`, não afrouxamento prematuro das restrições.

---

## P1 — Próxima iteração: Modo Concorrentes

**Objetivo:** habilitar comparativos técnicos ancorados em documentação real de concorrentes.

### Escopo esperado

1. Ativar a aba `Concorrentes` hoje exibida como “Em breve”.
2. Criar prompt dedicado para comparativos com mesma disciplina de ancoragem.
3. Consultar `competitor-pdfs` junto com `senior-erp-docs`, mantendo separação clara por fonte.
4. Adicionar filtros por concorrente na UI.
5. Estender a allowlist de domínios oficiais conforme os repositórios documentais indexados.

### Dependências

- Cobertura mínima confiável do namespace `competitor-pdfs`
- Curadoria de domínios oficiais por concorrente
- Critérios de recusa equivalentes aos do modo técnico

---

## P2 — Busca custom por domínio oficial

**Objetivo:** substituir o grounding aberto por uma busca controlada em `documentacao.senior.com.br`.

### Direção proposta

1. Criar uma tool de function-calling como `fetchSeniorDocs(query)`.
2. Executar a busca/scraping no domínio oficial via serverless.
3. Aplicar cache e validação de URL antes de retornar chunks ao modelo.
4. Repassar ao Gemini apenas conteúdo já ancorado no domínio aprovado.

### Motivo

Sem `allowedDomains` nativo no SDK, um `site:` na query não é garantia contratual.
Se a exigência é “zero zona cinza”, a busca precisa ser controlada pela aplicação.

---

## Watch — allowedDomains nativo no SDK Gemini

Monitorar:

- Google AI Developers Forum
- changelog do pacote `@google/genai`

Quando houver suporte oficial a `allowedDomains`, reavaliar o uso de grounding nativo apenas se a garantia de domínio for suficiente para manter a política atual de resposta ancorada.

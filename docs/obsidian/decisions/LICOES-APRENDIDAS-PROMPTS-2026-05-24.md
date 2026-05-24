# Licoes Aprendidas — Sessao de Consolidacao de Prompts e Anti-Alucinacao

**Data:** 2026-05-24
**Branch principal:** `codex/prompt-consolidation-v6` (PR #282)
**Branch anti-alucinacao:** `fix/war-room-rag-antialucinacao`
**Branch unificada:** PR #283
**Duracao:** Sessao completa (~4 fases de diagnostico, consolidacao, correcao e automacao)

---

## Tabela de Licoes Aprendidas

| # | Licao | Erro Cometido | Como Evitar | Impacto | Severidade |
|---|-------|---------------|-------------|---------|------------|
| 1 | **Temperature explicita e baixa (0.1) para saida estruturada** | `proxyChatSendMessage` nao passava `temperature`, usando default da API Gemini = 1.0. Resultado: alta variacao entre execucoes, formatacao inconsistente, alucinacao | Toda chamada de geracao estruturada deve explicitar `temperature: 0.1`. Nunca confiar no default da API. | Alucinacao, formatacao quebrada, dossies diferentes para mesmo CNPJ | **P0** |
| 2 | **Waterfall repete foundation 7-9x** | Cada especialista no waterfall recebia o foundation completo como prefixo, resultando em ~109K tokens de repeticoes | Implementar compressao de contexto: foundation deve ser passado 1x no inicio e referenciado nos especialistas, nao copiado | Custo desnecessario de tokens (3-5x mais caro), contexto diluido | **P1** |
| 3 | **Nao remover orquestrador mestre sem golden test** | `MASTER_INVESTIGATION_ORCHESTRATOR_V5` foi removido por parecer redundante, mas causou REGRESSAO no mapa societario (Mermaid deixou de ser gerado) | Nunca remover prompt de orquestracao sem validar com golden dossier test. O orquestrador faz a unificacao que especialistas isolados nao fazem. | Dossie sem mapa societario | **P1** |
| 4 | **5 blocos de traducao causam drift entre especialistas** | Cada especialista tinha seu proprio bloco de traducao com pequenas variacoes, causando interpretacoes diferentes de "receita", "faturamento", etc. | Manter UNICO bloco de traducao compartilhado (`SHARED_COMMERCIAL_INTELLIGENCE_ENGINE`) no foundation. Especialistas importam, nao duplicam. | Inconsistencia terminologica no dossie | **P1** |
| 5 | **Mapeamento de modulo errado no waterfall-orchestrator** | `PROMPT_CAMINHO_DE_VENDA` estava mapeado para `PROMPT_RH_SINDICATOS_GOD_MODE` — um prompt de RH/SST! Secao "Caminho de Venda" recebia conteudo sindical | Ao criar novo modulo de prompt, verificar DUAS vezes o mapeamento no waterfall-orchestrator.ts. Golden test deve validar cada secao do dossie. | Secao completamente errada no dossie (comercial vs sindical) | **P0** |
| 6 | **CNPJs ficticios em prompts de exemplo** | Prompts continham CNPJs inventados como exemplos, que o Gemini aprendia e reproduzia em respostas sobre outras empresas | Usar apenas CNPJs reais ou placeholders explicitos (`[CNPJ_DA_EMPRESA_ALVO]`). Adicionar `<anti_fabrication_rules>` proibindo fabricacao de CNPJs. | Alucinacao de dados financeiros/societarios | **P0** |
| 7 | **Safra desatualizada ("Safra 2024" em 2026)** | Prompts referenciavam "Safra 2024" como ano corrente, causando analise temporal incorreta | Usar placeholder `{SAFRA_ATUAL}` ou manter safra atualizada. Adicionar protocolo de verificacao temporal. | Analise de mercado com dados defasados | **P1** |
| 8 | **18 gatilhos repetidos no contrato de output** | Contrato listava "quando houver dados, faca X" para cada modulo individualmente — 18 repeticoes que poluiam o prompt e tornavam o contrato ilegivel | Contrato de output deve definir APENAS a estrutura do JSON. Instrucoes condicionais vivem dentro de cada modulo especialista, nao no contrato. | Prompt inchado (+30% tokens), dificil manutencao, modelo confuso | **P2** |
| 9 | **Mermaid classDef duplicado entre foundation e especialistas** | `classDef` de estilo Mermaid estava tanto no foundation quanto nos especialistas, causando conflito de definicoes | `classDef` debe ficar APENAS no foundation (ou no orquestrador mestre). Especialistas definem nos, nao estilos. | Mermaid com formatacao quebrada | **P2** |
| 10 | **MegaPrompts.ts perde exports a cada branch switch** | Ao trocar de branch, o arquivo `megaPrompts.ts` perdia exports silenciosamente (provavelmente merge conflict mal resolvido ou git reset parcial) | Verificar `megaPrompts.ts` apos cada branch switch. Idealmente, adicionar teste de snapshot ou guardrail que valide exports. | Build quebra silenciosamente | **P2** |
| 11 | **Ausencia de protocolo de recusa (refusal protocol)** | Modelo respondia mesmo sem dados suficientes, fabricando respostas em vez de admitir desconhecimento | Adicionar `<refusal_protocol>` em XML: "Se nao houver dados suficientes para uma secao, declarar explicitamente 'Sem dados disponiveis' — nao fabricar." | Alucinacao em secoes sem dados | **P1** |
| 12 | **Ausencia de distincao fato vs inferencia** | Modelo nao separava o que era dado confirmado de inferencia. Secoes como "evidencias" misturavam dados reais com suposicoes. | Adicionar `<fact_vs_inference_examples>` com exemplos concretos de como rotular cada tipo. Usar simbolos visuais no output (CONFIRMADO vs ANALISE INFERIDA). | Dossie com baixa credibilidade | **P1** |
| 13 | **Escopo de evidencia nao delimitado** | Modelo usava dados de uma empresa para responder sobre outra (ex: dados de CRM de "Pampa" aplicados a "Pampafoods") | Adicionar `<evidence_scope_protocol>` delimitando que evidencias so valem para a empresa alvo. Match parcial = PROSPECT, sem dados de CRM. | Confusao entre empresas similares | **P0** |
| 14 | **Entidades internacionais sem cadeia de auditoria** | Quando o modelo inferia conexao internacional (ex: Scheffer Colombia S.A.S.), nao fornecia comprovacao documental. Output dizia "conexao INFERIDA" sem explicar como. | Conexoes internacionais exigem comprovacao documental (fonte, URL, data). Se nao houver evidencia concreta, a conexao deve ser marcada como "NAO CONFIRMADA" e listar o que falta. | Dossie internacional sem rastro de auditoria | **P1** |
| 15 | **Mermaid condicional quando deveria ser obrigatorio** | Contrato dizia "quando houver dados, gere um diagrama Mermaid", permitindo que o modelo omitisse o grafo | Mermaid deve ser obrigatorio para TODO dossie. Se nao houver dados societarios, gerar grafo minimo com apenas a empresa raiz. | Dossies sem mapa societario mesmo com dados disponiveis | **P2** |
| 16 | **Queries superficiais sem profundidade setorial** | Prompts especialistas nao incluiam queries especificas para bioinsumos, mineracao, mercado de capitais — areas relevantes para agroindustria | Cada especialista deve ter queries setoriais especificas para o dominio do cliente (agro). Bioinsumos, mineracao e mercado de capitais sao essenciais para Senior. | Dossie incompleto para empresas com divisoes especializadas | **P2** |
| 17 | **A2 feeds silenciosamente ignorados no parsing** | O parser de decimal quebrava ao encontrar formato A2 (algarismo + 2 zeros) porque tratava como numero valido mas nao convertia corretamente | Validar parsing numerico com fixtures de todos os formatos brasileiros (A2, milhar com ponto, decimal com virgula). Testar com golden dataset. | Dados financeiros corrompidos no dossie | **P1** |
| 18 | **Output contract conflitante com especialistas** | O contrato de output exigia campos que os especialistas nao preenchiam, e vice-versa. Modelo ficava entre duas instrucoes conflitantes. | Contrato de output e especialistas devem ser gerados do mesmo template/base. Validar golden test que confira campos obrigatorios vs campos gerados. | Dossie com campos ausentes ou extras | **P0** |
| 19 | **Sem automacao de validacao de preview** | Validacao manual de preview Vercel era o unico metodo, propenso a erro e sem repeatabilidade | Criar `validate:preview` (curl smoke) para CI pre-merge e `test:e2e:cnpj` (Playwright) para validacao completa com interacao real. Scripts devem ser portaveis (nao dependem de ambiente especifico). | Deploy quebrado so descoberto em validacao manual | **P1** |
| 20 | **Playwright sem suporte a BASE_URL externa** | Playwright configurava `webServer` obrigatorio, impossibilitando apontar para preview Vercel em vez de `localhost` | `playwright.config.ts` deve aceitar `BASE_URL` env var e pular `webServer` quando URL externa for fornecida. Timeout global deve ser maior para ambientes remotos (180s+). | Testes E2E presos ao ambiente local | **P2** |

---

## Resumo por Categoria

### Alucinacao e Fabricacao (P0/P1)
| # | Licao | Severidade |
|---|-------|------------|
| 1 | Temperature nao passada (default 1.0) | P0 |
| 6 | CNPJs ficticios em prompts de exemplo | P0 |
| 7 | Safra desatualizada ("Safra 2024" em 2026) | P1 |
| 11 | Ausencia de protocolo de recusa | P1 |
| 12 | Ausencia de distincao fato vs inferencia | P1 |
| 13 | Escopo de evidencia nao delimitado | P0 |
| 14 | Entidades internacionais sem cadeia de auditoria | P1 |

### Arquitetura de Prompts (P0/P1)
| # | Licao | Severidade |
|---|-------|------------|
| 2 | Waterfall repete foundation 7-9x | P1 |
| 3 | Nao remover orquestrador mestre sem golden test | P1 |
| 4 | 5 blocos de traducao causam drift | P1 |
| 5 | Mapeamento de modulo errado no orquestrador | P0 |
| 8 | 18 gatilhos repetidos no contrato de output | P2 |
| 9 | Mermaid classDef duplicado | P2 |
| 10 | MegaPrompts.ts perde exports em branch switch | P2 |
| 15 | Mermaid condicional quando deveria ser obrigatorio | P2 |
| 18 | Output contract conflitante com especialistas | P0 |

### Dominio e Qualidade (P1/P2)
| # | Licao | Severidade |
|---|-------|------------|
| 16 | Queries superficiais sem profundidade setorial | P2 |
| 17 | A2 feeds silenciosamente ignorados no parsing | P1 |

### Automacao e Deploy (P1/P2)
| # | Licao | Severidade |
|---|-------|------------|
| 19 | Sem automacao de validacao de preview | P1 |
| 20 | Playwright sem suporte a BASE_URL externa | P2 |

---

## Metricas da Sessao

| Metrica | Valor |
|---------|-------|
| Licoes documentadas | 20 |
| P0 (critico) | 4 |
| P1 (alto) | 8 |
| P2 (medio) | 8 |
| Fases executadas | 5 |
| Agentes envolvidos | 5 (Debugger, RAG-Gemini, UI-UX, Explore, plus implementer) |
| Problemas residuais | 3 (2x P1, 1x P2) |
| Arquivos alterados | ~10 |
| Arquivos criados | ~6 (testes E2E, scripts, prompts) |

---

## Problemas Residuais (Nao Corrigidos)

| Prioridade | Problema | Modulo | Sugestao de Correcao |
|------------|----------|--------|----------------------|
| **P1** | CNPJs nao aparecendo todos no mapa societario — modulo teia deep falha por timeout | `features/dossier/teia-deep/` | Aumentar timeout ou quebrar consulta em lotes menores com paralelismo controlado |
| **P1** | Entidades internacionais sem link de auditoria — "Conexao INFERIDA" sem comprovacao documental | `prompts/mega/specialist-prompts.ts` | Adicionar exigencia de fonte/URL/data para toda conexao internacional. Se sem evidencia, marcar como "NAO CONFIRMADA" com checklist do que falta |
| **P2** | Mermaid no contrato condicional ("quando houver dados"), deveria ser obrigatorio | `prompts/mega/builders.ts` | Alterar contrato para "gere SEMPRE um diagrama Mermaid. Se apenas a empresa raiz estiver disponivel, gere grafo minimo de 1 no." |

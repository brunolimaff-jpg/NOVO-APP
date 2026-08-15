# Gold Narrative Word Budget — Design

**Data:** 2026-08-14  
**Track:** BRU-103 / PR #483  
**Baseline de decisão:** `3610ea2dfa2c907a69a986b6b062320d18589374`

## 1. Problema comprovado

O run real `d3ebe647-a398-40a4-bf1a-38c8f4e1d698` terminou em Preview com o caminho semântico limpo após o Composer (`post-preflight=0`, `post-mermaid=0`, `post-certainty=0`), mas o `GoldContractValidator` rejeitou o Gold com:

- `WORD_COUNT_OUT_OF_RANGE` (`wordCount=2321`);
- `ACTION_COUNT_MISMATCH`.

O contrato vigente orienta o Composer a produzir **900–1500 palavras**. Ao mesmo tempo, o Composer é explicitamente instruído a **não escrever Mermaid**, porque o pipeline injeta depois três diagramas canônicos e uma tabela dinâmica de elos. O validator, porém, mede `countWords(goldBrief)` sobre o artefato final enriquecido. Logo, o orçamento de geração e o domínio de medição são incompatíveis.

## 2. Decisão material aprovada por Bruno

**900–1500 palavras = orçamento da narrativa humana do Gold.**

A métrica deve ser aplicada à narrativa que sobreviveu a preflight/guards, excluindo somente componentes determinísticos inseridos pelo sistema depois do Composer:

1. blocos ` ```mermaid ... ``` ` canônicos;
2. tabela dinâmica determinística `MAPA DE ELOS DA CADEIA DE VALOR`.

Não significa o tamanho textual bruto do artefato final enriquecido.

## 3. Invariantes

- `MIN_WORDS=900` e `MAX_WORDS=1500` não mudam.
- As 9 seções obrigatórias não mudam.
- Limites de Mermaid, sinais, frente, adjacências, pergunta e ações não mudam.
- Preflight/guards continuam contando: se removerem narrativa, a narrativa remanescente deve continuar dentro de 900–1500.
- Os visuais determinísticos continuam presentes no artefato final e continuam sujeitos aos seus próprios limites estruturais (`mermaidCount`, etc.).
- Não reduzir o prompt para uma faixa arbitrária como 700–1000 para compensar visual variável.
- Não alterar semântica do verifier, I7, sanitizer ou Mermaid neste lote.

## 4. Design recomendado

Criar uma **visão narrativa canônica** exclusivamente para a métrica de palavras do `GoldContractValidator`.

Fluxo conceitual:

```text
Gold final pós-guards
→ derivar narrativeView
   - remover fences Mermaid completos
   - remover somente a tabela determinística de elos
→ countWords(narrativeView)
→ validar 900–1500

Gold final original
→ validar seções / mermaid / sinais / frente / adjacências / pergunta / ações
```

A função que deriva `narrativeView` deve ser pura e determinística. Ela não altera a saída entregue ao usuário; apenas define o domínio correto da métrica de palavras.

### Identificação da tabela determinística

Preferir um marcador/contrato canônico do próprio builder em vez de heurística ampla. A remoção deve atingir exclusivamente o bloco gerado por `buildDynamicValueChainTable`, começando no heading canônico `### 🔗 MAPA DE ELOS DA CADEIA DE VALOR` e terminando no fim da tabela gerada, sem apagar narrativa humana adjacente.

Se o formato atual não oferecer fronteira inequívoca, o menor ajuste permitido é tornar o bloco determinístico explicitamente identificável de forma estável, sem mudar a UI percebida.

## 5. Alternativas rejeitadas

### A. Reduzir prompt do Composer para ~700–1000 palavras

Rejeitada. O tamanho dos blocos determinísticos varia com SafePack/canonical. Ajustar o prompt por estimativa cria tuning frágil e acopla o LLM ao tamanho de uma transformação posterior.

### B. Medir o texto bruto imediatamente antes do Mermaid

Parcialmente correta, mas rejeitada como fonte final da métrica. O contrato deve medir a narrativa efetiva após todas as podas/guards relevantes, não uma versão anterior que ainda possa perder conteúdo.

### C. Aumentar o limite de 1500 palavras

Rejeitada. Mudaria a régua de produto em vez de corrigir o domínio da medição.

## 6. ACTION_COUNT_MISMATCH — trilha separada

O run real ainda apresenta `ACTION_COUNT_MISMATCH`. O ajuste anterior para `**1.**` não resolveu o formato real.

Não ampliar regex por hipótese.

Antes de novo fix, obter uma evidência estrutural do formato da seção 9 sem persistir conteúdo sensível. Preferência:

- captura local/efêmera do literal do Composer durante a próxima validação autorizada; ou
- assinatura estrutural não sensível do bloco de ações (por exemplo, formato detectado e contagem por estratégia), sem texto/claims.

Somente depois da evidência, aplicar o menor ajuste do oracle se o Composer estiver obedecendo semanticamente ao contrato de exatamente 3 ações.

## 7. Testes de design

O plano de implementação deve exigir TDD com pelo menos:

1. Gold com 1000 palavras narrativas + grande Mermaid/tabela determinística → `wordCount` contratual permanece ~1000 e PASS de tamanho.
2. Gold com 850 palavras narrativas + visuais que elevam bruto acima de 900 → continua FAIL por tamanho.
3. Gold com 1600 palavras narrativas → continua FAIL, independentemente dos visuais.
4. Remoção da `narrativeView` não altera o string Gold final.
5. Conteúdo humano fora dos blocos determinísticos nunca é removido da contagem.
6. `mermaidCount` e demais métricas continuam sendo calculadas no artefato final original.

## 8. Aceite

O lote só fecha quando:

- `wordCount` passa a representar a narrativa humana aprovada por contrato;
- 900–1500 permanece inalterado;
- visuais determinísticos permanecem intactos no Gold final;
- testes focados + Gold suite + full suite + typecheck + lint + build + no-gemini + diff-check passam;
- CI e Preview correspondem ao mesmo SHA;
- nova validação real demonstra a métrica narrativa correta;
- `ACTION_COUNT_MISMATCH` é atribuído por evidência antes de qualquer ampliação de parser;
- `output-selected=gold_pass` é o gate runtime final do BRU-103.

## 9. Locks

- Preview apenas.
- Supabase read-only.
- Sem migration/schema/data write.
- Sem Produção.
- PR #483 permanece Draft.
- Merge final permanece bloqueado até autorização explícita de Bruno.

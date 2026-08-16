# Revisão supervisora — vazamento de scaffolding no Gold Scheffer

**Data:** 2026-08-15  
**Worktree:** `/Users/brunolima/Documents/NOVO-APP-bru62`  
**Branch:** `feat/v6-shadow-prep`  
**Escopo:** somente leitura; sem código, merge, deploy, migration ou rodada paga.

## Resultado

A execução Gold foi bem-sucedida, mas a saída visual/manual revelou um P1 de segurança de saída e qualidade editorial: o Composer ecoou meta-instruções e rótulos internos do contrato Gold. O renderer React apenas exibiu o texto aprovado; a causa está antes da UI.

## Evidência do artefato

A saída fornecida pelo Bruno contém:

- `Teia Societária (Conteúdo para o Builder)`;
- `Mapa do Caos (Operações Confirmadas)`;
- `Entidade Raiz (same_root)`;
- `Relação PJ Direta (direct_pj_relation)`;
- `Relações Laterais (partner_other_cnpj)`.

Isso caracteriza scaffolding/meta-instrução exposto. Não há, nesta evidência, prova de token, prompt completo, system/developer message ou chain-of-thought na tela.

## Causa raiz verificada

1. `services/llm/gold/prompts/gold-contract-prompts.ts:147` apresenta ao Composer os nomes internos dos componentes e os enums técnicos. O modelo pode reproduzi-los na narrativa.
2. `services/llm/gold/gold-pipeline.ts:420-440` aplica preflight semântico, downgrade de certeza e Narrative Contract; nenhum desses gates verifica vocabulário de scaffolding.
3. `services/llm/gold/mermaid/mermaid-deterministic.ts:571-589` remove blocos Mermaid livres e injeta os componentes determinísticos, mas deixa headings e meta-texto que o Composer já escreveu.
4. `services/llm/gold/seam/gold-dossier-seam.ts:253-273` valida o manifest de componentes e devolve `result.goldBrief`; não existe `scaffold_fail`.
5. `components/SectionalBotMessage.tsx:341-349,519-549` trata Gold como texto próprio e não aplica os strips legados. Isso é comportamento coerente com a separação atual; não é a origem do vazamento.
6. `utils/leakShieldPolicy.ts` é compartilhado por `api/llm.ts` e `utils/textCleaners.ts`, mas não é aplicado ao artefato Gold pós-Composer.

## Recomendação ao Planejador

Abrir microdelta fail-closed, sem mudar modelo/provider do produto:

1. No prompt do Composer, substituir enums crus por linguagem humana e proibir headings/meta-rótulos internos. Os enums continuam permitidos no contrato JSON do Compact.
2. Criar detector/sanitizador determinístico estreito antes do Narrative Contract e do builder:
   - remover apenas headings internos exatos;
   - preservar a tabela e os fatos abaixo do heading;
   - humanizar enums técnicos quando aparecerem em papel/descrição;
   - residual ambíguo deve reprovar fechado, não ser apagado silenciosamente.
3. Verificar o artefato final exato; residual deve selecionar `factual_minimal` por `scaffold_fail`.
4. Adicionar RED/GREEN para prompt, pipeline, seam, idempotência, preservação de evidência e não alteração dos enums do Compact.
5. Manter PR #483 DRAFT e os locks de merge, produção, Supabase, retry e rodada Gold paga.

Ordem recomendada:

`compose → preflight → downgrade → sanitize scaffolding → verify/narrative → builder → verify final → artifact gate → residual detector → gold_pass`

Não sanitizar depois do único verifier final sem revalidar, pois isso quebraria a equivalência entre texto verificado e texto entregue.

## Revisão visual supervisora

- **P1:** Mermaid pequeno/concentrado em canvas amplo; falta forma visível de ampliar/abrir rótulos.
- **P1:** estados epistemológicos não são uniformes entre texto, cards e diagramas (`Confirmado`, ausência na fonte, estimativa, legado e `A validar`).
- **P2:** `Pronto para revisão` compete visualmente com `Preview demonstrativo — sem consulta ao vivo`.
- **P2:** próximo movimento comercial fica abaixo da primeira dobra.
- Sem sobreposição, clipping, contraste inadequado ou quebra mobile verificados nas imagens analisadas.

## Verificação executada

- Testes direcionados no checkout validado: **56/56 PASS** (`gold-pipeline`, `goldCriticalDiagnostics`, `golden-precondition`, `leak-shield-parity`, `rca05-gold-policy`).
- Análise do agente técnico delegado: confirmou a mesma causa raiz; não editou arquivos.
- Análise visual: confirmou os achados de legibilidade e não encontrou prompt bruto/CoT visível nos screenshots.
- O runtime não confirmou efetivamente que o agente delegado usou Verboo/DeepSeek V4 Flash; a preferência está configurada, mas atribuição do resultado ao modelo permanece não verificada.
- O envio externo ao Linear/Planejador ficou **NÃO VERIFICADO**: o conector MCP rejeitou a chamada por `statusUpdateType` sem `statusUpdateId`, mesmo na tentativa mínima.

## Status

`GOLD_PASS_WITH_P1_SCAFFOLDING_LEAK` — não pronto para revisão formal/merge até o microdelta de boundary e seus testes. Nenhuma alteração de código foi feita nesta revisão.

---
grok_wiki: true
page_id: 'page-score-porta'
title: 'Score PORTA'
description: 'Dimensões, pesos, markers, feeds, consolidação, flags, segmentos e regras de integridade do score comercial 0-100.'
repository: 'local/NOVO-APP'
branch: 'default'
generated_at: '2026-06-08T23:39:43.629Z'
source_files:
  - 'types.ts'
  - 'utils/porta.ts'
  - 'services/portaStateService.ts'
  - 'services/gemini/porta.ts'
  - 'features/dossier/porta-reconciliation.ts'
  - 'docs/ai-context/METODOLOGIA_PORTA.md'
  - 'tests/services/portaParser.test.ts'
---

O Score PORTA é o contrato de qualificação comercial renderizado nas mensagens do bot e persistido como `scorePorta`/`scoreOportunidade` ao final do dossiê. A implementação calcula um valor final de 0 a 100 a partir de cinco notas inteiras de 0 a 10, segmento aplicado, flags penalizadoras e markers internos removidos antes da exibição do texto.

<Info>
Apesar de o código atual viver sob módulos `gemini`, o contrato efetivo do score é portável: texto com markers `[[PORTA_*]]` mais tipos TypeScript. Qualquer gerador ou backend pode alimentar o score se emitir os markers no formato aceito pelo parser.
</Info>

## Superfície técnica

| Superfície                                 | Papel                                                                                                                   |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `ScorePortaData`                           | Estrutura pública do score em mensagens, sessões e UI.                                                                  |
| `PORTA_WEIGHTS`                            | Pesos por segmento `PRD`, `AGI` e `COP`.                                                                                |
| `utils/porta.ts`                           | Parser de marker final, parser de feeds consolidados, cálculo bruto, penalizações, limpeza de markers e faixas visuais. |
| `services/gemini/porta.ts`                 | Extração de feeds de deep dive, flags, segmentos e limpeza antes de devolver conteúdo visível.                          |
| `services/portaStateService.ts`            | Estado em memória da sessão para base score, ajustes de deep dive, flags, segmento e score consolidado.                 |
| `features/dossier/porta-reconciliation.ts` | Reexecução e reconciliação quando dimensões ficam ausentes no waterfall.                                                |
| `components/ScorePorta.tsx`                | Card visual exibido apenas em mensagens do bot com `scorePorta`.                                                        |

## Contrato de dados

| Campo                   | Tipo                              | Regra                                                                      |
| ----------------------- | --------------------------------- | -------------------------------------------------------------------------- |
| `score`                 | `number`                          | Score final 0-100 após penalizações.                                       |
| `p`, `o`, `r`, `t`, `a` | `number`                          | Notas das dimensões PORTA em escala 0-10.                                  |
| `segmento`              | `PRD \| AGI \| COP`               | Segmento usado para escolher os pesos.                                     |
| `flags`                 | `TRAD \| LOCK \| NOFIT`           | Flags recebidas no tipo, mas `LOCK` é legado e removido pela normalização. |
| `scoreBruto`            | `number?`                         | Score 0-100 antes das penalizações.                                        |
| `justificativas`        | `Record<PortaDimension, string>?` | Texto opcional usado pela UI no popover de cada dimensão.                  |

## Dimensões e pesos

O score bruto é calculado como:

```text
scoreBruto = round((P*wP + O*wO + R*wR + T*wT + A*wA) * 10)
scoreFinal = round(scoreBruto * multiplicadorDasFlags)
```

| Segmento |   P |   O |   R |   T |   A |
| -------- | --: | --: | --: | --: | --: |
| `PRD`    | 10% | 25% | 10% | 30% | 25% |
| `AGI`    | 15% | 30% | 20% | 20% | 15% |
| `COP`    | 15% | 20% | 25% | 20% | 20% |

| Dimensão | Nome operacional | Sinal principal                                                        |
| -------- | ---------------- | ---------------------------------------------------------------------- |
| `P`      | Porte            | Escala real, hectares, CNPJs, faturamento e massa crítica.             |
| `O`      | Operação         | Elos controlados da cadeia, verticalização e complexidade operacional. |
| `R`      | Retorno/pressão  | Pressão regulatória, fiscal, trabalhista, mercado e compliance.        |
| `T`      | Tecnologia       | Stack instalado, dor ativa e liberdade de troca.                       |
| `A`      | Adoção           | Cultura, governança, timing e janela política de decisão.              |

## Segmentos e flags

| Código | Segmento       | Uso                                                                   |
| ------ | -------------- | --------------------------------------------------------------------- |
| `PRD`  | Produtor rural | Default quando nenhum `PORTA_SEG` é encontrado.                       |
| `AGI`  | Agroindústria  | Operação com beneficiamento, indústria, logística ou cadeia complexa. |
| `COP`  | Cooperativa    | Perfil em que compliance e pressão regulatória ganham peso maior.     |

| Flag    | Multiplicador efetivo | Comportamento                                                                                                                     |
| ------- | --------------------: | --------------------------------------------------------------------------------------------------------------------------------- |
| `TRAD`  |                 `0.6` | Reduz score quando a natureza da receita indica trading puro.                                                                     |
| `NOFIT` |                 `0.3` | Reduz score quando o core operacional está fora do fit Senior/GAtec.                                                              |
| `LOCK`  |           `1`, legado | Aceito pelo tipo e por alguns prompts antigos, mas removido por `normalizePortaFlags`; não deve ser tratado como flag ativa nova. |

## Markers aceitos

O parser resolve o score nesta ordem:

1. Marker final v2 `[[PORTA:...]]`, com score recalculado a partir das dimensões.
2. Feeds `[[PORTA_FEED_*]]`, quando não há marker final.
3. Marker legado v1, com segmento `PRD`, sem flags e sem `scoreBruto`.

```text
[[PORTA:84:P8:O10:R7:T8:A8:AGI:NONE]]
[[PORTA:51:P7:O8:R6:T7:A7:PRD:TRAD]]
[[PORTA:18:P5:O4:R6:T5:A5:COP:NOFIT]]
```

<Warning>
No marker v2, o primeiro número não é fonte de verdade. A implementação recalcula `scoreBruto` e `score` usando pesos e flags; se o número inicial divergir das dimensões, vence o cálculo.
</Warning>

### Feeds por dimensão

| Marker                                                 | Alimenta | Observação                                                                       |
| ------------------------------------------------------ | -------- | -------------------------------------------------------------------------------- |
| `[[PORTA_FEED_P:NOTA:HA:...:CNPJS:...:FAT:...]]`       | `P`      | Feed principal de porte.                                                         |
| `[[PORTA_FEED_P_PROXY:FUNC:...]]`                      | `P`      | Proxy complementar por headcount.                                                |
| `[[PORTA_FEED_O:NOTA:ELOS:...]]`                       | `O`      | Pode aparecer também em forma compacta `[[PORTA_FEED_O:6]]`.                     |
| `[[PORTA_FEED_R:NOTA:PRESSOES:...]]`                   | `R`      | Também aceita variação `PRESSAO`.                                                |
| `[[PORTA_FEED_R_TRAB:NOTA:PASSIVOS:...]]`              | `R`      | Entra junto com pressões regulatórias/fiscais.                                   |
| `[[PORTA_FEED_T:NOTA:T1:...:T2:...:T3:...:STACK:...]]` | `T`      | Carrega nota final e sub-scores técnicos.                                        |
| `[[PORTA_FEED_A:NOTA:A1:...:A2:...:GERACAO:...]]`      | `A`      | Em snapshot consolidado, `A1/A2` prevalecem sobre a nota final quando presentes. |
| `[[PORTA_FEED_A2:NOTA:TIMING:...:FASE:...]]`           | `A`      | Complementa timing sazonal.                                                      |
| `[[PORTA_FLAG:TRAD:SIM:NATUREZA:TRADING]]`             | flag     | Ativa ou desativa `TRAD`.                                                        |
| `[[PORTA_FLAG:NOFIT:SIM]]`                             | flag     | Ativa ou desativa `NOFIT`.                                                       |
| `[[PORTA_SEG:AGI]]`                                    | segmento | Último segmento encontrado vence no snapshot de feeds.                           |

## Consolidação de feeds

A consolidação por `utils/porta.ts` exige todas as dimensões `P/O/R/T/A`. Se qualquer dimensão ficar ausente, `resolvePortaScore` retorna `score: null` e lista `missingDimensions`.

| Item                  | Regra implementada                                                                                                      |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Segmento              | Usa o último `PORTA_SEG`; se ausente, usa `PRD`.                                                                        |
| `P`                   | Usa `PORTA_FEED_P`; se houver `P_PROXY`, combina `80%` do feed principal com `20%` do proxy mapeado por funcionários.   |
| Proxy de funcionários | `<50` vira 1; sobe por faixas até `>=20000` virar 10.                                                                   |
| `R`                   | Faz média arredondada de todos os `PORTA_FEED_R` e `PORTA_FEED_R_TRAB`.                                                 |
| `A`                   | Quando `A1` e `A2` existem, calcula `60% A1 + 40% A2`; se `A2` de RH existir, primeiro faz média entre os dois timings. |
| Flags                 | Só flags com `SIM` entram no snapshot; `LOCK` é filtrado.                                                               |
| Notas                 | Valores derivados são arredondados e limitados a 0-10 nos caminhos auxiliares.                                          |

## Estado de deep dive

Deep dives não devem recalcular o score completo. O fluxo inicializa um estado PORTA por sessão, grava o score base e aplica feeds posteriores como ajustes.

| Operação                          | Regra                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------ |
| `setBaseScore`                    | Normaliza flags, calcula `scoreBruto` quando ausente e recalcula `score`.                  |
| `addFeedAdjustment`               | Substitui ajuste anterior da mesma `source + dimension`.                                   |
| Ajuste por dimensão               | Só altera a nota se a diferença absoluta para a base for `>= 1`.                           |
| `addSegmentFeed`                  | Mantém um feed por source; o mais recente define o segmento.                               |
| `addFlagFeed`                     | Ativa ou remove flags por source; `LOCK` não entra.                                        |
| `generatePortaContextForDeepDive` | Envia score atual e manda o módulo sugerir apenas `PORTA_FEED_*` se houver evidência nova. |

<Warning>
`portaStateService` usa um singleton de módulo (`currentPortaState`). Em mudanças que criem gerações concorrentes ou múltiplas sessões ativas no mesmo runtime, valide isolamento por `sessionId` antes de confiar no estado compartilhado.
</Warning>

## Waterfall e integridade

O waterfall executa os módulos do dossiê, tenta resolver o score, reexecuta módulos donos das dimensões faltantes e aciona uma reconciliação final antes de persistir a mensagem.

```text
Módulos do dossiê
  -> resolvePortaScore(texto acumulado)
    -> score completo: persiste score
    -> dimensões ausentes:
       -> retry dos módulos donos
       -> reconciliador emite apenas markers faltantes
       -> score completo: persiste score
       -> hold/timeout/erro: não persiste scorePorta
```

| Dimensão faltante | Módulo reexecutado           |
| ----------------- | ---------------------------- |
| `P`               | `Porte / Teia Societária`    |
| `O`               | `Operação / Cadeia de Valor` |
| `R`               | `Riscos & Compliance`        |
| `T`               | `Bordas de Controle`         |
| `A`               | `Caminho de Venda`           |

A reconciliação final usa templates mínimos por dimensão, timeout de 60s por chamada de módulo e uma janela de contexto de 12.000 caracteres. No orquestrador, a etapa completa de reconciliação corre contra timeout de 120s. Se houver hold de integridade, erro ou timeout, `waterfallScorePorta` fica `null`, o texto final ainda é limpo e o dossiê pode ser exibido sem card PORTA.

## Renderização e persistência

O card `ScorePorta` aparece somente em mensagens do bot que carregam `msg.scorePorta`. Ele mostra:

- score final `/100`;
- faixa visual: `Alta Compatibilidade` para `>=71`, `Média Compatibilidade` para `>=41`, `Baixa Compatibilidade` abaixo disso;
- segmento aplicado;
- flags válidas e não legadas;
- badges clicáveis de `P/O/R/T/A`, com justificativa customizada quando disponível.

Na conclusão do waterfall, o mesmo valor alimenta `ChatSession.scoreOportunidade`. Antes de renderizar o texto narrativo, `stripPortaMarkers` remove markers `[[PORTA*]]`, blocos visíveis de feeds PORTA e trechos textuais de `SCORE PORTA` que seriam redundantes com o card visual.

## Regras de manutenção

<Steps>
  <Step title="Ao alterar cálculo ou tipos">
    Atualize `types.ts`, `utils/porta.ts` e os testes de parser/consolidação. Preserve compatibilidade v1 se mensagens antigas ainda puderem ser lidas.
  </Step>
  <Step title="Ao alterar prompts">
    Mantenha a gramática canônica sem decimais, sem espaços internos e sem colchetes extras. O parser tolera algumas variações em certos caminhos, mas deep dives não devem depender dessa tolerância.
  </Step>
  <Step title="Ao alterar waterfall">
    Valide que `portaIntegrityHold` não renderiza score inválido e que lacunas parciais não passam silenciosamente como score completo.
  </Step>
</Steps>

Comandos úteis para mudanças nessa área:

```bash
npm run typecheck
npm test -- tests/utils/porta.test.ts tests/services/portaParser.test.ts tests/services/portaStateService.test.ts tests/features/dossier/porta-reconciliation.test.ts tests/components/ScorePorta.test.tsx
npm run validate:prompts
```

## Troubleshooting

| Sintoma                                        | Causa provável                                                                     | Checagem                                                                   |
| ---------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Card PORTA não aparece                         | `scorePorta` ficou `undefined` por hold, timeout ou dimensão ausente.              | Procure `missingDimensions`, `portaIntegrityHold` e logs `ModularDossier`. |
| `LOCK` não aparece na UI                       | Flag legada filtrada por normalização.                                             | Use `TRAD` ou `NOFIT` se houver efeito comercial real.                     |
| Score do marker não bate com o primeiro número | Parser v2 recalcula pelo vetor `P/O/R/T/A`, segmento e flags.                      | Corrija as dimensões ou o segmento, não apenas o primeiro número.          |
| Feed de deep dive não altera nota              | Diferença menor que 1 ponto ou ajuste substituído pela mesma `source + dimension`. | Verifique `feedAdjustments` e o source do módulo.                          |
| Parser de deep dive ignora marker com espaços  | Caminho de deep dive é menos tolerante que o resolver consolidado.                 | Emitir formato canônico `[[PORTA_FEED_T:6:T1:7:T2:8:T3:5:STACK:SAP]]`.     |

## Related pages

<CardGroup>
  <Card title="Waterfall de dossiê" href="/dossie-waterfall">
    Pipeline que executa módulos, reconcilia PORTA e finaliza a mensagem do dossiê.
  </Card>
  <Card title="Prompts de investigação" href="/prompts-reference">
    Builders, módulos especialistas e contrato de saída dos markers.
  </Card>
  <Card title="Contratos de UI" href="/ui-contracts-reference">
    Estados renderizados, mensagens do bot e componentes visuais protegidos contra regressão.
  </Card>
  <Card title="Observabilidade e diagnósticos" href="/observabilidade">
    Eventos `scoutDiag`, waterfall lifecycle, warnings de integridade e sinais de falha.
  </Card>
  <Card title="Testes e gates" href="/testes-gates">
    Comandos npm, Vitest, Playwright e critérios por tipo de mudança.
  </Card>
</CardGroup>

## Source files

- `types.ts`
- `utils/porta.ts`
- `services/portaStateService.ts`
- `services/gemini/porta.ts`
- `features/dossier/porta-reconciliation.ts`
- `docs/ai-context/METODOLOGIA_PORTA.md`
- `tests/services/portaParser.test.ts`

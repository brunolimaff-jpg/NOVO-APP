---
type: licoes-aprendidas
area: debug-tela-branca
data: 2026-05-28
sessao: investigacao-tela-branca-pr307
tags:
  - licao
  - tela-branca
  - debug
  - metodologia
  - vercel
  - serverless
  - playwright
  - diagnostico
  - waterfall
  - persistencia
  - performance
---

# Licoes Aprendidas — Investigacao Tela Branca PR #307

Voltar para [[DECISIONS-Index]].

## Contexto

Investigacao de tela branca no preview `fix-consolidate` (PR #307). Dossie da Scheffer (CNPJ 04.733.767/0001-80). Sintomas: tela branca com header, tela branca total, header/input com area central vazia. Erro 500 no `/api/open-web-search` identificado mas causa raiz da tela branca nao confirmada. Branch `fix/consolidated-grounding-loading-fixes`, base `fix/full-dossier-lifecycle-trace` (#306).

---

## 1. Playwright nao basta como prova final para bugs de lifecycle/cache/browser real

**Problema:** Playwright e Chrome DevTools automatizados sao uteis para coleta inicial, mas bugs que dependem de alternancia real de abas, freeze/thaw do SO, throttle de timers em background (1/min no Chrome) ou IndexedDB corrompido so se manifestam em navegador real com abas reais.

**Evidencia:** 2 sessoes de automacao (Playwright + Chrome DevTools MCP) nao conseguiram reproduzir a tela branca exata. Troca de abas via `browser_tabs` nao aciona o mesmo throttle de timer que o Chrome real aplica em abas de fundo.

**Regra:** Validacao final de bugs de lifecycle SEMPRE exige teste manual em navegador real com abas reais. Automacao e suporte, nao substituta.

---

## 2. Separar sintoma de causa raiz — cada sintoma pode ser um bug diferente

**Problema:** Tela branca, timeline vazia, overlay residual, bot ausente e 500 no `/api/open-web-search` foram inicialmente agrupados como "a tela branca". Mas cada um pode ter causa independente.

**Evidencia:** O erro 500 foi confirmado e reproduzido. A timeline vazia foi reproduzida (ao reabrir aba, so mensagem do usuario). Mas a tela branca total NAO foi reproduzida. Sao 3 sintomas diferentes que podem ter 3 causas diferentes.

**Regra:** Listar cada sintoma separadamente. Para cada um, verificar se e reprodutivel isoladamente. So agrupar quando houver evidencia de causalidade comum.

---

## 3. Endpoint auxiliar degradavel nunca deve retornar 500

**Problema:** `/api/open-web-search` e um endpoint de fallback — sua funcao e degradar gracefulmente quando a busca principal falha. Retornar 500 quebra esse contrato e propaga erro em cascata para o waterfall.

**Evidencia:** O endpoint retornou 500 durante a geracao do dossie. O waterfall tratou o erro (warning "fallback open-web-search falhou"), mas a segunda chamada ficou pending eterna.

**Regra:** Todo endpoint auxiliar/de fallback deve ter `try/catch` no nivel mais externo e sempre retornar 200 com `degraded: true` + `detail`. 500 so para erros verdadeiramente irrecuperaveis (ex: falha de autenticacao).

---

## 4. Serverless pode falhar fora do catch — logs da Vercel sao obrigatorios

**Problema:** Funcoes serverless podem crashar ANTES do `try/catch` por: import com side effect, timeout da runtime (60s no plano Hobby), dependencia pesada bloqueando event loop, ou fetch pendurado.

**Evidencia:** O 500 no `/api/open-web-search` ocorreu apesar do `catch (error: unknown)` no nivel superior do handler. Isso sugere crash fora do try/catch ou timeout da runtime.

**Regra:** Antes de diagnosticar qualquer 500 em serverless function, verificar os logs do Vercel Functions. Sem logs, o diagnostico e cego.

---

## 5. Persistencia parcial apos reload e risco critico

**Problema:** Se o dossie esta em andamento e o usuario recarrega ou reabre a aba, a sessao parcial (so mensagem do usuario, sem resposta do bot) pode ser salva e sobrescrever uma sessao completa anterior.

**Evidencia:** Ao abrir nova aba durante geracao do dossie, o app carregou com historico mostrando a sessao parcial — apenas "Investigando Grupo Scheffer..." sem resposta do bot.

**Regra:** Sessao incompleta (isThinking=true, sem texto final) nunca deve sobrescrever sessao completa no storage. Implementar status `generating | completed | failed | partial` e checar antes de persistir.

---

## 6. Supabase provar backend vivo nao prova UI renderizada

**Problema:** Diagnosticos persistidos no Supabase provam que o backend e a instrumentacao funcionam. Nao provam que o Virtuoso renderizou, que o portal fechou ou que o usuario viu o dossie.

**Evidencia:** O sistema de diagnostico persistente (#306) registra eventos de waterfall, heartbeat e visibility no Supabase. Mas nenhum desses eventos confirma que o DOM final esta correto.

**Regra:** Validacao de UI exige evidencia no cliente: DOM snapshot com dimensoes, console sem erros, screenshot. Supabase e backend da instrumentacao, nao da UI.

---

## 7. Nao misturar instrumentacao, prompt, waterfall, layout e persistencia na mesma correcao

**Problema:** PRs com 5+ dominios diferentes (documentExtractor + LoadingSmart + waterfall + MessageTimeline + geminiProxy) dificultam isolamento de regressao.

**Evidencia:** A PR #307 consolida mudancas das PRs #304 (grounding/fallback web) e #305 (LoadingSmart/waterfall). Mesmo sendo "so patches bons", a combinacao de dominios torna dificil isolar qual mudanca especifica causou a regressao.

**Regra:** Cada dominio (busca web, loading UI, waterfall, timeline, diagnostico) merece branch e validacao independentes. Consolidacao so depois de cada parte validada isoladamente.

---

## 8. Preview Vercel e por branch/commit, nao soma PRs abertas

**Problema:** Abrir PR #307 baseada na #306 NAO faz o preview incluir as mudancas da #306. Cada preview e um deploy isolado do commit da branch. Base branch != merge automatico.

**Evidencia:** O preview da #307 (`fix-consolidate`) e um deploy do commit `582db81` na branch `fix/consolidated-grounding-loading-fixes`. Ele NAO inclui automaticamente novos commits da #306.

**Regra:** Para testar o efeito combinado de duas PRs, fazer merge local e deploy separado, ou mergear a PR base primeiro.

---

## 9. Debug em hot path precisa ser gated

**Problema:** console.log, console.time e console.timeEnd em MessageRow, SectionalBotMessage e useMemos de parsing de texto disparam em toda renderizacao de mensagem. Para textos de 39k chars no dossie, isso e ruido extremo.

**Evidencia:** A PR #305 introduziu console.time em 5 useMemos (auditableSources, parseSmartOptions, stripUnsafeSocietarySections, parseMarkdownSections, parseTeiaText) e console.log no corpo do MessageRowBody. Esses foram descartados na #307, mas o padrao e recorrente.

**Regra:** Qualquer console.log/time/console.timeEnd em componente memo ou useMemo que renderiza por mensagem DEVE ser envolvido em gate: `if (import.meta.env.DEV || import.meta.env.VITE_DEBUG_CONSOLE)`. Nunca em producao sem gate.

---

## 10. Endpoint externo novo deve ser testado no ambiente real da Vercel

**Problema:** `html.duckduckgo.com/html/` funciona em maquina local mas e bloqueado por IPs de datacenter da Vercel. Teste local != teste serverless.

**Evidencia:** Reforca licao ja documentada. O endpoint HTML do DDG foi adicionado sem validacao no ambiente real e causou 500 em producao.

**Regra:** `curl` de dentro da serverless function ou `vercel dev --listen` antes do deploy.

---

## 11. Nao declarar causa raiz sem stack trace

**Problema:** "Provavelmente e o endpoint HTML do DDG" nao e diagnostico. Causa raiz exige: erro exato, stack trace, arquivo e linha, condicao que dispara.

**Evidencia:** A investigacao identificou o 500 mas nao conseguiu o stack trace (logs do Vercel nao foram verificados). A conclusao "causa raiz: DDG HTML bloqueado" e hipotese, nao fato.

**Regra:** Sem stack trace, o maximo que se pode afirmar e "hipotese principal, pendente de confirmacao". Nunca declarar causa raiz como fato sem o erro exato no arquivo exato.

---

## 12. Dossie em andamento precisa de status explicito

**Problema:** Sessoes de dossie nao tem status. O cliente nao sabe se o dossie foi interrompido, se esta em andamento, se completou ou se falhou parcialmente.

**Evidencia:** Ao reabrir o app durante geracao, a sessao carregou com mensagem do usuario mas sem resposta do bot. Nao ha como distinguir "dossie em andamento" de "dossie que falhou" ou "dossie parcial".

**Regra:** Toda sessao de dossie deve ter `dossierStatus: 'generating' | 'completed' | 'failed' | 'partial'`. O cliente usa esse status para decidir se mostra loading, dossie parcial, ou dossie completo. Persistencia so sobrescreve se o status novo for "mais completo" que o anterior (`completed > partial > failed > generating`).

---

## Resumo

| #   | Licao                                                      | Tipo               |
| --- | ---------------------------------------------------------- | ------------------ |
| 1   | Playwright nao basta para bugs de lifecycle                | Metodologia        |
| 2   | Separar sintoma de causa raiz                              | Metodologia        |
| 3   | Endpoint auxiliar nunca retorna 500                        | API/Resiliencia    |
| 4   | Serverless crasha fora do catch — logs Vercel obrigatorios | Debug/Serverless   |
| 5   | Persistencia parcial e risco critico                       | Persistencia/UX    |
| 6   | Supabase prova backend, nao UI                             | Debug/Metodologia  |
| 7   | Nao misturar dominios na mesma PR                          | Escopo/Metodologia |
| 8   | Preview Vercel e por commit, nao soma PRs                  | Deploy/Vercel      |
| 9   | Debug em hot path precisa de gate                          | Performance        |
| 10  | Endpoint novo testar no ambiente real Vercel               | Deploy/Serverless  |
| 11  | Nao declarar causa raiz sem stack trace                    | Debug/Metodologia  |
| 12  | Dossie precisa de status explicito                         | UX/Persistencia    |

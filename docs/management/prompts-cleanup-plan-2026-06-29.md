# Plano de Limpeza de Prompts Duplicados — 29/06/2026

**Autor:** IA gestora Z.ai (sessão web-2804fbf2)
**Para:** Bruno + DeepSeek (execução cirúrgica)
**Baseline:** `origin/main` @ `61ced7bc`
**Princípios aplicados:** 4 (não refatorar o que não entende), 6 (grep-validar tudo), 14 (honestidade sobre limites)

---

## ⚠️ LEIA ISTO ANTES DE MEXER EM QUALQUER PROMPT

1. **1 caractere quebra markers `[[PORTA:*]]`** — o parser em `utils/porta.ts` usa regexes rígidas. Qualquer alteração em `prompts/mega/foundation.ts` linhas 774-860 (SHARED_PARSER_GUARD_BLOCK) ou em qualquer template `[[PORTA_FEED_*]]` **QUEBRA O DOSSIÊ**.
2. **O teste `tests/prompts/megaPrompts.test.ts` linhas 259-334** pinna SHA256 hashes de 12 strings (SHARED_FOUNDATION_BLOCK + 8 specialist prompts + 3 built prompts). **Qualquer mudança de caractere exige `bun vitest run tests/prompts/megaPrompts.test.ts -u` no mesmo PR** para regenerar o snapshot.
3. **Antes de mexer, crie tag de reversão** (Princípio 12):
   ```bash
   git tag pre-prompts-cleanup
   git push origin pre-prompts-cleanup
   ```
4. **Bruno não lê código fluentemente** (Princípio 9) — cada PR precisa de resumo em português linha-a-linha.

---

## 📊 RESUMO EXECUTIVO (o que a investigação encontrou)

A investigação leu **todos os 13 arquivos de prompt** (4.052 LOC total) + o dossiê Scheffer gerado (1.181 linhas). **Conclusão: a duplicação real é muito menor do que parecia.**

| Achado | Real? | Severidade |
|---|---|---|
| Bloco `<inline_citation_rule>` copiado 8× verbatim em `specialist-prompts.ts` | ✅ SIM — única duplicação byte-idêntica | Média (3.920 chars redundantes) |
| SHARED_* blocks (11 blocos em foundation.ts) copy-pasted em specialist prompts | ❌ NÃO — são corretamente importados via builders.ts | — |
| "5× SCHEFFER & CIA LTDA" / "4× Qualificação: Sócio-Administrador" no dossiê | ❌ NÃO é duplicação de prompt — é repetição do template per-sócio em `teia-deep.ts:100-176` | Design (não bug) |
| "Nota de escopo:" / "Aviso metodológico:" aparecendo no dossiê | ⚠️ Leak de meta-instrução parafraseada pelo modelo — o shield não pega | Baixa (cosmético) |
| 3 cópias divergentes do prompt-leak-shield | ✅ SIM — `utils/textCleaners.ts` (live) + `utils/promptLeakShield.ts` (órfão) + `api/gemini.ts:59-115` (cópia local) | Média-Alta (débito, NÃO mexer agora) |

---

## 🎯 PLANO DE LIMPEZA — ordenado por segurança (faça do mais seguro ao mais arriscado)

### Passo H1 — DELETAR arquivo órfão `utils/promptLeakShield.ts` (151 LOC) — RISCO BAIXO

**O que:** Este arquivo foi extraído como refactor mas **nenhum serviço ativo o importa** (verificado com grep — só `tests/utils/textCleaners.test.ts` importa `applyPromptLeakShield` de `textCleaners.ts`, não deste arquivo).

**Ação:**
```bash
# Pré-validação (deve retornar 0 imports ativos):
grep -rn "from.*promptLeakShield" --include="*.ts" --include="*.tsx" src/ api/ services/ utils/ features/ components/ | grep -v "textCleaners"
# Se retornar 0 → seguro deletar
rm utils/promptLeakShield.ts
bun run typecheck
bun vitest run tests/utils/textCleaners.test.ts
```

**Validação:** typecheck passa + teste textCleaners passa (inalterado).

**Princípio 14 (honestidade):** Se Bruno prefere MANTER como alvo de extração futura, documentar como dead-code com `// TODO: orfão — ver docs/management/prompts-cleanup-plan-2026-06-29.md` em vez de deletar.

---

### Passo H3 — ADICIONAR padrões de leak-shield para "Nota de escopo" — RISCO BAIXO

**O que:** O `utils/textCleaners.ts` (cópia live do shield) não pega meta-instruções parafraseadas pelo modelo como "Nota de escopo: Este módulo aprofunda..." e "Aviso metodológico:". Estas vazaram no dossiê Scheffer.

**Ação:** Em `utils/textCleaners.ts`, adicionar ao array `HARD_PROMPT_LEAK_PATTERNS` (linhas 18-27):
```ts
{ id: 'nota_de_escopo', regex: /nota de escopo:\s*este m[óo]dulo/i },
{ id: 'aviso_metodologico', regex: /aviso metodol[óo]gico:/i },
```

**Validação:**
```bash
bun vitest run tests/utils/textCleaners.test.ts
# + teste manual: rodar pipeline Scheffer e confirmar que "Nota de escopo" some do output
```

**Princípio 5 (bug visível > bug escondido):** Parear com `console.warn` em dev para que o leak seja visível no console, não mascarado silenciosamente.

**PR separado** do Passo H1 (Princípio 3: pequeno e frequente).

---

### Passo H4 — CONSOLIDAR 8× `<inline_citation_rule>` em constante única — RISCO MÉDIO

**O que:** Em `prompts/mega/specialist-prompts.ts`, o bloco `<inline_citation_rule>` (560 chars) está copiado verbatim 8 vezes (linhas 171-178, 479-486, 768-775, 1017-1024, 1242-1249, 1449-1456, 1678-1685, 1866-1873). Total: 4.480 chars, sendo 3.920 redundantes.

**Ação:**
1. No topo de `specialist-prompts.ts`, definir:
```ts
const INLINE_CITATION_RULE_BLOCK = `
<inline_citation_rule>
REGRAS DE DISTRIBUICAO DE CITACOES PARA ESTE MODULO:
- Cada fato ou evidencia DEVE citar com [[n]](URL_COMPLETA_HTTPS) usando APENAS URLs do bloco [FONTES DISPONIVEIS PARA CITACAO] no contexto.
- PROIBIDO inventar URL, google.com/search, example.com ou rotulo descritivo sem URL valida.
- Se nao houver URL no bloco de fontes, declare "sem fonte URL verificavel" sem link falso.
- Distribua citacoes inline nos paragrafos; o rodape Fontes consolida citadas e consultadas.
- Cada secao deve ter pelo menos 2-3 citacoes inline quando houver fontes disponiveis.
</inline_citation_rule>`;
```
2. Substituir cada uma das 8 ocorrências verbatim por `${INLINE_CITATION_RULE_BLOCK}`.
3. **NO MESMO PR**, regenerar o snapshot:
```bash
bun vitest run tests/prompts/megaPrompts.test.ts -u
```
4. Rodar suite completa de prompts:
```bash
bash scripts/validate-prompts.sh
```

**CRÍTICO:** O texto do bloco NÃO MUDA — apenas a forma de incluí-lo (de inline verbatim para interpolação de constante). O snapshot SHA256 vai mudar porque o SOURCE FILE mudou, mas o OUTPUT do prompt concatenado permanece idêntico. Confirme com:
```bash
# Antes da mudança, salve o output de cada prompt:
bun -e "import { ALL_SPECIALIST_PROMPTS } from './prompts/mega/specialist-prompts'; ALL_SPECIALIST_PROMPTS.forEach((p,i) => console.log(i, require('crypto').createHash('sha256').update(p).digest('hex')))"
# Depois da mudança, rode o mesmo comando — os hashes DEVEM ser idênticos.
```
Se os hashes de OUTPUT diferirem em 1 caractere, **ABORTAR** — significa que a interpolação introduziu whitespace/newline diferente.

**Princípio 9 (resumo em português antes do merge):** O PR description deve dizer: "Movemos um bloco de texto repetido para uma constante. NENHUM caractere do texto do prompt mudou — apenas a forma de incluí-lo. Os hashes de output dos 8 prompts são idênticos aos anteriores (evidência: comando bun -e acima). O snapshot do teste foi regenerado porque o arquivo-fonte mudou, não porque o prompt mudou."

**Princípio 3:** PR isolado, separado de H1 e H3.

---

### Passo H2 — REVISAR template per-sócio em `teia-deep.ts` — RISCO MÉDIO (NECESSITA CONFIRMAÇÃO DO BRUNO)

**O que:** O dossiê Scheffer mostra "Empresas do Grupo Econômico: SCHEFFER & CIA LTDA (04.733.767/0001-80) — confirmado via QSA" repetido 5× (uma por sócio), "Qualificação: Sócio-Administrador" 4×, "Outros CNPJs: Não localizados..." 4×. Isto é o template per-sócio em `prompts/mega/teia-deep.ts:100-176` emitindo os mesmos campos para cada sócio quando todos pertencem à mesma matriz.

**Não é bug de prompt — é design do template.** Mas Bruno achou estranho. Duas opções:

**Opção (a) — Pequeno ajuste no template:**
Adicionar instrução em `teia-deep.ts` ~linha 170: "Se a 'Empresa do Grupo Econômico' for idêntica à do sócio anterior, substitua a linha por '(idem)'."

**Opção (b) — Reestruturar output:**
Emitir UM bloco consolidado "Empresas do Grupo Econômico" acima da lista de sócios, e por sócio listar apenas: Nome, Qualificação, Controle, Risco de Homônimo.

**RISCO:** `PROMPT_TEIA_DEEP_MODULE` NÃO está no snapshot SHA256 (só tem asserts `toContain`/`not.toContain` em `megaPrompts.test.ts:105-136`). Então mudar o template não quebra snapshot. MAS muda o output do dossiê — precisa regressão visual.

**VALIDAÇÃO:**
```bash
bun vitest run tests/prompts/megaPrompts.test.ts tests/features/dossier/teiaTextParser.test.ts tests/features/dossier/societaryGraph.test.ts
# + gerar dossiê Scheffer em HOMOLOG e comparar visualmente com o atual
```

**⚠️ NÃO EXECUTAR SEM CONFIRMAÇÃO DO BRUNO** — Princípio 4 (não refatorar o que não entende). A repetição pode ser INTENCIONAL (cada sócio tem atribuição formal diferente mesmo na mesma matriz). Perguntar ao Bruno: "Você quer que cada sócio repita a empresa do grupo, ou prefere um bloco consolidado no topo?"

---

### 🚫 NÃO MEXER — Passo H5 (3 cópias do leak-shield)

**O que:** `utils/textCleaners.ts` (live), `utils/promptLeakShield.ts` (órfão), `api/gemini.ts:59-115` (cópia local) têm 3 implementações divergentes do mesmo conceito (hash diferente: `Math.imul` vs bitshift; pattern sets diferentes; return types diferentes).

**Por que não mexer:**
- Princípio 4: não entendo completamente POR QUE 3 cópias existem. Hipóteses: (a) `api/gemini.ts` roda em Vercel serverless e pode precisar de cópia local por bundle path; (b) `promptLeakShield.ts` foi extração iniciada e nunca concluída.
- Consolidar requer entender o motivo de cada cópia. **Deixar para Fase 7 ou Fase 9** (self-audit).

**Ação recomendada:** Documentar como débito conhecido no `docs/audit.md` (Fase 9). NÃO criar PR agora.

---

### 🚫 NÃO MEXER — Passo H6 (PRESSOES vs PRESSAO)

**O que:** RAIO-X (linha 288) e RISCOS (linha 853) usam `[[PORTA_FEED_R:...:PRESSOES:...]]`; ORCAMENTO (linha 1772) usa `[[PORTA_FEED_R:...:PRESSAO:...]]`. O parser (`utils/porta.ts:17`) aceita ambos via regex `PRESS(?:OES|AO)`.

**Por que não mexer:** Ganho cosmético, risco alto (mudar exige snapshot update + regressão de output + fixture update). Parser já tolera. **Deixar como está.**

---

## ✅ CHECKLIST PÓS-LIMPEZA (validar tudo — Princípio 8)

Após executar H1 + H3 + H4 (em PRs separados), confirmar:

- [ ] `bun run typecheck` passa
- [ ] `bun vitest run tests/prompts/` passa (com snapshot regenerado em H4)
- [ ] `bash scripts/validate-prompts.sh` passa
- [ ] `grep -rn "GeminiProxy" --include="*.ts" --include="*.tsx" . | wc -l` == 0 (inalterado)
- [ ] `grep -rn "\[\[PORTA" --include="*.ts" prompts/ | wc -l` == inalterado (markers preservados)
- [ ] Gerar dossiê Scheffer em HOMOLOG — comparar com o atual (não deve ter regressão)
- [ ] Confirmar com Bruno visualmente que o dossiê está aceitável
- [ ] Tag `pre-prompts-cleanup` existe no GitHub (reversão em 30s se quebrar)
- [ ] Atualizar `docs/management/` com resultado da limpeza

---

## 📐 ORDEM RECOMENDADA DE EXECUÇÃO (Bruno + DeepSeek)

1. **Criar tag `pre-prompts-cleanup`** (Princípio 12)
2. **PR #1: H1** (deletar órfão `promptLeakShield.ts`) — 5 min, risco baixo
3. **PR #2: H3** (adicionar 2 patterns de leak-shield) — 15 min, risco baixo
4. **Confirmar com Bruno sobre H2** (template per-sócio) — decisão de design
5. **PR #3: H4** (consolidar inline_citation_rule + snapshot update) — 30 min, risco médio, **validar hashes de output idênticos antes do merge**
6. **Se Bruno aprovar H2 → PR #4** (ajustar template teia-deep) — 20 min, risco médio
7. **NÃO executar H5, H6** nesta fase

---

## 📞 CONTATOS

- **Dúvidas sobre este plano:** colar no chat Z.ai com referência a `docs/management/prompts-cleanup-plan-2026-06-29.md`
- **Se quebrar produção:** `git reset --hard pre-prompts-cleanup && git push origin main --force` (último recurso — preferir revert PR)

---

**Fim do plano. Gerado em 29/06/2026 pela IA gestora (Z.ai) — sessão web-2804fbf2.**

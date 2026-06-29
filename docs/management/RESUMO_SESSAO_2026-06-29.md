# RESUMO DA SESSÃO — 29/06/2026 (sessão web-2804fbf2)

**Para:** Bruno
**De:** IA gestora Z.ai
**Assunto:** Handoff V2 lido + Principle 6 aplicado + Fase 6 (ADRs 0003/0004/0005) concluída + plano de prompts pronto

---

## ✅ O QUE EU FIZ NESSA SESSÃO

### 1. Validei o handoff V2 (Princípio 6 — não aceitar claim sem grep)

Clonei o repo COMPLETO (não shallow) e verifiquei TODAS as claims do handoff. **Tudo bateu**, exceto 2 pequenas imprecisões que o grep pegou (ver seção "Discrepâncias encontradas").

- `origin/main` @ `61ced7bc` no topo ✅ (confirmado com `git fetch origin main && git log origin/main -5`)
- `GeminiProxy` = 0 ocorrências ✅
- `createClient` em `services/socio-search/cache.ts` ✅
- `maybeSingle` em `services/storage/userContext.ts` ✅
- 5 god components com LOC exato (1604, 702, 678, 741, 680) ✅
- 7 tags no GitHub (`archive/main-pre-stabilize-2026-06-29`, `fase-1-done`...`fase-4-done`, `pre-fase-6`, `pre-sprint-9`) ✅
- ADRs 0001 e 0002 existiam; 0003/0004/0005 não existiam (confirmado) ✅

### 2. Investiguei os "prompts duplicados" (o próximo passo que você identificou)

Li **todos os 13 arquivos de prompt** (4.052 linhas) + o dossiê Scheffer gerado (1.181 linhas). **Conclusão importante: a duplicação real é muito menor do que parecia.**

- **O que VOCÊ viu no dossiê** ("5× SCHEFFER & CIA LTDA", "4× Qualificação: Sócio-Administrador") **NÃO é bug de prompt** — é o template per-sócio em `teia-deep.ts` emitindo os mesmos campos para cada sócio (todos da mesma matriz). É design do template, não copy-paste.
- **A única duplicação real** é o bloco `<inline_citation_rule>` (560 chars) copiado 8× verbatim em `specialist-prompts.ts` = 3.920 chars redundantes. **Seguro de consolidar** (com snapshot update no mesmo PR).
- **SHARED\_\* blocks estão DRY** (11 blocos em `foundation.ts` corretamente importados via `builders.ts`, zero copy-paste).
- **3 cópias divergentes do prompt-leak-shield** (`textCleaners.ts` live + `promptLeakShield.ts` órfão + `api/gemini.ts` cópia local) — **NÃO mexer agora** (Princípio 4: não entendo por que 3 cópias existem; deixar para Fase 9).
- **"Nota de escopo:" vazou no dossiê** — meta-instrução parafraseada pelo modelo que o shield não pega. Fácil de adicionar 2 patterns (risco baixo).

→ Plano completo de limpeza (com ordem por segurança) em: `docs/management/prompts-cleanup-plan-2026-06-29.md`

### 3. Concluí a Fase 6 — 3 ADRs criados (5/5 god components documentados)

| ADR      | Arquivo                                       | LOC  | Linhas ADR       |
| -------- | --------------------------------------------- | ---- | ---------------- |
| 0001     | `waterfall-orchestrator.ts`                   | 1604 | 380 (já existia) |
| 0002     | `App.tsx`                                     | 702  | 193 (já existia) |
| **0003** | `services/llm/investigation-orchestration.ts` | 678  | **429 (novo)**   |
| **0004** | `services/clientLookupService.ts`             | 741  | **613 (novo)**   |
| **0005** | `api/gemini.ts`                               | 680  | **521 (novo)**   |

Cada ADR segue o template do ADR-0001 (9 seções) e aplica o **Princípio 14 (honestidade)**: divide em "O que entendo que faz" vs "O que NÃO entendo completamente". Os ADRs **documentam como débito conhecido** — não refatoram (Princípio 4).

---

## ⚠️ DISCREPÂNCIAS ENCONTRADAS NO HANDOFF (Princípio 6 em ação)

O grep pegou 2 imprecisões no handoff V2:

1. **Linha do `useGrounding ?? false`**: handoff dizia `api/gemini.ts:428`, mas está na **linha 440** (offset +12). Decisão 13 está correta semanticamente, só o número da linha estava errado.
2. **Endpoints Gemini residuais**: handoff dizia **3** (`docs-rag`, `radar-scan`, `documentExtractor`), mas grep encontrou **5** — faltaram `api/gerar-dossie.ts` e `api/rag.ts`. Isto significa que a remoção do `GEMINI_API_KEY` do Vercel (Decisão 14) pode quebrar **mais endpoints do que o esperado**.

Ambas documentadas no ADR-0005. **Não são críticas**, mas valem a correção no próximo handoff.

---

## 🎯 O QUE VOCÊ (BRUNO) FAZ AGORA

### Imediato (antes de qualquer edição de prompt)

```bash
cd NOVO-APP
git fetch origin main
git log origin/main -3   # deve mostrar 61ced7bc no topo
git tag pre-prompts-cleanup
git push origin pre-prompts-cleanup
```

### Próximos passos (em PRs separados — Princípio 3)

1. **Abrir chat Z.ai novo** e pedir para a DeepSeek executar o `docs/management/prompts-cleanup-plan-2026-06-29.md`
2. **Ordem recomendada:**
   - PR #1: deletar órfão `promptLeakShield.ts` (H1) — 5 min, risco baixo
   - PR #2: adicionar 2 patterns de leak-shield (H3) — 15 min, risco baixo
   - **Decidir comigo:** H2 (template per-sócio do teia-deep) é design — quer repetir ou consolidar?
   - PR #3: consolidar `inline_citation_rule` 8× → 1 constante (H4) — 30 min, risco médio, **validar hashes de output idênticos antes do merge**
3. **Fase 7** (1 arquivo): refatorar `api/cron-email-confirmation.ts` para `createClient` (mesmo padrão PR #397). ~1h, risco baixo.
4. **NÃO executar H5 (3 cópias leak-shield) nem H6 (PRESSOES/PRESSAO)** nesta fase.

### Antes de cada merge (Princípio 9)

Pedir resumo em português linha-a-linha para a DeepSeek. Se não conseguir explicar, não mergear.

### Após 23h (Princípio 7)

PR draft, nunca merge. Merge é decisão irreversível que afeta 20 usuários reais.

---

## 📊 ESTADO DO PROJETO APÓS ESTA SESSÃO

| Métrica                     | Antes     | Depois                       | Meta          |
| --------------------------- | --------- | ---------------------------- | ------------- |
| ADRs criados (Fase 6)       | 2/5       | **5/5 ✅**                   | 5             |
| God components documentados | 2         | **5 (todos) ✅**             | 5             |
| Plano de prompts            | —         | **documentado ✅**           | —             |
| Progresso Plano V3          | ~75%      | **~80%**                     | 100%          |
| Fase 7 (service-role key)   | 1 arquivo | 1 arquivo                    | 0             |
| Fase 8 (consolidar .md)     | 157 .md   | 157 .md (+2 novos de gestão) | ≤30           |
| Fase 9 (self-audit)         | pendente  | pendente                     | docs/audit.md |

**Restam ~2 semanas:** Fase 7 (1 arquivo) + Fase 8 (consolidar 157→≤30 .md) + Fase 9 (self-audit 97 itens) + execução do plano de prompts.

---

## 📂 ARQUIVOS CRIADOS NESTA SESSÃO

```
NOVO-APP/docs/adr/0003-investigation-orchestration-god-component.md  (429 linhas)
NOVO-APP/docs/adr/0004-client-lookup-service-god-component.md         (613 linhas)
NOVO-APP/docs/adr/0005-api-gemini-god-component.md                    (521 linhas)
NOVO-APP/docs/management/prompts-cleanup-plan-2026-06-29.md           (plano de limpeza)
```

**NÃO fiz commit/push** — você revisa e decide quando committar (Princípio 7 + 9). Sugiro um commit por ADR + um commit para o plano de prompts, com mensagem em português.

---

## 🧠 REGRAS DE OURO DESTA SESSÃO (levar para a próxima)

1. **Princípio 6 pegou 2 erros no handoff** — sempre grep-validar claims, mesmo de handoff de IA gestora anterior.
2. **A "duplicação" que você viu no dossiê NÃO era bug de prompt** — era design do template. Investigar antes de "corrigir".
3. **3 cópias do leak-shield** = débito, não bug. Deixar para Fase 9.
4. **Markers `[[PORTA:*]]` são contrato de máquina** — 1 caractere quebra o parser. O plano H4 foi desenhado para NÃO tocar em nenhum caractere de prompt, apenas na forma de incluí-lo.
5. **ADRs honestos (Princípio 14)** — cada um tem seção "O que NÃO entendo completamente". Isto é maturidade sênior, não fraqueza.

---

**Fim do resumo. Próximo passo: executar `docs/management/prompts-cleanup-plan-2026-06-29.md` (PRs separados) + Fase 7.**

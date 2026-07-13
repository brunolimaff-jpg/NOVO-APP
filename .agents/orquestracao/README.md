# Orquestração Determinística por Cartão de Missão — Fase 3A

> **Fonte canônica da Fase 3A.** Esta camada transforma a instrução do Bruno
> em um plano de execução determinístico e auditável, sem executar agentes reais.

---

## Visão geral

A Fase 3A introduz um pipeline de planejamento dry-run que:

1. Recebe um **Cartão de Missão** (JSON estruturado).
2. Valida entrada, autorização, papéis, skills e adaptadores.
3. Produz um **Plano de Execução** determinístico.
4. Gera **evidências** de cada decisão.

```
Instrução do Bruno
      ↓
Cartão de Missão
      ↓
Autorização (A0-A6)
      ↓
Papel canônico (7 papéis)
      ↓
Skills aprovadas (registry.yaml)
      ↓
Adaptador compatível (mapa-adaptadores.yaml)
      ↓
Plano de Execução
```

---

## Modo dry-run

A Fase 3A **não executa**:

- Subagentes reais.
- Skills.
- Shell da missão.
- Delivery-loop.
- Edição de código funcional.
- Commits automáticos da missão.
- PRs automáticos da missão.
- Merge.
- Deploy.

Ela **somente planeja** e valida.

---

## Arquivos canônicos

| Arquivo | Função |
|---------|--------|
| `cartao-missao.schema.json` | Schema JSON do Cartão de Missão (entrada) |
| `contrato-plano.schema.json` | Schema JSON do Plano de Execução (saída) |
| `roteamento.yaml` | Tabela de intenções → papéis + autorização A0-A6 |
| `politica-despacho.md` | Regras de despacho (filtros, proibições, estados) |
| `contrato-evidencias.yaml` | Dimensões de evidência que o plano deve registrar |
| `exemplos/*.json` | 5 cartões de exemplo (positivos e negativos) |

---

## CLI dry-run

```bash
# Planejar e salvar em arquivo
ruby scripts/plan-agent-mission.rb \
  --input .agents/orquestracao/exemplos/exploracao-readonly.json \
  --output /tmp/plano.json

# Planejar e imprimir na stdout
ruby scripts/plan-agent-mission.rb \
  --input .agents/orquestracao/exemplos/exploracao-readonly.json \
  --stdout
```

---

## Validação e testes

```bash
# Validar toda a camada de orquestração
ruby scripts/validate-agent-orchestration.rb

# Rodar testes (30+ cenários)
ruby scripts/test-agent-orchestration.rb
```

---

## Cartão de Missão

### Campos obrigatórios

`versao`, `id`, `titulo`, `objetivo`, `contexto`, `resultado_esperado`, `autorizacao`, `escopo`, `restricoes`, `verificacao`, `evidencias_requeridas`, `condicoes_parada`.

### Autorização

```yaml
autorizacao:
  nivel: A0-A6
  acoes_permitidas: [...]
  acoes_proibidas: [...]
```

| Nível | Significado |
|-------|-------------|
| A0 | Somente leitura |
| A1 | Planejar e artefatos |
| A2 | Edição local |
| A3 | Commit |
| A4 | Push e PR |
| A5 | Merge (exige token `MERGE`) |
| A6 | Deploy ou operação irreversível |

---

## Roteamento de papéis

| Intenção | Papel |
|----------|-------|
| Compreender ou mapear código | `explorador` |
| Encontrar causa raiz | `investigador-incidentes` |
| Desenhar solução | `planejador-solucao` |
| Implementar mudança | `executor-escopo` |
| Revisar contratos, APIs ou tipos | `revisor-contratos` |
| Validar entrega, testes ou CI | `validador-entrega` |
| Revisar evidências e factualidade | `revisor-evidencias-dossie` |

Apenas `executor-escopo` possui escrita padrão.

---

## Seleção de skills

Filtros obrigatórios (todos devem passar):

1. `tipo: skill` (não fluxo).
2. `selecionavel_por_missao: true`.
3. Status aprovado ou aprovado-com-restricoes.
4. Papel solicitante em `papeis_permitidos`.
5. Ferramenta selecionada em `ferramentas_compativeis`.
6. Autorização suficiente.
7. Rede compatível.
8. Shell compatível.
9. Caminho existe.
10. Hash válido (SHA-256).
11. Sem delegação.
12. Sem conflito de escopo (skill mutante não para leitor).

**`delivery-loop` nunca aparece em `skills_selecionadas`.**

---

## Delivery-loop

Tratado exclusivamente como `tipo: fluxo`.

- Pode ser referenciado no plano.
- Não pode ser executado na Fase 3A.
- Não entra em `skills_selecionadas`.
- Exige intenção explícita.
- Para em `REPORT_READY`.

---

## Fase 3A vs Fase 3B

| Aspecto | Fase 3A (atual) | Fase 3B (futura) |
|---------|-----------------|-------------------|
| Modo | Dry-run (planejar somente) | Execução real |
| Agentes | Não iniciados | Iniciados conforme plano |
| Skills | Não executadas | Executadas conforme seleção |
| Shell | Não executado | Executado com sandbox |
| Merge/Deploy | Negado | Condicionado a A5/A6 |
| Saída | Plano JSON + evidências | Resultados de execução |

---

## Fontes de decisão

O planner consulta exclusivamente estes arquivos canônicos:

- `.agents/orquestracao/roteamento.yaml`
- `.agents/skills/registry.yaml`
- `.agents/skills/compatibilidade.yaml`
- `.agents/adaptadores/mapa-adaptadores.yaml`
- `.agents/governanca/contrato-comunicacao-bruno.md`
- `.agents/papeis/README.md`

Nenhuma fonte externa ou inferência por LLM é usada no roteamento.

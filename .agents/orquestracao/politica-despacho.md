# Política de Despacho — Orquestração Determinística

> **Fonte canônica.** Este documento define as regras de despacho da Fase 3A.
> Nenhum adaptador, papel, skill ou ferramenta pode ampliar autorização.

---

## 1. Pipeline de despacho

```
Cartão de Missão
    ↓
1. Validar entrada (schema, campos obrigatórios)
    ↓
2. Validar autorização (A0-A6, ações permitidas/proibidas)
    ↓
3. Selecionar papel (roteamento.yaml + objetivo)
    ↓
4. Selecionar skills (registry.yaml + filtros)
    ↓
5. Selecionar adaptador (mapa-adaptadores.yaml + ferramenta)
    ↓
6. Verificar conflitos (escrita × papel × autorização)
    ↓
7. Verificar proibições (merge, deploy, rede, shell, delegação)
    ↓
8. Gerar plano determinístico (contrato-plano.schema.json)
    ↓
9. Produzir evidências da decisão (contrato-evidencias.yaml)
```

---

## 2. Seleção de papel

### 2.1 Ordem de precedência

1. Se `papel_preferido` está presente e é compatível com o objetivo → usar preferido.
2. Senão, aplicar tabela de roteamento (`roteamento.yaml`) cruzando palavras-chave com `objetivo`.
3. Se ambiguidade material (2+ papéis com mesma pontuação) → status `incompleto`.

### 2.2 Regras

- Não selecionar papel com base apenas em palavra isolada.
- Apenas `executor-escopo` possui escrita padrão.
- Papel nunca amplia autorização.
- Missões multipapel devem indicar `papel_principal` e `papeis_auxiliares`.
- Nenhum papel é realmente iniciado nesta fase (dry-run).

### 2.3 Classe de execução

| Classe | Pode escrever | Pode executar shell |
|--------|--------------|--------------------|
| Leitor | Não | Não |
| Executor | Sim | Sim |

A classe de execução é definida pelo papel, não pelo cartão. O cartão pode **restringir**, nunca **ampliar**.

---

## 3. Seleção de skills

### 3.1 Filtros obrigatórios (todos devem passar)

| # | Filtro | Fonte |
|---|--------|-------|
| 1 | `tipo: skill` | `registry.yaml` |
| 2 | `selecionavel_por_missao: true` | `registry.yaml` |
| 3 | Status `aprovada` ou `aprovada-com-restricoes` | `registry.yaml` |
| 4 | Papel solicitante está em `papeis_permitidos` | `registry.yaml` |
| 5 | Ferramenta selecionada está em `ferramentas_compativeis` | `registry.yaml` |
| 6 | Autorização do cartão ≥ autorização necessária da skill | Cruzamento |
| 7 | Rede compatível (skill exige rede → cartão permite rede) | Cruzamento |
| 8 | Shell compatível (skill exige shell → papel permite shell) | Cruzamento |
| 9 | Caminho existe no filesystem | Validação |
| 10 | Hash válido (SHA-256 do arquivo == hash declarado) | Validação |
| 11 | Sem delegação (`pode_delegar: false`) | `registry.yaml` |
| 12 | Sem conflito com escopo (skill mutante não para leitor) | Cruzamento |

### 3.2 Regras absolutas

- `delivery-loop` **nunca** aparece em `skills_selecionadas` (tipo: fluxo).
- Fluxo nunca é tratado como skill.
- Skill mutante não pode ser atribuída a papel leitor.
- Skill global não aprovada localmente deve ser negada.
- Skill não auditada deve ser negada.
- Skill solicitada não é automaticamente aprovada.
- Hash divergente gera negação.
- Skill incompatível com ferramenta gera negação ou `incompleto`.

### 3.3 Matriz mutante × papel

| Skill pode_escrever? | Papel é leitor? | Resultado |
|---------------------|-----------------|-----------|
| Sim | Sim | Negar |
| Sim | Executor | OK (se demais filtros passarem) |
| Não | Leitor | OK |
| Não | Executor | OK |

---

## 4. Seleção de adaptador

### 4.1 Critérios

1. Ferramenta deve estar em `ferramentas_permitidas` do cartão.
2. Ferramenta deve ter adaptador para o papel selecionado em `mapa-adaptadores.yaml`.
3. Adaptador deve ter `caminho` não-nulo (arquivo materializado).

### 4.2 Classificações de validação

| Status | Significado |
|--------|-------------|
| `validado` | Smoke test funcional executado e documentado |
| `parcialmente-validado` | Validação parcial, limitações conhecidas |
| `ativo-sem-smoke-test` | Arquivo existe mas sem smoke test |
| `parcial-por-superficie` | Documentado por superfície, não materializado |
| `suporte-documentado-nao-validado-localmente` | Sem prova local |
| `bloqueado` | Bloqueado por limitação técnica |

### 4.3 Regras

- Limitações da ferramenta devem aparecer em `avisos`.
- Não declarar `validado` uma superfície apenas documentada.
- Ausência de adaptador gera `negado` ou `incompleto`.
- Cline IDE não atende executor (subagents são read-only).

---

## 5. Delivery-loop

- Tipo: `fluxo` — tratado exclusivamente como fluxo, nunca como skill.
- Pode ser referenciado no plano via `fluxo_selecionado`.
- **Não pode ser executado** na Fase 3A.
- Não entra em `skills_selecionadas`.
- Deve mostrar as etapas que seriam acionadas.
- Deve parar em `REPORT_READY`.
- Merge e deploy continuam fora dele sem autorização própria.
- `SKILL.md` do delivery-loop não deve ser alterado.

---

## 6. Estados do plano

| Estado | Quando |
|--------|--------|
| `planejado` | Todos os filtros passaram, sem restrições materiais |
| `planejado-com-restricoes` | Plano viável mas com avisos ou limitações conhecidas |
| `negado` | Ação proibida detectada (merge sem A5, deploy sem A6, etc.) |
| `incompleto` | Dados insuficientes para planejar (ambiguidade, sem adaptador, etc.) |

---

## 7. Determinismo

- Mesma entrada e mesma base devem gerar a mesma saída.
- Ordenar listas sem significado semântico (skills, avisos, fontes_decisao).
- Chaves JSON ordenadas alfabeticamente na serialização.
- Timestamps e IDs aleatórios proibidos no plano.

---

## 8. Segurança do CLI

- Somente leitura (exceto arquivo `--output`).
- Sem rede.
- Sem execução de skill.
- Sem execução de agente.
- Sem shell da missão.
- Sem alteração de Git.
- Escrita somente no arquivo indicado por `--output`.
- Path traversal impedido (rejeitar `..`, `~`, caminhos absolutos suspeitos).
- Exit code não-zero para entrada inválida ou erro interno.
- Plano negado é saída válida com exit code zero.

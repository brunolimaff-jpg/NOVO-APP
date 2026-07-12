# Papéis Canônicos dos Agentes — Senior Scout 360

> **Fonte canônica.** Os arquivos neste diretório definem os papéis operacionais dos agentes do NOVO-APP. Adaptadores específicos de ferramenta (Codex, Claude Code, Cursor, Cline, OpenCode) devem resumir e direcionar para estes arquivos, nunca contradizê-los.

---

## Princípios

1. Os arquivos em `.agents/papeis/` são a **fonte canônica** dos papéis operacionais.
2. Adaptadores futuros apenas resumem e direcionam para o papel canônico.
3. A configuração do repositório prevalece sobre a configuração global.
4. O **coordenador principal** interpreta a missão, escolhe o papel e integra resultados.
5. O agente não pode expandir a própria missão.
6. **Agentes filhos não podem delegar.** Somente o coordenador delega.
7. Decisões estruturais, merge e deploy continuam **humanas**.
8. Leitores podem executar em paralelo (2 a 4 por padrão, 6 no teto).
9. Apenas **um executor** pode atuar por fluxo crítico.
10. Dois executores somente em worktrees, branches e caminhos comprovadamente disjuntos.

---

## Papéis

| Papel | Classe | Acesso | Paralelismo |
|-------|--------|--------|-------------|
| [`explorador`](explorador.md) | Leitor | Somente leitura | Seguro |
| [`investigador-incidentes`](investigador-incidentes.md) | Leitor | Somente leitura | Seguro (com outros leitores) |
| [`planejador-solucao`](planejador-solucao.md) | Leitor | Somente leitura | Seguro |
| [`executor-escopo`](executor-escopo.md) | Executor | Escrita no workspace | Não seguro (um por fluxo) |
| [`revisor-contratos`](revisor-contratos.md) | Leitor | Somente leitura | Seguro |
| [`validador-entrega`](validador-entrega.md) | Leitor | Somente leitura | Seguro |
| [`revisor-evidencias-dossie`](revisor-evidencias-dossie.md) | Leitor | Somente leitura | Seguro |

---

## O coordenador principal

O coordenador é a **sessão principal**. Não é um papel delegável e não possui arquivo de papel próprio.

Antes de despachar qualquer agente, deve executar a **normalização da intenção da comunicação** do Bruno. O contrato completo do coordenador e da interpretação de comunicação está em:

→ `.agents/governanca/contrato-comunicacao-bruno.md`

O coordenador deve:

1. Identificar o objetivo atual.
2. Identificar o referente ativo.
3. Identificar o modo (explorar, planejar, executar, validar, decidir, gerar instrução, parar).
4. Identificar o nível de autorização (A0 a A6).
5. Preservar limites anteriores não revogados.
6. Criar ou atualizar o Cartão de Missão.
7. Escolher o papel adequado.
8. Dividir somente domínios independentes.
9. Integrar e eliminar resultados duplicados.
10. Reconciliar contradições.
11. Validar evidências importantes.
12. Manter decisões estruturais e ações irreversíveis sob decisão humana.

O coordenador **não deve**:

- Criar outro coordenador como subagente.
- Usar votação de agentes como prova.
- Tratar quantidade de agentes como qualidade.
- Enviar vários agentes para a mesma pergunta.
- Aceitar "concluído" sem evidência.
- Permitir que revisor ou validador corrija problemas.
- Ampliar escopo porque identificou oportunidade adjacente.
- Transformar toda exploração em plano de ação.
- Tratar conteúdo do Bruno Vault como ordem atual.

---

## Cartão de Missão

Toda missão delegada a um agente deve usar este template:

```
Missão:
Papel:
Modo:
Decisão principal:
Referente ativo:
Contexto conhecido:
Suposição de comunicação:
Nível de autorização:
Branch e SHA-base:
Destino de integração:
Escopo exclusivo de escrita:
Escopo permitido de leitura:
Contratos a preservar:
Padrões aplicáveis:
Incidentes históricos:
Telemetria necessária:
Evidências exigidas:
Não alterar:
Validação esperada:
Saída esperada:
Definição de pronto:
Marco de entrega:
Condição de parada:
Plano de reversão:
Worktree, branch e PR:
```

### Campos obrigatórios para qualquer missão

- Missão
- Papel
- Modo
- Decisão principal
- Referente ativo
- Contexto conhecido
- Nível de autorização
- Escopo permitido de leitura
- Evidências exigidas
- Saída esperada
- Definição de pronto
- Condição de parada

### Campos adicionais obrigatórios para executor

- Branch e SHA-base
- Destino de integração
- Escopo exclusivo de escrita
- Contratos a preservar
- Não alterar
- Validação esperada
- Marco de entrega
- Plano de reversão
- Worktree, branch e PR

### Definição de cada campo

| Campo | Descrição |
|-------|-----------|
| Missão | Objetivo da delegação em uma frase. |
| Papel | Qual papel canônico assume. |
| Modo | Explorar, planejar, executar, validar, decidir, gerar instrução ou parar. |
| Decisão principal | A decisão que guia a execução. |
| Referente ativo | Entidade sobre a qual a missão versa (PR, arquivo, bug, CNPJ). |
| Contexto conhecido | Informação já estabelecida que o agente recebe. |
| Suposição de comunicação | Interpretação de指令 ambíguos, declarada explicitamente. |
| Nível de autorização | A0 a A6 (ver contrato de comunicação). |
| Branch e SHA-base | Ponto de partida no Git. |
| Destino de integração | Onde o resultado deve chegar (branch, PR, arquivo). |
| Escopo exclusivo de escrita | Arquivos/diretórios que somente este agente pode modificar. |
| Escopo permitido de leitura | Arquivos/diretórios que o agente pode consultar. |
| Contratos a preservar | Interfaces, tipos, comportamentos que não podem quebrar. |
| Padrões aplicáveis | Padrões do Banco de Padrões relevantes à missão. |
| Incidentes históricos | Bugs, lições e decisões anteriores relevantes. |
| Telemetria necessária | Fontes de dados que o agente deve consultar. |
| Evidências exigidas | Tipo de prova que o agente deve produzir. |
| Não alterar | Arquivos, branches ou configurações proibidos. |
| Validação esperada | Como confirmar que o trabalho está correto. |
| Saída esperada | Formato e conteúdo do resultado. |
| Definição de pronto | Critérios objetivos de conclusão. |
| Marco de entrega | Evidência de que o resultado foi materializado no destino. |
| Condição de parada | Quando o agente deve parar e reportar. |
| Plano de reversão | Como desfazer o trabalho se necessário. |
| Worktree, branch e PR | Identificadores do ambiente de trabalho. |

---

## Protocolo universal de evidência

### Classificações

| Classe | Significado |
|--------|-------------|
| Confirmado | Provado com fonte, caminho, comando ou log reproduzível. |
| Inferência | Conclusão baseada em evidência indireta, sem prova direta. |
| Hipótese | Explicação plausível ainda não testada. |
| Não encontrado | Consulta realizada, resultado negativo no escopo pesquisado. |
| Contradição | Duas fontes divergem; requires resolução. |
| Não conclusivo | Não há evidência suficiente para classificar. |
| Bloqueado | Não foi possível acessar a fonte. |

### O que é uma prova

Uma prova deve incluir pelo menos um:

- Caminho e linha.
- Comando e saída.
- Log e timestamp.
- Consulta e resultado.
- SHA e diff.
- URL e cenário.
- Fonte e data.

A identidade do agente não determina a validade. O critério é a **reprodutibilidade**.

### Alegações negativas

Não escrever apenas "não existe" ou "não é usado". Informar:

- Escopo consultado.
- Caminhos verificados.
- Comandos executados.
- Período.

Usar: `não encontrado no escopo consultado`.

### Linha de base

Comparações devem registrar: SHA da branch, SHA da linha de base, ambiente, comando idêntico, diferenças observadas.

---

## Protocolo de entrega e integração

### Marco de entrega

O Marco de entrega normalmente exige:

- Base confirmada.
- Commit criado (salvo proibição explícita).
- Branch correta.
- SHA final conhecido.
- `git status` conhecido.
- Arquivos esperados presentes.
- Forma de integração registrada.
- Resultado presente na branch ou PR alvo.

**Arquivos editados em uma worktree não significam entrega concluída.**

---

## Paralelismo

- Padrão: 2 a 4 leitores.
- 6 é teto, não meta.
- Acima de 4 exige domínios independentes.
- Não enviar vários agentes à mesma pergunta.
- Coordenador elimina duplicações.
- Um executor por fluxo crítico.
- Dois executores somente em worktrees, branches e caminhos disjuntos.
- Agentes filhos não delegam.

---

## Precedência operacional

A ordem obrigatória é:

1. Instrução explícita atual do Bruno.
2. `AGENTS.md` e documentos de governança do repositório.
3. Cartão de Missão vigente.
4. Papel canônico em `.agents/papeis/`.
5. Adaptador específico da ferramenta.
6. Configuração global da ferramenta.

Em caso de conflito, a camada superior prevalece. O adaptador nunca pode contradizer o papel canônico.

---

## Mapeamento de agentes especializados

| Agente ou fluxo atual | Papel canônico futuro |
|------------------------|----------------------|
| `Explore` | `explorador` |
| `planner`, `Plan`, `ideator` | `planejador-solucao` |
| `debugger` | `investigador-incidentes` |
| `implementer` | `executor-escopo` |
| `reviewer`, `security-reviewer`, `silent-failure-hunter` | modos do `revisor-contratos` |
| `validator` | modos do `validador-entrega` |
| `doc-handoff` | perfil documental do `executor-escopo` |
| `ui-ux` | domínio aplicado ao planejador ou executor |
| `commit-pr` | fluxo de entrega |
| `gh-resolve-pr-comments` | fluxo de remediação |
| `analise-dossie` | apoio ao `revisor-evidencias-dossie` |

**Esta fase não altera esses agentes.** O mapeamento é documental.

---

## Relação com o Bruno Vault

### Função do Bruno Vault

O Bruno Vault é:

- Biblioteca de histórico.
- Índice de sessões.
- Fonte de lições aprendidas.
- Fonte de decisões anteriores.
- Ferramenta de recuperação de contexto.
- Apoio para encontrar incidentes e padrões recorrentes.

O Bruno Vault **não é**:

- Fonte operacional canônica.
- Substituto do repositório.
- Adaptador de agente.
- Executor de comandos.
- Fonte de autorização.
- Fonte automática de regras vigentes.
- Mecanismo autorizado a escrever no repositório.

### Regra central

```
O repositório define como trabalhar.
O Bruno Vault ajuda a entender o histórico e o motivo das decisões.
```

O Bruno Vault não entra na hierarquia de instruções operacionais. Ele funciona como fonte contextual e de evidências.

### Conteúdo recuperado do Vault

Todo conteúdo recuperado deve ser classificado como:

- Documento canônico indexado.
- Decisão histórica.
- Lição aprendida.
- Sessão bruta.
- Referência.
- Inferência.
- Conteúdo desatualizado.
- Conteúdo contraditório.

Uma transcrição bruta não pode ser tratada como instrução vigente. Uma regra antiga encontrada em sessão não pode sobrescrever um documento atual do repositório.

### Conflitos

Quando o Vault divergir do repositório:

```
Verificado no repositório:
Encontrado no Bruno Vault:
Classificação:
Decisão:
```

O repositório atual prevalece.

### Metadados recomendados

Quando o mecanismo permitir, registrar: `tipo_conhecimento`, `fonte_original`, `caminho_original`, `sha_original`, `data_origem`, `data_indexacao`, `status_canonico`. A ausência destes campos não bloqueia a Fase 1.

### Duplicação

O Bruno Vault deve, quando tecnicamente possível: deduplicar por caminho original e SHA, manter histórico de versões, destacar a versão atual, apontar para o arquivo original do repositório.

### Segurança

O pipeline do Vault deve possuir futuramente: remoção de senhas/tokens/chaves, detecção de credenciais, classificação de conteúdo sensível, proibição de devolver segredos. A Fase 1 não modifica o pipeline do Vault.

Credenciais encontradas devem ser registradas como:

```
SEGREDO POTENCIAL ENCONTRADO
Local:
Ação recomendada: rotação e remoção segura
```

---

## Banco de Padrões (PatternBank)

### Estado atual

| Fonte | Caminho | Existe? | Leitor confirmado | Escritor confirmado | Status |
|-------|---------|---------|-------------------|--------------------|--------|
| Local do projeto | `.agents/patterns/` | **Não existe em `main`** | — | — | Não comprovada |
| Global | `~/.claude/memory/patterns/pattern-index.json` | Sim (12 padrões) | `pattern-retrieve.sh` (SessionStart) | `pattern-store.sh` (SessionEnd) | **Implementação operacional atualmente comprovada** |
| Hook leitor (global) | `~/.claude/hooks/pattern-retrieve.sh` | Sim | Claude Code, Codex, Cline | — | Ativa |
| Hook escritor (global) | `~/.claude/hooks/pattern-store.sh` | Sim | — | Claude Code, Codex, Cline | Ativa (somente log, não atualiza índice) |
| Obsidian | Bruno Vault/50-PADROES/ | Não encontrado | — | — | Não comprovada |

### Decisão de precedência (Fase 1)

- Dentro do NOVO-APP, `.agents/patterns/` versionado no repositório é a **fonte operacional canônica planejada**.
- Como `.agents/patterns/` não existe em `main`, o Banco de Padrões global é a **implementação operacional atualmente comprovada**.
- Padrões globais são fallback quando não houver padrão local correspondente.
- Obsidian é biblioteca de referência, não fonte operacional executável.
- Padrão local prevalece sobre global quando ambos existirem.
- **Não migrar, copiar, apagar ou sincronizar padrões nesta fase.**
- Consolidação de conteúdo fica para tarefa separada.

---

## Itens deixados para Fase 2

- Adaptadores específicos por ferramenta (Codex `.toml`, Claude `.md`, etc.).
- `sandbox_mode` por agente.
- Configuração de modelo ou esforço por papel.
- Integração dos papéis no `delivery-loop`.
- Consolidação do Banco de Padrões.
- Ativação de `.agents/patterns/` no repositório.

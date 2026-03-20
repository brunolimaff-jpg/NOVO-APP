# Playbook de Skills de IA

Este playbook define quando usar cada skill instalada no projeto e em qual ordem aplicar no fluxo de trabalho.

## Skills instaladas

- `super-brainstorm`
- `superhuman`
- `codedocs`
- `debugging-tools`
- `test-strategy`
- `playwright-testing`
- `clean-code`
- `skill-audit`
- `frontend-developer`
- `api-design`
- `observability`

## Fluxo padrão por tipo de tarefa

### 1) Feature nova (média/grande)

1. `super-brainstorm` para levantar decisões de arquitetura e dependências.
2. `api-design` se houver endpoint/contrato novo.
3. `frontend-developer` se houver telas/componentes.
4. `test-strategy` para definir suíte mínima (unit/integration/e2e).
5. `playwright-testing` para cenários críticos ponta a ponta.
6. `clean-code` para revisão final de legibilidade e manutenção.

### 2) Bug em produção

1. `debugging-tools` para reproduzir e isolar causa raiz.
2. `observability` para mapear sinais (erro, latência, logs, traces).
3. `test-strategy` para criar teste de regressão.
4. `clean-code` para garantir correção simples e segura.

### 3) Refatoração técnica

1. `super-brainstorm` para definir escopo e risco.
2. `clean-code` para guiar refatoração.
3. `test-strategy` para rede de segurança.
4. `playwright-testing` em fluxos impactados por UI.

### 4) Documentação e onboarding técnico

1. `codedocs` para gerar/atualizar mapa técnico.
2. `superhuman` para quebrar iniciativas longas em etapas executáveis.

## Regras de uso rápido

- Não usar `superhuman` para tarefas triviais (ex.: ajuste de texto).
- Em mudanças com risco de contrato, `api-design` é obrigatório antes de codar.
- Em mudanças visuais, `frontend-developer` + `playwright-testing` devem ser considerados em conjunto.
- Toda correção de bug crítico deve sair com teste de regressão definido em `test-strategy`.
- Quando uma skill sugerir ação destrutiva, confirmar antes de executar.

## Exemplos de prompts

### `super-brainstorm`

`Mapear a melhor estratégia para corrigir o fluxo de inicialização de sessão no App sem quebrar histórico e sidebar.`

### `api-design`

`Revisar o contrato de /api/radar-scan para suportar novas categorias sem erro de validação e com mensagens de falha úteis.`

### `frontend-developer`

`Revisar layout da tela de Nova Investigação para garantir usabilidade em desktop e mobile com sidebar recolhida por padrão.`

### `debugging-tools`

`Investigar por que o botão Iniciar investigação completa não dispara o fluxo no estado inicial vazio.`

### `test-strategy`

`Definir testes mínimos para proteger o fluxo: inicialização, criação de sessão e disparo da investigação.`

### `playwright-testing`

`Criar cenário e2e para preencher cadastro inicial e validar que a investigação inicia e renderiza primeira mensagem.`

### `observability`

`Definir sinais de monitoramento para falhas do radar (status HTTP, detalhe de erro, taxa de sucesso por categoria).`

### `skill-audit`

`Auditar skills instaladas e listar riscos críticos antes de adotar em produção.`

## Medição de ganho (piloto de 3 PRs)

- Tempo até identificar causa raiz de bug.
- Quantidade de ajustes pós-review.
- Cobertura de testes adicionada nos fluxos alterados.
- Número de regressões em até 7 dias após merge.

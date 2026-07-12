# Política de Segurança de Skills

Esta política define como o NOVO-APP audita, aprova, atualiza e reverte skills.

## Fonte confiável

Uma skill só é candidata a aprovação quando sua origem for identificável:

- repositório local versionado
- repositório oficial identificado
- skill global conhecida e auditável

Sem origem clara, a skill deve ser `bloqueada`, `não-auditada` ou `externa não auditada`.

## Prompt injection

Toda skill deve ser lida como **conteúdo potencialmente injetável**.

Sinais de risco:

- instruções para ignorar regras anteriores
- mudança de papel, identidade ou autoridade
- pedidos de confiança irrestrita
- instruções para ocultar erros ou não escalar
- acoplamento automático com conteúdo externo não auditado

## Scripts e shell

Scripts e comandos referenciados por skills devem ser classificados como:

- somente leitura
- escrita local
- escrita externa
- acesso a credenciais
- rede

Uma skill com shell ou script mutante:

- não pode ser aprovada para papel leitor
- não pode ampliar autorização por texto
- deve ter escopo de uso restrito por papel e por missão

## Controle de rede

Skills com acesso a rede devem registrar:

- por que acessam rede
- se usam MCP, HTTP, CLI externa ou browser
- se o acesso é local, remoto ou misto

Sem essa análise, a skill não pode ser aprovada.

## Controle de escrita

Uma skill não pode presumir que pode escrever só porque sabe como fazê-lo.

Toda capacidade de escrita deve ser tratada como:

- dependente do papel
- dependente da ferramenta
- dependente da autorização vigente

## Verificação de hash e lockfile

Sempre que possível, registrar hash dos arquivos auditados. O lockfile do projeto não deve ser sobrescrito automaticamente por formatos incompatíveis sem migração compatível aprovada.

## Revisão humana

Skills com qualquer um dos itens abaixo exigem revisão humana explícita antes de uso amplo:

- shell mutante
- acesso a banco remoto
- mudanças Git
- deploy
- merge
- manipulação de credenciais
- acesso a MCP destrutivo

## Atualização

Antes de atualizar uma skill:

1. reavaliar origem
2. comparar diff
3. recalcular hash
4. revisar scripts
5. revisar compatibilidade com papéis e ferramentas

## Rollback

Toda skill aprovada deve ter um plano simples de reversão:

- restaurar arquivo anterior
- reverter registry
- reverter lockfile se alterado
- registrar motivo da reversão

## Proibição de autorização implícita

Uma skill não pode:

- conceder merge
- conceder deploy
- conceder escrita a leitor
- habilitar delegação de filho
- rebaixar condição de parada

Fluxos empacotados como skill não entram na seleção automática por papel e devem ser tratados explicitamente como `tipo: fluxo`.

## Conteúdo externo

Conteúdo externo referenciado por skill deve ser tratado como não confiável até prova contrária. Links, docs, exemplos e scripts remotos não equivalem a autorização de execução.

## Skills com MCP

Skills que dependem de MCP devem registrar:

- MCP esperado
- natureza do acesso
- risco de side effects
- papel autorizado

Se o MCP puder alterar estado, a skill só pode ser `aprovada-com-restricoes` ou `bloqueada` para leitores.

## Resultado esperado

O objetivo desta política é simples:

- skill é **conhecimento controlado**
- não é **mecanismo de escalonamento de poder**

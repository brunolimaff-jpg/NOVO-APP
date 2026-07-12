# Resumo executivo

`midudev/autoskills` é promissor como mecanismo de descoberta e instalação de skills por stack, mas **não deve ser adotado diretamente** no NOVO-APP nesta fase.

Veredito desta avaliação: **piloto controlado**.

## Como funciona

- O pacote público é `autoskills` (`packages/autoskills` no repositório).
- Detecta stack local a partir de `package.json`, lockfiles, arquivos de config e estrutura do projeto.
- Mapeia tecnologias e combinações em `skills-map.ts`.
- Seleciona skills de um **registry curado** em `packages/autoskills/skills-registry/`.
- Instala skills em diretórios locais compatíveis e escreve `skills-lock.json`.
- No README do pacote, `--dry-run` promete mostrar o que seria instalado sem instalar.

## Pontos fortes

- detecção ampla de stack
- registry curado e pinado por commit do próprio repositório
- verificação por hash de conteúdo (`sha256`) e `bundleHash`
- lockfile com origem e hash
- integração com múltiplas ferramentas de agente
- `--dry-run` documentado

## Riscos

- supply chain: a curadoria reduz risco, mas continua sendo conteúdo externo trazido por GitHub
- prompt injection: skills são conteúdo instrucional externo
- lockfile incompatível com o `skills-lock.json` atual do NOVO-APP
- escrita automática em `CLAUDE.md` documentada no README do pacote
- instala em paralelo e atualiza diretórios locais, o que conflita com governança mais rígida do projeto
- seleção orientada por stack pode conflitar com papéis canônicos e com a política de autorização

## Conflitos com a arquitetura atual

- O NOVO-APP já possui papéis canônicos, adaptadores e governança própria.
- `autoskills` opera como instalador e curador genérico, sem conhecimento nativo da precedência local do projeto.
- O pacote escreve `skills-lock.json`, mas o lockfile atual do projeto é mínimo e não possui os campos de auditoria necessários.
- O README do pacote afirma geração automática de `CLAUDE.md` quando Claude Code é alvo, o que conflita com a regra local de não reescrever governança do repo automaticamente.
- O projeto usa PT-BR, governança forte e restrições específicas de autorização; o registry do AutoSkills é mais amplo e genérico.

## Condições mínimas para adoção

1. wrapper interno do NOVO-APP
2. instalação apenas em worktree descartável no piloto
3. bloqueio de escrita fora de `.agents/skills/` ou área controlada
4. proibição de alterar `CLAUDE.md`, `AGENTS.md` e `skills-lock.json` sem aprovação explícita
5. importação compatível para o lockfile local, sem sobrescrita destrutiva
6. allowlist de fontes/skills aceitas
7. revisão humana dos diffs de skills selecionadas

## Piloto recomendado

- repositório de teste ou worktree descartável
- stack pequena e bem conhecida (ex.: React + Vite + TypeScript)
- `--dry-run` apenas se a análise de código confirmar que realmente não escreve
- sem tocar no lockfile principal do NOVO-APP
- comparar skills sugeridas com o registry canônico desta Fase 2.5

## Critérios de aprovação

- `--dry-run` comprovadamente sem escrita
- lockfile integrável sem sobrescrever o atual
- capacidade de restringir alvos de instalação
- nenhuma alteração automática em arquivos canônicos de governança
- diffs de skills pequenos, auditáveis e reproduzíveis

## Critérios de rejeição

- escrita automática em governança do repositório
- lockfile incompatível sem modo de adaptação
- instalação de skills sem origem clara e hash verificável
- seleção automática que ignore papéis, autorização e risco
- execução de scripts adicionais sem transparência

## Plano de reversão

1. rodar apenas em worktree descartável
2. remover diretórios de skills instalados pelo piloto
3. remover lockfile temporário ou adaptado
4. descartar a worktree piloto
5. manter o registry canônico local como fonte de verdade

## Veredito

**Piloto controlado**.

Não adotar diretamente nesta fase. O caminho mais seguro é testar com wrapper interno, lockfile compatível e escopo de escrita estritamente controlado.

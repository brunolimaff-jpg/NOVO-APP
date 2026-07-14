# Manual pós-merge — instalação local do DCG no macOS (Bruno)

#

# DCG é segunda barreira. A autorização primária continua sendo o catálogo

# argv + agent_command_guard (fail-closed). Relatório de preflight NÃO é

# credencial e NÃO libera `--agent-runtime` na Fase 3B.3A.

#

# NÃO executar durante CI. NÃO instalar globalmente nesta PR.

## Versão pinada

- Ferramenta: destructive-command-guard
- Versão: **v0.6.6**
- Origem: https://github.com/Dicklesworthstone/destructive_command_guard
- Release: https://github.com/Dicklesworthstone/destructive_command_guard/releases/tag/v0.6.6
- Plataforma principal: **Darwin arm64** (`aarch64-apple-darwin`)
- Compat: Darwin x86_64 (`x86_64-apple-darwin`)

Asset oficial Apple Silicon (SHA256SUMS v0.6.6):

- arquivo: `dcg-aarch64-apple-darwin.tar.xz`
- sha256: `0d94fc8227d41521b27e9fe51e1bcd323a855fbe0df1a42fa17b2dc841c5c1ae`

## Passos

1. Identificar arquitetura: `uname -m` (esperado `arm64`).
2. Baixar **somente** o asset oficial da release v0.6.6 correspondente.
3. Verificar SHA-256 contra `SHA256SUMS` oficial (não confiar em espelhos).
4. Extrair e colocar o binário `dcg` no PATH do usuário (ex.: `~/.local/bin`).
5. Configurar o hook oficial do Codex CLI (`dcg install` / merge em `~/.codex/hooks.json` PreToolUse Bash) — **não** alterar hooks globais via esta missão.
6. Verificar com modo seguro: `dcg explain "git reset --hard"` ou `dcg test --format json "git reset --hard"`.
7. **Nunca** executar o comando destrutivo de exemplo no shell.

## Variáveis proibidas

- `DCG_BYPASS`
- `DCG_DISABLE`

## Integração Codex

Upstream documenta hook PreToolUse Bash apontando para `dcg`. Confirmar trust
humano do agente (`/hooks-trust` quando aplicável). Sem evidência programática
confiável → preflight mantém `hook_confiado: unknown`.

## Nota sobre fail-open do DCG

O DCG upstream pode falhar aberto em alguns erros de parse/timeout. Nosso
`agent_command_guard` permanece fail-closed e não é substituído pelo DCG.

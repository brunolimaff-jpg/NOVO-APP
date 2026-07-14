# Manual — instalação local do DCG no macOS (Bruno)

# DCG é segunda barreira. A autorização primária continua sendo o catálogo

# argv + agent_command_guard (fail-closed). Relatório de preflight NÃO é

# credencial de runtime.

#

# Runtime single-agent (3B.3B+) exige três chaves explícitas.

# Piloto supervisionado (3B.3C) exige seis chaves + readiness.

#

# NÃO executar durante CI. NÃO versionar o binário.

## Versão pinada

- Ferramenta: destructive-command-guard
- Versão: **v0.6.6**
- Origem: https://github.com/Dicklesworthstone/destructive_command_guard
- Release: https://github.com/Dicklesworthstone/destructive_command_guard/releases/tag/v0.6.6
- Plataforma principal: **Darwin arm64** (`aarch64-apple-darwin`)

### Asset (arquivo compactado)

- arquivo: `dcg-aarch64-apple-darwin.tar.xz`
- sha256: `0d94fc8227d41521b27e9fe51e1bcd323a855fbe0df1a42fa17b2dc841c5c1ae`

### Binário extraído (executável)

- sha256: `6f5ab54413f9142902d57462da9f3cd0902b00bfffb4c2d6c9b77f0fd2980b86`
- Proveniência: download oficial 2026-07-14; SHA do asset verificado **antes** da extração;
  temp apagado; binário **não** foi instalado pela missão de proveniência.

**Nunca** comparar o binário instalado com o SHA do `.tar.xz`.

## Ordem correta

1. Baixar o asset oficial da release v0.6.6.
2. Verificar checksum do **asset** (tar.xz).
3. Extrair somente após o asset bater.
4. Instalar o binário no PATH (ex.: `~/.local/bin/dcg`).
5. Verificar checksum do **binário** contra `binary_checksums_esperados`.
6. Adicionar hook DCG direto no PreToolUse Bash **sem remover** `guardian-block.sh`.
7. Executar probe seguro: `dcg test --format json "git reset --hard"` (nunca no shell).
8. Criar atestação humana: `ruby scripts/attest-dcg-hook.rb --ack TRUST_DCG_HOOK --hooks ~/.codex/hooks.json --dcg "$(command -v dcg)"`.
9. Executar `ruby scripts/check-pilot-readiness.rb --stdout`.
10. Somente então considerar `PILOT_READY` / piloto real sob autorização humana.

## Hook Codex (coexistência com guardian)

Formato observada em `~/.codex/hooks.json`: array `PreToolUse` com grupos `{matcher, hooks[]}`.

Manter o grupo existente:

- `matcher: Bash` → `guardian-block.sh`

Adicionar **outra** entrada (ou segundo comando no mesmo matcher) apontando para o
**caminho absoluto** do binário `dcg` (sem `bash -c` / `sh -c` / `eval`).

Exemplo ilustrativo (não aplicar automaticamente):

```json
{
  "matcher": "Bash",
  "hooks": [{ "type": "command", "command": "/Users/SEU_USER/.local/bin/dcg" }]
}
```

Guardian sozinho **não** concede `hook_confiado`. Sem atestação humana válida → `unknown`.

## Variáveis proibidas

- `DCG_BYPASS`
- `DCG_DISABLE`

## Readiness

```bash
ruby scripts/check-pilot-readiness.rb --stdout
```

Não executa piloto. Não define `AGENT_RUNTIME_EXECUTE` / `AGENT_RUNTIME_PILOT`.

## Nota sobre fail-open do DCG

O DCG upstream pode falhar aberto em alguns erros. Nosso `agent_command_guard`
permanece fail-closed e não é substituído pelo DCG.

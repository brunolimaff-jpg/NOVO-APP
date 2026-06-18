# Plano: Remover marketplace claude-code-skills

## Contexto

O marketplace `claude-code-skills` (repo `alirezarezvani/claude-skills`) injeta 196 comandos + 33 agentes + 756 skills de terceiros no namespace. O agente `migration-planner` do plugin `playwright-pro` (desse marketplace) está colidindo com o agente nativo `/planner` no autocomplete do Nimbalyst.

## Ação

1. ✅ Remover entrada `claude-code-skills` do bloco `extraKnownMarketplaces` em `~/.claude/settings.json`
2. ✅ Remover `engineering-skills@claude-code-skills: false` do bloco `enabledPlugins` (ficará órfão)
3. 🔴 Remover diretório físico `~/.claude/plugins/marketplaces/claude-code-skills` (52MB — repositório git)
4. 🔴 Remover diretório físico `~/.claude/plugins/cache/claude-code-skills` (6.5MB — cache de runtime)

> **Descoberta:** Os passos 1-2 não resolveram porque o Nimbalyst escaneia os diretórios em disco. O `migration-planner` continua sendo carregado do repositório git clonado em `marketplaces/`.

## Verificação

- `/planner` deve aparecer corretamente no autocomplete de agentes
- Nenhum agente/plugin nativo ou do `claude-plugins-official` deve ser afetado
- ~58.5MB liberados em disco

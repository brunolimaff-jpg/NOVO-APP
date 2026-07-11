# Scout 360 - Desenvolvimento Local (macOS)

## Executar com 1 Clique

### Metodo 1: Duplo-clique no Finder

```
1. Abra Finder
2. Navegue até: Documents/NOVO-APP/
3. Duplo-clique em: dev-local.command
4. O app abre automaticamente em http://localhost:3000
```

O servidor esta rodando. Edite `App.tsx`, `components/`, `hooks/`, `services/`, `api/` ou `utils/` e veja as mudancas em tempo real (HMR).

---

### Método 2: Terminal

```bash
cd ~/Documents/NOVO-APP
./dev-local.command
```

---

## O que o Script Faz

- Verifica Node.js e npm.
- Instala dependencias se faltarem.
- Inicia `npm run dev` (Vite).
- Aguarda o servidor ficar pronto.
- Abre automaticamente o navegador.

---

## Parar o Servidor

**No Terminal:**

```bash
Ctrl + C
```

Ou feche a janela do Terminal.

---

## Variaveis de Ambiente

Se precisar de `.env`:

```bash
cp .env.example .env
# Edite .env com suas configurações
```

O script carrega automaticamente.

---

## Hot Module Reload (HMR)

Todas as mudancas nos arquivos de aplicacao recarregam automaticamente no navegador.

```
Edite -> salve -> veja em tempo real
```

---

## 🔧 Troubleshooting

### Porta 3000 ja esta em uso

```bash
# Verifique qual processo está usando
lsof -i :3000

# Ou use outra porta:
npm run dev -- --port 3001
```

### Node não encontrado

```bash
# Instale Node.js via Homebrew
brew install node

# Ou via https://nodejs.org/
```

### Dependencies não instalam

```bash
rm -rf node_modules package-lock.json
npm install
```

---

## Local vs Vercel Preview

|                     | Local                  | Vercel Preview              |
| ------------------- | ------------------- | ---------------------- |
| **Tempo de reload** | HMR imediato        | build e deploy remoto  |
| **Uso**             | triagem de frontend | gate de runtime e UX   |
| **APIs**            | proxy para alvo     | handlers da branch     |
| **Aceite de PR**    | nao                 | sim                    |

O Vite local nao emula as serverless functions. Mudancas em `api/`, seguranca, LLM ou UX so estao validadas depois do Preview Vercel da PR.

---

## Workflow Recomendado

1. Desenvolvimento local: `./dev-local.command` ou `npm run dev`.
2. Triagem tecnica: comandos focados do repositorio.
3. Push para branch/PR: Vercel cria Preview automaticamente.
4. Aceite: checks remotos e Preview da mesma SHA; producao so apos `MERGE` explicito.

---

## Logs

Se algo der errado, o log está em:

```
/tmp/vite-dev.log
```

Verifique para diagnosticar problemas.

---

Para diagnostico de Preview, use logs Vercel, Sentry e `scout_diagnostics`; nao conclua por comportamento do Vite local.

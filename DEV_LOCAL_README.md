# 🚀 Scout 360 — Servidor Local (macOS)

## Executar com 1 Clique

### Método 1: Duplo-clique no Finder ⭐ (Recomendado)

```
1. Abra Finder
2. Navegue até: Documents/NOVO-APP/
3. Duplo-clique em: dev-local.command
4. O app abre automaticamente em http://localhost:5173
```

**Pronto!** O servidor está rodando. Edite os arquivos em `src/` e veja as mudanças em tempo real (HMR).

---

### Método 2: Terminal

```bash
cd ~/Documents/NOVO-APP
./dev-local.command
```

---

## ⚡ O que o Script Faz

✅ Verifica Node.js e npm  
✅ Instala dependências se faltarem  
✅ Inicia `npm run dev` (Vite)  
✅ Aguarda o servidor ficar pronto  
✅ Abre automaticamente o navegador  
✅ Mostra feedback visual colorido  

---

## 🛑 Parar o Servidor

**No Terminal:**
```bash
Ctrl + C
```

Ou feche a janela do Terminal.

---

## 📝 Variáveis de Ambiente

Se precisar de `.env`:

```bash
cp .env.example .env
# Edite .env com suas configurações
```

O script carrega automaticamente.

---

## 💡 Hot Module Reload (HMR)

Todas as mudanças em `src/` recarregam **automaticamente** no navegador — nenhum F5 necessário!

```
✨ Edite → Salve → Veja em tempo real
```

---

## 🔧 Troubleshooting

### Porta 5173 já está em uso

```bash
# Verifique qual processo está usando
lsof -i :5173

# Ou use outra porta:
VITE_PORT=5174 npm run dev
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

## 📊 Comparação: Local vs Vercel Deploy

| | Local | Vercel |
|---|---|---|
| **Tempo de reload** | ~200ms (HMR) | ~30-60s (build+deploy) |
| **Iteração UX** | ⚡ Instantâneo | ⏳ Lento |
| **Debugging** | 🔍 DevTools local | 🌐 Remote |
| **Ambiente** | Dev (sem auth real) | Produção |

**Use local para desenvolvimento rápido!**

---

## 🎯 Workflow Recomendado

1. **Desenvolvimento Local**: `./dev-local.command`
2. **Testes Locais**: `npm run test:watch`
3. **Build Final**: `npm run build`
4. **Deploy**: Push para `main` (Vercel auto-deploy)

---

## 📞 Logs

Se algo der errado, o log está em:
```
/tmp/vite-dev.log
```

Verifique para diagnosticar problemas.

---

**Happy coding! 🎉**

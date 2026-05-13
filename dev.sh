#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

# Cores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}🦅 Senior Scout 360 — Dev Server${NC}"
echo ""

# === Pré-checks ===

if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠️  .env não encontrado. Criando placeholder...${NC}"
    echo "GEMINI_API_KEY=preencher" > .env
    echo "PINECONE_API_KEY=preencher" >> .env
    echo "VITE_CLERK_PUBLISHABLE_KEY=pk_test_placeholder" >> .env
fi

if ! command -v vercel &>/dev/null; then
    echo "❌ Vercel CLI não instalado. Rode: npm i -g vercel"
    exit 1
fi

if ! command -v node &>/dev/null; then
    echo "❌ Node.js não encontrado"
    exit 1
fi

# === Instalar dependências se necessário ===
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}📦 Instalando dependências...${NC}"
    npm install
    echo ""
fi

# === Iniciar ===
echo -e "${GREEN}✅ Tudo pronto. Iniciando servidor...${NC}"
echo -e "${CYAN}   Frontend + API handlers → http://localhost:3000${NC}"
echo -e "${CYAN}   Pressione Ctrl+C para parar${NC}"
echo ""

exec vercel dev --listen 3000

#!/bin/bash

# ═══════════════════════════════════════════════════════════════════════════
# Scout 360 — Servidor Local macOS
# Execute com duplo-clique no Finder
# Abre o app automaticamente no navegador
# ═══════════════════════════════════════════════════════════════════════════

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Diretório do projeto
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR" || exit 1

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║${NC}  Scout 360 — Servidor Local${NC}                              ${BLUE}║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Verifica se Node está instalado
if ! command -v node &> /dev/null; then
    echo -e "${RED}✗ Node.js não encontrado${NC}"
    echo -e "${YELLOW}  Instale via: https://nodejs.org/${NC}"
    exit 1
fi

# Verifica se npm está instalado
if ! command -v npm &> /dev/null; then
    echo -e "${RED}✗ npm não encontrado${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Node$(node -v) | npm$(npm -v)${NC}"
echo ""

# Limpa node_modules se estiver corrompido (opcional, comentado)
# if [ -d "node_modules/.vite" ] && [ ! -f "node_modules/vite/bin/vite.js" ]; then
#     echo -e "${YELLOW}⚠ Limpando node_modules corrompidos...${NC}"
#     rm -rf node_modules
# fi

# Instala dependências se faltarem
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}📦 Instalando dependências...${NC}"
    npm install
    echo ""
fi

# Inicia o servidor Vite
echo -e "${YELLOW}🚀 Iniciando servidor Vite...${NC}"
echo ""

# Função para detectar quando o servidor está pronto
PORT=3000
MAX_WAIT=30
WAIT_COUNT=0

# Inicia npm run dev em background
npm run dev > /tmp/vite-dev.log 2>&1 &
DEV_PID=$!

# Aguarda o servidor ficar pronto (máximo 30 segundos)
while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
    if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
        break
    fi
    sleep 1
    WAIT_COUNT=$((WAIT_COUNT + 1))
done

if [ $WAIT_COUNT -ge $MAX_WAIT ]; then
    echo -e "${RED}✗ Timeout: servidor não iniciou${NC}"
    echo -e "${YELLOW}  Log: /tmp/vite-dev.log${NC}"
    kill $DEV_PID 2>/dev/null
    exit 1
fi

# Aguarda mais 2 segundos para garantir que está completamente pronto
sleep 2

echo -e "${GREEN}✓ Servidor iniciado com sucesso!${NC}"
echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║${NC}  Local App: ${GREEN}http://localhost:$PORT${NC}${BLUE}                     ║${NC}"
echo -e "${BLUE}║${NC}  PID: $DEV_PID${NC}${BLUE}                                               ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Abre o navegador
open "http://localhost:$PORT"

echo -e "${GREEN}📱 Navegador aberto em http://localhost:$PORT${NC}"
echo ""
echo -e "${YELLOW}💡 Dicas:${NC}"
echo -e "  • Edite App.tsx, components/, hooks/, services/ ou utils/ - HMR atualiza automaticamente"
echo -e "  • Abra DevTools: ${BLUE}Cmd + Option + I${NC}"
echo -e "  • Para parar o servidor: ${BLUE}Ctrl + C${NC}"
echo ""

# Aguarda o processo dev
wait $DEV_PID
EXIT_CODE=$?

echo ""
echo -e "${YELLOW}⚠ Servidor finalizado (código: $EXIT_CODE)${NC}"

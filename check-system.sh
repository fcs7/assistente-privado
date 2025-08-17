#!/bin/bash

# 🔍 WHMCS Assistant - System Check Ubuntu
# Verifica se todas as dependências estão instaladas corretamente

echo "🔍 WHMCS Assistant - Verificação do Sistema"
echo "==========================================="
echo ""

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Função para check com status visual
check_command() {
    local cmd=$1
    local name=$2
    local version_flag=$3
    
    if command -v "$cmd" &> /dev/null; then
        local version=""
        if [ -n "$version_flag" ]; then
            version=" ($(eval "$cmd $version_flag" 2>/dev/null | head -n1))"
        fi
        echo -e "${GREEN}✅${NC} $name$version"
        return 0
    else
        echo -e "${RED}❌${NC} $name - Não instalado"
        return 1
    fi
}

# Função para check de serviço
check_service() {
    local service=$1
    local name=$2
    
    if systemctl is-active --quiet "$service" 2>/dev/null; then
        echo -e "${GREEN}✅${NC} $name - Ativo"
        return 0
    elif systemctl is-enabled --quiet "$service" 2>/dev/null; then
        echo -e "${YELLOW}⚠️${NC} $name - Instalado mas parado"
        return 1
    else
        echo -e "${BLUE}ℹ️${NC} $name - Não instalado (opcional)"
        return 2
    fi
}

# Verificações do sistema
echo "🖥️  SISTEMA OPERACIONAL"
echo "====================="
echo "OS: $(lsb_release -d | cut -f2)"
echo "Kernel: $(uname -r)"
echo "Arquitetura: $(uname -m)"
echo ""

echo "📦 DEPENDÊNCIAS ESSENCIAIS"
echo "=========================="
check_command "node" "Node.js" "--version"
check_command "npm" "npm" "--version"
check_command "git" "Git" "--version"
check_command "curl" "cURL" "--version | head -n1"
check_command "jq" "jq" "--version"
check_command "pwgen" "pwgen" "--version 2>&1 | head -n1"
echo ""

echo "🔧 FERRAMENTAS DE BUILD"
echo "======================"
check_command "gcc" "GCC" "--version | head -n1"
check_command "g++" "G++" "--version | head -n1"
check_command "make" "Make" "--version | head -n1"
check_command "python3" "Python3" "--version"
echo ""

echo "🛠️  SERVIÇOS OPCIONAIS"
echo "====================="
check_service "redis-server" "Redis"
check_service "postgresql" "PostgreSQL"
check_service "docker" "Docker"
echo ""

echo "📁 PROJETO WHMCS ASSISTANT"
echo "=========================="

if [ -f "package.json" ]; then
    echo -e "${GREEN}✅${NC} package.json encontrado"
    
    # Verificar dependências instaladas
    if [ -d "node_modules" ]; then
        echo -e "${GREEN}✅${NC} node_modules (dependências instaladas)"
    else
        echo -e "${YELLOW}⚠️${NC} node_modules (execute: npm install)"
    fi
    
    # Verificar build
    if [ -d "dist" ] && [ -f "dist/server.js" ]; then
        echo -e "${GREEN}✅${NC} dist/ (projeto compilado)"
    else
        echo -e "${YELLOW}⚠️${NC} dist/ (execute: npm run build)"
    fi
    
    # Verificar .env
    if [ -f ".env" ]; then
        echo -e "${GREEN}✅${NC} .env encontrado"
        
        # Verificar configurações essenciais
        essential_vars=("OPENAI_API_KEY" "OPENAI_ASSISTANT_ID" "WHMCS_API_URL" "WHMCS_IDENTIFIER" "WHMCS_SECRET" "WHATICKET_URL" "WHATICKET_TOKEN")
        configured_count=0
        
        for var in "${essential_vars[@]}"; do
            if grep -q "^$var=" .env && ! grep -q "^$var=.*xxx\|^$var=.*seu_\|^$var=.*gere_com" .env; then
                ((configured_count++))
            fi
        done
        
        echo -e "${BLUE}ℹ️${NC} Configurações: $configured_count/${#essential_vars[@]} essenciais"
        
    else
        echo -e "${YELLOW}⚠️${NC} .env (copie de .env.example)"
    fi
    
else
    echo -e "${RED}❌${NC} Este não é o diretório do projeto WHMCS Assistant"
    exit 1
fi

echo ""

# Verificar conectividade de rede
echo "🌐 CONECTIVIDADE"
echo "==============="

# Testar conexão com OpenAI
if curl -s --max-time 5 https://api.openai.com > /dev/null; then
    echo -e "${GREEN}✅${NC} OpenAI API (api.openai.com)"
else
    echo -e "${RED}❌${NC} OpenAI API (verifique conexão)"
fi

# Testar conexão com NPM
if curl -s --max-time 5 https://registry.npmjs.org > /dev/null; then
    echo -e "${GREEN}✅${NC} NPM Registry (registry.npmjs.org)"
else
    echo -e "${RED}❌${NC} NPM Registry (verifique conexão)"
fi

echo ""

# Verificar portas em uso
echo "🔌 PORTAS"
echo "========"

if lsof -i :3000 > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠️${NC} Porta 3000 em uso:"
    lsof -i :3000 | head -n2
else
    echo -e "${GREEN}✅${NC} Porta 3000 disponível"
fi

if lsof -i :6379 > /dev/null 2>&1; then
    echo -e "${GREEN}✅${NC} Porta 6379 (Redis) em uso"
else
    echo -e "${BLUE}ℹ️${NC} Porta 6379 (Redis) livre"
fi

if lsof -i :5432 > /dev/null 2>&1; then
    echo -e "${GREEN}✅${NC} Porta 5432 (PostgreSQL) em uso"
else
    echo -e "${BLUE}ℹ️${NC} Porta 5432 (PostgreSQL) livre"
fi

echo ""

# Resumo e recomendações
echo "📋 RESUMO"
echo "========"

missing_essential=0
missing_optional=0

# Verificar essenciais
for cmd in node npm git curl jq pwgen; do
    if ! command -v "$cmd" &> /dev/null; then
        ((missing_essential++))
    fi
done

if [ $missing_essential -eq 0 ]; then
    echo -e "${GREEN}✅ Todas as dependências essenciais instaladas${NC}"
else
    echo -e "${RED}❌ $missing_essential dependências essenciais faltando${NC}"
    echo "💡 Execute: ./install-ubuntu.sh"
fi

# Verificar projeto
if [ -f ".env" ] && [ -d "node_modules" ] && [ -d "dist" ]; then
    echo -e "${GREEN}✅ Projeto configurado e pronto${NC}"
    echo "🚀 Execute: ./quick-start.sh"
elif [ -f "package.json" ]; then
    echo -e "${YELLOW}⚠️ Projeto parcialmente configurado${NC}"
    echo "🔧 Execute: ./install-ubuntu.sh (se não executou)"
    echo "⚡ Ou: ./quick-start.sh (para configurar)"
else
    echo -e "${RED}❌ Diretório incorreto${NC}"
    echo "📁 Navegue para o diretório do WHMCS Assistant"
fi

echo ""
echo "🆘 AJUDA:"
echo "   ./install-ubuntu.sh  - Instalação completa"
echo "   ./quick-start.sh     - Início rápido"
echo "   npm run health       - Testar sistema rodando"
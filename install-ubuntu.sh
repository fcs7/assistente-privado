#!/bin/bash

# 🚀 WHMCS Assistant - Instalador Completo Ubuntu LTS
# Instala todas as dependências e configura o sistema automaticamente

set -e  # Para na primeira falha

echo "🚀 WHMCS Assistant - Instalador Ubuntu LTS"
echo "=========================================="
echo ""

# Verificar se é Ubuntu
if ! grep -q "Ubuntu" /etc/os-release; then
    echo "❌ Este script é para Ubuntu LTS. Detectado: $(lsb_release -d | cut -f2)"
    echo "💡 Para outras distros, instale manualmente:"
    echo "   - Node.js 20+"
    echo "   - npm"
    echo "   - Redis (opcional)"
    echo "   - PostgreSQL (opcional)"
    echo "   - pwgen"
    echo "   - curl, jq"
    exit 1
fi

echo "✅ Ubuntu detectado: $(lsb_release -d | cut -f2)"
echo ""

# Função para log colorido
log_info() { echo -e "\e[32m[INFO]\e[0m $1"; }
log_warn() { echo -e "\e[33m[WARN]\e[0m $1"; }
log_error() { echo -e "\e[31m[ERROR]\e[0m $1"; }

# Verificar se é root
if [ "$EUID" -eq 0 ]; then
    log_error "Não execute como root! Use um usuário normal."
    exit 1
fi

log_info "Atualizando repositórios do sistema..."
sudo apt update

echo ""
echo "📦 INSTALANDO DEPENDÊNCIAS ESSENCIAIS"
echo "====================================="

# Node.js 20 LTS via NodeSource
log_info "Instalando Node.js 20 LTS..."
if ! command -v node &> /dev/null || [ "$(node -v | cut -d'v' -f2 | cut -d'.' -f1)" -lt "18" ]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
    log_info "✅ Node.js $(node -v) instalado"
else
    log_info "✅ Node.js $(node -v) já instalado"
fi

# Dependências base
log_info "Instalando utilitários base..."
sudo apt install -y \
    curl \
    wget \
    git \
    jq \
    pwgen \
    build-essential \
    python3-pip \
    software-properties-common \
    apt-transport-https \
    ca-certificates \
    gnupg \
    lsb-release

log_info "✅ Utilitários base instalados"

echo ""
echo "🔴 INSTALANDO REDIS (OPCIONAL)"
echo "=============================="

read -p "Instalar Redis para cache? [y/N]: " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    log_info "Instalando Redis..."
    sudo apt install -y redis-server
    sudo systemctl enable redis-server
    sudo systemctl start redis-server
    log_info "✅ Redis instalado e iniciado"
else
    log_warn "Redis não instalado - sistema usará cache em memória"
fi

echo ""
echo "🐘 INSTALANDO POSTGRESQL (OPCIONAL)"
echo "=================================="

read -p "Instalar PostgreSQL para logs? [y/N]: " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    log_info "Instalando PostgreSQL..."
    sudo apt install -y postgresql postgresql-contrib
    sudo systemctl enable postgresql
    sudo systemctl start postgresql
    
    log_info "Configurando banco para WHMCS Assistant..."
    sudo -u postgres psql -c "CREATE USER whmcs_user WITH PASSWORD 'whmcs_pass';"
    sudo -u postgres psql -c "CREATE DATABASE whmcs_assistant OWNER whmcs_user;"
    sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE whmcs_assistant TO whmcs_user;"
    
    log_info "✅ PostgreSQL instalado e configurado"
else
    log_warn "PostgreSQL não instalado - logs serão exibidos no console"
fi

echo ""
echo "🐳 INSTALANDO DOCKER (OPCIONAL)"
echo "=============================="

read -p "Instalar Docker para deploy? [y/N]: " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    log_info "Instalando Docker..."
    
    # Remover versões antigas
    sudo apt remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true
    
    # Adicionar repositório Docker
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    sudo apt update
    sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    
    # Adicionar usuário ao grupo docker
    sudo usermod -aG docker $USER
    
    # Habilitar e iniciar Docker
    sudo systemctl enable docker
    sudo systemctl start docker
    
    log_info "✅ Docker instalado (relogin necessário para usar sem sudo)"
else
    log_warn "Docker não instalado - use npm para execução"
fi

echo ""
echo "📁 CONFIGURANDO PROJETO"
echo "======================"

# Verificar se estamos no diretório do projeto
if [ ! -f "package.json" ]; then
    log_error "Execute este script no diretório raiz do projeto WHMCS Assistant!"
    log_info "💡 Navegue para o diretório que contém package.json e tente novamente"
    exit 1
fi

log_info "Instalando dependências npm..."
npm install

log_info "Compilando TypeScript..."
npm run build

echo ""
echo "🔐 CONFIGURANDO SEGURANÇA"
echo "========================"

# Verificar se .env existe
if [ ! -f ".env" ]; then
    log_info "Criando arquivo .env a partir do exemplo..."
    cp .env.example .env
fi

log_info "Gerando tokens seguros..."
npm run generate-secrets > tokens.txt
echo ""
log_warn "🔑 TOKENS GERADOS SALVOS EM: tokens.txt"
log_warn "📋 COPIE OS TOKENS PARA SEU .env MANUALMENTE!"
echo ""

echo ""
echo "🧪 TESTANDO INSTALAÇÃO"
echo "====================="

log_info "Verificando Node.js..."
node --version

log_info "Verificando npm..."
npm --version

log_info "Verificando compilação..."
if [ -d "dist" ]; then
    log_info "✅ Projeto compilado com sucesso"
else
    log_error "❌ Falha na compilação"
fi

# Testar Redis se instalado
if command -v redis-cli &> /dev/null; then
    log_info "Testando Redis..."
    if redis-cli ping &> /dev/null; then
        log_info "✅ Redis funcionando"
    else
        log_warn "⚠️ Redis instalado mas não respondendo"
    fi
fi

# Testar PostgreSQL se instalado
if command -v psql &> /dev/null; then
    log_info "Testando PostgreSQL..."
    if sudo -u postgres psql -c "SELECT 1;" &> /dev/null; then
        log_info "✅ PostgreSQL funcionando"
    else
        log_warn "⚠️ PostgreSQL instalado mas com problemas"
    fi
fi

echo ""
echo "✅ INSTALAÇÃO CONCLUÍDA!"
echo "========================"
echo ""
echo "🚀 PRÓXIMOS PASSOS:"
echo ""
echo "1. 📝 Configure seu .env com suas credenciais:"
echo "   nano .env"
echo ""
echo "2. 🔑 Use os tokens gerados em tokens.txt:"
echo "   cat tokens.txt"
echo ""
echo "3. ⚙️ Configure no mínimo:"
echo "   - OPENAI_API_KEY"
echo "   - OPENAI_ASSISTANT_ID" 
echo "   - WHMCS_API_URL"
echo "   - WHMCS_IDENTIFIER"
echo "   - WHMCS_SECRET"
echo "   - WHATICKET_URL"
echo "   - WHATICKET_TOKEN"
echo ""
echo "4. 🚀 Inicie o sistema:"
echo "   npm run dev          # Desenvolvimento"
echo "   npm start            # Produção"
echo "   npm run start:simple # Versão simples"
echo ""
echo "5. 🏥 Teste a saúde:"
echo "   npm run health"
echo ""
echo "6. 📱 Configure webhook no WhaTicket:"
echo "   URL: http://seu-servidor:3000/webhook"
echo "   Secret: [use o WEBHOOK_SECRET gerado]"
echo ""

if command -v docker &> /dev/null; then
    echo "🐳 Docker disponível! Para usar:"
    echo "   docker-compose up -d  # (após relogin)"
    echo ""
fi

echo "💡 DOCUMENTAÇÃO COMPLETA: README.md"
echo "🆘 PROBLEMAS? Veja seção Troubleshooting no README"
echo ""
echo "🎉 WHMCS Assistant pronto para uso!"
#!/bin/bash

# 🚀 WHMCS Assistant - Quick Start Ubuntu
# Inicia o sistema rapidamente após instalação

set -e

echo "🚀 WHMCS Assistant - Quick Start"
echo "==============================="
echo ""

# Verificar se está no diretório correto
if [ ! -f "package.json" ]; then
    echo "❌ Execute no diretório do projeto WHMCS Assistant!"
    exit 1
fi

# Verificar se .env existe
if [ ! -f ".env" ]; then
    echo "❌ Arquivo .env não encontrado!"
    echo "💡 Execute primeiro: ./install-ubuntu.sh"
    exit 1
fi

# Função para verificar se uma variável está configurada no .env
check_env_var() {
    local var_name=$1
    local var_value=$(grep "^$var_name=" .env 2>/dev/null | cut -d'=' -f2)
    
    if [ -z "$var_value" ] || [[ "$var_value" == *"xxx"* ]] || [[ "$var_value" == *"seu_"* ]] || [[ "$var_value" == *"gere_com"* ]]; then
        return 1
    else
        return 0
    fi
}

echo "🔍 Verificando configuração..."

# Verificar configurações essenciais
missing_configs=()

if ! check_env_var "OPENAI_API_KEY"; then
    missing_configs+=("OPENAI_API_KEY")
fi

if ! check_env_var "OPENAI_ASSISTANT_ID"; then
    missing_configs+=("OPENAI_ASSISTANT_ID")
fi

if ! check_env_var "WHMCS_API_URL"; then
    missing_configs+=("WHMCS_API_URL")
fi

if ! check_env_var "WHMCS_IDENTIFIER"; then
    missing_configs+=("WHMCS_IDENTIFIER")
fi

if ! check_env_var "WHMCS_SECRET"; then
    missing_configs+=("WHMCS_SECRET")
fi

if ! check_env_var "WHATICKET_URL"; then
    missing_configs+=("WHATICKET_URL")
fi

if ! check_env_var "WHATICKET_TOKEN"; then
    missing_configs+=("WHATICKET_TOKEN")
fi

# Se há configurações faltando
if [ ${#missing_configs[@]} -gt 0 ]; then
    echo ""
    echo "⚠️  CONFIGURAÇÃO INCOMPLETA"
    echo "=========================="
    echo ""
    echo "❌ Variáveis não configuradas:"
    for config in "${missing_configs[@]}"; do
        echo "   - $config"
    done
    echo ""
    echo "🔧 CONFIGURAR AGORA:"
    echo ""
    
    # Mostrar tokens se existirem
    if [ -f "tokens.txt" ]; then
        echo "🔑 Tokens disponíveis em tokens.txt:"
        cat tokens.txt | head -20
        echo ""
    fi
    
    echo "📝 Edite o arquivo .env:"
    echo "   nano .env"
    echo ""
    echo "💡 Configurações mínimas necessárias:"
    echo "   1. OPENAI_API_KEY=sk-proj-..."
    echo "   2. OPENAI_ASSISTANT_ID=asst_..."
    echo "   3. WHMCS_API_URL=https://seu-whmcs.com/includes/api.php"
    echo "   4. WHMCS_IDENTIFIER=seu_identifier"
    echo "   5. WHMCS_SECRET=sua_secret"
    echo "   6. WHATICKET_URL=https://seu-whaticket.com"
    echo "   7. WHATICKET_TOKEN=seu_token"
    echo ""
    echo "🔄 Execute novamente após configurar: ./quick-start.sh"
    exit 1
fi

echo "✅ Configuração válida!"

# Verificar se está compilado
if [ ! -d "dist" ] || [ ! -f "dist/server.js" ]; then
    echo ""
    echo "🔨 Compilando projeto..."
    npm run build
fi

# Verificar dependências
echo ""
echo "📦 Verificando dependências..."
if [ ! -d "node_modules" ]; then
    echo "📦 Instalando dependências..."
    npm install
fi

# Testar serviços opcionais
echo ""
echo "🔍 Verificando serviços..."

# Redis
if command -v redis-cli &> /dev/null; then
    if redis-cli ping &> /dev/null 2>&1; then
        echo "✅ Redis: Funcionando"
    else
        echo "⚠️  Redis: Instalado mas não iniciado"
        echo "💡 Inicie com: sudo systemctl start redis-server"
    fi
else
    echo "ℹ️  Redis: Não instalado (usará cache em memória)"
fi

# PostgreSQL
if command -v psql &> /dev/null; then
    if sudo -u postgres psql -c "SELECT 1;" &> /dev/null 2>&1; then
        echo "✅ PostgreSQL: Funcionando"
    else
        echo "⚠️  PostgreSQL: Instalado mas com problemas"
    fi
else
    echo "ℹ️  PostgreSQL: Não instalado (logs no console)"
fi

echo ""
echo "🚀 INICIANDO WHMCS ASSISTANT"
echo "============================"

# Menu de opções
echo ""
echo "Escolha como iniciar:"
echo "1) 🔧 Desenvolvimento (com hot reload)"
echo "2) 🚀 Produção (versão compilada)"
echo "3) ⚡ Simples (versão JavaScript)"
echo "4) 🏥 Apenas testar saúde"
echo "5) 🔍 Ver configurações"
echo ""

read -p "Opção [1-5]: " -n 1 -r
echo ""

case $REPLY in
    1)
        echo "🔧 Iniciando em modo desenvolvimento..."
        echo "📱 Webhook: http://localhost:3000/webhook"
        echo "🏥 Health: http://localhost:3000/health"
        echo ""
        npm run dev
        ;;
    2)
        echo "🚀 Iniciando em modo produção..."
        npm run build
        echo "📱 Webhook: http://localhost:3000/webhook"
        echo "🏥 Health: http://localhost:3000/health"
        echo ""
        npm start
        ;;
    3)
        echo "⚡ Iniciando versão simples..."
        echo "📱 Webhook: http://localhost:3000/webhook"
        echo "🏥 Health: http://localhost:3000/health"
        echo ""
        npm run start:simple
        ;;
    4)
        echo "🏥 Testando saúde do sistema..."
        echo ""
        npm run build > /dev/null 2>&1
        
        # Iniciar em background para testar
        npm start &
        SERVER_PID=$!
        
        # Aguardar inicialização
        echo "⏳ Aguardando inicialização..."
        sleep 10
        
        # Testar health
        if curl -s http://localhost:3000/health > /dev/null; then
            echo "✅ Sistema funcionando!"
            curl -s http://localhost:3000/health | jq .
        else
            echo "❌ Sistema com problemas"
        fi
        
        # Parar servidor
        kill $SERVER_PID 2>/dev/null || true
        ;;
    5)
        echo "🔍 Configurações atuais:"
        echo ""
        echo "📊 Variáveis configuradas:"
        echo "✅ OPENAI_API_KEY: $(grep "^OPENAI_API_KEY=" .env | cut -d'=' -f2 | head -c 20)..."
        echo "✅ OPENAI_ASSISTANT_ID: $(grep "^OPENAI_ASSISTANT_ID=" .env | cut -d'=' -f2)"
        echo "✅ WHMCS_API_URL: $(grep "^WHMCS_API_URL=" .env | cut -d'=' -f2)"
        echo "✅ WHATICKET_URL: $(grep "^WHATICKET_URL=" .env | cut -d'=' -f2)"
        echo ""
        echo "🔧 Para editar: nano .env"
        ;;
    *)
        echo "❌ Opção inválida"
        exit 1
        ;;
esac
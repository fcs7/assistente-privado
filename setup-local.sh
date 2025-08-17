#!/bin/bash

# 🚀 Setup Local Development - WHMCS Assistant
# Alternative to Docker for testing

echo "🤖 WHMCS Assistant - Setup Local Development"
echo "============================================"

# 1. Install dependencies
echo "📦 Installing dependencies..."
npm install

# 2. Build TypeScript
echo "🔨 Building TypeScript..."
npm run build

# 3. Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  Arquivo .env não encontrado!"
    echo "📋 Copiando .env.example para .env..."
    cp .env.example .env
    echo ""
    echo "🔧 CONFIGURE SEU .env ANTES DE CONTINUAR:"
    echo "   - OPENAI_API_KEY (obrigatório)"
    echo "   - OPENAI_ASSISTANT_ID (obrigatório)"
    echo "   - WHMCS_API_URL (obrigatório)"
    echo "   - WHMCS_IDENTIFIER (obrigatório)"
    echo "   - WHMCS_SECRET (obrigatório)"
    echo "   - WHATICKET_URL (já configurado: https://api-atendimento.ntweb.com.br)"
    echo "   - WHATICKET_TOKEN (obrigatório)"
    echo ""
    echo "📝 Execute: nano .env"
    echo ""
    exit 1
fi

# 4. Validate basic .env
echo "✅ Arquivo .env encontrado"

# 5. Start services message
echo ""
echo "🎯 Para testar o sistema:"
echo "   1. Configure Redis local: sudo systemctl start redis"
echo "   2. Configure PostgreSQL local: sudo systemctl start postgresql"
echo "   3. Execute: npm run dev"
echo ""
echo "🌐 O assistente ficará disponível em: http://localhost:3000"
echo "📱 Webhook endpoint: http://localhost:3000/webhook"
echo ""
echo "🔧 Para desenvolvimento sem banco:"
echo "   - Cache funcionará em memória (fallback)"
echo "   - Logs serão exibidos no console"
echo ""
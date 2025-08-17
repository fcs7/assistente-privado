#!/bin/bash

# 🔐 Gerador de Tokens Seguros - WHMCS Assistant
# Gera tokens criptograficamente seguros usando pwgen

echo "🔐 WHMCS Assistant - Gerador de Tokens Seguros"
echo "================================================"

# Verificar se pwgen está instalado
if ! command -v pwgen &> /dev/null; then
    echo "❌ pwgen não encontrado. Instale com:"
    echo "   sudo pacman -S pwgen  # Arch Linux"
    echo "   sudo apt install pwgen  # Ubuntu/Debian"
    echo "   brew install pwgen  # macOS"
    exit 1
fi

echo ""
echo "✨ Gerando tokens seguros..."
echo ""

# Gerar tokens
WEBHOOK_SECRET=$(pwgen -s -c -n 32 1)
API_BACKUP=$(pwgen -s -c -n 48 1)
ADMIN_TOKEN=$(pwgen -s -c -n 24 1)
SESSION_SECRET=$(pwgen -s -c -n 64 1)
DB_SECRET=$(pwgen -s -c -n 40 1)

# Exibir tokens formatados
echo "📋 COPIE ESTES TOKENS PARA SEU .env:"
echo "======================================"
echo ""
echo "# 📱 Webhook Security (WhaTicket)"
echo "WEBHOOK_SECRET=$WEBHOOK_SECRET"
echo ""
echo "# 🔑 Backup API Key (opcional)"
echo "API_KEY_BACKUP=$API_BACKUP"
echo ""
echo "# 🛡️ Admin Token (futuras APIs admin)"
echo "ADMIN_TOKEN=$ADMIN_TOKEN"
echo ""
echo "# 🔐 Session Secret (autenticação)"
echo "SESSION_SECRET=$SESSION_SECRET"
echo ""
echo "# 💾 Database Encryption (opcional)"
echo "DATABASE_SECRET=$DB_SECRET"
echo ""
echo "======================================"
echo ""
echo "🎯 IMPORTANTE: Configure no WhaTicket:"
echo "   URL: http://seu-servidor:3000/webhook"
echo "   Secret: $WEBHOOK_SECRET"
echo ""
echo "💡 DICA: Salve estes tokens em local seguro!"
echo "   Eles são únicos e não podem ser recuperados."
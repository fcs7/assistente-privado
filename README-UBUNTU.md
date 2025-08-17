# 🚀 WHMCS Assistant - Guia Ubuntu LTS

**Instalação e configuração completa para Ubuntu LTS (18.04, 20.04, 22.04, 24.04)**

## ⚡ Instalação Ultra-Rápida

### 1️⃣ Clone o projeto
```bash
git clone https://github.com/seu-usuario/assistente-privado.git
cd assistente-privado
```

### 2️⃣ Execute o instalador automático
```bash
./install-ubuntu.sh
```

### 3️⃣ Configure e inicie
```bash
./quick-start.sh
```

**Pronto! 🎉 Seu WHMCS Assistant estará funcionando em menos de 5 minutos!**

---

## 📋 O que o Instalador Faz

### 🔧 Instala Automaticamente:
- ✅ **Node.js 20 LTS** (via NodeSource oficial)
- ✅ **npm** e ferramentas de build
- ✅ **Utilitários**: curl, wget, git, jq, pwgen
- ✅ **Redis** (opcional - para cache)
- ✅ **PostgreSQL** (opcional - para logs)
- ✅ **Docker** (opcional - para deploy)

### ⚙️ Configura Automaticamente:
- ✅ **Dependências npm** instaladas
- ✅ **Projeto compilado** (TypeScript → JavaScript)
- ✅ **Tokens seguros** gerados com pwgen
- ✅ **Arquivo .env** criado
- ✅ **Banco PostgreSQL** configurado (se escolhido)
- ✅ **Serviços habilitados** e iniciados

### 🧪 Testa Automaticamente:
- ✅ **Compilação** TypeScript
- ✅ **Conectividade** Redis/PostgreSQL
- ✅ **Saúde** do sistema
- ✅ **Endpoints** funcionais

---

## 🚀 Scripts Disponíveis

| Script | Descrição | Uso |
|--------|-----------|-----|
| `./install-ubuntu.sh` | **Instalação completa** do zero | Primeira vez |
| `./quick-start.sh` | **Início rápido** com menu interativo | Uso diário |
| `./check-system.sh` | **Verificação** de dependências | Diagnóstico |
| `./generate-secrets.sh` | **Geração** de tokens seguros | Renovar tokens |

## 📱 Quick Start Interativo

O `./quick-start.sh` oferece menu com opções:

```
1) 🔧 Desenvolvimento (com hot reload)
2) 🚀 Produção (versão compilada)  
3) ⚡ Simples (versão JavaScript)
4) 🏥 Apenas testar saúde
5) 🔍 Ver configurações
```

---

## 🔧 Requisitos de Sistema

### Mínimos:
- **Ubuntu LTS**: 18.04, 20.04, 22.04, ou 24.04
- **RAM**: 512MB (1GB recomendado)
- **CPU**: 1 core (2+ recomendado)
- **Disco**: 2GB livres
- **Rede**: Conexão com internet

### Recomendados:
- **RAM**: 2GB+ (para Redis + PostgreSQL)
- **CPU**: 2+ cores (melhor performance)
- **SSD**: Para I/O mais rápido

---

## 🔐 Configuração de Segurança

### 1️⃣ Tokens Automáticos
```bash
./generate-secrets.sh
# Gera tokens criptograficamente seguros
```

### 2️⃣ Firewall (Produção)
```bash
# Permitir apenas portas necessárias
sudo ufw allow 22    # SSH
sudo ufw allow 3000  # WHMCS Assistant
sudo ufw allow 443   # HTTPS (se usar)
sudo ufw enable
```

### 3️⃣ SSL/TLS (Produção)
```bash
# Use Caddy, nginx ou Traefik como proxy reverso
# Para certificados SSL automáticos com Let's Encrypt
```

---

## 🐳 Deploy com Docker

### Opção 1: Docker Compose (Recomendado)
```bash
# Instalar com Docker incluído
./install-ubuntu.sh  # Escolha "y" para Docker

# Usar Docker
docker-compose up -d

# Ver logs
docker-compose logs -f app
```

### Opção 2: Docker Manual
```bash
# Build da imagem
docker build -t whmcs-assistant .

# Executar container
docker run -d \
  --name whmcs-assistant \
  --env-file .env \
  -p 3000:3000 \
  whmcs-assistant
```

---

## 🛠️ Troubleshooting Ubuntu

### ❌ Erro: "Node.js versão antiga"
```bash
# Remover Node.js antigo
sudo apt remove nodejs npm

# Reinstalar via instalador
./install-ubuntu.sh
```

### ❌ Erro: "permission denied"
```bash
# Dar permissão aos scripts
chmod +x *.sh

# Não executar como root
# Use usuário normal com sudo quando necessário
```

### ❌ Erro: "Docker sem permissão"
```bash
# Após instalar Docker, faça logout/login
# Ou adicione usuário ao grupo docker:
sudo usermod -aG docker $USER
newgrp docker
```

### ❌ Erro: "Porta 3000 em uso"
```bash
# Ver o que está usando
sudo lsof -i :3000

# Matar processo
sudo pkill -f node

# Ou usar porta diferente no .env
PORT=3001
```

### ❌ Erro: "Redis connection"
```bash
# Iniciar Redis
sudo systemctl start redis-server
sudo systemctl enable redis-server

# Testar Redis
redis-cli ping
```

### ❌ Erro: "PostgreSQL connection"
```bash
# Iniciar PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Reconfigurar banco
sudo -u postgres psql -c "CREATE USER whmcs_user WITH PASSWORD 'whmcs_pass';"
```

---

## 📊 Monitoramento

### System Check Completo
```bash
./check-system.sh
# Verifica TUDO: dependências, serviços, projeto, conectividade
```

### Health Check Rápido
```bash
npm run health
# Testa apenas a API (sistema deve estar rodando)
```

### Logs em Tempo Real
```bash
# Desenvolvimento
npm run dev

# Docker
docker-compose logs -f app

# SystemD (se configurado como serviço)
journalctl -u whmcs-assistant -f
```

---

## 🚀 Deploy em Produção

### 1️⃣ Servidor VPS/Cloud
```bash
# 1. Clone o projeto
git clone https://github.com/seu-usuario/assistente-privado.git
cd assistente-privado

# 2. Execute instalador
./install-ubuntu.sh

# 3. Configure .env com credenciais reais
nano .env

# 4. Inicie em produção
npm run build
npm start

# 5. Configure como serviço (opcional)
sudo cp systemd/whmcs-assistant.service /etc/systemd/system/
sudo systemctl enable whmcs-assistant
sudo systemctl start whmcs-assistant
```

### 2️⃣ Proxy Reverso (Recomendado)
```bash
# Instalar Caddy (mais simples)
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy

# Configurar Caddy
sudo nano /etc/caddy/Caddyfile
```

Exemplo Caddyfile:
```
seu-dominio.com {
    reverse_proxy localhost:3000
}
```

---

## 🆘 Suporte

### 🔍 Diagnóstico Automático
```bash
./check-system.sh  # Verifica tudo
```

### 📞 Obter Ajuda
1. **GitHub Issues**: Para bugs e features
2. **Documentação**: README.md principal
3. **Logs**: Sempre inclua logs do erro

### 🐛 Reportar Problemas
Inclua sempre:
- Saída de `./check-system.sh`
- Versão do Ubuntu: `lsb_release -a`
- Logs do erro
- Passos para reproduzir

---

## ✅ Checklist de Deploy

- [ ] Ubuntu LTS instalado e atualizado
- [ ] `./install-ubuntu.sh` executado com sucesso
- [ ] `.env` configurado com credenciais reais
- [ ] `./check-system.sh` mostra tudo ✅
- [ ] `npm run health` retorna "healthy"
- [ ] Webhook configurado no WhaTicket
- [ ] Firewall configurado (se produção)
- [ ] SSL/TLS configurado (se produção)
- [ ] Backup do `.env` em local seguro
- [ ] Monitoramento configurado (se produção)

---

**🎉 Com estes scripts, seu WHMCS Assistant estará rodando em Ubuntu em menos de 5 minutos!**
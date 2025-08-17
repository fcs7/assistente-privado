# 🐳 Multi-stage Dockerfile for WHMCS Assistant
# Otimizado para produção com Alpine Linux

# Build stage
FROM node:18-alpine AS builder

# Instalar dependências do sistema necessárias para build
RUN apk add --no-cache python3 make g++

# Configurar diretório de trabalho
WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./
COPY tsconfig.json ./

# Instalar TODAS as dependências (incluindo devDependencies para build)
RUN npm ci && npm cache clean --force

# Copiar código fonte
COPY src/ ./src/

# Build da aplicação
RUN npm run build

# Remover devDependencies após build para economizar espaço
RUN npm ci --only=production && npm cache clean --force

# Production stage
FROM node:18-alpine AS production

# Instalar ferramentas de sistema essenciais
RUN apk add --no-cache \
    curl \
    ca-certificates \
    && update-ca-certificates

# Criar usuário não-root para segurança
RUN addgroup -g 1001 -S nodejs && \
    adduser -S whmcs -u 1001 -G nodejs

# Configurar diretório de trabalho
WORKDIR /app

# Copiar dependências de produção da stage anterior
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Copiar arquivos necessários
COPY package*.json ./
COPY .env.example ./

# Criar diretórios necessários e ajustar permissões
RUN mkdir -p logs tmp && \
    chown -R whmcs:nodejs /app

# Mudar para usuário não-root
USER whmcs

# Configurar variáveis de ambiente
ENV NODE_ENV=production
ENV PORT=3000

# Expor porta
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Comando de inicialização
CMD ["node", "dist/server.js"]
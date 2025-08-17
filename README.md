# 🤖 WHMCS Assistant - OpenAI + WhatsApp Integration

Sistema completo de assistente virtual que integra OpenAI Assistant API, WHMCS e WhatsApp (via WhaTicket) para automatizar atendimento ao cliente.

## 🚀 Funcionalidades

- **Integração OpenAI Assistant API** - Processamento inteligente de mensagens usando Assistants (não Chat Completions)
- **Integração WHMCS** - Acesso completo às funções do WHMCS (faturas, serviços, tickets)
- **WhatsApp via WhaTicket** - Recebe e responde mensagens automaticamente
- **Factory Pattern** - Arquitetura extensível para adicionar novas funções facilmente
- **Cache Redis** - Otimização de performance com cache inteligente
- **Logs PostgreSQL** - Rastreamento completo de todas as interações

## 📋 Pré-requisitos

- Node.js 20+ (você tem v22.18.0 ✅)
- Redis (opcional - tem fallback em memória)
- PostgreSQL (opcional - logs em console como fallback)
- Conta OpenAI com acesso à API
- WHMCS com API habilitada
- WhaTicket configurado

## 🔧 Instalação

### 1. Clone o repositório
```bash
git clone https://github.com/seu-usuario/assistente-privado.git
cd assistente-privado
```

### 2. Instale as dependências
```bash
npm install
```

### 3. Configure as variáveis de ambiente
```bash
cp .env.example .env
nano .env
```

## ⚙️ Configuração Essencial

### 🔑 OpenAI Configuration
```env
# Obtenha em: https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Crie em: https://platform.openai.com/assistants
OPENAI_ASSISTANT_ID=asst_xxxxxxxxxxxxxxxxxxxxxxxxx
```

#### Como criar o OpenAI Assistant:
1. Acesse https://platform.openai.com/assistants
2. Clique em "Create Assistant"
3. Configure:
   - **Name**: WHMCS Assistant
   - **Instructions**: "Você é um assistente de suporte que ajuda clientes com faturas, serviços e tickets do WHMCS."
   - **Model**: gpt-4-turbo-preview
4. Adicione as funções (Tools > Functions):

**Função 1: get_client_invoices**
```json
{
  "name": "get_client_invoices",
  "description": "Busca faturas do cliente no WHMCS",
  "parameters": {
    "type": "object",
    "properties": {
      "email": {
        "type": "string",
        "description": "Email do cliente"
      },
      "status": {
        "type": "string",
        "enum": ["Paid", "Unpaid", "Overdue", "Cancelled"],
        "description": "Status da fatura"
      }
    },
    "required": ["email"]
  }
}
```

**Função 2: check_service_status**
```json
{
  "name": "check_service_status",
  "description": "Verifica status de serviços do cliente",
  "parameters": {
    "type": "object",
    "properties": {
      "email": {
        "type": "string",
        "description": "Email do cliente"
      },
      "domain": {
        "type": "string",
        "description": "Domínio do serviço"
      }
    },
    "required": ["email"]
  }
}
```

**Função 3: create_ticket**
```json
{
  "name": "create_ticket",
  "description": "Cria ticket de suporte no WHMCS",
  "parameters": {
    "type": "object",
    "properties": {
      "email": {
        "type": "string",
        "description": "Email do cliente"
      },
      "subject": {
        "type": "string",
        "description": "Assunto do ticket"
      },
      "message": {
        "type": "string",
        "description": "Mensagem do ticket"
      },
      "priority": {
        "type": "string",
        "enum": ["Low", "Medium", "High"],
        "description": "Prioridade"
      }
    },
    "required": ["email", "subject", "message"]
  }
}
```

5. Salve e copie o Assistant ID

### 💼 WHMCS Configuration
```env
# URL da API do seu WHMCS
WHMCS_API_URL=https://seu-dominio.com.br/includes/api.php

# Credenciais API (Setup > Staff Management > API Credentials)
WHMCS_IDENTIFIER=seu_api_identifier
WHMCS_SECRET=seu_api_secret
```

### 📱 WhaTicket Configuration
```env
# Sua instância WhaTicket
WHATICKET_URL=https://api-atendimento.ntweb.com.br

# Token de autenticação
WHATICKET_TOKEN=seu_bearer_token_aqui

# Secret para webhooks (crie uma string aleatória forte)
WEBHOOK_SECRET=sua_chave_secreta_forte_aqui_xyz123
```

## 🚀 Executando o Sistema

### Desenvolvimento (com hot reload)
```bash
npm run dev
```

### Produção
```bash
npm run build
npm start
```

### Com Docker (quando resolver o problema do Docker)
```bash
docker-compose up -d
```

## 📱 Configurando Webhook no WhaTicket

1. Acesse seu painel WhaTicket
2. Vá em Configurações > Webhooks
3. Adicione novo webhook:
   - **URL**: `http://seu-servidor:3000/webhook`
   - **Eventos**: Mensagens recebidas
   - **Secret**: O mesmo configurado em WEBHOOK_SECRET

## 🧪 Testando

### 1. Verificar saúde do sistema
```bash
curl http://localhost:3000/health
```

### 2. Testar webhook manualmente
```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{"test":"message"}'
```

### 3. Logs
```bash
# Ver logs em tempo real
npm run dev

# Logs de produção
docker-compose logs -f app
```

## 📂 Estrutura do Projeto

```
assistente-privado/
├── src/
│   ├── config/           # Configurações centralizadas
│   ├── factories/        # Factory Pattern para funções
│   ├── functions/        # Funções WHMCS implementadas
│   │   ├── base/        # Classe base para funções
│   │   ├── GetClientInvoices.ts
│   │   ├── CheckServiceStatus.ts
│   │   └── CreateTicket.ts
│   ├── handlers/         # Webhook handler
│   ├── services/         # Serviços (OpenAI, WHMCS, Cache)
│   ├── types/           # TypeScript types
│   ├── utils/           # Utilidades (logger, validators)
│   └── server.ts        # Servidor Express principal
├── .env.example         # Exemplo de configuração
├── docker-compose.yml   # Configuração Docker
├── package.json         # Dependências
└── tsconfig.json        # Configuração TypeScript
```

## 🔄 Adicionando Novas Funções

1. Crie novo arquivo em `src/functions/`:
```typescript
// src/functions/MinhaNovaFuncao.ts
import { BaseFunction } from './base/BaseFunction';

export class MinhaNovaFuncao extends BaseFunction {
  name = 'minha_nova_funcao';
  description = 'Descrição da função';
  
  async execute(args: any): Promise<any> {
    // Implementação
  }
}
```

2. Registre no Factory (`src/factories/FunctionFactory.ts`):
```typescript
FunctionFactory.register('minha_nova_funcao', () => new MinhaNovaFuncao());
```

3. Adicione no OpenAI Assistant (platform.openai.com)

## 🐛 Troubleshooting

### Redis não conecta
- O sistema usa cache em memória como fallback
- Para usar Redis: `sudo systemctl start redis`

### Docker não inicia
- Problema conhecido no Arch Linux com iptables
- Use desenvolvimento local: `npm run dev`

### TypeScript errors
- Use o quick test: `node quick-test.js`
- Ou desabilite strict mode temporariamente

## 📝 Variáveis de Ambiente

| Variável | Descrição | Obrigatório |
|----------|-----------|-------------|
| OPENAI_API_KEY | Chave API OpenAI | ✅ |
| OPENAI_ASSISTANT_ID | ID do Assistant | ✅ |
| WHMCS_API_URL | URL da API WHMCS | ✅ |
| WHMCS_IDENTIFIER | Identificador API | ✅ |
| WHMCS_SECRET | Secret API | ✅ |
| WHATICKET_URL | URL WhaTicket | ✅ |
| WHATICKET_TOKEN | Token Bearer | ✅ |
| WEBHOOK_SECRET | Secret webhooks | ⚠️ Recomendado |
| REDIS_URL | URL Redis | ❌ Opcional |
| DATABASE_URL | URL PostgreSQL | ❌ Opcional |

## 🚀 Deploy em Produção

### VPS/Cloud
1. Configure servidor com Node.js 20+
2. Clone repositório
3. Configure .env com dados reais
4. Use PM2 para gerenciar processo:
```bash
npm install -g pm2
pm2 start npm --name "whmcs-assistant" -- start
pm2 save
pm2 startup
```

### Railway/Render/Heroku
- Use as variáveis de ambiente do painel
- Configure PORT automático
- Adicione Redis e PostgreSQL como add-ons

## 📚 Documentação Adicional

- [OpenAI Assistant API](https://platform.openai.com/docs/assistants)
- [WHMCS API Reference](https://developers.whmcs.com/api-reference/)
- [WhaTicket Docs](https://docs.whaticket.com)

## 🤝 Suporte

Para problemas ou dúvidas:
1. Verifique os logs: `npm run dev`
2. Teste endpoints: `/health` e `/webhook`
3. Confirme credenciais no `.env`

## 📄 Licença

MIT - Use como quiser!

---

**Desenvolvido com ❤️ usando TypeScript, Node.js e Factory Pattern**
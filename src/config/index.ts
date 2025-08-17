import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // 🤖 OPENAI - FACILMENTE CONFIGURÁVEL VIA .ENV
  openai: {
    apiKey: process.env.OPENAI_API_KEY!,
    organizationId: process.env.OPENAI_ORGANIZATION_ID,
    assistantId: process.env.OPENAI_ASSISTANT_ID!,
    model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
    maxRetries: parseInt(process.env.OPENAI_MAX_RETRIES || '3'),
    timeout: parseInt(process.env.OPENAI_TIMEOUT || '30000')
  },
  
  // 💼 WHMCS
  whmcs: {
    apiUrl: process.env.WHMCS_API_URL!,
    identifier: process.env.WHMCS_IDENTIFIER!,
    secret: process.env.WHMCS_SECRET!,
    allowedIp: process.env.WHMCS_ALLOWED_IP
  },
  
  // 📱 WHATICKET
  whaticket: {
    url: process.env.WHATICKET_URL!,
    token: process.env.WHATICKET_TOKEN!
  },
  
  // 🔐 WEBHOOK
  webhook: {
    secret: process.env.WEBHOOK_SECRET || 'default-secret-change-in-production'
  },
  
  // 🔴 CACHE & DATABASE
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    ttl: parseInt(process.env.CACHE_TTL || '300')
  },
  
  database: {
    url: process.env.DATABASE_URL || 'postgresql://whmcs_user:whmcs_pass@localhost:5432/whmcs_assistant'
  },
  
  // 🌐 APP
  app: {
    port: parseInt(process.env.PORT || '3000'),
    env: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'info',
    maxRequestSize: process.env.MAX_REQUEST_SIZE || '10mb',
    requestTimeout: parseInt(process.env.REQUEST_TIMEOUT || '30000')
  },
  
  // 🔒 SECURITY
  security: {
    corsOrigin: process.env.CORS_ORIGIN || '*',
    rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW || '900000'), // 15 min
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '100')
  },
  
  // 📊 MONITORING
  monitoring: {
    enableMetrics: process.env.ENABLE_METRICS === 'true',
    metricsPort: parseInt(process.env.METRICS_PORT || '9090'),
    enableTracing: process.env.ENABLE_TRACING === 'true',
    tracingEndpoint: process.env.TRACING_ENDPOINT
  }
};

// ⚠️ Validar configurações obrigatórias na inicialização
export function validateConfig() {
  const required = [
    'OPENAI_API_KEY',
    'OPENAI_ASSISTANT_ID', 
    'WHMCS_API_URL',
    'WHMCS_IDENTIFIER',
    'WHMCS_SECRET',
    'WHATICKET_URL',
    'WHATICKET_TOKEN'
  ];
  
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('❌ Configurações obrigatórias ausentes:');
    missing.forEach(key => console.error(`   • ${key}`));
    console.error('');
    console.error('📝 Configure estas variáveis no arquivo .env');
    console.error('📖 Consulte o arquivo .env.example para exemplos');
    throw new Error(`Missing required env variables: ${missing.join(', ')}`);
  }
  
  // Validações específicas
  if (!config.openai.apiKey.startsWith('sk-')) {
    throw new Error('OPENAI_API_KEY deve começar com "sk-"');
  }
  
  if (!config.openai.assistantId.startsWith('asst_')) {
    throw new Error('OPENAI_ASSISTANT_ID deve começar com "asst_"');
  }
  
  if (!config.whmcs.apiUrl.includes('/api.php')) {
    console.warn('⚠️  WHMCS_API_URL deve terminar com "/includes/api.php"');
  }
  
  console.log('✅ Todas as configurações validadas com sucesso!');
}

// 📋 Função para exibir configuração atual (sem secrets)
export function displayConfig() {
  console.log(`
╔════════════════════════════════════════════╗
║         WHMCS ASSISTANT - CONFIGURAÇÃO     ║
╠════════════════════════════════════════════╣
║ 🤖 OpenAI Assistant: ${config.openai.assistantId}║
║ 🧠 Modelo: ${config.openai.model.padEnd(28)}║
║ 🌐 WHMCS URL: ${config.whmcs.apiUrl.length > 25 ? config.whmcs.apiUrl.substring(0, 22) + '...' : config.whmcs.apiUrl.padEnd(25)}║
║ 📱 WhaTicket: ${config.whaticket.url.length > 25 ? config.whaticket.url.substring(0, 22) + '...' : config.whaticket.url.padEnd(25)}║
║ 🚀 Porta: ${config.app.port.toString().padEnd(32)}║
║ 🌍 Ambiente: ${config.app.env.padEnd(28)}║
║ 📝 Log Level: ${config.app.logLevel.padEnd(26)}║
╚════════════════════════════════════════════╝
  `);
}
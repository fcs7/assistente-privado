// 🚀 WHMCS Assistant - Main Application
// Versão híbrida que funciona em desenvolvimento e produção

import express from 'express';
import cors from 'cors';
import { config } from './config';
import { WebhookHandler } from './handlers/WebhookHandler';
import { OpenAIAssistantService } from './services/OpenAIAssistantService';
import { WHMCSService } from './services/WHMCSService';
import { cacheService } from './services/CacheService';
import { createLogger } from './utils/logger';
import { FunctionFactory } from './factories/FunctionFactory';

// Logger principal
const logger = createLogger({ service: 'app' });

// Criar aplicação Express
export const app = express();

// Middleware global
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Middleware para Request ID
app.use((req, res, next) => {
  req.requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  next();
});

// Serviços principais
const openaiService = new OpenAIAssistantService();
const whmcsService = new WHMCSService();
const webhookHandler = new WebhookHandler();

// 🏥 Health Check
app.get('/health', async (req, res) => {
  try {
    const health = await webhookHandler.healthCheck();
    
    res.json({
      ...health,
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      functions: FunctionFactory.getStats(),
      config: {
        openai: !!config.openai.apiKey,
        whmcs: !!config.whmcs.apiUrl,
        whaticket: !!config.whaticket.url
      }
    });
  } catch (error) {
    logger.error('Health check failed', error);
    res.status(500).json({
      status: 'unhealthy',
      error: 'Health check failed'
    });
  }
});

// 🔍 Webhook DEBUG - Aceita TODOS os métodos HTTP
app.all('/webhook', (req, res, next) => {
  console.log('\n\n========================================');
  console.log('🔍 WEBHOOK DEBUG - REQUISIÇÃO RECEBIDA');
  console.log('========================================');
  console.log('📅 Timestamp:', new Date().toISOString());
  console.log('🔤 Method:', req.method);
  console.log('🔗 URL:', req.url);
  console.log('🔗 Original URL:', req.originalUrl);
  console.log('📋 Headers:', JSON.stringify(req.headers, null, 2));
  
  // Se for GET, retorna sucesso para teste de conectividade
  if (req.method === 'GET') {
    console.log('✅ GET request - Teste de conectividade do Whaticket');
    console.log('========================================\n\n');
    return res.json({ 
      status: 'ok', 
      message: 'Webhook ativo e funcionando',
      timestamp: new Date().toISOString()
    });
  }
  
  console.log('📦 Body Type:', typeof req.body);
  console.log('📦 Body Keys:', Object.keys(req.body || {}));
  console.log('📦 Body Content:', JSON.stringify(req.body, null, 2));
  
  // Log específico para campos importantes
  if (req.body) {
    console.log('\n🎯 CAMPOS ESPECÍFICOS:');
    console.log('- sender:', req.body.sender);
    console.log('- mensagem:', req.body.mensagem);
    console.log('- message:', req.body.message);
    console.log('- body:', req.body.body);
    console.log('- text:', req.body.text);
    console.log('- content:', req.body.content);
    console.log('- filaescolhida:', req.body.filaescolhida);
    console.log('- queue:', req.body.queue);
    console.log('- fila:', req.body.fila);
    console.log('- chamadoId:', req.body.chamadoId);
    console.log('- ticketId:', req.body.ticketId);
    console.log('- ticket:', req.body.ticket);
    console.log('- contact:', req.body.contact);
    console.log('- from:', req.body.from);
    console.log('- phone:', req.body.phone);
    console.log('- type:', req.body.type);
    console.log('- action:', req.body.action);
    console.log('- event:', req.body.event);
  }
  
  console.log('========================================\n\n');
  
  // Se for POST, continua para o handler normal
  if (req.method === 'POST') {
    next();
  } else {
    // Para outros métodos, retorna sucesso
    res.json({ 
      status: 'received', 
      method: req.method,
      timestamp: new Date().toISOString()
    });
  }
});

// 🧪 Endpoint de teste para simular webhooks do Whaticket
app.post('/webhook/test', async (req, res) => {
  try {
    logger.info('🧪 Teste de webhook iniciado', {
      payload: req.body,
      headers: req.headers
    });

    // Simular payload típico do Whaticket se não fornecido
    const testPayload = req.body && Object.keys(req.body).length > 0 ? req.body : {
      event: 'message',
      ticket: {
        id: 123,
        contact: {
          number: '5511999999999',
          name: 'Teste Usuario'
        },
        whatsapp: {
          id: 1,
          name: 'WhatsApp Instance'
        }
      },
      message: {
        id: 'test_msg_' + Date.now(),
        body: 'Olá, esta é uma mensagem de teste para o assistente WHMCS!',
        fromMe: false,
        timestamp: Date.now()
      }
    };

    // Criar nova requisição simulada
    const simulatedReq = {
      ...req,
      body: testPayload,
      requestId: `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };

    // Processar com o webhook handler
    await webhookHandler.handle(simulatedReq as any, res);
    
  } catch (error) {
    logger.error('Erro no teste de webhook', error);
    res.status(500).json({
      error: 'Test webhook failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// 📊 Status do webhook para debugging
app.get('/webhook/status', async (req, res) => {
  try {
    const health = await webhookHandler.healthCheck();
    
    res.json({
      webhook: {
        status: 'active',
        endpoint: '/webhook',
        testEndpoint: '/webhook/test'
      },
      health,
      config: {
        webhookSecret: !!config.webhook.secret && config.webhook.secret !== 'default-secret-change-in-production',
        whaticketUrl: config.whaticket.url,
        whaticketToken: !!config.whaticket.token
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Erro ao obter status do webhook', error);
    res.status(500).json({
      error: 'Failed to get webhook status',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// 📊 Status das Funções
app.get('/functions', (req, res) => {
  res.json({
    available: FunctionFactory.getAvailableFunctions(),
    stats: FunctionFactory.getStats(),
    definitions: FunctionFactory.getOpenAIFunctionDefinitions()
  });
});

// 🧪 Teste de Função (development only)
app.post('/test-function/:name', async (req, res) => {
  if (config.app.env === 'production') {
    return res.status(404).json({ error: 'Not available in production' });
  }

  const functionName = req.params.name;
  const args = req.body;

  try {
    const result = await FunctionFactory.execute(functionName, args, {
      sessionId: req.requestId,
      userId: 'test-user',
      metadata: { source: 'api-test' }
    });

    res.json(result);
  } catch (error) {
    logger.error(`Test function error: ${functionName}`, error);
    res.status(500).json({
      error: 'Function execution failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// 🔍 Logs recentes (development only)
app.get('/logs', (req, res) => {
  if (config.app.env === 'production') {
    return res.status(404).json({ error: 'Not available in production' });
  }

  res.json({
    message: 'Logs are displayed in console in development mode',
    tip: 'Use docker-compose logs -f app for container logs'
  });
});

// ❌ 404 Handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    available: [
      'GET /health',
      'POST /webhook',
      'POST /webhook/test',
      'GET /webhook/status',
      'GET /functions',
      'POST /test-function/:name (dev only)',
      'GET /logs (dev only)'
    ]
  });
});

// 🚨 Error Handler
app.use((error: any, req: any, res: any, next: any) => {
  logger.error('Unhandled application error', error, {
    requestId: req.requestId,
    path: req.path,
    method: req.method
  });

  res.status(500).json({
    error: 'Internal server error',
    requestId: req.requestId
  });
});

// Inicialização para desenvolvimento
export async function initializeApp() {
  try {
    // Verificar configurações essenciais
    if (!config.openai.apiKey) {
      logger.warn('⚠️ OpenAI API Key não configurada - funcionalidade limitada');
    }

    if (!config.whmcs.apiUrl) {
      logger.warn('⚠️ WHMCS API URL não configurada - funcionalidade limitada');
    }

    // Teste de conectividade (opcional)
    logger.info('🔧 Verificando serviços...');
    
    const healthCheck = await webhookHandler.healthCheck();
    logger.info(`📊 Status: ${healthCheck.status}`, {
      functions: FunctionFactory.getStats().totalFunctions
    });

    logger.info('✅ Aplicação inicializada com sucesso');

  } catch (error) {
    logger.error('❌ Erro na inicialização', error);
    throw error;
  }
}

export default app;
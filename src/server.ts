import express from 'express';
import cors from 'cors';
import { config, validateConfig, displayConfig } from './config';
import { OpenAIAssistantService } from './services/OpenAIAssistantService';
import { WHMCSService } from './services/WHMCSService';
import { cacheService } from './services/CacheService';
import { WebhookHandler } from './handlers/WebhookHandler';
import { FunctionFactory } from './factories/FunctionFactory';
import { appLogger, createLogger } from './utils/logger';

// 🌐 Servidor Express principal
class Server {
  private app: express.Application;
  private openaiService: OpenAIAssistantService;
  private whmcsService: WHMCSService;
  private webhookHandler: WebhookHandler;
  private logger = createLogger({ service: 'server' });
  
  constructor() {
    this.app = express();
    this.setupMiddlewares();
    this.setupRoutes();
    this.setupErrorHandlers();
  }
  
  // 🔧 Configurar middlewares
  private setupMiddlewares(): void {
    // Security & CORS
    this.app.use(cors({
      origin: config.security.corsOrigin,
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-signature', 'signature']
    }));
    
    // Body parsing
    this.app.use(express.json({ 
      limit: config.app.maxRequestSize,
      verify: (req: any, res, buf) => {
        // Armazenar raw body para validação de assinatura
        req.rawBody = buf.toString('utf8');
      }
    }));
    this.app.use(express.urlencoded({ extended: true }));
    
    // Request logging
    this.app.use((req, res, next) => {
      const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      req.requestId = requestId;
      
      this.logger.info(`${req.method} ${req.path}`, {
        requestId,
        method: req.method,
        path: req.path,
        userAgent: req.headers['user-agent'],
        ip: req.ip
      });
      
      next();
    });
    
    // Response time tracking
    this.app.use((req, res, next) => {
      const startTime = Date.now();
      
      res.on('finish', () => {
        const duration = Date.now() - startTime;
        this.logger.info(`Request completed`, {
          requestId: req.requestId,
          statusCode: res.statusCode,
          duration
        });
      });
      
      next();
    });
  }
  
  // 🛣️ Configurar rotas
  private setupRoutes(): void {
    // 📱 Webhook principal do WhaTicket
    this.app.post('/webhook/whaticket', async (req, res) => {
      await this.webhookHandler.handle(req, res);
    });
    
    // 🏥 Health check principal
    this.app.get('/health', async (req, res) => {
      try {
        const healthData = await this.getHealthStatus();
        
        const statusCode = healthData.status === 'healthy' ? 200 : 503;
        res.status(statusCode).json(healthData);
        
      } catch (error) {
        this.logger.error('Health check failed', error);
        res.status(503).json({
          status: 'unhealthy',
          error: 'Health check failed',
          timestamp: new Date().toISOString()
        });
      }
    });
    
    // 🔍 Health check detalhado
    this.app.get('/health/detailed', async (req, res) => {
      try {
        const detailedHealth = await this.getDetailedHealthStatus();
        
        const hasUnhealthy = Object.values(detailedHealth.services).some(
          (service: any) => service.status === 'unhealthy'
        );
        
        const statusCode = hasUnhealthy ? 503 : 200;
        res.status(statusCode).json(detailedHealth);
        
      } catch (error) {
        this.logger.error('Detailed health check failed', error);
        res.status(503).json({
          status: 'unhealthy',
          error: 'Detailed health check failed'
        });
      }
    });
    
    // 🤖 Teste direto do OpenAI Assistant
    this.app.post('/test/openai', async (req, res) => {
      try {
        const { message, userId } = req.body;
        
        if (!message) {
          return res.status(400).json({
            error: 'Message is required',
            example: { message: 'Olá, preciso de ajuda' }
          });
        }
        
        this.logger.info('Test OpenAI request', { 
          requestId: req.requestId,
          messageLength: message.length 
        });
        
        const result = await this.openaiService.processMessage(
          message,
          userId || `test_${req.requestId}`,
          {
            sessionId: req.requestId,
            metadata: { source: 'test_endpoint' }
          }
        );
        
        res.json({
          success: result.success,
          response: result.response,
          error: result.error,
          requestId: req.requestId
        });
        
      } catch (error) {
        this.logger.error('Test OpenAI failed', error);
        res.status(500).json({
          error: 'Internal server error',
          requestId: req.requestId
        });
      }
    });
    
    // 💼 Teste direto do WHMCS
    this.app.post('/test/whmcs', async (req, res) => {
      try {
        const { action, client_identifier } = req.body;
        
        if (!client_identifier) {
          return res.status(400).json({
            error: 'client_identifier is required',
            example: { action: 'find_client', client_identifier: 'cliente@email.com' }
          });
        }
        
        this.logger.info('Test WHMCS request', { 
          requestId: req.requestId,
          action,
          identifier: client_identifier 
        });
        
        let result;
        
        switch (action) {
          case 'find_client':
            result = await this.whmcsService.findClient(client_identifier);
            break;
          case 'get_invoices':
            const client = await this.whmcsService.findClient(client_identifier);
            if (client) {
              result = await this.whmcsService.getInvoices({ clientId: client.id });
            } else {
              result = { error: 'Client not found' };
            }
            break;
          default:
            return res.status(400).json({
              error: 'Invalid action',
              validActions: ['find_client', 'get_invoices']
            });
        }
        
        res.json({
          action,
          result,
          requestId: req.requestId
        });
        
      } catch (error) {
        this.logger.error('Test WHMCS failed', error);
        res.status(500).json({
          error: 'Internal server error',
          requestId: req.requestId
        });
      }
    });
    
    // 🏭 Informações do Function Factory
    this.app.get('/functions', (req, res) => {
      const stats = FunctionFactory.getStats();
      const definitions = FunctionFactory.getOpenAIFunctionDefinitions();
      
      res.json({
        stats,
        functions: definitions,
        healthCheck: FunctionFactory.healthCheck()
      });
    });
    
    // 📊 Métricas e estatísticas
    this.app.get('/metrics', async (req, res) => {
      try {
        const cacheStats = await cacheService.getStats();
        const functionStats = FunctionFactory.getStats();
        
        res.json({
          server: {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            environment: config.app.env
          },
          cache: cacheStats,
          functions: functionStats,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        this.logger.error('Metrics endpoint failed', error);
        res.status(500).json({ error: 'Failed to get metrics' });
      }
    });
    
    // 🏠 Root endpoint com informações do sistema
    this.app.get('/', (req, res) => {
      res.json({
        service: 'WHMCS Assistant',
        version: '1.0.0',
        status: 'running',
        environment: config.app.env,
        timestamp: new Date().toISOString(),
        endpoints: {
          webhook: 'POST /webhook/whaticket',
          health: 'GET /health',
          test_openai: 'POST /test/openai',
          test_whmcs: 'POST /test/whmcs',
          functions: 'GET /functions',
          metrics: 'GET /metrics'
        },
        documentation: 'https://github.com/seu-usuario/whmcs-assistant'
      });
    });
  }
  
  // ⚠️ Configurar tratamento de erros
  private setupErrorHandlers(): void {
    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Endpoint not found',
        path: req.originalUrl,
        method: req.method,
        availableEndpoints: [
          'POST /webhook/whaticket',
          'GET /health',
          'POST /test/openai',
          'POST /test/whmcs',
          'GET /functions',
          'GET /metrics'
        ]
      });
    });
    
    // Global error handler
    this.app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
      this.logger.error('Unhandled error', error, {
        requestId: req.requestId,
        path: req.path,
        method: req.method
      });
      
      res.status(500).json({
        error: 'Internal server error',
        requestId: req.requestId,
        timestamp: new Date().toISOString()
      });
    });
  }
  
  // 🏥 Status de saúde básico
  private async getHealthStatus(): Promise<any> {
    try {
      const [openaiHealth, cacheHealth] = await Promise.all([
        this.openaiService.healthCheck(),
        cacheService.healthCheck()
      ]);
      
      const isHealthy = openaiHealth.status === 'healthy' && cacheHealth.status === 'healthy';
      
      return {
        status: isHealthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        services: {
          openai: openaiHealth.status,
          cache: cacheHealth.status
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: 'Health check failed'
      };
    }
  }
  
  // 🔍 Status de saúde detalhado
  private async getDetailedHealthStatus(): Promise<any> {
    const [openaiHealth, whmcsHealth, cacheHealth, webhookHealth, functionHealth] = await Promise.all([
      this.openaiService.healthCheck(),
      this.whmcsService.healthCheck(),
      cacheService.healthCheck(),
      this.webhookHandler.healthCheck(),
      Promise.resolve(FunctionFactory.healthCheck())
    ]);
    
    return {
      status: 'detailed',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      services: {
        openai: openaiHealth,
        whmcs: whmcsHealth,
        cache: cacheHealth,
        webhook: webhookHealth,
        functions: functionHealth
      },
      configuration: {
        environment: config.app.env,
        port: config.app.port,
        assistantId: config.openai.assistantId
      }
    };
  }
  
  // 🚀 Inicializar servidor
  async start(): Promise<void> {
    try {
      // 1. Validar configurações
      console.log('🔍 Validando configurações...');
      validateConfig();
      
      // 2. Inicializar serviços
      console.log('🔧 Inicializando serviços...');
      this.openaiService = new OpenAIAssistantService();
      this.whmcsService = new WHMCSService();
      this.webhookHandler = new WebhookHandler();
      
      // 3. Testar conexões críticas
      console.log('🏥 Testando conexões...');
      const healthStatus = await this.getHealthStatus();
      
      if (healthStatus.status === 'unhealthy') {
        console.warn('⚠️ Alguns serviços não estão saudáveis, mas o servidor será iniciado mesmo assim');
      }
      
      // 4. Iniciar servidor HTTP
      const server = this.app.listen(config.app.port, () => {
        console.log('\n' + '='.repeat(60));
        displayConfig();
        
        const functionStats = FunctionFactory.getStats();
        console.log(`
✅ *WHMCS ASSISTANT - SERVIDOR INICIADO COM SUCESSO!*

🌐 Servidor: http://localhost:${config.app.port}
🏥 Health: http://localhost:${config.app.port}/health
📱 Webhook: http://localhost:${config.app.port}/webhook/whaticket
🧪 Teste: http://localhost:${config.app.port}/test/openai

🔧 Funções WHMCS: ${functionStats.totalFunctions} registradas
📊 Status: ${healthStatus.status}
🕐 Iniciado em: ${new Date().toLocaleString('pt-BR')}

💡 Pronto para receber mensagens do WhatsApp via WhaTicket!
        `);
        console.log('='.repeat(60));
      });
      
      // 5. Configurar graceful shutdown
      this.setupGracefulShutdown(server);
      
    } catch (error) {
      console.error('❌ Erro ao iniciar servidor:', error);
      appLogger.error('Server startup failed', error);
      process.exit(1);
    }
  }
  
  // 🛑 Configurar shutdown gracioso
  private setupGracefulShutdown(server: any): void {
    const shutdown = async (signal: string) => {
      console.log(`\n📡 Recebido sinal ${signal}, iniciando shutdown gracioso...`);
      
      server.close(async () => {
        console.log('🌐 Servidor HTTP fechado');
        
        try {
          // Fechar conexões
          await cacheService.disconnect();
          console.log('✅ Conexões fechadas com sucesso');
          
          console.log('👋 Shutdown completo. Até logo!');
          process.exit(0);
        } catch (error) {
          console.error('❌ Erro durante shutdown:', error);
          process.exit(1);
        }
      });
    };
    
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }
}

// 🚀 Inicializar servidor se este arquivo for executado diretamente
if (require.main === module) {
  const server = new Server();
  server.start().catch(error => {
    console.error('❌ Falha crítica ao iniciar servidor:', error);
    process.exit(1);
  });
}

export { Server };
export default Server;
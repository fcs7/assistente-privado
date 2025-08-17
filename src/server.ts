// 🚀 WHMCS Assistant Server Entry Point
import app, { initializeApp } from './app';
import { config } from './config';
import { createLogger } from './utils/logger';

const logger = createLogger({ service: 'server' });

// Inicializar e startar servidor
async function startServer() {
  try {
    // Inicializar aplicação
    await initializeApp();

    // Iniciar servidor
    const PORT = config.app.port;
    
    const server = app.listen(PORT, () => {
      console.log(`
============================================================
🤖 WHMCS Assistant - ONLINE
============================================================

🌐 Servidor: http://localhost:${PORT}
📱 Webhook: http://localhost:${PORT}/webhook  
🏥 Health: http://localhost:${PORT}/health
🔧 Funções: http://localhost:${PORT}/functions

📊 Configuração:
${config.openai.apiKey ? '✅' : '❌'} OpenAI API
${config.whmcs.apiUrl ? '✅' : '❌'} WHMCS API  
${config.whaticket.url ? '✅' : '❌'} WhaTicket API

🔧 Funções WHMCS: ${require('./factories/FunctionFactory').FunctionFactory.getAvailableFunctions().length} registradas
📊 Status: ${config.openai.apiKey && config.whmcs.apiUrl ? 'healthy' : 'unhealthy'}
🕐 Iniciado em: ${new Date().toLocaleString('pt-BR')}

💡 Pronto para receber mensagens do WhatsApp via WhaTicket!
        
============================================================
      `);
      
      logger.info('🚀 Servidor iniciado', {
        port: PORT,
        env: config.app.env,
        functionsCount: require('./factories/FunctionFactory').FunctionFactory.getAvailableFunctions().length
      });
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, shutting down gracefully');
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      logger.info('SIGINT received, shutting down gracefully');
      server.close(() => {
        logger.info('Server closed');  
        process.exit(0);
      });
    });

  } catch (error) {
    logger.error('❌ Falha ao iniciar servidor', error);
    process.exit(1);
  }
}

// Para desenvolvimento com ts-node ou produção com node
if (require.main === module) {
  startServer();
}

export default startServer;
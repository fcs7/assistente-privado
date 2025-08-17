import pino from 'pino';
import { config } from '../config';
import type { LogContext } from '../types';

// 📝 Logger configurado com Pino para performance
const logger = pino({
  level: config.app.logLevel,
  base: {
    env: config.app.env,
    service: 'whmcs-assistant'
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => {
      return { level: label };
    }
  },
  transport: config.app.env === 'development' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname'
    }
  } : undefined
});

// 🏷️ Classe para logging contextual
export class Logger {
  private baseContext: LogContext;

  constructor(context: LogContext = {}) {
    this.baseContext = context;
  }

  private mergeContext(context?: LogContext) {
    return { ...this.baseContext, ...context };
  }

  info(message: string, context?: LogContext) {
    logger.info(this.mergeContext(context), message);
  }

  error(message: string, error?: Error | unknown, context?: LogContext) {
    const errorContext = {
      ...this.mergeContext(context),
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : error
    };
    logger.error(errorContext, message);
  }

  warn(message: string, context?: LogContext) {
    logger.warn(this.mergeContext(context), message);
  }

  debug(message: string, context?: LogContext) {
    logger.debug(this.mergeContext(context), message);
  }

  trace(message: string, context?: LogContext) {
    logger.trace(this.mergeContext(context), message);
  }

  // 🎯 Métodos específicos para o domínio
  openaiRequest(action: string, context?: LogContext) {
    this.info(`OpenAI Request: ${action}`, {
      ...context,
      service: 'openai',
      action
    });
  }

  openaiResponse(action: string, tokensUsed?: number, context?: LogContext) {
    this.info(`OpenAI Response: ${action}`, {
      ...context,
      service: 'openai',
      action,
      tokensUsed
    });
  }

  whmcsRequest(action: string, context?: LogContext) {
    this.info(`WHMCS Request: ${action}`, {
      ...context,
      service: 'whmcs',
      action
    });
  }

  whmcsResponse(action: string, success: boolean, context?: LogContext) {
    this.info(`WHMCS Response: ${action}`, {
      ...context,
      service: 'whmcs',
      action,
      success
    });
  }

  webhookReceived(source: string, event: string, context?: LogContext) {
    this.info(`Webhook received from ${source}`, {
      ...context,
      service: 'webhook',
      source,
      event
    });
  }

  functionExecuted(functionName: string, success: boolean, duration: number, context?: LogContext) {
    this.info(`Function executed: ${functionName}`, {
      ...context,
      service: 'function',
      functionName,
      success,
      duration
    });
  }
}

// 📊 Logger para métricas e performance
export class MetricsLogger {
  private logger: Logger;

  constructor() {
    this.logger = new Logger({ service: 'metrics' });
  }

  requestStarted(method: string, path: string, requestId: string) {
    this.logger.info('Request started', {
      requestId,
      method,
      path,
      timestamp: Date.now()
    });
  }

  requestCompleted(method: string, path: string, requestId: string, statusCode: number, duration: number) {
    this.logger.info('Request completed', {
      requestId,
      method,
      path,
      statusCode,
      duration,
      timestamp: Date.now()
    });
  }

  cacheHit(key: string, ttl?: number) {
    this.logger.debug('Cache hit', {
      key,
      ttl,
      operation: 'cache_hit'
    });
  }

  cacheMiss(key: string) {
    this.logger.debug('Cache miss', {
      key,
      operation: 'cache_miss'
    });
  }

  errorOccurred(error: Error, context?: LogContext) {
    this.logger.error('Error occurred', error, {
      ...context,
      operation: 'error'
    });
  }
}

// 🚀 Instâncias globais para uso em toda a aplicação
export const appLogger = new Logger();
export const metricsLogger = new MetricsLogger();

// 🔧 Função para criar logger com contexto específico
export function createLogger(context: LogContext): Logger {
  return new Logger(context);
}

export default logger;
import { z } from 'zod';
import type { IBaseFunction, FunctionContext, FunctionResult } from '../../types';
import { createLogger } from '../../utils/logger';

// 🏗️ Classe base abstrata para todas as funções WHMCS
export abstract class BaseFunction implements IBaseFunction {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly parameters: any;
  
  protected logger = createLogger({ service: 'function' });
  
  // 🎯 Método abstrato que deve ser implementado por cada função
  abstract execute(args: any, context?: FunctionContext): Promise<FunctionResult>;
  
  // 🛡️ Validação de argumentos (implementação padrão)
  protected validateArgs(args: any, schema?: z.ZodSchema): any {
    if (!schema) {
      return args;
    }
    
    try {
      return schema.parse(args);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessages = error.errors.map(err => 
          `${err.path.join('.')}: ${err.message}`
        ).join(', ');
        
        throw new Error(`Argumentos inválidos: ${errorMessages}`);
      }
      throw error;
    }
  }
  
  // 📊 Wrapper para execução com logging e métricas
  async executeWithLogging(args: any, context?: FunctionContext): Promise<FunctionResult> {
    const startTime = Date.now();
    const requestContext = {
      ...context,
      functionName: this.name,
      requestId: context?.sessionId || `req_${Date.now()}`
    };
    
    this.logger.info(`Executing function: ${this.name}`, {
      ...requestContext,
      args: this.sanitizeArgsForLogging(args)
    });
    
    try {
      const result = await this.execute(args, context);
      const duration = Date.now() - startTime;
      
      this.logger.functionExecuted(this.name, result.success, duration, requestContext);
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.logger.error(`Function ${this.name} failed`, error, requestContext);
      this.logger.functionExecuted(this.name, false, duration, requestContext);
      
      return {
        success: false,
        message: '❌ Ocorreu um erro interno. Tente novamente.',
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      };
    }
  }
  
  // 🧹 Sanitiza argumentos para logging (remove dados sensíveis)
  protected sanitizeArgsForLogging(args: any): any {
    const sanitized = { ...args };
    
    // Remove campos sensíveis
    const sensitiveFields = ['password', 'secret', 'token', 'key', 'auth'];
    sensitiveFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '***';
      }
    });
    
    return sanitized;
  }
  
  // ✅ Cria resultado de sucesso padronizado
  protected createSuccessResult(message: string, data?: any): FunctionResult {
    return {
      success: true,
      message,
      data
    };
  }
  
  // ❌ Cria resultado de erro padronizado
  protected createErrorResult(message: string, error?: string): FunctionResult {
    return {
      success: false,
      message,
      error
    };
  }
  
  // 📱 Formata mensagem para WhatsApp
  protected formatWhatsAppMessage(content: string): string {
    // Garante que a mensagem esteja bem formatada para WhatsApp
    return content
      .trim()
      .replace(/\n{3,}/g, '\n\n') // Remove quebras de linha excessivas
      .replace(/\s+/g, ' ') // Remove espaços extras
      .trim();
  }
  
  // 🔍 Identifica tipo de identificador de cliente
  protected identifyClientIdentifierType(identifier: string): 'email' | 'cpf' | 'cnpj' | 'id' | 'domain' | 'unknown' {
    // Remove espaços e caracteres especiais para análise
    const clean = identifier.replace(/\D/g, '');
    
    // Verifica se é email
    if (identifier.includes('@') && identifier.includes('.')) {
      return 'email';
    }
    
    // Verifica se é ID numérico puro
    if (/^\d+$/.test(identifier) && identifier.length <= 10) {
      return 'id';
    }
    
    // Verifica se é CPF (11 dígitos)
    if (clean.length === 11) {
      return 'cpf';
    }
    
    // Verifica se é CNPJ (14 dígitos)
    if (clean.length === 14) {
      return 'cnpj';
    }
    
    // Verifica se é domínio
    if (identifier.includes('.') && !identifier.includes('@')) {
      return 'domain';
    }
    
    return 'unknown';
  }
  
  // 💰 Formata valor monetário brasileiro
  protected formatCurrency(value: string | number): string {
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    
    if (isNaN(numValue)) {
      return 'R$ 0,00';
    }
    
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(numValue);
  }
  
  // 📅 Formata data brasileira
  protected formatDate(dateString: string): string {
    try {
      const date = new Date(dateString);
      
      if (isNaN(date.getTime())) {
        return dateString; // Retorna original se não conseguir parsear
      }
      
      return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }).format(date);
    } catch {
      return dateString;
    }
  }
  
  // ⏰ Calcula dias até vencimento
  protected calculateDaysUntilDue(dueDate: string): number {
    try {
      const due = new Date(dueDate);
      const now = new Date();
      
      // Reset horas para comparar apenas datas
      due.setHours(0, 0, 0, 0);
      now.setHours(0, 0, 0, 0);
      
      const diffTime = due.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      return diffDays;
    } catch {
      return 0;
    }
  }
  
  // 🎨 Retorna emoji baseado no status
  protected getStatusEmoji(status: string): string {
    const emojiMap: Record<string, string> = {
      // Invoice statuses
      'Paid': '✅',
      'Unpaid': '🟡',
      'Overdue': '🔴',
      'Cancelled': '⚫',
      'Collections': '🔴',
      'Payment Pending': '🟠',
      
      // Service statuses
      'Active': '✅',
      'Pending': '🟡',
      'Suspended': '🟠',
      'Terminated': '🔴',
      'ServiceCancelled': '⚫',
      'Fraud': '🚫',
      
      // Ticket statuses
      'TicketOpen': '🟡',
      'Answered': '🔵',
      'Customer-Reply': '🟠',
      'Closed': '✅',
      
      // Priority levels
      'Low': '🟢',
      'Medium': '🟡',
      'High': '🔴'
    };
    
    return emojiMap[status] || '⚪';
  }
  
  // 🔗 Gera definição da função para OpenAI
  getOpenAIDefinition() {
    return {
      type: 'function' as const,
      function: {
        name: this.name,
        description: this.description,
        parameters: this.parameters
      }
    };
  }
  
  // 📋 Informações da função para debug
  getInfo() {
    return {
      name: this.name,
      description: this.description,
      parameters: this.parameters
    };
  }
}
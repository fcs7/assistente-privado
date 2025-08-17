import { BaseFunction } from '../functions/base/BaseFunction';
import { createLogger } from '../utils/logger';
import type { IBaseFunction, FunctionDefinition, FunctionContext, FunctionResult } from '../types';

// 🏭 Factory Pattern para funções WHMCS - Máxima Extensibilidade
export class FunctionFactory {
  private static functions = new Map<string, () => BaseFunction>();
  private static logger = createLogger({ service: 'factory' });
  
  // 📝 Registrar nova função no factory
  static register(name: string, creator: () => BaseFunction): void {
    this.functions.set(name, creator);
    this.logger.info(`✅ Função registrada: ${name}`);
  }
  
  // 🎯 Criar instância de uma função
  static create(name: string): BaseFunction | null {
    const creator = this.functions.get(name);
    
    if (!creator) {
      this.logger.warn(`❌ Função não encontrada: ${name}`);
      return null;
    }
    
    try {
      const instance = creator();
      this.logger.debug(`🔨 Instância criada: ${name}`);
      return instance;
    } catch (error) {
      this.logger.error(`Erro ao criar função ${name}`, error);
      return null;
    }
  }
  
  // 🔧 Executar função com contexto
  static async execute(
    name: string, 
    args: any, 
    context?: FunctionContext
  ): Promise<FunctionResult> {
    const functionInstance = this.create(name);
    
    if (!functionInstance) {
      return {
        success: false,
        message: `❌ Função '${name}' não encontrada ou não implementada`,
        error: 'Function not found'
      };
    }
    
    try {
      // Usar executeWithLogging da BaseFunction para métricas
      return await functionInstance.executeWithLogging(args, context);
    } catch (error) {
      this.logger.error(`Erro ao executar função ${name}`, error);
      
      return {
        success: false,
        message: '❌ Erro interno ao executar função',
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      };
    }
  }
  
  // 📋 Listar todas as funções disponíveis
  static getAvailableFunctions(): string[] {
    return Array.from(this.functions.keys());
  }
  
  // 📊 Obter informações de uma função
  static getFunctionInfo(name: string): any {
    const functionInstance = this.create(name);
    
    if (!functionInstance) {
      return null;
    }
    
    return functionInstance.getInfo();
  }
  
  // 🤖 Gerar definições para OpenAI Assistant
  static getOpenAIFunctionDefinitions(): FunctionDefinition[] {
    const definitions: FunctionDefinition[] = [];
    
    for (const [name, creator] of this.functions.entries()) {
      try {
        const instance = creator();
        const definition = instance.getOpenAIDefinition();
        definitions.push(definition);
        
        this.logger.debug(`📤 Definição OpenAI gerada: ${name}`);
      } catch (error) {
        this.logger.error(`Erro ao gerar definição OpenAI para ${name}`, error);
      }
    }
    
    return definitions;
  }
  
  // 🔍 Verificar se função existe
  static hasFunction(name: string): boolean {
    return this.functions.has(name);
  }
  
  // 🗑️ Remover função (útil para testes)
  static unregister(name: string): boolean {
    const existed = this.functions.delete(name);
    
    if (existed) {
      this.logger.info(`🗑️ Função removida: ${name}`);
    }
    
    return existed;
  }
  
  // 🧹 Limpar todas as funções (útil para testes)
  static clear(): void {
    const count = this.functions.size;
    this.functions.clear();
    this.logger.info(`🧹 ${count} funções removidas do factory`);
  }
  
  // 📈 Estatísticas do factory
  static getStats(): {
    totalFunctions: number;
    functionNames: string[];
    lastRegistered?: string;
  } {
    const functionNames = this.getAvailableFunctions();
    
    return {
      totalFunctions: functionNames.length,
      functionNames,
      lastRegistered: functionNames[functionNames.length - 1]
    };
  }
  
  // 🔄 Recarregar função (útil para desenvolvimento)
  static reload(name: string, creator: () => BaseFunction): boolean {
    if (this.functions.has(name)) {
      this.functions.set(name, creator);
      this.logger.info(`🔄 Função recarregada: ${name}`);
      return true;
    }
    
    return false;
  }
  
  // 🎯 Auto-register de funções (busca automática - para futuras expansões)
  static autoRegister(functionInstances: { [key: string]: () => BaseFunction }): void {
    let registered = 0;
    
    Object.entries(functionInstances).forEach(([name, creator]) => {
      this.register(name, creator);
      registered++;
    });
    
    this.logger.info(`🚀 Auto-registradas ${registered} funções`);
  }
  
  // 🏥 Health check do factory
  static healthCheck(): {
    status: 'healthy' | 'unhealthy';
    functionsCount: number;
    issues: string[];
  } {
    const issues: string[] = [];
    const functionsCount = this.functions.size;
    
    if (functionsCount === 0) {
      issues.push('Nenhuma função registrada');
    }
    
    // Verificar se todas as funções podem ser instanciadas
    for (const [name, creator] of this.functions.entries()) {
      try {
        const instance = creator();
        if (!instance.name || !instance.description) {
          issues.push(`Função ${name} tem propriedades obrigatórias faltando`);
        }
      } catch (error) {
        issues.push(`Função ${name} não pode ser instanciada: ${error}`);
      }
    }
    
    return {
      status: issues.length === 0 ? 'healthy' : 'unhealthy',
      functionsCount,
      issues
    };
  }
}

// 🎉 Auto-registrar funções quando disponíveis
// Este código será executado quando as funções forem importadas

export function registerWHMCSFunctions() {
  try {
    // Importar e registrar funções WHMCS
    const { GetClientInvoices } = require('../functions/GetClientInvoices');
    const { CheckServiceStatus } = require('../functions/CheckServiceStatus');
    const { CreateTicket } = require('../functions/CreateTicket');
    
    FunctionFactory.register('get_client_invoices', () => new GetClientInvoices());
    FunctionFactory.register('check_service_status', () => new CheckServiceStatus());
    FunctionFactory.register('create_ticket', () => new CreateTicket());
    
    FunctionFactory['logger'].info('✅ 3 funções WHMCS registradas com sucesso!');
    
  } catch (error) {
    FunctionFactory['logger'].error('Erro ao registrar funções WHMCS', error);
    // Fallback silencioso - as funções serão registradas quando disponíveis
  }
}

// 🚀 Executar auto-registro
registerWHMCSFunctions();

// 🔄 Função utilitária para registrar função individual de forma segura
export function safeRegister(name: string, creator: () => BaseFunction): boolean {
  try {
    FunctionFactory.register(name, creator);
    return true;
  } catch (error) {
    FunctionFactory['logger'].error(`Erro ao registrar função ${name}`, error);
    return false;
  }
}

// 📤 Exportar apenas default para evitar conflitos
export default FunctionFactory;
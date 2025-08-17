import OpenAI from 'openai';
import { config } from '../config';
import { createLogger } from '../utils/logger';
import { cacheService, CacheKeys, CacheStrategies } from './CacheService';
import type { 
  OpenAIThread, 
  OpenAIRun, 
  ToolCall, 
  ToolOutput, 
  FunctionContext,
  FunctionResult 
} from '../types';

// 🤖 Serviço principal do OpenAI Assistant
export class OpenAIAssistantService {
  private openai: OpenAI;
  private assistantId: string;
  private logger = createLogger({ service: 'openai' });
  
  constructor() {
    // Inicializar OpenAI client com configurações do .env
    this.openai = new OpenAI({
      apiKey: config.openai.apiKey,
      organization: config.openai.organizationId,
      maxRetries: config.openai.maxRetries,
      timeout: config.openai.timeout
    });
    
    this.assistantId = config.openai.assistantId;
    
    this.logger.info(`✅ OpenAI Assistant configurado: ${this.assistantId}`);
  }
  
  // 💬 Processar mensagem do usuário
  async processMessage(
    message: string, 
    userId?: string, 
    context?: FunctionContext
  ): Promise<{ success: boolean; response?: string; error?: string }> {
    try {
      this.logger.openaiRequest('processMessage', { userId, messageLength: message.length });
      
      // 1. Obter ou criar thread
      const thread = await this.getOrCreateThread(userId);
      
      // 2. Adicionar mensagem do usuário
      await this.openai.beta.threads.messages.create(thread.id, {
        role: 'user',
        content: message
      });
      
      // 3. Executar assistant
      const run = await this.openai.beta.threads.runs.create(thread.id, {
        assistant_id: this.assistantId,
        metadata: {
          userId: userId || 'anonymous',
          timestamp: new Date().toISOString(),
          ...context?.metadata
        }
      });
      
      // 4. Aguardar completion
      const completedRun = await this.waitForCompletion(thread.id, run.id);
      
      // 5. Obter resposta
      const response = await this.getResponse(thread.id);
      
      this.logger.openaiResponse('processMessage', undefined, { 
        userId, 
        runId: run.id,
        status: completedRun.status 
      });
      
      return {
        success: true,
        response
      };
      
    } catch (error) {
      this.logger.error('Erro ao processar mensagem', error, { userId });
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      };
    }
  }
  
  // 🧵 Obter ou criar thread para usuário
  private async getOrCreateThread(userId?: string): Promise<OpenAIThread> {
    if (!userId) {
      // Thread temporária para usuários anônimos
      return await this.openai.beta.threads.create();
    }
    
    const cacheKey = CacheKeys.thread(userId);
    
    return await cacheService.getOrSet(
      cacheKey,
      async () => {
        this.logger.info(`Criando nova thread para usuário: ${userId}`);
        
        const thread = await this.openai.beta.threads.create({
          metadata: {
            userId,
            createdAt: new Date().toISOString()
          }
        });
        
        return thread;
      },
      CacheStrategies.thread
    );
  }
  
  // ⏳ Aguardar completion do run com polling
  private async waitForCompletion(threadId: string, runId: string): Promise<OpenAIRun> {
    const maxAttempts = 30; // 30 tentativas = ~30 segundos
    const pollInterval = 1000; // 1 segundo
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const run = await this.openai.beta.threads.runs.retrieve(threadId, runId);
      
      this.logger.debug(`Run status: ${run.status}`, { 
        threadId, 
        runId, 
        attempt, 
        status: run.status 
      });
      
      switch (run.status) {
        case 'completed':
          return run;
          
        case 'requires_action':
          if (run.required_action?.type === 'submit_tool_outputs') {
            return await this.handleFunctionCalls(threadId, runId, run);
          }
          break;
          
        case 'failed':
        case 'cancelled':
        case 'expired':
          throw new Error(`Run falhou com status: ${run.status}`);
          
        case 'queued':
        case 'in_progress':
        case 'cancelling':
          // Continuar polling
          await this.sleep(pollInterval);
          break;
      }
    }
    
    throw new Error('Timeout aguardando completion do run');
  }
  
  // 🔧 Processar function calls
  private async handleFunctionCalls(threadId: string, runId: string, run: OpenAIRun): Promise<OpenAIRun> {
    if (!run.required_action?.submit_tool_outputs?.tool_calls) {
      throw new Error('Tool calls não encontradas');
    }
    
    const toolCalls = run.required_action.submit_tool_outputs.tool_calls;
    this.logger.info(`Processando ${toolCalls.length} function calls`, { threadId, runId });
    
    const toolOutputs: ToolOutput[] = [];
    
    for (const toolCall of toolCalls) {
      try {
        const output = await this.executeFunctionCall(toolCall);
        toolOutputs.push({
          tool_call_id: toolCall.id,
          output: JSON.stringify(output)
        });
      } catch (error) {
        this.logger.error(`Erro ao executar function call: ${toolCall.function.name}`, error);
        
        toolOutputs.push({
          tool_call_id: toolCall.id,
          output: JSON.stringify({
            success: false,
            message: '❌ Erro interno ao processar função',
            error: error instanceof Error ? error.message : 'Erro desconhecido'
          })
        });
      }
    }
    
    // Submeter outputs e continuar run
    await this.openai.beta.threads.runs.submitToolOutputs(threadId, runId, {
      tool_outputs: toolOutputs
    });
    
    // Aguardar completion novamente
    return await this.waitForCompletion(threadId, runId);
  }
  
  // ⚡ Executar function call individual
  private async executeFunctionCall(toolCall: ToolCall): Promise<FunctionResult> {
    const { name, arguments: argsString } = toolCall.function;
    
    this.logger.info(`Executando function: ${name}`, { 
      functionName: name,
      toolCallId: toolCall.id 
    });
    
    try {
      const args = JSON.parse(argsString);
      
      // Integrar com FunctionFactory
      const { FunctionFactory } = await import('../factories/FunctionFactory');
      
      return await FunctionFactory.execute(name, args, {
        sessionId: toolCall.id,
        metadata: { source: 'openai_assistant' }
      });
      
    } catch (error) {
      this.logger.error(`Erro ao parsear argumentos da função ${name}`, error);
      
      return {
        success: false,
        message: '❌ Erro ao processar argumentos da função',
        error: 'Argumentos inválidos'
      };
    }
  }
  
  // 📥 Obter resposta do assistant
  private async getResponse(threadId: string): Promise<string> {
    const messages = await this.openai.beta.threads.messages.list(threadId, {
      order: 'desc',
      limit: 1
    });
    
    if (messages.data.length === 0) {
      return 'Sem resposta disponível';
    }
    
    const lastMessage = messages.data[0];
    
    if (lastMessage.role === 'assistant' && lastMessage.content[0]?.type === 'text') {
      return lastMessage.content[0].text.value;
    }
    
    return 'Resposta inválida';
  }
  
  // 🧹 Limpar thread de um usuário
  async clearUserThread(userId: string): Promise<boolean> {
    try {
      const cacheKey = CacheKeys.thread(userId);
      await cacheService.del(cacheKey);
      
      this.logger.info(`Thread limpa para usuário: ${userId}`);
      return true;
      
    } catch (error) {
      this.logger.error(`Erro ao limpar thread do usuário ${userId}`, error);
      return false;
    }
  }
  
  // 📊 Obter informações do assistant
  async getAssistantInfo(): Promise<any> {
    try {
      const assistant = await this.openai.beta.assistants.retrieve(this.assistantId);
      
      return {
        id: assistant.id,
        name: assistant.name,
        description: assistant.description,
        model: assistant.model,
        tools: assistant.tools?.length || 0,
        instructions: assistant.instructions ? 'Configuradas' : 'Não configuradas'
      };
      
    } catch (error) {
      this.logger.error('Erro ao obter informações do assistant', error);
      return null;
    }
  }
  
  // 🏥 Health check
  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; latency?: number; assistantId?: string }> {
    try {
      const start = Date.now();
      
      // Tentar obter informações do assistant
      await this.getAssistantInfo();
      
      const latency = Date.now() - start;
      
      return {
        status: 'healthy',
        latency,
        assistantId: this.assistantId
      };
      
    } catch (error) {
      this.logger.error('Health check OpenAI falhou', error);
      
      return {
        status: 'unhealthy',
        assistantId: this.assistantId
      };
    }
  }
  
  // 😴 Utility para sleep
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
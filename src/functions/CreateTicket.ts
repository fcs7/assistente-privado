import { z } from 'zod';
import { BaseFunction } from './base/BaseFunction';
import { WHMCSService } from '../services/WHMCSService';
import { schemas } from '../utils/validators';
import type { FunctionContext, FunctionResult, WHMCSClient } from '../types';

// 🎫 Função para criar ticket de suporte no WHMCS
export class CreateTicket extends BaseFunction {
  readonly name = 'create_ticket';
  readonly description = 'Cria um ticket de suporte no WHMCS para o cliente';
  
  readonly parameters = {
    type: 'object',
    properties: {
      client_identifier: {
        type: 'string',
        description: 'Email, CPF/CNPJ, ID ou domínio do cliente'
      },
      subject: {
        type: 'string',
        description: 'Assunto do ticket de suporte',
        minLength: 5,
        maxLength: 200
      },
      message: {
        type: 'string',
        description: 'Mensagem/descrição detalhada do problema ou solicitação',
        minLength: 10,
        maxLength: 5000
      },
      priority: {
        type: 'string',
        enum: ['Low', 'Medium', 'High'],
        description: 'Prioridade do ticket',
        default: 'Medium'
      },
      department: {
        type: 'string',
        description: 'Departamento específico (opcional - usar nome ou ID do departamento)'
      }
    },
    required: ['client_identifier', 'subject', 'message']
  };
  
  async execute(args: any, context?: FunctionContext): Promise<FunctionResult> {
    try {
      // 🛡️ Validar argumentos
      const validated = this.validateArgs(args, schemas.createTicket);
      
      const whmcsService = new WHMCSService();
      
      // 📋 1. Buscar cliente
      this.logger.info('Buscando cliente para criar ticket...', { 
        identifier: validated.client_identifier 
      });
      
      const client = await whmcsService.findClient(validated.client_identifier);
      
      if (!client) {
        return this.createErrorResult(
          '❌ Cliente não encontrado. Verifique o email, CPF/CNPJ ou ID informado.'
        );
      }
      
      // 🎫 2. Criar ticket
      this.logger.info('Criando ticket de suporte...', { 
        clientId: client.id,
        subject: validated.subject,
        priority: validated.priority
      });
      
      const ticketResult = await whmcsService.createTicket({
        clientId: client.id,
        subject: validated.subject,
        message: this.enhanceTicketMessage(validated.message, context),
        priority: validated.priority,
        department: validated.department
      });
      
      // 📱 3. Formatar resposta
      if (ticketResult.success) {
        const response = this.formatSuccessResponse(
          client, 
          ticketResult, 
          validated.subject,
          validated.priority
        );
        
        return this.createSuccessResult(response.message, {
          client: {
            id: client.id,
            name: client.fullname,
            email: client.email
          },
          ticket: {
            id: ticketResult.ticketId,
            subject: validated.subject,
            priority: validated.priority,
            status: 'Open'
          }
        });
      } else {
        return this.createErrorResult(
          ticketResult.message || '❌ Erro ao criar ticket de suporte.'
        );
      }
      
    } catch (error) {
      this.logger.error('Erro ao criar ticket', error);
      
      return this.createErrorResult(
        '❌ Erro interno ao criar ticket. Tente novamente.',
        error instanceof Error ? error.message : undefined
      );
    }
  }
  
  // 💬 Formatar resposta de sucesso para WhatsApp
  private formatSuccessResponse(
    client: WHMCSClient,
    ticketResult: { ticketId?: number; message: string },
    subject: string,
    priority: string
  ): { message: string } {
    
    const clientName = client.fullname || `${client.firstname} ${client.lastname}`.trim();
    const priorityEmoji = this.getPriorityEmoji(priority);
    
    let message = `🎫 *Ticket Criado com Sucesso!*\n\n`;
    
    message += `👤 *Cliente:* ${clientName}\n`;
    message += `📧 *Email:* ${client.email}\n\n`;
    
    message += `🎯 *Detalhes do Ticket:*\n`;
    if (ticketResult.ticketId) {
      message += `   🆔 ID: #${ticketResult.ticketId}\n`;
    }
    message += `   📝 Assunto: ${subject}\n`;
    message += `   ${priorityEmoji} Prioridade: ${this.translatePriority(priority)}\n`;
    message += `   📊 Status: Aberto\n`;
    message += `   📅 Criado: ${new Date().toLocaleString('pt-BR')}\n\n`;
    
    // Informações sobre próximos passos
    message += `✅ *Próximos Passos:*\n`;
    message += `• Nossa equipe será notificada automaticamente\n`;
    message += `• Você receberá atualizações por email\n`;
    message += `• Tempo médio de resposta: ${this.getExpectedResponseTime(priority)}\n\n`;
    
    // Dicas úteis
    message += `💡 *Dicas:*\n`;
    message += `• Mantenha este número de ticket para referência\n`;
    message += `• Responda ao email para adicionar informações\n`;
    message += `• Acesse o painel de controle para acompanhar\n\n`;
    
    // Informações de contato
    message += `📞 *Precisa de ajuda urgente?*\n`;
    if (priority === 'High') {
      message += `• WhatsApp: (11) 99999-9999\n`;
      message += `• Telefone: (11) 3333-4444\n`;
    } else {
      message += `• Prefira aguardar o retorno via email\n`;
      message += `• Para urgências: WhatsApp (11) 99999-9999\n`;
    }
    
    return {
      message: this.formatWhatsAppMessage(message)
    };
  }
  
  // 📝 Enriquecer mensagem do ticket com contexto
  private enhanceTicketMessage(originalMessage: string, context?: FunctionContext): string {
    let enhancedMessage = originalMessage;
    
    // Adicionar contexto se disponível
    if (context) {
      enhancedMessage += '\n\n--- INFORMAÇÕES TÉCNICAS ---\n';
      
      if (context.sessionId) {
        enhancedMessage += `Session ID: ${context.sessionId}\n`;
      }
      
      if (context.metadata?.source) {
        enhancedMessage += `Origem: ${context.metadata.source}\n`;
      }
      
      enhancedMessage += `Criado via: Assistente WhatsApp\n`;
      enhancedMessage += `Data/Hora: ${new Date().toISOString()}\n`;
    }
    
    // Adicionar instruções para a equipe
    enhancedMessage += '\n--- INSTRUÇÕES PARA SUPORTE ---\n';
    enhancedMessage += 'Este ticket foi criado automaticamente via assistente IA.\n';
    enhancedMessage += 'Cliente preferiu comunicação via WhatsApp.\n';
    enhancedMessage += 'Priorize resposta clara e objetiva.\n';
    
    return enhancedMessage;
  }
  
  // 🎨 Obter emoji da prioridade
  private getPriorityEmoji(priority: string): string {
    const emojiMap: Record<string, string> = {
      'Low': '🟢',
      'Medium': '🟡',
      'High': '🔴'
    };
    
    return emojiMap[priority] || '🟡';
  }
  
  // 🌍 Traduzir prioridade para português
  private translatePriority(priority: string): string {
    const translations: Record<string, string> = {
      'Low': 'Baixa',
      'Medium': 'Média',
      'High': 'Alta'
    };
    
    return translations[priority] || priority;
  }
  
  // ⏱️ Tempo esperado de resposta baseado na prioridade
  private getExpectedResponseTime(priority: string): string {
    const responseTimes: Record<string, string> = {
      'Low': '24-48 horas',
      'Medium': '8-24 horas',
      'High': '2-8 horas'
    };
    
    return responseTimes[priority] || '24 horas';
  }
  
  // 🎯 Sugerir categoria baseada no assunto
  private suggestCategory(subject: string): string | undefined {
    const subjectLower = subject.toLowerCase();
    
    if (subjectLower.includes('email') || subjectLower.includes('e-mail')) {
      return 'Email';
    }
    
    if (subjectLower.includes('site') || subjectLower.includes('website') || subjectLower.includes('dominio')) {
      return 'Hospedagem';
    }
    
    if (subjectLower.includes('fatura') || subjectLower.includes('pagamento') || subjectLower.includes('cobrança')) {
      return 'Financeiro';
    }
    
    if (subjectLower.includes('ssl') || subjectLower.includes('certificado')) {
      return 'Certificados';
    }
    
    return undefined;
  }
}
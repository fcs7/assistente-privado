import { z } from 'zod';
import { BaseFunction } from './base/BaseFunction';
import { WHMCSService } from '../services/WHMCSService';
import { schemas } from '../utils/validators';
import type { FunctionContext, FunctionResult, WHMCSClient, WHMCSService as WHMCSServiceType } from '../types';

// ✅ Função para verificar status dos serviços do cliente
export class CheckServiceStatus extends BaseFunction {
  readonly name = 'check_service_status';
  readonly description = 'Verifica o status dos serviços/produtos de um cliente no WHMCS';
  
  readonly parameters = {
    type: 'object',
    properties: {
      client_identifier: {
        type: 'string',
        description: 'Email, CPF/CNPJ, ID ou domínio do cliente'
      },
      domain: {
        type: 'string',
        description: 'Domínio específico para verificar (opcional)'
      },
      service_id: {
        type: 'integer',
        description: 'ID específico do serviço para verificar (opcional)'
      }
    },
    required: ['client_identifier']
  };
  
  async execute(args: any, context?: FunctionContext): Promise<FunctionResult> {
    try {
      // 🛡️ Validar argumentos
      const validated = this.validateArgs(args, schemas.checkServiceStatus);
      
      const whmcsService = new WHMCSService();
      
      // 📋 1. Buscar cliente
      this.logger.info('Buscando cliente...', { identifier: validated.client_identifier });
      
      const client = await whmcsService.findClient(validated.client_identifier);
      
      if (!client) {
        return this.createErrorResult(
          '❌ Cliente não encontrado. Verifique o email, CPF/CNPJ ou ID informado.'
        );
      }
      
      // 🌐 2. Buscar serviços
      this.logger.info('Buscando serviços...', { 
        clientId: client.id,
        domain: validated.domain,
        serviceId: validated.service_id
      });
      
      const services = await whmcsService.getServices({
        clientId: client.id,
        domain: validated.domain
      });
      
      // 🔍 3. Filtrar por service_id se especificado
      let filteredServices = services;
      if (validated.service_id) {
        filteredServices = services.filter(service => service.id === validated.service_id);
      }
      
      // 📱 4. Formatar resposta para WhatsApp
      const response = this.formatResponse(client, filteredServices);
      
      return this.createSuccessResult(response.message, {
        client: {
          id: client.id,
          name: client.fullname,
          email: client.email
        },
        services: filteredServices.map(service => ({
          id: service.id,
          name: service.name,
          domain: service.domain,
          status: service.status,
          nextDueDate: service.recurringamount ? 'Recurring' : 'One-time'
        })),
        summary: response.summary
      });
      
    } catch (error) {
      this.logger.error('Erro ao verificar status dos serviços', error);
      
      return this.createErrorResult(
        '❌ Erro interno ao verificar serviços. Tente novamente.',
        error instanceof Error ? error.message : undefined
      );
    }
  }
  
  // 💬 Formatar resposta para WhatsApp
  private formatResponse(
    client: WHMCSClient,
    services: WHMCSServiceType[]
  ): { message: string; summary: any } {
    
    const clientName = client.fullname || `${client.firstname} ${client.lastname}`.trim();
    
    let message = `🌐 *Serviços de ${clientName}*\n\n`;
    
    if (services.length === 0) {
      message += '📭 Nenhum serviço encontrado para este cliente.';
      
      return {
        message: this.formatWhatsAppMessage(message),
        summary: {
          totalServices: 0,
          activeServices: 0,
          suspendedServices: 0,
          terminatedServices: 0
        }
      };
    }
    
    // 📊 Calcular estatísticas
    const stats = {
      totalServices: services.length,
      activeServices: services.filter(s => s.status === 'Active').length,
      suspendedServices: services.filter(s => s.status === 'Suspended').length,
      terminatedServices: services.filter(s => s.status === 'Terminated').length,
      pendingServices: services.filter(s => s.status === 'Pending').length
    };
    
    message += `Encontrei *${services.length}* serviço(s):\n\n`;
    
    // 🌐 Processar cada serviço
    for (const service of services) {
      const statusEmoji = this.getStatusEmoji(service.status);
      
      message += `${statusEmoji} *${service.name || service.translated_name || 'Serviço'}*\n`;
      
      if (service.domain) {
        message += `   🌍 Domínio: ${service.domain}\n`;
      }
      
      message += `   📊 Status: ${this.translateServiceStatus(service.status)}\n`;
      
      if (service.amount && parseFloat(service.amount) > 0) {
        message += `   💰 Valor: ${this.formatCurrency(service.amount)}\n`;
      }
      
      if (service.regdate) {
        message += `   📅 Criado em: ${this.formatDate(service.regdate)}\n`;
      }
      
      // Informações específicas baseadas no status
      if (service.status === 'Active') {
        message += '   ✅ Serviço funcionando normalmente\n';
        
        // Informações de uso se disponíveis
        if (service.disk_usage && service.disk_limit) {
          const diskUsagePercent = (service.disk_usage / service.disk_limit) * 100;
          message += `   💽 Disco: ${service.disk_usage}MB / ${service.disk_limit}MB (${diskUsagePercent.toFixed(1)}%)\n`;
        }
        
        if (service.bw_usage && service.bw_limit) {
          const bwUsagePercent = (service.bw_usage / service.bw_limit) * 100;
          message += `   🔄 Tráfego: ${service.bw_usage}MB / ${service.bw_limit}MB (${bwUsagePercent.toFixed(1)}%)\n`;
        }
        
      } else if (service.status === 'Suspended') {
        message += '   ⚠️ Serviço suspenso - verifique pagamentos\n';
        
      } else if (service.status === 'Terminated') {
        message += '   ❌ Serviço cancelado\n';
        
      } else if (service.status === 'Pending') {
        message += '   🟡 Serviço aguardando ativação\n';
      }
      
      // Credenciais se disponíveis e serviço ativo
      if (service.status === 'Active' && service.username) {
        message += `   👤 Usuário: ${service.username}\n`;
        // Note: Não exibimos senhas por segurança
        message += '   🔒 Senha: (disponível no painel de controle)\n';
      }
      
      // Servidor se disponível
      if (service.serverhostname || service.serverip) {
        message += `   🖥️ Servidor: ${service.serverhostname || service.serverip}\n`;
      }
      
      message += '\n';
    }
    
    // 📊 Resumo se houver múltiplos serviços
    if (services.length > 1) {
      message += '📊 *Resumo:*\n';
      message += `   📈 Total: ${stats.totalServices} serviços\n`;
      
      if (stats.activeServices > 0) {
        message += `   ✅ Ativos: ${stats.activeServices}\n`;
      }
      
      if (stats.suspendedServices > 0) {
        message += `   ⚠️ Suspensos: ${stats.suspendedServices}\n`;
      }
      
      if (stats.terminatedServices > 0) {
        message += `   ❌ Cancelados: ${stats.terminatedServices}\n`;
      }
      
      if (stats.pendingServices > 0) {
        message += `   🟡 Pendentes: ${stats.pendingServices}\n`;
      }
    }
    
    // 💡 Dicas baseadas no status
    if (stats.suspendedServices > 0) {
      message += '\n💡 *Dica:* Serviços suspensos podem ser reativados após quitação de pendências.';
    } else if (stats.activeServices === stats.totalServices && stats.totalServices > 0) {
      message += '\n✅ *Parabéns!* Todos os seus serviços estão funcionando normalmente.';
    }
    
    return {
      message: this.formatWhatsAppMessage(message),
      summary: stats
    };
  }
  
  // 🌍 Traduzir status de serviços para português
  private translateServiceStatus(status: string): string {
    const translations: Record<string, string> = {
      'Active': 'Ativo',
      'Pending': 'Pendente',
      'Suspended': 'Suspenso',
      'Terminated': 'Cancelado',
      'Cancelled': 'Cancelado',
      'Fraud': 'Bloqueado por Fraude'
    };
    
    return translations[status] || status;
  }
}
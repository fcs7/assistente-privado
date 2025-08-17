import { z } from 'zod';
import { BaseFunction } from './base/BaseFunction';
import { WHMCSService } from '../services/WHMCSService';
import { schemas } from '../utils/validators';
import type { FunctionContext, FunctionResult, WHMCSClient, WHMCSInvoice } from '../types';

// 📄 Função para buscar faturas do cliente no WHMCS
export class GetClientInvoices extends BaseFunction {
  readonly name = 'get_client_invoices';
  readonly description = 'Busca faturas do cliente no WHMCS com opções de filtro, geração de PIX e envio de PDF';
  
  readonly parameters = {
    type: 'object',
    properties: {
      client_identifier: {
        type: 'string',
        description: 'Email, CPF/CNPJ, ID ou domínio do cliente'
      },
      status: {
        type: 'string',
        enum: ['Unpaid', 'Paid', 'Overdue', 'Cancelled', 'All'],
        description: 'Status das faturas a buscar',
        default: 'Unpaid'
      },
      limit: {
        type: 'integer',
        description: 'Número máximo de faturas a retornar',
        minimum: 1,
        maximum: 20,
        default: 5
      },
      send_pdf: {
        type: 'boolean',
        description: 'Se deve incluir link para PDF das faturas',
        default: false
      },
      send_pix: {
        type: 'boolean',
        description: 'Se deve gerar código PIX para faturas em aberto',
        default: true
      }
    },
    required: ['client_identifier']
  };
  
  async execute(args: any, context?: FunctionContext): Promise<FunctionResult> {
    try {
      // 🛡️ Validar argumentos
      const validated = this.validateArgs(args, schemas.getClientInvoices);
      
      const whmcsService = new WHMCSService();
      
      // 📋 1. Buscar cliente
      this.logger.info('Buscando cliente...', { identifier: validated.client_identifier });
      
      const client = await whmcsService.findClient(validated.client_identifier);
      
      if (!client) {
        return this.createErrorResult(
          '❌ Cliente não encontrado. Verifique o email, CPF/CNPJ ou ID informado.'
        );
      }
      
      // 📄 2. Buscar faturas
      this.logger.info('Buscando faturas...', { 
        clientId: client.id, 
        status: validated.status 
      });
      
      const invoices = await whmcsService.getInvoices({
        clientId: client.id,
        status: validated.status,
        limit: validated.limit
      });
      
      // 📱 3. Formatar resposta para WhatsApp
      const response = await this.formatResponse(
        client, 
        invoices, 
        validated.send_pix, 
        validated.send_pdf,
        whmcsService
      );
      
      return this.createSuccessResult(response.message, {
        client: {
          id: client.id,
          name: client.fullname,
          email: client.email
        },
        invoices: invoices.map(inv => ({
          id: inv.id,
          number: inv.number,
          total: inv.total,
          status: inv.status,
          duedate: inv.duedate
        })),
        summary: response.summary
      });
      
    } catch (error) {
      this.logger.error('Erro ao buscar faturas', error);
      
      return this.createErrorResult(
        '❌ Erro interno ao buscar faturas. Tente novamente.',
        error instanceof Error ? error.message : undefined
      );
    }
  }
  
  // 💬 Formatar resposta para WhatsApp
  private async formatResponse(
    client: WHMCSClient,
    invoices: WHMCSInvoice[],
    sendPix: boolean,
    sendPdf: boolean,
    whmcsService: WHMCSService
  ): Promise<{ message: string; summary: any }> {
    
    const clientName = client.fullname || `${client.firstname} ${client.lastname}`.trim();
    
    let message = `📋 *Faturas de ${clientName}*\n\n`;
    
    if (invoices.length === 0) {
      message += '✅ Parabéns! Você não possui faturas pendentes no momento.';
      
      return {
        message: this.formatWhatsAppMessage(message),
        summary: {
          totalInvoices: 0,
          totalAmount: 0,
          overdueCount: 0
        }
      };
    }
    
    // 📊 Calcular resumo
    const totalAmount = invoices.reduce((sum, inv) => sum + parseFloat(inv.total || '0'), 0);
    const overdueCount = invoices.filter(inv => 
      inv.status === 'Overdue' || 
      (inv.status === 'Unpaid' && this.calculateDaysUntilDue(inv.duedate) < 0)
    ).length;
    
    message += `Encontrei *${invoices.length}* fatura(s):\n\n`;
    
    // 📄 Processar cada fatura
    for (const invoice of invoices) {
      const statusEmoji = this.getStatusEmoji(invoice.status);
      const daysUntilDue = this.calculateDaysUntilDue(invoice.duedate);
      
      message += `${statusEmoji} *Fatura #${invoice.number}*\n`;
      message += `   💰 Valor: ${this.formatCurrency(invoice.total)}\n`;
      message += `   📅 Vencimento: ${this.formatDate(invoice.duedate)}`;
      
      // Adicionar informação de dias
      if (invoice.status === 'Unpaid') {
        if (daysUntilDue > 0) {
          message += ` (${daysUntilDue} dias)\n`;
        } else if (daysUntilDue === 0) {
          message += ` (Vence hoje! ⚠️)\n`;
        } else {
          message += ` (${Math.abs(daysUntilDue)} dias em atraso! 🚨)\n`;
        }
      } else {
        message += '\n';
      }
      
      message += `   📊 Status: ${this.translateStatus(invoice.status)}\n`;
      
      // 🔗 Adicionar PIX para faturas em aberto
      if (sendPix && (invoice.status === 'Unpaid' || invoice.status === 'Overdue')) {
        try {
          const pixResult = await whmcsService.generatePIX(invoice.id);
          if (pixResult.success && pixResult.code) {
            message += `   📱 PIX: \`${pixResult.code}\`\n`;
            if (pixResult.qrCode) {
              message += `   📲 QR Code: ${pixResult.qrCode}\n`;
            }
          }
        } catch (error) {
          this.logger.warn(`Erro ao gerar PIX para fatura ${invoice.id}`, error);
        }
      }
      
      // 📎 Adicionar link PDF
      if (sendPdf) {
        // Na prática, você construiria o link real do WHMCS
        const pdfLink = `https://seu-whmcs.com/dl/invoice/${invoice.id}/${invoice.number}`;
        message += `   📎 PDF: ${pdfLink}\n`;
      }
      
      message += '\n';
    }
    
    // 💡 Adicionar resumo final
    if (invoices.length > 1) {
      message += '📊 *Resumo:*\n';
      message += `   💰 Total: ${this.formatCurrency(totalAmount)}\n`;
      
      if (overdueCount > 0) {
        message += `   🚨 Em atraso: ${overdueCount} fatura(s)\n`;
      }
      
      const unpaidCount = invoices.filter(inv => inv.status === 'Unpaid').length;
      if (unpaidCount > 0) {
        message += `   🟡 Pendentes: ${unpaidCount} fatura(s)\n`;
      }
    }
    
    // 💬 Adicionar dicas úteis
    if (overdueCount > 0) {
      message += '\n💡 *Dica:* Faturas em atraso podem gerar multa e juros. Quite o quanto antes!';
    } else if (invoices.some(inv => inv.status === 'Unpaid')) {
      message += '\n💡 *Dica:* Use o código PIX acima para pagamento instantâneo!';
    }
    
    return {
      message: this.formatWhatsAppMessage(message),
      summary: {
        totalInvoices: invoices.length,
        totalAmount,
        overdueCount
      }
    };
  }
  
  // 🌍 Traduzir status para português
  private translateStatus(status: string): string {
    const translations: Record<string, string> = {
      'Unpaid': 'Pendente',
      'Paid': 'Pago',
      'Overdue': 'Em Atraso',
      'Cancelled': 'Cancelado',
      'Collections': 'Cobrança',
      'Payment Pending': 'Pagamento Pendente'
    };
    
    return translations[status] || status;
  }
}
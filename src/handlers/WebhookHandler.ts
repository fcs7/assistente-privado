import { Request, Response } from 'express';
import { OpenAIAssistantService } from '../services/OpenAIAssistantService';
import { cacheService, CacheKeys, CacheStrategies } from '../services/CacheService';
import { createLogger } from '../utils/logger';
import { schemas, validators } from '../utils/validators';
import { config } from '../config';
import type { WhaTicketWebhook } from '../types';

// 📱 Handler para webhooks do WhaTicket (WhatsApp)
export class WebhookHandler {
  private openaiService: OpenAIAssistantService;
  private logger = createLogger({ service: 'webhook' });
  
  constructor() {
    this.openaiService = new OpenAIAssistantService();
  }
  
  // 🎯 Processar webhook principal
  async handle(req: Request, res: Response): Promise<void> {
    const startTime = Date.now();
    const requestId = `webhook_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      this.logger.webhookReceived('WhaTicket', 'message', { requestId });
      
      // 🛡️ 1. Validar assinatura do webhook (se configurado)
      if (config.webhook.secret !== 'default-secret-change-in-production') {
        const isValid = this.validateWebhookSignature(req);
        if (!isValid) {
          this.logger.warn('Webhook com assinatura inválida rejeitado', { requestId });
          res.status(401).json({ error: 'Invalid signature' });
          return;
        }
      }
      
      // 📝 2. Validar estrutura do payload
      const webhookData = this.validateWebhookPayload(req.body);
      if (!webhookData) {
        this.logger.warn('Webhook com payload inválido rejeitado', { requestId });
        res.status(400).json({ error: 'Invalid payload' });
        return;
      }
      
      // 🚫 3. Filtrar eventos relevantes (apenas mensagens do cliente)
      if (!this.shouldProcessMessage(webhookData)) {
        this.logger.debug('Webhook ignorado (não é mensagem de cliente)', { 
          requestId, 
          event: webhookData.event 
        });
        res.status(200).json({ status: 'ignored', reason: 'not a client message' });
        return;
      }
      
      // 🔄 4. Verificar duplicação (idempotência)
      const messageId = webhookData.message?.id;
      if (messageId && await this.isDuplicateMessage(messageId)) {
        this.logger.debug('Mensagem duplicada ignorada', { requestId, messageId });
        res.status(200).json({ status: 'duplicate', messageId });
        return;
      }
      
      // ⚡ 5. Processar mensagem de forma assíncrona
      this.processMessageAsync(webhookData, requestId).catch(error => {
        this.logger.error('Erro no processamento assíncrono', error, { requestId });
      });
      
      // 📤 6. Responder rapidamente ao webhook
      const duration = Date.now() - startTime;
      this.logger.info('Webhook aceito para processamento', { 
        requestId, 
        duration,
        messageId 
      });
      
      res.status(200).json({ 
        status: 'accepted', 
        requestId,
        messageId,
        processingAsync: true 
      });
      
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Erro ao processar webhook', error, { requestId, duration });
      
      res.status(500).json({ 
        error: 'Internal server error', 
        requestId 
      });
    }
  }
  
  // 🔐 Validar assinatura do webhook
  private validateWebhookSignature(req: Request): boolean {
    try {
      const signature = req.headers['x-signature'] || req.headers['signature'];
      
      if (!signature || typeof signature !== 'string') {
        return false;
      }
      
      const payload = JSON.stringify(req.body);
      const validation = validators.webhookSignature(payload, signature, config.webhook.secret);
      
      return validation.isValid;
    } catch (error) {
      this.logger.error('Erro ao validar assinatura do webhook', error);
      return false;
    }
  }
  
  // ✅ Validar payload do webhook
  private validateWebhookPayload(body: any): WhaTicketWebhook | null {
    try {
      return schemas.whaTicketWebhook.parse(body);
    } catch (error) {
      this.logger.error('Payload do webhook inválido', error);
      return null;
    }
  }
  
  // 🎯 Verificar se deve processar a mensagem
  private shouldProcessMessage(webhookData: WhaTicketWebhook): boolean {
    // Processar apenas mensagens de texto que não são nossas
    return !!(
      webhookData.message &&
      webhookData.message.body &&
      !webhookData.message.fromMe &&
      webhookData.message.body.trim().length > 0
    );
  }
  
  // 🔄 Verificar mensagem duplicada
  private async isDuplicateMessage(messageId: string): Promise<boolean> {
    const cacheKey = CacheKeys.webhookResponse(messageId);
    const cached = await cacheService.get(cacheKey);
    return cached.hit;
  }
  
  // ⚡ Processar mensagem de forma assíncrona
  private async processMessageAsync(webhookData: WhaTicketWebhook, requestId: string): Promise<void> {
    const startTime = Date.now();
    
    try {
      if (!webhookData.message || !webhookData.ticket) {
        throw new Error('Dados da mensagem ou ticket ausentes');
      }
      
      const message = webhookData.message;
      const ticket = webhookData.ticket;
      
      // 🆔 Identificar usuário único
      const userId = this.extractUserId(ticket);
      
      this.logger.info('Processando mensagem do cliente', {
        requestId,
        userId,
        messageId: message.id,
        contactNumber: ticket.contact.number,
        messageLength: message.body.length
      });
      
      // 🤖 Processar com OpenAI Assistant
      const response = await this.openaiService.processMessage(
        message.body,
        userId,
        {
          sessionId: requestId,
          userId,
          metadata: {
            source: 'whaticket',
            messageId: message.id,
            contactNumber: ticket.contact.number,
            contactName: ticket.contact.name,
            whatsappId: ticket.whatsapp.id
          }
        }
      );
      
      // 📤 Enviar resposta se processamento foi bem-sucedido
      if (response.success && response.response) {
        await this.sendResponseToWhatsApp(
          ticket,
          response.response,
          requestId
        );
        
        // 💾 Cachear para evitar duplicação
        const cacheKey = CacheKeys.webhookResponse(message.id);
        await cacheService.set(cacheKey, { 
          processed: true, 
          requestId,
          response: response.response 
        }, CacheStrategies.webhook);
        
      } else {
        this.logger.error('Falha no processamento da mensagem', undefined, {
          requestId,
          userId,
          error: response.error
        });
        
        // Enviar mensagem de erro amigável
        await this.sendErrorResponse(ticket, requestId);
      }
      
      const duration = Date.now() - startTime;
      this.logger.info('Processamento assíncrono concluído', {
        requestId,
        userId,
        duration,
        success: response.success
      });
      
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Erro no processamento assíncrono da mensagem', error, {
        requestId,
        duration
      });
      
      // Tentar enviar mensagem de erro genérica
      if (webhookData.ticket) {
        await this.sendErrorResponse(webhookData.ticket, requestId);
      }
    }
  }
  
  // 🆔 Extrair ID único do usuário
  private extractUserId(ticket: any): string {
    // Usar número do WhatsApp como identificador único
    const number = ticket.contact.number.replace(/\D/g, '');
    return `whatsapp_${number}`;
  }
  
  // 📤 Enviar resposta para WhatsApp via API NTWeb
  private async sendResponseToWhatsApp(
    ticket: any,
    responseText: string,
    requestId: string
  ): Promise<void> {
    try {
      // Usar a API real da NTWeb para envio de mensagens
      const axios = require('axios');
      
      const payload = {
        number: ticket.contact.number,
        body: responseText
      };
      
      this.logger.info('Enviando resposta para WhatsApp via NTWeb API', {
        requestId,
        contactNumber: ticket.contact.number,
        responseLength: responseText.length
      });
      
      const response = await axios.post('https://api-atendimento.ntweb.com.br/api/messages/send', payload, {
        headers: {
          'Authorization': `Bearer ${config.whaticket.token}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });
      
      if (response.status === 200 || response.status === 201) {
        this.logger.info('✅ Resposta enviada com sucesso para WhatsApp', {
          requestId,
          contactNumber: ticket.contact.number,
          messageId: response.data?.messageId || 'unknown',
          responseLength: responseText.length
        });
      } else {
        throw new Error(`API retornou status ${response.status}: ${response.data}`);
      }
      
    } catch (error) {
      this.logger.error('❌ Erro ao enviar resposta para WhatsApp', error, {
        requestId,
        contactNumber: ticket.contact?.number,
        apiEndpoint: 'https://api-atendimento.ntweb.com.br/api/messages/send',
        errorMessage: error.message,
        errorResponse: error.response?.data
      });
      throw error;
    }
  }
  
  // ❌ Enviar mensagem de erro amigável
  private async sendErrorResponse(ticket: any, requestId: string): Promise<void> {
    const errorMessage = `🤖 Olá! Sou seu assistente virtual WHMCS.\n\n` +
      `❌ Desculpe, encontrei um problema técnico ao processar sua mensagem.\n\n` +
      `🔄 Tente novamente em alguns minutos ou entre em contato com nosso suporte:\n` +
      `📞 Telefone: (11) 3333-4444\n` +
      `📧 Email: suporte@empresa.com\n\n` +
      `🆔 Ref: ${requestId}`;
    
    try {
      await this.sendResponseToWhatsApp(ticket, errorMessage, requestId);
    } catch (error) {
      this.logger.error('Erro ao enviar mensagem de erro', error, { requestId });
    }
  }
  
  // 🏥 Health check do webhook handler
  async healthCheck(): Promise<{ 
    status: 'healthy' | 'unhealthy'; 
    services: any;
    uptime: number;
  }> {
    try {
      const openaiHealth = await this.openaiService.healthCheck();
      
      return {
        status: openaiHealth.status === 'healthy' ? 'healthy' : 'unhealthy',
        services: {
          openai: openaiHealth,
          cache: await cacheService.healthCheck()
        },
        uptime: process.uptime()
      };
      
    } catch (error) {
      this.logger.error('Health check falhou', error);
      
      return {
        status: 'unhealthy',
        services: {
          error: 'Health check failed'
        },
        uptime: process.uptime()
      };
    }
  }
}
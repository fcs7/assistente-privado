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
      
      // 🛡️ 1. Validar assinatura do webhook (opcional - mais flexível para Whaticket)
      if (config.webhook.secret && config.webhook.secret !== 'default-secret-change-in-production') {
        // Só valida assinatura se o header estiver presente
        const signature = req.headers['x-signature'] || req.headers['signature'];
        if (signature) {
          const isValid = this.validateWebhookSignature(req);
          if (!isValid) {
            this.logger.warn('Webhook com assinatura inválida rejeitado', { requestId, signature });
            res.status(401).json({ error: 'Invalid signature' });
            return;
          }
          this.logger.debug('Webhook com assinatura válida', { requestId });
        } else {
          this.logger.debug('Webhook sem assinatura - permitindo (Whaticket)', { requestId });
        }
      } else {
        this.logger.debug('Validação de assinatura desabilitada', { requestId });
      }
      
      // 📝 2. Validar estrutura do payload com logs detalhados
      this.logger.debug('Payload recebido do webhook', { 
        requestId, 
        payload: JSON.stringify(req.body, null, 2),
        headers: req.headers
      });
      
      const webhookData = this.validateWebhookPayload(req.body);
      if (!webhookData) {
        this.logger.warn('Webhook com payload inválido rejeitado', { 
          requestId, 
          payload: req.body,
          payloadType: typeof req.body,
          payloadKeys: Object.keys(req.body || {})
        });
        res.status(400).json({ 
          error: 'Invalid payload', 
          debug: {
            receivedKeys: Object.keys(req.body || {}),
            expectedFormat: 'Whaticket webhook format'
          }
        });
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
  
  // ✅ Validar payload do webhook - mais tolerante a diferentes formatos
  private validateWebhookPayload(body: any): WhaTicketWebhook | null {
    try {
      // Tentar validação normal primeiro
      const result = schemas.whaTicketWebhook.safeParse(body);
      if (result.success) {
        return result.data;
      }
      
      // Se falhar, logar detalhes do erro e tentar estratégias de fallback
      this.logger.warn('Validação inicial falhou, tentando fallbacks', {
        error: result.error.errors,
        receivedData: body
      });
      
      // Fallback: aceitar qualquer objeto que tenha pelo menos message ou event
      if (body && (body.message || body.event || body.ticket)) {
        this.logger.info('Usando fallback - aceitar payload parcial do Whaticket');
        return body as WhaTicketWebhook;
      }
      
      return null;
    } catch (error) {
      this.logger.error('Erro na validação do payload do webhook', error, {
        payload: body,
        payloadType: typeof body
      });
      return null;
    }
  }
  
  // 🎯 Verificar se deve processar a mensagem - mais flexível
  private shouldProcessMessage(webhookData: WhaTicketWebhook): boolean {
    // Mais tolerante: processar se tiver message.body (fromMe pode ser undefined)
    if (webhookData.message?.body && webhookData.message.body.trim().length > 0) {
      // Se fromMe está definido, só processar se não for nossa mensagem
      if (webhookData.message.fromMe !== undefined && webhookData.message.fromMe === true) {
        return false;
      }
      return true;
    }
    
    // Processar também eventos específicos do Whaticket mesmo sem mensagem
    if (webhookData.event && ['message', 'message:new', 'message:received'].includes(webhookData.event)) {
      return true;
    }
    
    return false;
  }
  
  // 🔄 Verificar mensagem duplicada
  private async isDuplicateMessage(messageId: string): Promise<boolean> {
    const cacheKey = CacheKeys.webhookResponse(messageId);
    const cached = await cacheService.get(cacheKey);
    return cached.hit;
  }
  
  // ⚡ Processar mensagem de forma assíncrona - mais resiliente
  private async processMessageAsync(webhookData: WhaTicketWebhook, requestId: string): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Mais flexível: tentar extrair dados mesmo que parciais
      const message = webhookData.message;
      const ticket = webhookData.ticket;
      
      // Verificar se temos dados mínimos necessários
      if (!message?.body && !webhookData.event) {
        throw new Error('Dados insuficientes: sem message.body ou event');
      }
      
      // Usar dados padrão se ticket não estiver disponível
      const safeTicket = ticket || {
        id: Date.now(),
        contact: {
          number: 'unknown',
          name: 'Usuario Desconhecido'
        },
        whatsapp: {
          id: 1,
          name: 'WhatsApp'
        }
      };
      
      // 🆔 Identificar usuário único
      const userId = this.extractUserId(safeTicket);
      
      this.logger.info('Processando mensagem do cliente', {
        requestId,
        userId,
        messageId: message?.id || 'unknown',
        contactNumber: safeTicket.contact?.number || 'unknown',
        messageLength: message?.body?.length || 0
      });
      
      // 🤖 Processar com OpenAI Assistant
      const messageBody = message?.body || `Evento: ${webhookData.event}`;
      const response = await this.openaiService.processMessage(
        messageBody,
        userId,
        {
          sessionId: requestId,
          userId,
          metadata: {
            source: 'whaticket',
            messageId: message?.id || 'unknown',
            contactNumber: safeTicket.contact?.number || 'unknown',
            contactName: safeTicket.contact?.name || 'Usuario',
            whatsappId: safeTicket.whatsapp?.id || 1,
            event: webhookData.event
          }
        }
      );
      
      // 📤 Enviar resposta se processamento foi bem-sucedido
      if (response.success && response.response) {
        await this.sendResponseToWhatsApp(
          safeTicket,
          response.response,
          requestId
        );
        
        // 💾 Cachear para evitar duplicação
        const messageId = message?.id || requestId;
        const cacheKey = CacheKeys.webhookResponse(messageId);
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
        await this.sendErrorResponse(safeTicket, requestId);
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
  
  // 🆔 Extrair ID único do usuário - mais resiliente
  private extractUserId(ticket: any): string {
    // Tentar diferentes estratégias para extrair identificador único
    try {
      if (ticket?.contact?.number) {
        const number = ticket.contact.number.replace(/\D/g, '');
        return `whatsapp_${number}`;
      }
      
      if (ticket?.id) {
        return `ticket_${ticket.id}`;
      }
      
      // Fallback para usuário genérico
      return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    } catch (error) {
      this.logger.warn('Erro ao extrair userId, usando fallback', { ticket, error });
      return `fallback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
  }
  
  // 📤 Enviar resposta para WhatsApp via API do Whaticket - mais resiliente
  private async sendResponseToWhatsApp(
    ticket: any,
    responseText: string,
    requestId: string
  ): Promise<void> {
    try {
      // Usar a API do Whaticket para envio de mensagens
      const axios = require('axios');
      
      // Extrair número de contato de forma mais resiliente
      const contactNumber = ticket?.contact?.number || 'unknown';
      if (contactNumber === 'unknown') {
        this.logger.warn('Número de contato não disponível, não é possível enviar resposta', { requestId, ticket });
        return;
      }
      
      const payload = {
        number: contactNumber,
        body: responseText
      };
      
      this.logger.info('Enviando resposta para WhatsApp via API Whaticket', {
        requestId,
        contactNumber,
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
          contactNumber,
          messageId: response.data?.messageId || 'unknown',
          responseLength: responseText.length
        });
      } else {
        throw new Error(`API retornou status ${response.status}: ${response.data}`);
      }
      
    } catch (error) {
      this.logger.error('❌ Erro ao enviar resposta para WhatsApp', error, {
        requestId,
        contactNumber: ticket?.contact?.number || 'unknown',
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
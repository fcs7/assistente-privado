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
      this.logger.info('🔍 PAYLOAD COMPLETO RECEBIDO DO WHATICKET:', { 
        requestId, 
        payload: JSON.stringify(req.body, null, 2),
        payloadKeys: Object.keys(req.body || {}),
        hasTicket: !!req.body?.ticket,
        hasMessage: !!req.body?.message,
        hasEvent: !!req.body?.event,
        headers: {
          'content-type': req.headers['content-type'],
          'user-agent': req.headers['user-agent'],
          'x-signature': req.headers['x-signature']
        }
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
  
  // ✅ Validar payload do webhook - suporte ao formato REAL do Whaticket
  private validateWebhookPayload(body: any): WhaTicketWebhook | null {
    try {
      // 1. Tentar validação com formato REAL do Whaticket primeiro
      const realFormatResult = schemas.whaticketRealWebhook.safeParse(body);
      if (realFormatResult.success) {
        this.logger.info('✅ Payload validado com formato REAL do Whaticket', {
          filaescolhida: body.filaescolhida,
          sender: body.sender,
          mensagem: body.mensagem?.substring(0, 50) + '...'
        });
        return realFormatResult.data as any;
      }
      
      // 2. Tentar validação com formato antigo (compatibilidade)
      const oldFormatResult = schemas.whaTicketWebhook.safeParse(body);
      if (oldFormatResult.success) {
        this.logger.info('✅ Payload validado com formato ANTIGO do Whaticket');
        return oldFormatResult.data;
      }
      
      // 3. Log detalhado dos erros e tentar fallback inteligente
      this.logger.warn('Ambas validações falharam, analisando payload', {
        realFormatErrors: realFormatResult.error.errors,
        oldFormatErrors: oldFormatResult.error.errors,
        receivedKeys: Object.keys(body || {})
      });
      
      // 4. Fallback inteligente: aceitar se tiver campos do Whaticket
      if (body && (body.sender || body.mensagem || body.chamadoId || body.filaescolhida)) {
        this.logger.info('✅ Usando fallback para formato Whaticket real');
        return body as any;
      }
      
      // 5. Fallback antigo mantido
      if (body && (body.message || body.event || body.ticket)) {
        this.logger.info('✅ Usando fallback para formato antigo');
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
  
  // 🎯 Verificar se deve processar a mensagem - formato REAL do Whaticket
  private shouldProcessMessage(webhookData: any): boolean {
    // Formato REAL do Whaticket: usar campo 'mensagem'
    if (webhookData.mensagem && webhookData.mensagem.trim().length > 0) {
      // Se fromMe está definido, só processar se não for nossa mensagem
      if (webhookData.fromMe === true) {
        return false;
      }
      this.logger.debug('✅ Mensagem do formato Whaticket real será processada', {
        mensagem: webhookData.mensagem.substring(0, 50),
        sender: webhookData.sender,
        fila: webhookData.filaescolhida
      });
      return true;
    }
    
    // Formato antigo: usar message.body (compatibilidade)
    if (webhookData.message?.body && webhookData.message.body.trim().length > 0) {
      if (webhookData.message.fromMe === true) {
        return false;
      }
      this.logger.debug('✅ Mensagem do formato antigo será processada');
      return true;
    }
    
    // Processar também eventos específicos
    if (webhookData.event && ['message', 'message:new', 'message:received'].includes(webhookData.event)) {
      return true;
    }
    
    // Processar ações do Whaticket
    if (webhookData.acao && ['start', 'message'].includes(webhookData.acao)) {
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
      
      this.logger.info('🔍 ANALISANDO DADOS DO WEBHOOK (FORMATO REAL):', {
        requestId,
        // Formato REAL do Whaticket
        sender: webhookData.sender,
        mensagem: webhookData.mensagem?.substring(0, 100),
        chamadoId: webhookData.chamadoId,
        filaescolhida: webhookData.filaescolhida,
        filaescolhidaid: webhookData.filaescolhidaid,
        name: webhookData.name,
        fromMe: webhookData.fromMe,
        // Formato antigo (compatibilidade)
        originalMessage: message,
        originalTicket: ticket,
        webhookEvent: webhookData.event
      });
      
      // Verificar dados mínimos - formato REAL do Whaticket
      if (!webhookData.mensagem && !message?.body && !webhookData.event && !webhookData.acao) {
        throw new Error('Dados insuficientes: sem mensagem, message.body, event ou acao');
      }
      
      // 🆔 Identificar usuário único (usando dados diretos do webhook)
      const userId = this.extractUserId(webhookData);
      
      this.logger.info('Processando mensagem do cliente (FORMATO REAL)', {
        requestId,
        userId,
        // Dados do formato REAL do Whaticket
        sender: webhookData.sender,
        chamadoId: webhookData.chamadoId,
        messageLength: webhookData.mensagem?.length || message?.body?.length || 0,
        fila: webhookData.filaescolhida,
        filaId: webhookData.filaescolhidaid
      });
      
      // 🤖 Processar com OpenAI Assistant - usar dados corretos
      const messageBody = webhookData.mensagem || message?.body || `Evento: ${webhookData.event || webhookData.acao}`;
      const contactNumber = webhookData.sender || webhookData.ticketData?.contact?.number || ticket?.contact?.number || 'unknown';
      const contactName = webhookData.name || webhookData.ticketData?.contact?.name || ticket?.contact?.name || 'Usuario';
      
      const response = await this.openaiService.processMessage(
        messageBody,
        userId,
        {
          sessionId: requestId,
          userId,
          metadata: {
            source: 'whaticket',
            // Dados do formato REAL
            messageId: webhookData.chamadoId?.toString() || message?.id || 'unknown',
            contactNumber,
            contactName,
            whatsappId: String(webhookData.defaultWhatsapp_x || webhookData.ticketData?.whatsapp?.id || 1),
            queueName: webhookData.filaescolhida || 'Geral',
            queueId: String(webhookData.filaescolhidaid || webhookData.queueId || 1),
            companyId: String(webhookData.companyId || 1),
            ticketStatus: webhookData.ticketData?.status || 'pending',
            event: webhookData.event || webhookData.acao || 'message'
          }
        }
      );
      
      // 📤 Enviar resposta se processamento foi bem-sucedido
      if (response.success && response.response) {
        // Criar objeto de resposta com dados do formato REAL do Whaticket
        const responseData = {
          contactNumber,
          contactName,
          chamadoId: webhookData.chamadoId,
          filaescolhida: webhookData.filaescolhida,
          // Manter compatibilidade com formato antigo
          ticketData: webhookData.ticketData || ticket
        };
        
        await this.sendResponseToWhatsApp(
          responseData,
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
        const errorResponseData = {
          contactNumber,
          contactName,
          chamadoId: webhookData.chamadoId
        };
        await this.sendErrorResponse(errorResponseData, requestId);
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
      const errorData = {
        contactNumber: webhookData.sender || webhookData.ticketData?.contact?.number || 'unknown',
        contactName: webhookData.name || webhookData.ticketData?.contact?.name || 'Usuario',
        chamadoId: webhookData.chamadoId
      };
      await this.sendErrorResponse(errorData, requestId);
    }
  }
  
  // 🆔 Extrair ID único do usuário - formato REAL do Whaticket
  private extractUserId(webhookData: any): string {
    try {
      // 1. Formato REAL do Whaticket: usar campo 'sender'
      if (webhookData.sender) {
        const number = webhookData.sender.replace(/\D/g, '');
        this.logger.debug('✅ UserId extraído do campo sender', { sender: webhookData.sender, userId: `whatsapp_${number}` });
        return `whatsapp_${number}`;
      }
      
      // 2. Formato antigo: usar ticket.contact.number
      if (webhookData.ticket?.contact?.number) {
        const number = webhookData.ticket.contact.number.replace(/\D/g, '');
        this.logger.debug('✅ UserId extraído do formato antigo', { number, userId: `whatsapp_${number}` });
        return `whatsapp_${number}`;
      }
      
      // 3. Usar ticketData.contact.number (formato misto)
      if (webhookData.ticketData?.contact?.number) {
        const number = webhookData.ticketData.contact.number.replace(/\D/g, '');
        this.logger.debug('✅ UserId extraído do ticketData', { number, userId: `whatsapp_${number}` });
        return `whatsapp_${number}`;
      }
      
      // 4. Usar chamadoId como fallback
      if (webhookData.chamadoId) {
        const userId = `ticket_${webhookData.chamadoId}`;
        this.logger.debug('✅ UserId extraído do chamadoId', { chamadoId: webhookData.chamadoId, userId });
        return userId;
      }
      
      // 5. Usar ticket.id
      if (webhookData.ticket?.id) {
        const userId = `ticket_${webhookData.ticket.id}`;
        this.logger.debug('✅ UserId extraído do ticket.id', { ticketId: webhookData.ticket.id, userId });
        return userId;
      }
      
      // 6. Fallback para usuário genérico
      const fallbackId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      this.logger.warn('⚠️ Nenhum identificador encontrado, usando fallback', { 
        availableFields: Object.keys(webhookData || {}),
        fallbackId 
      });
      return fallbackId;
      
    } catch (error) {
      const errorFallback = `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      this.logger.error('❌ Erro ao extrair userId, usando fallback de erro', { 
        webhookData, 
        error, 
        errorFallback 
      });
      return errorFallback;
    }
  }
  
  // 📤 Enviar resposta para WhatsApp via API do Whaticket - formato REAL
  private async sendResponseToWhatsApp(
    responseData: any,
    responseText: string,
    requestId: string
  ): Promise<void> {
    try {
      // Usar a API do Whaticket para envio de mensagens
      const axios = require('axios');
      
      // Extrair número de contato do formato REAL ou antigo
      const contactNumber = responseData.contactNumber || 
                           responseData.contact?.number || 
                           responseData.ticketData?.contact?.number || 
                           'unknown';
      
      if (contactNumber === 'unknown') {
        this.logger.warn('❌ Número de contato não disponível, não é possível enviar resposta', { 
          requestId, 
          responseData,
          availableFields: Object.keys(responseData || {})
        });
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
  private async sendErrorResponse(responseData: any, requestId: string): Promise<void> {
    const errorMessage = `🤖 Olá! Sou seu assistente virtual WHMCS.\n\n` +
      `❌ Desculpe, encontrei um problema técnico ao processar sua mensagem.\n\n` +
      `🔄 Tente novamente em alguns minutos ou entre em contato com nosso suporte:\n` +
      `📞 Telefone: (11) 3333-4444\n` +
      `📧 Email: suporte@empresa.com\n\n` +
      `🆔 Ref: ${requestId}`;
    
    try {
      await this.sendResponseToWhatsApp(responseData, errorMessage, requestId);
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
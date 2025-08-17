import axios, { AxiosInstance, AxiosError } from 'axios';
import { config } from '../config';
import { createLogger } from '../utils/logger';
import { cacheService, CacheKeys, CacheStrategies } from './CacheService';
import { validators } from '../utils/validators';
import type { 
  WHMCSClient, 
  WHMCSInvoice, 
  WHMCSService as WHMCSServiceType, 
  WHMCSTicket,
  WHMCSApiResponse 
} from '../types';

// 💼 Serviço para integração com WHMCS API
export class WHMCSService {
  private client: AxiosInstance;
  private logger = createLogger({ service: 'whmcs' });
  
  constructor() {
    this.client = axios.create({
      baseURL: config.whmcs.apiUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'WHMCS-Assistant/1.0'
      }
    });
    
    // Interceptor para logging de requests
    this.client.interceptors.request.use(
      (config) => {
        this.logger.whmcsRequest(config.data?.action || 'unknown');
        return config;
      },
      (error) => {
        this.logger.error('WHMCS request failed', error);
        return Promise.reject(error);
      }
    );
    
    // Interceptor para logging de responses
    this.client.interceptors.response.use(
      (response) => {
        const success = response.data?.result === 'success';
        this.logger.whmcsResponse(
          response.config.data?.action || 'unknown', 
          success
        );
        return response;
      },
      (error) => {
        this.logger.error('WHMCS response error', error);
        return Promise.reject(error);
      }
    );
  }
  
  // 🔐 Preparar dados de autenticação para WHMCS
  private prepareAuthData(action: string, additionalData: Record<string, any> = {}) {
    return {
      action,
      username: config.whmcs.identifier,
      password: config.whmcs.secret,
      responsetype: 'json',
      ...additionalData
    };
  }
  
  // 📤 Executar chamada para API WHMCS
  private async makeRequest<T>(action: string, data: Record<string, any> = {}): Promise<WHMCSApiResponse<T>> {
    try {
      const requestData = this.prepareAuthData(action, data);
      
      // Converter para URL-encoded format
      const formData = new URLSearchParams();
      Object.entries(requestData).forEach(([key, value]) => {
        formData.append(key, String(value));
      });
      
      const response = await this.client.post('', formData);
      
      if (response.data.result === 'error') {
        throw new Error(`WHMCS API Error: ${response.data.message}`);
      }
      
      return response.data;
    } catch (error) {
      if (error instanceof AxiosError) {
        this.logger.error(`WHMCS API call failed: ${action}`, error, {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data
        });
        
        throw new Error(`WHMCS API Error: ${error.message}`);
      }
      throw error;
    }
  }
  
  // 👤 Buscar cliente por identificador (email, CPF, ID, etc.)
  async findClient(identifier: string): Promise<WHMCSClient | null> {
    const cacheKey = CacheKeys.client(identifier);
    
    return await cacheService.getOrSet(
      cacheKey,
      async () => {
        this.logger.info(`Buscando cliente: ${identifier}`);
        
        // Determinar tipo de identificador
        const identifierType = this.identifyClientType(identifier);
        
        try {
          let searchData: Record<string, any> = {};
          
          switch (identifierType) {
            case 'email':
              searchData = { email: identifier };
              break;
            case 'id':
              searchData = { clientid: identifier };
              break;
            case 'cpf':
            case 'cnpj':
              // Buscar por campo customizado ou nome
              searchData = { search: identifier.replace(/\D/g, '') };
              break;
            case 'domain':
              searchData = { domain: identifier };
              break;
            default:
              // Busca genérica
              searchData = { search: identifier };
          }
          
          const response = await this.makeRequest<{ clients: { client: WHMCSClient[] } }>('GetClients', {
            ...searchData,
            limitnum: 1
          });
          
          if (response.clients?.client && response.clients.client.length > 0) {
            const client = response.clients.client[0];
            
            // Enriquecer dados do cliente
            client.fullname = `${client.firstname} ${client.lastname}`.trim();
            
            this.logger.info(`Cliente encontrado: ${client.fullname} (ID: ${client.id})`);
            return client;
          }
          
          this.logger.warn(`Cliente não encontrado: ${identifier}`);
          return null;
          
        } catch (error) {
          this.logger.error(`Erro ao buscar cliente: ${identifier}`, error);
          return null;
        }
      },
      CacheStrategies.client
    );
  }
  
  // 📄 Buscar faturas de um cliente
  async getInvoices(options: {
    clientId: number;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<WHMCSInvoice[]> {
    const { clientId, status = 'Unpaid', limit = 10, offset = 0 } = options;
    const cacheKey = CacheKeys.clientInvoices(clientId, status);
    
    return await cacheService.getOrSet(
      cacheKey,
      async () => {
        this.logger.info(`Buscando faturas - Cliente: ${clientId}, Status: ${status}`);
        
        try {
          const searchData: Record<string, any> = {
            userid: clientId,
            limitnum: limit,
            limitstart: offset
          };
          
          if (status !== 'All') {
            searchData.status = status;
          }
          
          const response = await this.makeRequest<{ invoices: { invoice: WHMCSInvoice[] } }>('GetInvoices', searchData);
          
          const invoices = response.invoices?.invoice || [];
          
          this.logger.info(`Encontradas ${invoices.length} faturas para cliente ${clientId}`);
          
          return invoices;
          
        } catch (error) {
          this.logger.error(`Erro ao buscar faturas do cliente ${clientId}`, error);
          return [];
        }
      },
      CacheStrategies.invoices
    );
  }
  
  // 🌐 Buscar serviços de um cliente  
  async getServices(options: {
    clientId: number;
    pid?: number;
    domain?: string;
    status?: string;
  }): Promise<WHMCSServiceType[]> {
    const { clientId, pid, domain, status } = options;
    const cacheKey = CacheKeys.clientServices(clientId);
    
    return await cacheService.getOrSet(
      cacheKey,
      async () => {
        this.logger.info(`Buscando serviços - Cliente: ${clientId}`);
        
        try {
          const searchData: Record<string, any> = {
            clientid: clientId,
            limitnum: 50
          };
          
          if (pid) searchData.pid = pid;
          if (domain) searchData.domain = domain;
          if (status && status !== 'All') searchData.status = status;
          
          const response = await this.makeRequest<{ products: { product: WHMCSServiceType[] } }>('GetClientsProducts', searchData);
          
          const services = response.products?.product || [];
          
          this.logger.info(`Encontrados ${services.length} serviços para cliente ${clientId}`);
          
          return services;
          
        } catch (error) {
          this.logger.error(`Erro ao buscar serviços do cliente ${clientId}`, error);
          return [];
        }
      },
      CacheStrategies.services
    );
  }
  
  // 🎫 Criar ticket de suporte
  async createTicket(options: {
    clientId: number;
    subject: string;
    message: string;
    priority?: string;
    department?: string;
  }): Promise<{ success: boolean; ticketId?: number; message: string }> {
    const { clientId, subject, message, priority = 'Medium', department } = options;
    
    try {
      this.logger.info(`Criando ticket - Cliente: ${clientId}, Assunto: ${subject}`);
      
      const ticketData: Record<string, any> = {
        clientid: clientId,
        subject: subject,
        message: message,
        priority: priority
      };
      
      if (department) {
        ticketData.deptid = department;
      }
      
      const response = await this.makeRequest<{ ticketid: number; tid: string }>('OpenTicket', ticketData);
      
      if (response.ticketid) {
        this.logger.info(`Ticket criado com sucesso - ID: ${response.ticketid}`);
        
        return {
          success: true,
          ticketId: response.ticketid,
          message: `Ticket #${response.tid} criado com sucesso!`
        };
      }
      
      return {
        success: false,
        message: 'Erro ao criar ticket'
      };
      
    } catch (error) {
      this.logger.error(`Erro ao criar ticket para cliente ${clientId}`, error);
      
      return {
        success: false,
        message: 'Erro interno ao criar ticket'
      };
    }
  }
  
  // 💳 Gerar código PIX para fatura (simulado - implementação específica depende do gateway)
  async generatePIX(invoiceId: number): Promise<{ success: boolean; code?: string; qrCode?: string }> {
    try {
      this.logger.info(`Gerando PIX para fatura: ${invoiceId}`);
      
      // Esta é uma implementação simulada
      // Na prática, você integraria com seu gateway de pagamento
      const pixCode = `00020101021226800014br.gov.bcb.pix2558pix.example.com/qr/v2/${invoiceId}52040000530398654041.005802BR5925EMPRESA EXEMPLO LTDA6009SAO PAULO62070503***6304ABCD`;
      
      return {
        success: true,
        code: pixCode,
        qrCode: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(pixCode)}`
      };
      
    } catch (error) {
      this.logger.error(`Erro ao gerar PIX para fatura ${invoiceId}`, error);
      
      return {
        success: false
      };
    }
  }
  
  // 🔍 Identificar tipo de identificador de cliente
  private identifyClientType(identifier: string): 'email' | 'cpf' | 'cnpj' | 'id' | 'domain' | 'unknown' {
    // Remove espaços
    const clean = identifier.trim();
    
    // Email
    if (validators.email(clean)) {
      return 'email';
    }
    
    // ID numérico
    if (/^\d+$/.test(clean) && clean.length <= 10) {
      return 'id';
    }
    
    // CPF
    if (validators.cpf(clean)) {
      return 'cpf';
    }
    
    // CNPJ
    if (validators.cnpj(clean)) {
      return 'cnpj';
    }
    
    // Domain
    if (validators.domain(clean)) {
      return 'domain';
    }
    
    return 'unknown';
  }
  
  // 🏥 Health check da API WHMCS
  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; latency?: number; version?: string }> {
    try {
      const start = Date.now();
      
      // Fazer uma chamada simples para verificar conectividade
      const response = await this.makeRequest('GetStats');
      
      const latency = Date.now() - start;
      
      return {
        status: 'healthy',
        latency,
        version: response.version || 'unknown'
      };
      
    } catch (error) {
      this.logger.error('Health check WHMCS falhou', error);
      
      return {
        status: 'unhealthy'
      };
    }
  }
  
  // 📊 Limpar cache relacionado a um cliente
  async clearClientCache(clientId: number): Promise<void> {
    await Promise.all([
      cacheService.clearPattern(`client:${clientId}:*`),
      cacheService.clearPattern(`client:*:${clientId}`)
    ]);
    
    this.logger.info(`Cache limpo para cliente ${clientId}`);
  }
}
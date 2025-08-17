import Redis from 'ioredis';
import { config } from '../config';
import { createLogger } from '../utils/logger';
import type { CacheOptions, CacheResult } from '../types';

// 🔴 Serviço de cache com Redis para performance
export class CacheService {
  private redis: Redis;
  private logger = createLogger({ service: 'cache' });
  private defaultTTL: number;
  
  constructor() {
    this.defaultTTL = config.redis.ttl;
    
    try {
      this.redis = new Redis(config.redis.url, {
        retryStrategy: (times: number) => {
          if (times > 3) {
            this.logger.warn('⚠️ Redis indisponível - usando cache em memória');
            return null; // Para de tentar
          }
          return Math.min(times * 200, 1000);
        },
        maxRetriesPerRequest: 1,
        lazyConnect: true,
        keepAlive: 30000,
        family: 4, // IPv4
        enableOfflineQueue: false,
        reconnectOnError: () => false
      });
      
      this.redis.on('connect', () => {
        this.logger.info('✅ Conectado ao Redis');
      });
      
      let errorLogged = false;
      this.redis.on('error', (error) => {
        if (!errorLogged && !error.message.includes('ECONNREFUSED')) {
          this.logger.warn('⚠️ Redis não disponível - usando fallback em memória');
          errorLogged = true;
        }
      });
      
      this.redis.on('ready', () => {
        this.logger.info('🚀 Redis pronto para uso');
      });
      
    } catch (error) {
      this.logger.error('❌ Falha ao inicializar Redis', error);
      throw error;
    }
  }
  
  // 📥 Buscar valor do cache
  async get<T = any>(key: string, options?: CacheOptions): Promise<CacheResult<T>> {
    try {
      const fullKey = this.buildKey(key, options?.prefix);
      const startTime = Date.now();
      
      const value = await this.redis.get(fullKey);
      const duration = Date.now() - startTime;
      
      if (value === null) {
        this.logger.debug(`Cache miss: ${fullKey}`, { key: fullKey, duration });
        return { value: null, hit: false };
      }
      
      const parsedValue = JSON.parse(value);
      const ttl = await this.redis.ttl(fullKey);
      
      this.logger.debug(`Cache hit: ${fullKey}`, { 
        key: fullKey, 
        duration, 
        ttl: ttl > 0 ? ttl : undefined 
      });
      
      return { 
        value: parsedValue, 
        hit: true, 
        ttl: ttl > 0 ? ttl : undefined 
      };
      
    } catch (error) {
      this.logger.error(`Erro ao buscar cache: ${key}`, error);
      return { value: null, hit: false };
    }
  }
  
  // 📤 Armazenar valor no cache
  async set<T = any>(key: string, value: T, options?: CacheOptions): Promise<boolean> {
    try {
      const fullKey = this.buildKey(key, options?.prefix);
      const ttl = options?.ttl || this.defaultTTL;
      const serializedValue = JSON.stringify(value);
      
      const startTime = Date.now();
      await this.redis.setex(fullKey, ttl, serializedValue);
      const duration = Date.now() - startTime;
      
      this.logger.debug(`Cache set: ${fullKey}`, { 
        key: fullKey, 
        ttl, 
        duration,
        size: serializedValue.length 
      });
      
      return true;
    } catch (error) {
      this.logger.error(`Erro ao definir cache: ${key}`, error);
      return false;
    }
  }
  
  // 🗑️ Remover valor do cache
  async del(key: string, options?: CacheOptions): Promise<boolean> {
    try {
      const fullKey = this.buildKey(key, options?.prefix);
      const result = await this.redis.del(fullKey);
      
      this.logger.debug(`Cache deleted: ${fullKey}`, { key: fullKey, existed: result > 0 });
      
      return result > 0;
    } catch (error) {
      this.logger.error(`Erro ao deletar cache: ${key}`, error);
      return false;
    }
  }
  
  // 🔄 Buscar ou definir (pattern cache-aside)
  async getOrSet<T = any>(
    key: string, 
    fetcher: () => Promise<T>, 
    options?: CacheOptions
  ): Promise<T> {
    const cached = await this.get<T>(key, options);
    
    if (cached.hit && cached.value !== null) {
      return cached.value;
    }
    
    // Cache miss - buscar dados
    const value = await fetcher();
    
    // Armazenar no cache para próximas requisições
    await this.set(key, value, options);
    
    return value;
  }
  
  // 🧹 Limpar cache por padrão
  async clearPattern(pattern: string, prefix?: string): Promise<number> {
    try {
      const fullPattern = this.buildKey(pattern, prefix);
      const keys = await this.redis.keys(fullPattern);
      
      if (keys.length === 0) {
        return 0;
      }
      
      const result = await this.redis.del(...keys);
      
      this.logger.info(`Cache cleared: ${keys.length} keys matching ${fullPattern}`);
      
      return result;
    } catch (error) {
      this.logger.error(`Erro ao limpar cache com padrão: ${pattern}`, error);
      return 0;
    }
  }
  
  // ⏰ Estender TTL de uma chave
  async extend(key: string, ttl: number, options?: CacheOptions): Promise<boolean> {
    try {
      const fullKey = this.buildKey(key, options?.prefix);
      const result = await this.redis.expire(fullKey, ttl);
      
      this.logger.debug(`Cache TTL extended: ${fullKey}`, { key: fullKey, ttl });
      
      return result === 1;
    } catch (error) {
      this.logger.error(`Erro ao estender TTL: ${key}`, error);
      return false;
    }
  }
  
  // 📊 Verificar se chave existe
  async exists(key: string, options?: CacheOptions): Promise<boolean> {
    try {
      const fullKey = this.buildKey(key, options?.prefix);
      const result = await this.redis.exists(fullKey);
      return result === 1;
    } catch (error) {
      this.logger.error(`Erro ao verificar existência: ${key}`, error);
      return false;
    }
  }
  
  // 🔧 Construir chave completa com prefixo
  private buildKey(key: string, prefix?: string): string {
    const basePrefix = 'whmcs_assistant';
    const fullPrefix = prefix ? `${basePrefix}:${prefix}` : basePrefix;
    return `${fullPrefix}:${key}`;
  }
  
  // 📈 Métricas do cache
  async getStats(): Promise<{
    connected: boolean;
    memory: any;
    keyspace: any;
    commandStats: any;
  }> {
    try {
      const info = await this.redis.info();
      const sections = this.parseRedisInfo(info);
      
      return {
        connected: this.redis.status === 'ready',
        memory: sections.memory || {},
        keyspace: sections.keyspace || {},
        commandStats: sections.commandstats || {}
      };
    } catch (error) {
      this.logger.error('Erro ao obter estatísticas do Redis', error);
      return {
        connected: false,
        memory: {},
        keyspace: {},
        commandStats: {}
      };
    }
  }
  
  // 🔍 Parser das informações do Redis
  private parseRedisInfo(info: string): Record<string, any> {
    const sections: Record<string, any> = {};
    let currentSection = '';
    
    info.split('\r\n').forEach(line => {
      if (line.startsWith('# ')) {
        currentSection = line.substring(2).toLowerCase();
        sections[currentSection] = {};
      } else if (line.includes(':') && currentSection) {
        const [key, value] = line.split(':');
        sections[currentSection][key] = value;
      }
    });
    
    return sections;
  }
  
  // 🏥 Health check
  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; latency?: number }> {
    try {
      const start = Date.now();
      await this.redis.ping();
      const latency = Date.now() - start;
      
      return { status: 'healthy', latency };
    } catch (error) {
      this.logger.error('Health check Redis falhou', error);
      return { status: 'unhealthy' };
    }
  }
  
  // 🔒 Fechar conexão
  async disconnect(): Promise<void> {
    try {
      await this.redis.quit();
      this.logger.info('✅ Conexão Redis fechada');
    } catch (error) {
      this.logger.error('❌ Erro ao fechar conexão Redis', error);
    }
  }
}

// 🌟 Instância singleton para uso global
export const cacheService = new CacheService();

// 🎯 Helper functions para cache específico do domínio
export const CacheKeys = {
  // WHMCS Client cache
  client: (identifier: string) => `client:${identifier}`,
  clientInvoices: (clientId: number, status: string) => `client:${clientId}:invoices:${status}`,
  clientServices: (clientId: number) => `client:${clientId}:services`,
  
  // OpenAI Thread cache
  thread: (userId: string) => `thread:${userId}`,
  
  // Webhook response cache
  webhookResponse: (messageId: string) => `webhook:response:${messageId}`,
  
  // Rate limiting
  rateLimit: (identifier: string) => `ratelimit:${identifier}`
};

// 🔄 Cache strategies específicas
export const CacheStrategies = {
  // Cache de cliente (TTL longo pois dados mudam pouco)
  client: { ttl: 1800, prefix: 'whmcs' }, // 30 minutos
  
  // Cache de faturas (TTL médio pois podem ter atualizações)
  invoices: { ttl: 600, prefix: 'whmcs' }, // 10 minutos
  
  // Cache de serviços (TTL médio)
  services: { ttl: 900, prefix: 'whmcs' }, // 15 minutos
  
  // Cache de thread OpenAI (TTL longo para manter contexto)
  thread: { ttl: 3600, prefix: 'openai' }, // 1 hora
  
  // Cache de resposta webhook (TTL curto para evitar duplicação)
  webhook: { ttl: 300, prefix: 'webhook' } // 5 minutos
};
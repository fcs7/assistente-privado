import { z } from 'zod';
import type { WHMCSApiResponse, WebhookValidation } from '../types';

// 🛡️ Schemas de validação com Zod

// OpenAI Schemas
export const openAIMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1, 'Mensagem não pode estar vazia')
});

export const toolCallSchema = z.object({
  id: z.string(),
  type: z.literal('function'),
  function: z.object({
    name: z.string(),
    arguments: z.string()
  })
});

// WHMCS Schemas
export const whmcsClientSchema = z.object({
  email: z.string().email('Email inválido').optional(),
  userid: z.number().positive('ID do usuário deve ser positivo').optional(),
  domain: z.string().optional()
}).refine(data => data.email || data.userid || data.domain, {
  message: 'Pelo menos um identificador (email, userid ou domain) é necessário'
});

export const whmcsInvoiceFiltersSchema = z.object({
  clientId: z.number().positive('ID do cliente deve ser positivo'),
  status: z.enum(['Unpaid', 'Paid', 'Overdue', 'Cancelled', 'Collections', 'Payment Pending', 'All']).default('Unpaid'),
  limit: z.number().min(1, 'Limite mínimo é 1').max(50, 'Limite máximo é 50').default(10),
  offset: z.number().min(0, 'Offset deve ser não-negativo').default(0)
});

export const whmcsServiceFiltersSchema = z.object({
  clientId: z.number().positive('ID do cliente deve ser positivo'),
  pid: z.number().positive('ID do produto deve ser positivo').optional(),
  domain: z.string().optional(),
  status: z.enum(['Pending', 'Active', 'Suspended', 'Terminated', 'Cancelled', 'Fraud', 'All']).default('All')
});

export const whmcsTicketCreateSchema = z.object({
  clientId: z.number().positive('ID do cliente deve ser positivo'),
  subject: z.string().min(5, 'Assunto deve ter pelo menos 5 caracteres').max(200, 'Assunto muito longo'),
  message: z.string().min(10, 'Mensagem deve ter pelo menos 10 caracteres').max(5000, 'Mensagem muito longa'),
  priority: z.enum(['Low', 'Medium', 'High']).default('Medium'),
  department: z.string().optional()
});

// WhatsApp Schemas - Flexibilizado para aceitar diferentes formatos do Whaticket
export const whaTicketWebhookSchema = z.object({
  event: z.string().optional(),
  ticket: z.object({
    id: z.number().optional(),
    contact: z.object({
      number: z.string().optional(),
      name: z.string().optional()
    }).optional(),
    whatsapp: z.object({
      id: z.number().optional(),
      name: z.string().optional()
    }).optional()
  }).optional(),
  message: z.object({
    id: z.string().optional(),
    body: z.string().optional(),
    fromMe: z.boolean().optional(),
    mediaType: z.string().optional(),
    mediaUrl: z.string().optional(),
    timestamp: z.number().optional()
  }).optional()
}).passthrough(); // Permite campos adicionais não definidos no schema

// Function Parameter Schemas
export const getClientInvoicesSchema = z.object({
  client_identifier: z.string().min(1, 'Identificador do cliente é obrigatório'),
  status: z.enum(['Unpaid', 'Paid', 'Overdue', 'Cancelled', 'All']).default('Unpaid'),
  limit: z.number().min(1).max(20).default(5),
  send_pdf: z.boolean().default(false),
  send_pix: z.boolean().default(true)
});

export const checkServiceStatusSchema = z.object({
  client_identifier: z.string().min(1, 'Identificador do cliente é obrigatório'),
  domain: z.string().optional(),
  service_id: z.number().positive().optional()
}).refine(data => data.domain || data.service_id, {
  message: 'Domain ou service_id deve ser fornecido'
});

export const createTicketSchema = z.object({
  client_identifier: z.string().min(1, 'Identificador do cliente é obrigatório'),
  subject: z.string().min(5, 'Assunto deve ter pelo menos 5 caracteres'),
  message: z.string().min(10, 'Mensagem deve ter pelo menos 10 caracteres'),
  priority: z.enum(['Low', 'Medium', 'High']).default('Medium'),
  department: z.string().optional()
});

// 🔍 Funções de validação

export function validateWHMCSResponse<T>(response: any): WHMCSApiResponse<T> {
  const schema = z.object({
    result: z.enum(['success', 'error']),
    message: z.string().optional(),
    totalresults: z.number().optional(),
    startnumber: z.number().optional(),
    numreturned: z.number().optional()
  }).passthrough(); // Permite campos adicionais
  
  return schema.parse(response) as WHMCSApiResponse<T>;
}

export function validateEmail(email: string): boolean {
  const emailSchema = z.string().email();
  return emailSchema.safeParse(email).success;
}

export function validateCPF(cpf: string): boolean {
  // Remove caracteres não numéricos
  const cleanCPF = cpf.replace(/\D/g, '');
  
  // Verifica se tem 11 dígitos
  if (cleanCPF.length !== 11) return false;
  
  // Verifica se não são todos dígitos iguais
  if (/^(\d)\1{10}$/.test(cleanCPF)) return false;
  
  // Validação dos dígitos verificadores
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cleanCPF.charAt(i)) * (10 - i);
  }
  let digit = 11 - (sum % 11);
  if (digit >= 10) digit = 0;
  if (digit !== parseInt(cleanCPF.charAt(9))) return false;
  
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cleanCPF.charAt(i)) * (11 - i);
  }
  digit = 11 - (sum % 11);
  if (digit >= 10) digit = 0;
  if (digit !== parseInt(cleanCPF.charAt(10))) return false;
  
  return true;
}

export function validateCNPJ(cnpj: string): boolean {
  const cleanCNPJ = cnpj.replace(/\D/g, '');
  
  if (cleanCNPJ.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cleanCNPJ)) return false;
  
  // Validação dos dígitos verificadores do CNPJ
  const weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(cleanCNPJ.charAt(i)) * weights1[i];
  }
  let digit = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (digit !== parseInt(cleanCNPJ.charAt(12))) return false;
  
  sum = 0;
  for (let i = 0; i < 13; i++) {
    sum += parseInt(cleanCNPJ.charAt(i)) * weights2[i];
  }
  digit = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (digit !== parseInt(cleanCNPJ.charAt(13))) return false;
  
  return true;
}

export function validatePhone(phone: string): boolean {
  const cleanPhone = phone.replace(/\D/g, '');
  // Aceita telefones brasileiros com 10 ou 11 dígitos
  return /^(\d{10,11})$/.test(cleanPhone);
}

export function validateDomain(domain: string): boolean {
  const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9](?:\.[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9])*$/;
  return domainRegex.test(domain);
}

// 🔐 Validação de webhook com HMAC
export function validateWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): WebhookValidation {
  try {
    const crypto = require('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
    
    const providedSignature = signature.replace('sha256=', '');
    
    const isValid = crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'hex'),
      Buffer.from(providedSignature, 'hex')
    );
    
    return {
      isValid,
      timestamp: Date.now()
    };
  } catch (error) {
    return {
      isValid: false,
      error: 'Erro na validação da assinatura',
      timestamp: Date.now()
    };
  }
}

// 🧹 Sanitização de dados
export function sanitizeString(input: string, maxLength: number = 1000): string {
  return input
    .trim()
    .slice(0, maxLength)
    .replace(/[<>]/g, '') // Remove caracteres HTML básicos
    .replace(/javascript:/gi, '') // Remove javascript: URLs
    .replace(/on\w+=/gi, ''); // Remove event handlers
}

export function sanitizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

export function sanitizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

// 📋 Utilitários de validação
export const validators = {
  email: validateEmail,
  cpf: validateCPF,
  cnpj: validateCNPJ,
  phone: validatePhone,
  domain: validateDomain,
  webhookSignature: validateWebhookSignature
};

export const sanitizers = {
  string: sanitizeString,
  email: sanitizeEmail,
  phone: sanitizePhone
};

export const schemas = {
  openAIMessage: openAIMessageSchema,
  toolCall: toolCallSchema,
  whmcsClient: whmcsClientSchema,
  whmcsInvoiceFilters: whmcsInvoiceFiltersSchema,
  whmcsServiceFilters: whmcsServiceFiltersSchema,
  whmcsTicketCreate: whmcsTicketCreateSchema,
  whaTicketWebhook: whaTicketWebhookSchema,
  getClientInvoices: getClientInvoicesSchema,
  checkServiceStatus: checkServiceStatusSchema,
  createTicket: createTicketSchema
};
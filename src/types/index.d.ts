// 🏗️ TIPOS ESSENCIAIS DO WHMCS ASSISTANT

// OpenAI Types
export interface OpenAIMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface OpenAIThread {
  id: string;
  created_at: number;
  metadata?: Record<string, any> | null;
}

export interface OpenAIRun {
  id: string;
  thread_id: string;
  assistant_id: string;
  status: 'queued' | 'in_progress' | 'requires_action' | 'cancelling' | 'cancelled' | 'failed' | 'completed' | 'expired' | 'incomplete';
  required_action?: {
    type: 'submit_tool_outputs';
    submit_tool_outputs: {
      tool_calls: ToolCall[];
    };
  } | null;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolOutput {
  tool_call_id: string;
  output: string;
}

// WHMCS Types
export interface WHMCSClient {
  id: number;
  firstname: string;
  lastname: string;
  fullname: string;
  email: string;
  address1: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  phonenumber: string;
  currency: string;
  status: string;
}

export interface WHMCSInvoice {
  id: number;
  invoiceid: number;
  number: string;
  userid: number;
  date: string;
  duedate: string;
  datepaid: string;
  subtotal: string;
  credit: string;
  tax: string;
  tax2: string;
  total: string;
  balance: string;
  taxrate: string;
  taxrate2: string;
  status: 'Unpaid' | 'Paid' | 'Overdue' | 'Cancelled' | 'Collections' | 'Payment Pending';
  paymentmethod: string;
  notes: string;
}

export interface WHMCSService {
  id: number;
  userid: number;
  orderid: number;
  pid: number;
  regdate: string;
  name: string;
  translated_name: string;
  groupname: string;
  translated_groupname: string;
  domain: string;
  dedicatedip: string;
  assignedips: string;
  serverhostname: string;
  serverip: string;
  serverusername: string;
  serverpassword: string;
  recurringamount: string;
  paymentmethod: string;
  firstpaymentamount: string;
  amount: string;
  status: 'Pending' | 'Active' | 'Suspended' | 'Terminated' | 'Cancelled' | 'Fraud';
  username: string;
  password: string;
  subscriptionid: string;
  promocode: string;
  overideautosuspend: string;
  overidesuspenduntil: string;
  dedicatedip: string;
  assignedips: string;
  notes: string;
  disk_usage: number;
  disk_limit: number;
  bw_usage: number;
  bw_limit: number;
  last_update: string;
}

export interface WHMCSTicket {
  id: number;
  tid: string;
  c: string;
  deptid: number;
  userid: number;
  name: string;
  email: string;
  cc: string;
  subject: string;
  status: 'Open' | 'Answered' | 'Customer-Reply' | 'Closed';
  priority: 'Low' | 'Medium' | 'High';
  admin: string;
  attachment: string;
  urgency: 'Low' | 'Medium' | 'High';
  flag: number;
  lastreply: string;
  date: string;
}

// WhatsApp Types
export interface WhatsAppMessage {
  id: string;
  from: string;
  to: string;
  timestamp: number;
  text?: {
    body: string;
  };
  type: 'text' | 'image' | 'audio' | 'video' | 'document';
}

export interface WhaTicketWebhook {
  event?: string;
  ticket?: {
    id?: number;
    contact?: {
      number?: string;
      name?: string;
    };
    whatsapp?: {
      id?: number;
      name?: string;
    };
  };
  message?: {
    id?: string;
    body?: string;
    fromMe?: boolean;
    mediaType?: string;
    mediaUrl?: string;
    timestamp?: number;
  };
}

// Function Types
export interface FunctionContext {
  threadId?: string;
  userId?: string;
  clientId?: number;
  sessionId?: string;
  metadata?: Record<string, any>;
}

export interface FunctionResult {
  success: boolean;
  message: string;
  data?: any;
  error?: string;
  shouldContinue?: boolean;
  nextAction?: string;
}

export interface FunctionDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, any>;
      required: string[];
    };
  };
}

// Base Function Interface
export interface IBaseFunction {
  name: string;
  description: string;
  parameters: any;
  execute(args: any, context?: FunctionContext): Promise<FunctionResult>;
}

// Cache Types
export interface CacheOptions {
  ttl?: number;
  prefix?: string;
}

export interface CacheResult<T = any> {
  value: T | null;
  hit: boolean;
  ttl?: number;
}

// API Response Types
export interface WHMCSApiResponse<T = any> {
  result: 'success' | 'error';
  message?: string;
  totalresults?: number;
  startnumber?: number;
  numreturned?: number;
  [key: string]: T | any;
}

export interface ApiError extends Error {
  code?: string;
  status?: number;
  details?: any;
}

// Logging Types
export interface LogContext {
  requestId?: string;
  userId?: string;
  clientId?: number;
  serviceId?: string;
  action?: string;
  service?: string;
  method?: string;
  path?: string;
  userAgent?: string;
  ip?: string;
  duration?: number;
  contactNumber?: string;
  messageId?: string;
  contactName?: string;
  whatsappId?: string;
  messageLength?: number;
  responseLength?: number;
  apiEndpoint?: string;
  errorMessage?: string;
  errorResponse?: any;
  status?: string;
  statusText?: string;
  data?: any;
  domain?: string;
  port?: number;
  env?: string;
  functions?: number;
  functionsCount?: number;
  identifier?: string;
  subject?: string;
  priority?: string;
  event?: string;
  messageId?: string;
  runId?: string;
  functionName?: string;
  toolCallId?: string;
  threadId?: string;
  error?: string;
  ticketId?: number;
  key?: string;
  ttl?: number;
  operation?: string;
  args?: any;
  tokensUsed?: number;
  statusCode?: number;
  source?: string;
  size?: number;
  attempt?: number;
  existed?: boolean;
  hit?: boolean;
  latency?: number;
  success?: boolean;
  timestamp?: number;
  metadata?: Record<string, any>;
}

// Environment Types
export interface ConfigValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// Webhook Security
export interface WebhookValidation {
  isValid: boolean;
  error?: string;
  timestamp?: number;
}

// Rate Limiting
export interface RateLimitInfo {
  remaining: number;
  resetTime: number;
  limit: number;
}
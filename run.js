#!/usr/bin/env node

// 🚀 WHMCS Assistant - Quick Run Script
// Simplified version to test the core functionality

require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Request ID middleware
app.use((req, res, next) => {
  req.requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  next();
});

// Logging
const log = (level, message, data = {}) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`, 
    Object.keys(data).length > 0 ? JSON.stringify(data, null, 2) : '');
};

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    services: {
      openai: process.env.OPENAI_API_KEY ? 'configured' : 'missing',
      whmcs: process.env.WHMCS_API_URL ? 'configured' : 'missing',
      whaticket: process.env.WHATICKET_URL ? 'configured' : 'missing'
    }
  });
});

// Webhook endpoint
app.post('/webhook', async (req, res) => {
  const requestId = req.requestId;
  
  try {
    log('info', `📱 Webhook received`, {
      requestId,
      body: req.body
    });

    // Validate webhook has required data
    if (!req.body || !req.body.message) {
      return res.status(400).json({
        error: 'Invalid webhook payload',
        requestId
      });
    }

    // Process message (simplified)
    const message = req.body.message;
    const response = await processMessage(message, requestId);

    res.json({
      status: 'processed',
      requestId,
      response
    });

  } catch (error) {
    log('error', `❌ Webhook error`, {
      requestId,
      error: error.message
    });

    res.status(500).json({
      error: 'Internal server error',
      requestId
    });
  }
});

// Simple message processor
async function processMessage(message, requestId) {
  log('info', `🤖 Processing message`, {
    requestId,
    message: message.body || message
  });

  // Check if OpenAI is configured
  if (!process.env.OPENAI_API_KEY) {
    return 'OpenAI não configurado. Configure OPENAI_API_KEY no .env';
  }

  // Basic response for testing
  const responses = {
    'oi': 'Olá! Sou o assistente WHMCS. Como posso ajudar?',
    'faturas': 'Para ver suas faturas, me informe seu email cadastrado.',
    'serviços': 'Para verificar seus serviços, me informe seu email.',
    'suporte': 'Para abrir um ticket, descreva seu problema.',
    'default': 'Olá! Posso ajudar com:\n- Faturas\n- Serviços\n- Suporte\n\nO que você precisa?'
  };

  const text = (message.body || message).toLowerCase();
  
  for (const [key, value] of Object.entries(responses)) {
    if (text.includes(key)) {
      return value;
    }
  }

  return responses.default;
}

// Start server
app.listen(PORT, () => {
  console.log(`
============================================================
🤖 WHMCS Assistant - RUNNING
============================================================

🌐 Server: http://localhost:${PORT}
📱 Webhook: http://localhost:${PORT}/webhook
🏥 Health: http://localhost:${PORT}/health

📊 Configuration Status:
- OpenAI: ${process.env.OPENAI_API_KEY ? '✅ Configured' : '❌ Missing'}
- WHMCS: ${process.env.WHMCS_API_URL ? '✅ Configured' : '❌ Missing'}
- WhaTicket: ${process.env.WHATICKET_URL ? '✅ Configured' : '❌ Missing'}

💡 Test with:
curl http://localhost:${PORT}/health
curl -X POST http://localhost:${PORT}/webhook -H "Content-Type: application/json" -d '{"message":{"body":"oi"}}'

⏹️ Stop with: Ctrl+C
============================================================
  `);
});

// Error handling
process.on('unhandledRejection', (error) => {
  log('error', 'Unhandled rejection', { error: error.message });
});

process.on('uncaughtException', (error) => {
  log('error', 'Uncaught exception', { error: error.message });
  process.exit(1);
});
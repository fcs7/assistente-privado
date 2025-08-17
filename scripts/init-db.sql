-- 🗄️ WHMCS Assistant Database Initialization
-- Criação de tabelas básicas para logs e monitoramento

-- Extensões úteis
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tabela de logs de requests
CREATE TABLE IF NOT EXISTS request_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL,
    path VARCHAR(500) NOT NULL,
    status_code INTEGER,
    duration_ms INTEGER,
    user_agent TEXT,
    ip_address INET,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de logs de webhooks
CREATE TABLE IF NOT EXISTS webhook_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id VARCHAR(255) NOT NULL,
    source VARCHAR(100) NOT NULL,
    event_type VARCHAR(100),
    message_id VARCHAR(255),
    contact_number VARCHAR(50),
    contact_name VARCHAR(255),
    message_body TEXT,
    processed BOOLEAN DEFAULT FALSE,
    response_sent BOOLEAN DEFAULT FALSE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de logs de funções WHMCS
CREATE TABLE IF NOT EXISTS function_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id VARCHAR(255) NOT NULL,
    function_name VARCHAR(100) NOT NULL,
    client_identifier VARCHAR(255),
    client_id INTEGER,
    success BOOLEAN NOT NULL,
    duration_ms INTEGER,
    error_message TEXT,
    response_summary JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de métricas de cache
CREATE TABLE IF NOT EXISTS cache_metrics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key_pattern VARCHAR(255) NOT NULL,
    operation VARCHAR(20) NOT NULL, -- 'hit', 'miss', 'set', 'del'
    ttl_seconds INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_request_logs_created_at ON request_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_request_logs_request_id ON request_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_request_logs_status_code ON request_logs(status_code);

CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON webhook_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_request_id ON webhook_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_message_id ON webhook_logs(message_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_contact_number ON webhook_logs(contact_number);

CREATE INDEX IF NOT EXISTS idx_function_logs_created_at ON function_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_function_logs_function_name ON function_logs(function_name);
CREATE INDEX IF NOT EXISTS idx_function_logs_client_id ON function_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_function_logs_success ON function_logs(success);

CREATE INDEX IF NOT EXISTS idx_cache_metrics_created_at ON cache_metrics(created_at);
CREATE INDEX IF NOT EXISTS idx_cache_metrics_operation ON cache_metrics(operation);

-- Função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers para updated_at
CREATE TRIGGER update_request_logs_updated_at BEFORE UPDATE ON request_logs 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_webhook_logs_updated_at BEFORE UPDATE ON webhook_logs 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Views úteis para monitoramento

-- View de estatísticas de requests
CREATE OR REPLACE VIEW request_stats AS
SELECT 
    DATE_TRUNC('hour', created_at) as hour,
    COUNT(*) as total_requests,
    AVG(duration_ms) as avg_duration_ms,
    COUNT(CASE WHEN status_code >= 200 AND status_code < 300 THEN 1 END) as success_count,
    COUNT(CASE WHEN status_code >= 400 THEN 1 END) as error_count
FROM request_logs 
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', created_at)
ORDER BY hour DESC;

-- View de estatísticas de webhooks
CREATE OR REPLACE VIEW webhook_stats AS
SELECT 
    DATE_TRUNC('hour', created_at) as hour,
    source,
    COUNT(*) as total_webhooks,
    COUNT(CASE WHEN processed = TRUE THEN 1 END) as processed_count,
    COUNT(CASE WHEN response_sent = TRUE THEN 1 END) as response_sent_count,
    COUNT(CASE WHEN error_message IS NOT NULL THEN 1 END) as error_count
FROM webhook_logs 
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', created_at), source
ORDER BY hour DESC, source;

-- View de estatísticas de funções
CREATE OR REPLACE VIEW function_stats AS
SELECT 
    function_name,
    COUNT(*) as total_calls,
    COUNT(CASE WHEN success = TRUE THEN 1 END) as success_count,
    AVG(duration_ms) as avg_duration_ms,
    COUNT(DISTINCT client_id) as unique_clients
FROM function_logs 
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY function_name
ORDER BY total_calls DESC;

-- Inserir dados de exemplo (opcional, apenas para desenvolvimento)
-- Uncomment para inserir dados de teste
/*
INSERT INTO request_logs (request_id, method, path, status_code, duration_ms, user_agent, ip_address) VALUES
('req_test_001', 'POST', '/webhook/whaticket', 200, 150, 'WhaTicket/1.0', '192.168.1.100'),
('req_test_002', 'GET', '/health', 200, 25, 'curl/7.68.0', '127.0.0.1'),
('req_test_003', 'POST', '/test/openai', 200, 2500, 'PostmanRuntime/7.28.4', '192.168.1.101');

INSERT INTO webhook_logs (request_id, source, event_type, message_id, contact_number, contact_name, message_body, processed, response_sent) VALUES
('req_test_001', 'WhaTicket', 'message', 'msg_001', '5511999999999', 'João Silva', 'Olá, preciso de ajuda com minhas faturas', true, true),
('req_test_004', 'WhaTicket', 'message', 'msg_002', '5511888888888', 'Maria Santos', 'Como verifico o status do meu serviço?', true, true);

INSERT INTO function_logs (request_id, function_name, client_identifier, client_id, success, duration_ms) VALUES
('req_test_001', 'get_client_invoices', 'joao@email.com', 123, true, 850),
('req_test_004', 'check_service_status', 'maria@email.com', 456, true, 650);
*/

-- Comentário final
COMMENT ON DATABASE whmcs_assistant IS 'Database for WHMCS Assistant - WhatsApp Integration with OpenAI';
-- ══════════════════════════════════════════════════════════════
-- EXECUTE ESTE SCRIPT NO SUPABASE SQL EDITOR
-- ══════════════════════════════════════════════════════════════

-- 1. Reestrutura clientes: cpf vira opcional, adiciona id + telefone
ALTER TABLE clientes DROP CONSTRAINT IF EXISTS clientes_pkey;
ALTER TABLE clientes ALTER COLUMN cpf DROP NOT NULL;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS id       BIGSERIAL;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS telefone TEXT;
ALTER TABLE clientes ADD PRIMARY KEY (id);
CREATE INDEX IF NOT EXISTS idx_clientes_telefone ON clientes (telefone);

-- 2. WhatsApp de suporte por condomínio
ALTER TABLE unidades ADD COLUMN IF NOT EXISTS whatsapp TEXT;

-- 3. Vincula pedido ao cliente
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cliente_id BIGINT REFERENCES clientes(id);
CREATE INDEX IF NOT EXISTS idx_pedidos_cliente ON pedidos (cliente_id);

-- Reestrutura clientes: cpf vira opcional, adiciona id + telefone
-- (cpf era PK e NOT NULL — incompatível com cadastro via celular)

ALTER TABLE clientes DROP CONSTRAINT IF EXISTS clientes_pkey;
ALTER TABLE clientes ALTER COLUMN cpf DROP NOT NULL;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS id BIGSERIAL;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS telefone TEXT;

-- Torna id a nova PK
ALTER TABLE clientes ADD PRIMARY KEY (id);

-- Index para busca por telefone (verificar duplicatas)
CREATE INDEX IF NOT EXISTS idx_clientes_telefone ON clientes (telefone);

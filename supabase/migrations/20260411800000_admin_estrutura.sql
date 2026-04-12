-- Expande unidades → condomínios
ALTER TABLE unidades ADD COLUMN IF NOT EXISTS endereco   TEXT;
ALTER TABLE unidades ADD COLUMN IF NOT EXISTS cidade     TEXT;
ALTER TABLE unidades ADD COLUMN IF NOT EXISTS cep        TEXT;
ALTER TABLE unidades ADD COLUMN IF NOT EXISTS ativo      BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE unidades ADD COLUMN IF NOT EXISTS mesa_qr    TEXT;

-- Estoque por condomínio
CREATE TABLE IF NOT EXISTS estoque (
  id             BIGSERIAL PRIMARY KEY,
  unidade_id     INTEGER   NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
  produto_id     BIGINT    NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  quantidade     INTEGER   NOT NULL DEFAULT 0 CHECK (quantidade >= 0),
  preco_venda    NUMERIC(10,2),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (unidade_id, produto_id)
);
CREATE INDEX IF NOT EXISTS idx_estoque_unidade ON estoque (unidade_id);
CREATE INDEX IF NOT EXISTS idx_estoque_produto ON estoque (produto_id);

ALTER TABLE estoque ENABLE ROW LEVEL SECURITY;
CREATE POLICY "estoque_all" ON estoque FOR ALL USING (true);

-- Clientes vinculados ao condomínio
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS unidade_id INTEGER REFERENCES unidades(id);

-- Trigger: atualiza updated_at do estoque
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER estoque_updated_at
  BEFORE UPDATE ON estoque
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

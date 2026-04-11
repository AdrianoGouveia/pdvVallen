-- Destaque nos produtos (aparecem na tela inicial)
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS destaque BOOLEAN NOT NULL DEFAULT FALSE;

-- Tabela de unidades (lojas/tablets)
CREATE TABLE IF NOT EXISTS unidades (
  id         SERIAL PRIMARY KEY,
  nome       TEXT NOT NULL,
  codigo     TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Vincular venda à unidade
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS unidade_id INTEGER REFERENCES unidades(id);

-- RLS unidades
ALTER TABLE unidades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leitura pública de unidades" ON unidades FOR SELECT USING (true);
CREATE POLICY "Gestão de unidades anon"     ON unidades FOR ALL   USING (true);

-- Destaque: policy de update em produtos já existe, só garantir
CREATE POLICY "Update destaque anon" ON produtos FOR UPDATE USING (true) WITH CHECK (true);

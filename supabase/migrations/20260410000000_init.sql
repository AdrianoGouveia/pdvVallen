-- ============================================================
-- PDV Vallen — Schema Supabase
-- ============================================================

-- Tabela de produtos
CREATE TABLE IF NOT EXISTS produtos (
  id              BIGSERIAL PRIMARY KEY,
  nome            TEXT        NOT NULL,
  preco           NUMERIC(10,2) NOT NULL CHECK (preco >= 0),
  codigo_barras   TEXT        UNIQUE NOT NULL,
  estoque         INTEGER     NOT NULL DEFAULT 0 CHECK (estoque >= 0),
  imagem_url      TEXT,
  restrito_idade  BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabela de clientes (verificação de idade)
CREATE TABLE IF NOT EXISTS clientes (
  cpf             TEXT        PRIMARY KEY,
  nome            TEXT        NOT NULL,
  data_nascimento DATE        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabela de pedidos (histórico)
CREATE TABLE IF NOT EXISTS pedidos (
  id              BIGSERIAL PRIMARY KEY,
  total           NUMERIC(10,2) NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'aprovado',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabela de itens do pedido
CREATE TABLE IF NOT EXISTS itens_pedido (
  id              BIGSERIAL PRIMARY KEY,
  pedido_id       BIGINT      REFERENCES pedidos(id) ON DELETE CASCADE,
  produto_id      BIGINT      REFERENCES produtos(id),
  quantidade      INTEGER     NOT NULL CHECK (quantidade > 0),
  preco_unitario  NUMERIC(10,2) NOT NULL
);

-- ============================================================
-- Função segura para dar baixa no estoque (transação atômica)
-- ============================================================
CREATE OR REPLACE FUNCTION baixar_estoque(
  p_produto_id BIGINT,
  p_quantidade INTEGER
)
RETURNS VOID AS $$
BEGIN
  UPDATE produtos
  SET estoque = estoque - p_quantidade
  WHERE id = p_produto_id AND estoque >= p_quantidade;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Estoque insuficiente para produto id=%', p_produto_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Row Level Security (RLS) — habilitar conforme necessário
-- ============================================================
ALTER TABLE produtos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidos   ENABLE ROW LEVEL SECURITY;
ALTER TABLE itens_pedido ENABLE ROW LEVEL SECURITY;

-- Política: leitura pública de produtos (PDV não requer login)
CREATE POLICY "Leitura pública de produtos"
  ON produtos FOR SELECT USING (true);

CREATE POLICY "Baixa de estoque anon"
  ON produtos FOR UPDATE USING (true);

CREATE POLICY "Leitura de clientes anon"
  ON clientes FOR SELECT USING (true);

CREATE POLICY "Inserção de clientes anon"
  ON clientes FOR INSERT WITH CHECK (true);

CREATE POLICY "Inserção de pedidos anon"
  ON pedidos FOR INSERT WITH CHECK (true);

CREATE POLICY "Inserção de itens anon"
  ON itens_pedido FOR INSERT WITH CHECK (true);

-- ============================================================
-- Dados de exemplo
-- ============================================================
INSERT INTO produtos (nome, preco, codigo_barras, estoque, restrito_idade) VALUES
  ('Coca-Cola 350ml',   4.50, '7894900011517', 50, FALSE),
  ('Skol Lata 350ml',   4.00, '7891991010856', 30, TRUE),
  ('Pão de Forma',      8.90, '7896003801030', 20, FALSE),
  ('Biscoito Oreo',     6.50, '7622300991924', 40, FALSE),
  ('Cerveja Heineken',  6.00, '7896045503651', 25, TRUE);

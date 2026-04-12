-- ============================================================
-- Campos adicionais em produtos
-- ============================================================
ALTER TABLE produtos
  ADD COLUMN IF NOT EXISTS preco_custo    NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS unidade_medida TEXT DEFAULT 'UN',
  ADD COLUMN IF NOT EXISTS markup         NUMERIC(5,2);

-- ============================================================
-- Tipo da unidade: 'condominio' | 'armazem'
-- ============================================================
ALTER TABLE unidades ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'condominio';

-- Armazém Geral (inserir apenas se não existir)
INSERT INTO unidades (nome, codigo, ativo, tipo)
SELECT 'Armazém Geral', 'ARMAZEM', true, 'armazem'
WHERE NOT EXISTS (SELECT 1 FROM unidades WHERE tipo = 'armazem');

-- ============================================================
-- Histórico de transferências de estoque
-- ============================================================
CREATE TABLE IF NOT EXISTS transferencias_estoque (
  id          BIGSERIAL PRIMARY KEY,
  origem_id   BIGINT REFERENCES unidades(id),
  destino_id  BIGINT REFERENCES unidades(id),
  produto_id  BIGINT REFERENCES produtos(id),
  quantidade  INT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE transferencias_estoque ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'transferencias_estoque' AND policyname = 'anon_rw_transf') THEN
    CREATE POLICY "anon_rw_transf" ON transferencias_estoque FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================
-- RPC: transferência atômica de estoque
-- ============================================================
CREATE OR REPLACE FUNCTION transferir_estoque(
  p_origem_id  BIGINT,
  p_destino_id BIGINT,
  p_produto_id BIGINT,
  p_quantidade INT
) RETURNS void AS $$
DECLARE
  saldo INT;
BEGIN
  -- Verificar saldo na origem
  SELECT quantidade INTO saldo
  FROM estoque
  WHERE unidade_id = p_origem_id AND produto_id = p_produto_id;

  IF saldo IS NULL THEN
    RAISE EXCEPTION 'Produto não encontrado no armazém de origem';
  END IF;
  IF saldo < p_quantidade THEN
    RAISE EXCEPTION 'Estoque insuficiente: disponível %, solicitado %', saldo, p_quantidade;
  END IF;

  -- Decrementar origem
  UPDATE estoque
  SET quantidade = quantidade - p_quantidade
  WHERE unidade_id = p_origem_id AND produto_id = p_produto_id;

  -- Upsert no destino
  INSERT INTO estoque (unidade_id, produto_id, quantidade)
  VALUES (p_destino_id, p_produto_id, p_quantidade)
  ON CONFLICT (unidade_id, produto_id)
  DO UPDATE SET quantidade = estoque.quantidade + EXCLUDED.quantidade;

  -- Log
  INSERT INTO transferencias_estoque (origem_id, destino_id, produto_id, quantidade)
  VALUES (p_origem_id, p_destino_id, p_produto_id, p_quantidade);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

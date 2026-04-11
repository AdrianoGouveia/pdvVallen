-- Adiciona colunas do Asaas na tabela pedidos
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS asaas_id        TEXT,
  ADD COLUMN IF NOT EXISTS asaas_reference TEXT;

-- Index para busca rápida no webhook
CREATE INDEX IF NOT EXISTS idx_pedidos_asaas_id ON pedidos(asaas_id);

-- Política para leitura do status (polling do PDV)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='pedidos' AND policyname='Leitura de pedidos anon'
  ) THEN
    EXECUTE 'CREATE POLICY "Leitura de pedidos anon" ON pedidos FOR SELECT USING (true)';
  END IF;
END $$;

-- ============================================================
-- Maquininha PagSeguro — tabela `terminais` + coluna `terminal_id`
-- Uma `unidade` pode ter várias maquininhas físicas; cada app
-- Android instalado guarda seu `terminal_id` localmente e só
-- processa pedidos endereçados a ele.
-- ============================================================

CREATE TABLE IF NOT EXISTS terminais (
  id          BIGSERIAL PRIMARY KEY,
  unidade_id  BIGINT      NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
  nome        TEXT        NOT NULL,
  serial      TEXT        UNIQUE,
  ativo       BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_terminais_unidade ON terminais(unidade_id);

-- Pedido pode ser direcionado a um terminal específico.
-- Nullable para compatibilidade com fluxo atual (web/PIX não usa).
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS terminal_id BIGINT REFERENCES terminais(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pedidos_terminal_status
  ON pedidos(terminal_id, status)
  WHERE provider = 'maquininha';

-- RLS
ALTER TABLE terminais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Leitura pública de terminais"
  ON terminais FOR SELECT USING (true);

CREATE POLICY "Inserção anon de terminais"
  ON terminais FOR INSERT WITH CHECK (true);

CREATE POLICY "Update anon de terminais"
  ON terminais FOR UPDATE USING (true);

-- Realtime para app Android reagir a novos pedidos
ALTER PUBLICATION supabase_realtime ADD TABLE terminais;

-- Update de pedidos pela maquininha (aprovado/recusado + NSU)
ALTER TABLE pedidos
  ADD COLUMN IF NOT EXISTS nsu TEXT,
  ADD COLUMN IF NOT EXISTS bandeira TEXT,
  ADD COLUMN IF NOT EXISTS tipo_cartao TEXT;

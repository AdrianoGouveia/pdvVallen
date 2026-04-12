-- Histórico de reposições (lotes com data de vencimento)
CREATE TABLE IF NOT EXISTS reposicoes (
  id               BIGSERIAL PRIMARY KEY,
  produto_id       BIGINT REFERENCES produtos(id) ON DELETE CASCADE,
  unidade_id       BIGINT REFERENCES unidades(id) ON DELETE CASCADE,
  quantidade       INT           NOT NULL,
  preco_custo      NUMERIC(10,2),
  preco_venda      NUMERIC(10,2),
  markup           NUMERIC(5,2),
  data_vencimento  DATE          NOT NULL,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

ALTER TABLE reposicoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reposicoes_all" ON reposicoes FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_repos_produto  ON reposicoes (produto_id);
CREATE INDEX IF NOT EXISTS idx_repos_unidade  ON reposicoes (unidade_id);
CREATE INDEX IF NOT EXISTS idx_repos_venc     ON reposicoes (data_vencimento);

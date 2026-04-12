-- ============================================================
-- Tabela de categorias (gerenciável pelo admin)
-- ============================================================
CREATE TABLE IF NOT EXISTS categorias (
  id     BIGSERIAL PRIMARY KEY,
  nome   TEXT NOT NULL UNIQUE,
  ordem  INT  NOT NULL DEFAULT 0,
  ativo  BOOLEAN NOT NULL DEFAULT true
);

ALTER TABLE categorias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categorias_all" ON categorias FOR ALL USING (true) WITH CHECK (true);

-- Seed: categorias do sistema
INSERT INTO categorias (nome, ordem) VALUES
  ('REFRIGERANTES', 1),
  ('SNACKS',        2),
  ('CERVEJAS',      3),
  ('SUCOS',         4),
  ('AGUA',          5),
  ('VINHOS',        6),
  ('CHURRASCO',     7),
  ('REFRIGERADOS',  8),
  ('PADARIA',       9),
  ('MERCEARIA',    10),
  ('BOMBONIERE',   11),
  ('LIMPEZA',      12),
  ('UTILIDADES',   13)
ON CONFLICT (nome) DO NOTHING;

-- View v_categorias usada pelo código (lê da tabela gerenciável)
CREATE OR REPLACE VIEW v_categorias AS
SELECT nome AS categoria, ordem
FROM categorias
WHERE ativo = true
ORDER BY ordem, nome;

-- Permissão de leitura na view
GRANT SELECT ON v_categorias TO anon, authenticated;

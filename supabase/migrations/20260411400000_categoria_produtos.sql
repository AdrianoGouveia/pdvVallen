-- Adiciona coluna categoria aos produtos
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS categoria TEXT;

-- Índice para filtro rápido por categoria
CREATE INDEX IF NOT EXISTS idx_produtos_categoria ON produtos (categoria);

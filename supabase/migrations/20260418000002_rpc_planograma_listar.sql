-- ============================================================
-- RPCs de leitura do planograma (consumidas pela maquininha).
-- Retornam a visão "produto disponível para venda" numa filial:
-- preço vindo do planograma, estoque do planograma (nullable),
-- tudo já achatado pra consumo direto pelo Android.
-- ============================================================

CREATE OR REPLACE FUNCTION listar_planograma(p_unidade_id BIGINT)
RETURNS TABLE (
  id             BIGINT,
  nome           TEXT,
  codigo_barras  TEXT,
  preco          NUMERIC,
  estoque        INT,
  emoji          TEXT,
  imagem_url     TEXT,
  restrito_idade BOOLEAN,
  categoria      TEXT
) AS $$
  SELECT
    p.id,
    p.nome,
    p.codigo_barras,
    pg.preco_venda AS preco,
    CASE WHEN pg.controla_estoque THEN pg.quantidade ELSE NULL END AS estoque,
    p.emoji,
    p.imagem_url,
    p.restrito_idade,
    p.categoria
  FROM planograma pg
  JOIN produtos p ON p.id = pg.produto_id
  WHERE pg.unidade_id = p_unidade_id
    AND pg.ativo = TRUE
    AND (NOT pg.controla_estoque OR pg.quantidade > 0)
  ORDER BY p.nome;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION buscar_produto_planograma(
  p_unidade_id    BIGINT,
  p_codigo_barras TEXT
)
RETURNS TABLE (
  id             BIGINT,
  nome           TEXT,
  codigo_barras  TEXT,
  preco          NUMERIC,
  estoque        INT,
  emoji          TEXT,
  imagem_url     TEXT,
  restrito_idade BOOLEAN,
  categoria      TEXT
) AS $$
  SELECT
    p.id,
    p.nome,
    p.codigo_barras,
    pg.preco_venda AS preco,
    CASE WHEN pg.controla_estoque THEN pg.quantidade ELSE NULL END AS estoque,
    p.emoji,
    p.imagem_url,
    p.restrito_idade,
    p.categoria
  FROM planograma pg
  JOIN produtos p ON p.id = pg.produto_id
  WHERE pg.unidade_id    = p_unidade_id
    AND p.codigo_barras  = p_codigo_barras
    AND pg.ativo         = TRUE
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION listar_planograma(BIGINT)              TO anon, authenticated;
GRANT EXECUTE ON FUNCTION buscar_produto_planograma(BIGINT,TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION registrar_pendencia(BIGINT,TEXT)       TO anon, authenticated;
GRANT EXECUTE ON FUNCTION vender_item(BIGINT,BIGINT,INT)         TO anon, authenticated;
GRANT EXECUTE ON FUNCTION verificar_senha_tecnico(BIGINT,TEXT)   TO anon, authenticated;

-- ============================================================
-- Pendências: listagem enriquecida + resolução
-- ------------------------------------------------------------
-- Cenários cobertos a partir de um código lido na maquininha
-- que caiu em pendencias_planograma:
--   (a) produto já existe no catálogo do franqueado, só falta
--       entrar no planograma da unidade  → "adicionar_ao_planograma"
--   (b) código nunca visto                 → "cadastrar_produto_pendencia"
--       (cadastra produto + entra no planograma, tudo atômico)
-- ============================================================

-- ------------------------------------------------------------
-- 1. Listagem: pendências pendentes da unidade + match no catálogo
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION listar_pendencias(p_unidade_id BIGINT)
RETURNS TABLE (
  id                  BIGINT,
  codigo_barras       TEXT,
  tentativas          INT,
  last_seen_at        TIMESTAMPTZ,
  produto_cadastrado  BOOLEAN,
  produto_id          BIGINT,
  produto_nome        TEXT,
  produto_emoji       TEXT,
  produto_imagem_url  TEXT,
  produto_categoria   TEXT,
  produto_preco_ref   NUMERIC
) AS $$
  SELECT
    pp.id,
    pp.codigo_barras,
    pp.tentativas,
    pp.last_seen_at,
    (p.id IS NOT NULL) AS produto_cadastrado,
    p.id          AS produto_id,
    p.nome        AS produto_nome,
    p.emoji       AS produto_emoji,
    p.imagem_url  AS produto_imagem_url,
    p.categoria   AS produto_categoria,
    p.preco       AS produto_preco_ref
  FROM pendencias_planograma pp
  JOIN unidades u ON u.id = pp.unidade_id
  LEFT JOIN produtos p
    ON p.codigo_barras = pp.codigo_barras
   AND p.franqueado_id = u.franqueado_id
  WHERE pp.unidade_id = p_unidade_id
    AND pp.resolvido = FALSE
  ORDER BY pp.last_seen_at DESC;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ------------------------------------------------------------
-- 2. Categorias do franqueado (para o combo do cadastro)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION listar_categorias_unidade(p_unidade_id BIGINT)
RETURNS TABLE (
  nome  TEXT,
  emoji TEXT
) AS $$
  SELECT c.nome, c.emoji
  FROM categorias c
  JOIN unidades u ON u.franqueado_id = c.franqueado_id
  WHERE u.id = p_unidade_id
    AND c.ativo = TRUE
  ORDER BY c.ordem, c.nome;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ------------------------------------------------------------
-- 3. Resolve pendência de produto JÁ cadastrado: adiciona ao planograma
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION adicionar_ao_planograma(
  p_unidade_id       BIGINT,
  p_produto_id       BIGINT,
  p_preco_venda      NUMERIC,
  p_quantidade       INT,
  p_controla_estoque BOOLEAN
) RETURNS void AS $$
DECLARE
  v_codigo TEXT;
BEGIN
  IF p_preco_venda IS NULL OR p_preco_venda <= 0 THEN
    RAISE EXCEPTION 'Preço de venda inválido';
  END IF;

  IF p_controla_estoque AND (p_quantidade IS NULL OR p_quantidade < 0) THEN
    RAISE EXCEPTION 'Quantidade inválida para item com controle de estoque';
  END IF;

  INSERT INTO planograma (unidade_id, produto_id, preco_venda, quantidade, controla_estoque, ativo)
  VALUES (
    p_unidade_id,
    p_produto_id,
    p_preco_venda,
    CASE WHEN p_controla_estoque THEN p_quantidade ELSE NULL END,
    p_controla_estoque,
    TRUE
  )
  ON CONFLICT (unidade_id, produto_id) DO UPDATE SET
    preco_venda      = EXCLUDED.preco_venda,
    quantidade       = EXCLUDED.quantidade,
    controla_estoque = EXCLUDED.controla_estoque,
    ativo            = TRUE;

  SELECT codigo_barras INTO v_codigo FROM produtos WHERE id = p_produto_id;

  UPDATE pendencias_planograma
     SET resolvido     = TRUE,
         resolvido_em  = NOW(),
         resolvido_por = auth.uid()
   WHERE unidade_id    = p_unidade_id
     AND codigo_barras = v_codigo;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- 4. Cadastra produto novo + entra no planograma + resolve pendência
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION cadastrar_produto_pendencia(
  p_unidade_id       BIGINT,
  p_codigo_barras    TEXT,
  p_nome             TEXT,
  p_preco_venda      NUMERIC,
  p_categoria        TEXT,
  p_emoji            TEXT,
  p_imagem_url       TEXT,
  p_restrito_idade   BOOLEAN,
  p_quantidade       INT,
  p_controla_estoque BOOLEAN
) RETURNS BIGINT AS $$
DECLARE
  v_franqueado_id BIGINT;
  v_produto_id    BIGINT;
BEGIN
  IF p_nome IS NULL OR length(trim(p_nome)) = 0 THEN
    RAISE EXCEPTION 'Nome obrigatório';
  END IF;
  IF p_preco_venda IS NULL OR p_preco_venda <= 0 THEN
    RAISE EXCEPTION 'Preço de venda inválido';
  END IF;
  IF p_controla_estoque AND (p_quantidade IS NULL OR p_quantidade < 0) THEN
    RAISE EXCEPTION 'Quantidade inválida para item com controle de estoque';
  END IF;

  SELECT franqueado_id INTO v_franqueado_id
    FROM unidades WHERE id = p_unidade_id;
  IF v_franqueado_id IS NULL THEN
    RAISE EXCEPTION 'Unidade % não encontrada', p_unidade_id;
  END IF;

  -- Reaproveita produto do catálogo se já existir com mesmo código
  SELECT id INTO v_produto_id
    FROM produtos
   WHERE franqueado_id = v_franqueado_id
     AND codigo_barras = p_codigo_barras;

  IF v_produto_id IS NULL THEN
    INSERT INTO produtos (
      nome, codigo_barras, preco, categoria, emoji, imagem_url,
      restrito_idade, franqueado_id, controla_estoque_cnpj, estoque_cnpj
    ) VALUES (
      trim(p_nome), p_codigo_barras, p_preco_venda,
      NULLIF(p_categoria,''), NULLIF(p_emoji,''), NULLIF(p_imagem_url,''),
      COALESCE(p_restrito_idade, FALSE), v_franqueado_id,
      FALSE, 0
    )
    RETURNING id INTO v_produto_id;
  ELSE
    UPDATE produtos SET
      nome            = trim(p_nome),
      preco           = p_preco_venda,
      categoria       = COALESCE(NULLIF(p_categoria,''), categoria),
      emoji           = COALESCE(NULLIF(p_emoji,''), emoji),
      imagem_url      = COALESCE(NULLIF(p_imagem_url,''), imagem_url),
      restrito_idade  = COALESCE(p_restrito_idade, restrito_idade)
    WHERE id = v_produto_id;
  END IF;

  INSERT INTO planograma (unidade_id, produto_id, preco_venda, quantidade, controla_estoque, ativo)
  VALUES (
    p_unidade_id,
    v_produto_id,
    p_preco_venda,
    CASE WHEN p_controla_estoque THEN p_quantidade ELSE NULL END,
    p_controla_estoque,
    TRUE
  )
  ON CONFLICT (unidade_id, produto_id) DO UPDATE SET
    preco_venda      = EXCLUDED.preco_venda,
    quantidade       = EXCLUDED.quantidade,
    controla_estoque = EXCLUDED.controla_estoque,
    ativo            = TRUE;

  UPDATE pendencias_planograma
     SET resolvido     = TRUE,
         resolvido_em  = NOW(),
         resolvido_por = auth.uid()
   WHERE unidade_id    = p_unidade_id
     AND codigo_barras = p_codigo_barras;

  RETURN v_produto_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- 5. Storage bucket para fotos de produto (cadastro via maquininha)
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('produto-fotos', 'produto-fotos', true)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='storage' AND tablename='objects' AND policyname='produto_fotos_read'
  ) THEN
    CREATE POLICY "produto_fotos_read" ON storage.objects
      FOR SELECT USING (bucket_id = 'produto-fotos');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='storage' AND tablename='objects' AND policyname='produto_fotos_insert'
  ) THEN
    CREATE POLICY "produto_fotos_insert" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'produto-fotos');
  END IF;
END $$;

-- ------------------------------------------------------------
-- 6. Grants
-- ------------------------------------------------------------
GRANT EXECUTE ON FUNCTION listar_pendencias(BIGINT)                                    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION listar_categorias_unidade(BIGINT)                            TO anon, authenticated;
GRANT EXECUTE ON FUNCTION adicionar_ao_planograma(BIGINT, BIGINT, NUMERIC, INT, BOOLEAN) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION cadastrar_produto_pendencia(
  BIGINT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, BOOLEAN, INT, BOOLEAN
) TO anon, authenticated;

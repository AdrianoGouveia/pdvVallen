-- ============================================================
-- Cadastro de produto: aceita preço de custo + markup
-- ------------------------------------------------------------
-- Estende cadastrar_produto_pendencia com p_preco_custo e p_markup (DEFAULT NULL,
-- então os chamadores antigos — maquininha — seguem funcionando). Grava em
-- produtos.preco_custo / produtos.markup. DROP + CREATE porque a assinatura muda.
-- ============================================================

DROP FUNCTION IF EXISTS cadastrar_produto_pendencia(
  BIGINT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, BOOLEAN, INT, BOOLEAN);

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
  p_controla_estoque BOOLEAN,
  p_preco_custo      NUMERIC DEFAULT NULL,
  p_markup           NUMERIC DEFAULT NULL
) RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_franqueado_id BIGINT;
  v_produto_id    BIGINT;
BEGIN
  IF p_nome IS NULL OR length(trim(p_nome)) = 0 THEN RAISE EXCEPTION 'Nome obrigatório'; END IF;
  IF p_preco_venda IS NULL OR p_preco_venda <= 0 THEN RAISE EXCEPTION 'Preço de venda inválido'; END IF;
  IF p_controla_estoque AND (p_quantidade IS NULL OR p_quantidade < 0) THEN
    RAISE EXCEPTION 'Quantidade inválida para item com controle de estoque';
  END IF;

  SELECT franqueado_id INTO v_franqueado_id FROM unidades WHERE id = p_unidade_id;
  IF v_franqueado_id IS NULL THEN RAISE EXCEPTION 'Unidade % não encontrada', p_unidade_id; END IF;

  SELECT id INTO v_produto_id FROM produtos
   WHERE franqueado_id = v_franqueado_id AND codigo_barras = p_codigo_barras;

  IF v_produto_id IS NULL THEN
    INSERT INTO produtos (
      nome, codigo_barras, preco, preco_custo, markup, categoria, emoji, imagem_url,
      restrito_idade, franqueado_id, controla_estoque_cnpj, estoque_cnpj
    ) VALUES (
      trim(p_nome), p_codigo_barras, p_preco_venda, p_preco_custo, p_markup,
      NULLIF(p_categoria,''), NULLIF(p_emoji,''), NULLIF(p_imagem_url,''),
      COALESCE(p_restrito_idade, FALSE), v_franqueado_id, FALSE, 0
    )
    RETURNING id INTO v_produto_id;
  ELSE
    UPDATE produtos SET
      nome           = trim(p_nome),
      preco          = p_preco_venda,
      preco_custo    = COALESCE(p_preco_custo, preco_custo),
      markup         = COALESCE(p_markup, markup),
      categoria      = COALESCE(NULLIF(p_categoria,''), categoria),
      emoji          = COALESCE(NULLIF(p_emoji,''), emoji),
      imagem_url     = COALESCE(NULLIF(p_imagem_url,''), imagem_url),
      restrito_idade = COALESCE(p_restrito_idade, restrito_idade)
    WHERE id = v_produto_id;
  END IF;

  INSERT INTO planograma (unidade_id, produto_id, preco_venda, quantidade, controla_estoque, ativo)
  VALUES (
    p_unidade_id, v_produto_id, p_preco_venda,
    CASE WHEN p_controla_estoque THEN p_quantidade ELSE NULL END, p_controla_estoque, TRUE
  )
  ON CONFLICT (unidade_id, produto_id) DO UPDATE SET
    preco_venda      = EXCLUDED.preco_venda,
    quantidade       = EXCLUDED.quantidade,
    controla_estoque = EXCLUDED.controla_estoque,
    ativo            = TRUE;

  UPDATE pendencias_planograma
     SET resolvido = TRUE, resolvido_em = NOW(), resolvido_por = auth.uid()
   WHERE unidade_id = p_unidade_id AND codigo_barras = p_codigo_barras;

  RETURN v_produto_id;
END;
$$;

GRANT EXECUTE ON FUNCTION cadastrar_produto_pendencia(
  BIGINT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, BOOLEAN, INT, BOOLEAN, NUMERIC, NUMERIC
) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

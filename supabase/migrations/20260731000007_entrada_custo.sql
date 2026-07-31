-- ============================================================
-- Entrada de estoque: aceita/atualiza o preço de custo
-- ------------------------------------------------------------
-- Ao receber mercadoria o custo pode mudar. registrar_entrada passa a aceitar
-- p_preco_custo (opcional): quando vem, atualiza produtos.preco_custo (o que
-- re-enfileira pro DWPDV). DROP + CREATE porque a assinatura muda.
-- ============================================================

DROP FUNCTION IF EXISTS registrar_entrada(BIGINT, BIGINT, INT, DATE);

CREATE OR REPLACE FUNCTION registrar_entrada(
  p_unidade_id  BIGINT,
  p_produto_id  BIGINT,
  p_qtd         INT,
  p_validade    DATE    DEFAULT NULL,
  p_preco_custo NUMERIC DEFAULT NULL
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_nova INT; v_franq BIGINT;
BEGIN
  IF p_qtd IS NULL OR p_qtd <= 0 THEN RAISE EXCEPTION 'Quantidade inválida'; END IF;
  IF NOT pode_na_unidade(p_unidade_id, 'estoque.entrada') THEN
    RAISE EXCEPTION 'Sem permissão para dar entrada nesta loja';
  END IF;

  UPDATE planograma SET quantidade = COALESCE(quantidade, 0) + p_qtd
   WHERE unidade_id = p_unidade_id AND produto_id = p_produto_id AND controla_estoque = TRUE
   RETURNING quantidade INTO v_nova;
  IF v_nova IS NULL THEN
    RAISE EXCEPTION 'Produto fora do planograma desta loja (ou sem controle de estoque). Cadastre primeiro.';
  END IF;

  -- Atualiza o custo se veio (dispara re-envio pro DWPDV via trigger)
  IF p_preco_custo IS NOT NULL AND p_preco_custo > 0 THEN
    UPDATE produtos SET preco_custo = p_preco_custo WHERE id = p_produto_id;
  END IF;

  IF p_validade IS NOT NULL THEN
    INSERT INTO validades (unidade_id, produto_id, data_validade, quantidade, registrado_por)
    VALUES (p_unidade_id, p_produto_id, p_validade, p_qtd, auth.uid());
  END IF;

  SELECT franqueado_id INTO v_franq FROM unidades WHERE id = p_unidade_id;
  INSERT INTO log_auditoria (ator, franqueado_id, acao, alvo, detalhe)
  VALUES (auth.uid(), v_franq, 'estoque.entrada', 'produto ' || p_produto_id,
    jsonb_build_object('qtd', p_qtd, 'novo_estoque', v_nova, 'custo', p_preco_custo, 'unidade', p_unidade_id));

  RETURN v_nova;
END;
$$;
GRANT EXECUTE ON FUNCTION registrar_entrada(BIGINT, BIGINT, INT, DATE, NUMERIC) TO authenticated;
REVOKE EXECUTE ON FUNCTION registrar_entrada(BIGINT, BIGINT, INT, DATE, NUMERIC) FROM PUBLIC, anon;

NOTIFY pgrst, 'reload schema';

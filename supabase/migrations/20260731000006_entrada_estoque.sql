-- ============================================================
-- Entrada de estoque (receber mercadoria) — SOMA ao planograma
-- ------------------------------------------------------------
-- Diferente da auditoria (que reconcilia), a entrada ADICIONA quantidade ao
-- estoque (ex.: chegou mercadoria). Nova permissão estoque.entrada.
-- ============================================================

INSERT INTO permissoes (codigo, descricao, grupo) VALUES
  ('estoque.entrada', 'Dar entrada de estoque (receber mercadoria)', 'Operação')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO papel_permissao (role, permissao) VALUES
  ('franqueado','estoque.entrada'), ('gerente','estoque.entrada'), ('repositor','estoque.entrada')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION registrar_entrada(
  p_unidade_id BIGINT,
  p_produto_id BIGINT,
  p_qtd        INT,
  p_validade   DATE DEFAULT NULL
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

  IF p_validade IS NOT NULL THEN
    INSERT INTO validades (unidade_id, produto_id, data_validade, quantidade, registrado_por)
    VALUES (p_unidade_id, p_produto_id, p_validade, p_qtd, auth.uid());
  END IF;

  SELECT franqueado_id INTO v_franq FROM unidades WHERE id = p_unidade_id;
  INSERT INTO log_auditoria (ator, franqueado_id, acao, alvo, detalhe)
  VALUES (auth.uid(), v_franq, 'estoque.entrada', 'produto ' || p_produto_id,
    jsonb_build_object('qtd', p_qtd, 'novo_estoque', v_nova, 'unidade', p_unidade_id));

  RETURN v_nova;
END;
$$;
GRANT EXECUTE ON FUNCTION registrar_entrada(BIGINT, BIGINT, INT, DATE) TO authenticated;
REVOKE EXECUTE ON FUNCTION registrar_entrada(BIGINT, BIGINT, INT, DATE) FROM PUBLIC, anon;

NOTIFY pgrst, 'reload schema';

-- ==========================================================================
-- Ajuste de preço no /operador SEM exigir planograma (2026-10-22).
-- A loja não usa planograma: o preço de venda é produtos.preco (totem e push do
-- Beepay já caem nele quando não há planograma). Antes, solicitar_alteracao_preco
-- abortava com 'Produto fora do planograma desta unidade'.
--  • Preço atual = planograma.preco_venda ativo da unidade, senão produtos.preco.
--  • Escopo: produto tem que ser do franqueado da unidade (antes o planograma
--    garantia isso implicitamente) — mesmo escopo do buscar_produto_operador.
--  • _op_aplicar_preco: atualiza o planograma (no-op se não houver) e produtos.preco
--    (dispara o outbox do Beepay); redefinido em 20261022000001 p/ marcar a unidade.
-- Mexe em preço (dinheiro) → revisão adversarial.
-- ==========================================================================
CREATE OR REPLACE FUNCTION solicitar_alteracao_preco(
  p_unidade_id BIGINT,
  p_produto_id BIGINT,
  p_preco_novo NUMERIC,
  p_origem     TEXT DEFAULT 'manual'
) RETURNS alteracoes_preco
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_franq    BIGINT;
  v_antigo   NUMERIC;
  v_alcada   BOOLEAN;
  v_row      alteracoes_preco;
BEGIN
  IF p_preco_novo IS NULL OR p_preco_novo <= 0 THEN
    RAISE EXCEPTION 'Preço inválido';
  END IF;

  v_franq := _op_franq_do_user(p_unidade_id);
  IF v_franq IS NULL THEN
    RAISE EXCEPTION 'Sem permissão para esta unidade';
  END IF;

  -- MUDANÇA: planograma é opcional (antes: RAISE se não houvesse linha ativa).
  SELECT COALESCE(pl.preco_venda, p.preco) INTO v_antigo
    FROM produtos p
    LEFT JOIN planograma pl
      ON pl.unidade_id = p_unidade_id AND pl.produto_id = p.id AND pl.ativo = TRUE
   WHERE p.id = p_produto_id AND p.franqueado_id = v_franq;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto não encontrado no catálogo desta loja';
  END IF;

  v_alcada := _op_tem_alcada(v_franq);

  INSERT INTO alteracoes_preco (
    unidade_id, produto_id, preco_antigo, preco_novo, origem,
    status, solicitado_por, decidido_por, decided_at
  ) VALUES (
    p_unidade_id, p_produto_id, v_antigo, p_preco_novo,
    COALESCE(NULLIF(p_origem,''),'manual'),
    CASE WHEN v_alcada THEN 'aplicado' ELSE 'pendente' END,
    auth.uid(),
    CASE WHEN v_alcada THEN auth.uid() ELSE NULL END,
    CASE WHEN v_alcada THEN NOW() ELSE NULL END
  ) RETURNING * INTO v_row;

  IF v_alcada THEN
    PERFORM _op_aplicar_preco(p_unidade_id, p_produto_id, p_preco_novo);
  END IF;

  RETURN v_row;
END;
$$;

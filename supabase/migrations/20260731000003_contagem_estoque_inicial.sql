-- ============================================================
-- Contagem: estoque inicial (sistema=0 aplica direto) + fix de bug latente
-- ------------------------------------------------------------
-- 1. Estoque inicial: quando o sistema é 0 (primeira auditoria / item zerado), a
--    contagem VIRA o estoque, aplicada na hora, sem recontagem/divergência.
-- 2. FIX: registrar_contagem_item e recontar_item tinham "status" (coluna de
--    retorno) conflitando com contagens.status → erro em runtime ("column
--    reference status is ambiguous"). Qualificado como c.status. A auditoria
--    logada não funcionava antes disto.
-- Mesma assinatura → CREATE OR REPLACE preserva grants.
-- ============================================================

CREATE OR REPLACE FUNCTION registrar_contagem_item(
  p_contagem_id BIGINT,
  p_produto_id  BIGINT,
  p_qtd_contada INT
) RETURNS TABLE (qtd_sistema INT, qtd_contada INT, diferenca INT, status TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_unidade BIGINT; v_sis INT; v_status TEXT;
BEGIN
  IF p_qtd_contada IS NULL OR p_qtd_contada < 0 THEN RAISE EXCEPTION 'Quantidade inválida'; END IF;
  SELECT c.unidade_id INTO v_unidade FROM contagens c WHERE c.id = p_contagem_id AND c.status = 'aberta';
  IF v_unidade IS NULL THEN RAISE EXCEPTION 'Contagem não está aberta'; END IF;
  IF NOT pode_na_unidade(v_unidade, 'estoque.contar') THEN
    RAISE EXCEPTION 'Sem permissão para contar nesta loja';
  END IF;

  SELECT quantidade INTO v_sis FROM planograma
   WHERE unidade_id = v_unidade AND produto_id = p_produto_id AND controla_estoque = TRUE;

  IF v_sis IS NULL OR v_sis = 0 THEN
    -- Estoque inicial: a contagem vira o estoque, aplicada direto (sem recontagem).
    v_status := 'conferido';
    UPDATE planograma SET quantidade = p_qtd_contada
     WHERE unidade_id = v_unidade AND produto_id = p_produto_id AND controla_estoque = TRUE;
  ELSE
    v_status := CASE WHEN p_qtd_contada = v_sis THEN 'conferido' ELSE 'divergente' END;
  END IF;

  INSERT INTO contagem_itens (contagem_id, produto_id, qtd_sistema, qtd_contada, contado_por, status, qtd_recontada)
  VALUES (p_contagem_id, p_produto_id, v_sis, p_qtd_contada, auth.uid(), v_status, NULL)
  ON CONFLICT (contagem_id, produto_id) DO UPDATE SET
    qtd_contada   = EXCLUDED.qtd_contada,
    contado_por   = auth.uid(),
    contado_at    = NOW(),
    status        = v_status,
    qtd_recontada = NULL;

  SELECT ci.qtd_sistema INTO v_sis FROM contagem_itens ci
   WHERE ci.contagem_id = p_contagem_id AND ci.produto_id = p_produto_id;

  RETURN QUERY SELECT v_sis, p_qtd_contada, (p_qtd_contada - COALESCE(v_sis, 0)), v_status;
END;
$$;

CREATE OR REPLACE FUNCTION recontar_item(
  p_contagem_id   BIGINT,
  p_produto_id    BIGINT,
  p_qtd_recontada INT
) RETURNS TABLE (qtd_sistema INT, qtd_recontada INT, diferenca INT, status TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_unidade BIGINT; v_sis INT; v_status TEXT;
BEGIN
  IF p_qtd_recontada IS NULL OR p_qtd_recontada < 0 THEN RAISE EXCEPTION 'Quantidade inválida'; END IF;
  SELECT c.unidade_id INTO v_unidade FROM contagens c WHERE c.id = p_contagem_id AND c.status = 'aberta';
  IF v_unidade IS NULL THEN RAISE EXCEPTION 'Contagem não está aberta'; END IF;
  IF NOT pode_na_unidade(v_unidade, 'estoque.contar') THEN
    RAISE EXCEPTION 'Sem permissão para contar nesta loja';
  END IF;

  SELECT ci.qtd_sistema INTO v_sis FROM contagem_itens ci
   WHERE ci.contagem_id = p_contagem_id AND ci.produto_id = p_produto_id;

  v_status := CASE WHEN p_qtd_recontada = COALESCE(v_sis, 0) THEN 'conferido' ELSE 'recontado' END;

  UPDATE contagem_itens
     SET qtd_recontada = p_qtd_recontada, status = v_status, contado_at = NOW(), contado_por = auth.uid()
   WHERE contagem_id = p_contagem_id AND produto_id = p_produto_id;

  RETURN QUERY SELECT v_sis, p_qtd_recontada, (p_qtd_recontada - COALESCE(v_sis, 0)), v_status;
END;
$$;

-- FIX: minhas_unidades declarava SETOF BIGINT mas unidades.id é integer →
-- "structure of query does not match function result type" em runtime. Isso
-- quebrava pode_na_unidade (contagem/escopo) E o seletor de unidade do front.
CREATE OR REPLACE FUNCTION minhas_unidades(p_franqueado_id BIGINT) RETURNS SETOF BIGINT
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_role TEXT;
BEGIN
  IF eh_super_admin() THEN
    RETURN QUERY SELECT id::bigint FROM unidades WHERE franqueado_id = p_franqueado_id; RETURN;
  END IF;
  SELECT role INTO v_role FROM usuarios_franqueados
   WHERE user_id = auth.uid() AND franqueado_id = p_franqueado_id AND ativo = TRUE;
  IF v_role IS NULL THEN RETURN; END IF;
  IF v_role IN ('franqueado','gerente') THEN
    RETURN QUERY SELECT id::bigint FROM unidades WHERE franqueado_id = p_franqueado_id; RETURN;
  END IF;
  RETURN QUERY
    SELECT uu.unidade_id FROM usuario_unidades uu
     JOIN usuarios_franqueados uf ON uf.id = uu.usuario_franqueado_id
    WHERE uf.user_id = auth.uid() AND uf.franqueado_id = p_franqueado_id AND uf.ativo = TRUE;
END;
$$;

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- Contagem com divergência — recontagem + aprovação do gerente
-- ------------------------------------------------------------
-- Fluxo:
--   repositor conta → bate (conferido) | diverge (divergente)
--   divergente → 2ª contagem (recontar): bate (conferido) | confirma (recontado)
--   recontado → gerente valida (estoque.validar): aprova (aprovado, atualiza
--   estoque) | recusa (rejeitado). Só a aprovação escreve no planograma.
-- ============================================================

ALTER TABLE contagem_itens ADD COLUMN IF NOT EXISTS status        TEXT;
ALTER TABLE contagem_itens ADD COLUMN IF NOT EXISTS qtd_recontada INT;
ALTER TABLE contagem_itens ADD COLUMN IF NOT EXISTS decidido_por  UUID;
ALTER TABLE contagem_itens ADD COLUMN IF NOT EXISTS decided_at    TIMESTAMPTZ;

-- Backfill status das linhas existentes pela diferença.
UPDATE contagem_itens SET status =
  CASE WHEN qtd_contada = COALESCE(qtd_sistema,0) THEN 'conferido' ELSE 'divergente' END
 WHERE status IS NULL;

ALTER TABLE contagem_itens ALTER COLUMN status SET DEFAULT 'conferido';
ALTER TABLE contagem_itens ALTER COLUMN status SET NOT NULL;
ALTER TABLE contagem_itens DROP CONSTRAINT IF EXISTS chk_contagem_status;
ALTER TABLE contagem_itens ADD CONSTRAINT chk_contagem_status
  CHECK (status IN ('conferido','divergente','recontado','aprovado','rejeitado'));

-- Estas duas MUDAM o tipo de retorno (novas colunas) → CREATE OR REPLACE não
-- altera retorno; precisa DROP antes (re-GRANT no fim do arquivo).
DROP FUNCTION IF EXISTS registrar_contagem_item(BIGINT, BIGINT, INT);
DROP FUNCTION IF EXISTS listar_contagem_itens(BIGINT);

-- ------------------------------------------------------------
-- 1ª contagem: grava e classifica (conferido | divergente)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION registrar_contagem_item(
  p_contagem_id BIGINT,
  p_produto_id  BIGINT,
  p_qtd_contada INT
) RETURNS TABLE (qtd_sistema INT, qtd_contada INT, diferenca INT, status TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_unidade BIGINT; v_sis INT; v_status TEXT;
BEGIN
  IF p_qtd_contada IS NULL OR p_qtd_contada < 0 THEN RAISE EXCEPTION 'Quantidade inválida'; END IF;
  SELECT unidade_id INTO v_unidade FROM contagens WHERE id = p_contagem_id AND status = 'aberta';
  IF v_unidade IS NULL THEN RAISE EXCEPTION 'Contagem não está aberta'; END IF;
  IF NOT pode_na_unidade(v_unidade, 'estoque.contar') THEN
    RAISE EXCEPTION 'Sem permissão para contar nesta loja';
  END IF;

  SELECT quantidade INTO v_sis FROM planograma
   WHERE unidade_id = v_unidade AND produto_id = p_produto_id AND controla_estoque = TRUE;

  v_status := CASE WHEN p_qtd_contada = COALESCE(v_sis, 0) THEN 'conferido' ELSE 'divergente' END;

  INSERT INTO contagem_itens (contagem_id, produto_id, qtd_sistema, qtd_contada, contado_por, status, qtd_recontada)
  VALUES (p_contagem_id, p_produto_id, v_sis, p_qtd_contada, auth.uid(), v_status, NULL)
  ON CONFLICT (contagem_id, produto_id) DO UPDATE SET
    qtd_contada   = EXCLUDED.qtd_contada,
    contado_por   = auth.uid(),
    contado_at    = NOW(),
    status        = v_status,     -- recomeça o ciclo se recontou do zero
    qtd_recontada = NULL;         -- qtd_sistema (snapshot) preservado

  SELECT ci.qtd_sistema INTO v_sis FROM contagem_itens ci
   WHERE ci.contagem_id = p_contagem_id AND ci.produto_id = p_produto_id;

  RETURN QUERY SELECT v_sis, p_qtd_contada, (p_qtd_contada - COALESCE(v_sis,0)), v_status;
END;
$$;

-- ------------------------------------------------------------
-- 2ª contagem: bate (resolve) | confirma divergência (vai p/ gerente)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION recontar_item(
  p_contagem_id BIGINT,
  p_produto_id  BIGINT,
  p_qtd_recontada INT
) RETURNS TABLE (qtd_sistema INT, qtd_recontada INT, diferenca INT, status TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_unidade BIGINT; v_sis INT; v_status TEXT;
BEGIN
  IF p_qtd_recontada IS NULL OR p_qtd_recontada < 0 THEN RAISE EXCEPTION 'Quantidade inválida'; END IF;
  SELECT unidade_id INTO v_unidade FROM contagens WHERE id = p_contagem_id AND status = 'aberta';
  IF v_unidade IS NULL THEN RAISE EXCEPTION 'Contagem não está aberta'; END IF;
  IF NOT pode_na_unidade(v_unidade, 'estoque.contar') THEN
    RAISE EXCEPTION 'Sem permissão para contar nesta loja';
  END IF;

  SELECT ci.qtd_sistema INTO v_sis FROM contagem_itens ci
   WHERE ci.contagem_id = p_contagem_id AND ci.produto_id = p_produto_id;

  v_status := CASE WHEN p_qtd_recontada = COALESCE(v_sis,0) THEN 'conferido' ELSE 'recontado' END;

  UPDATE contagem_itens
     SET qtd_recontada = p_qtd_recontada, status = v_status, contado_at = NOW(), contado_por = auth.uid()
   WHERE contagem_id = p_contagem_id AND produto_id = p_produto_id;

  RETURN QUERY SELECT v_sis, p_qtd_recontada, (p_qtd_recontada - COALESCE(v_sis,0)), v_status;
END;
$$;

-- ------------------------------------------------------------
-- Fila de divergências confirmadas (gerente valida)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION listar_divergencias(p_unidade_id BIGINT)
RETURNS TABLE (
  item_id       BIGINT,
  contagem_id   BIGINT,
  produto_id    BIGINT,
  produto_nome  TEXT,
  emoji         TEXT,
  qtd_sistema   INT,
  qtd_contada   INT,
  qtd_recontada INT,
  contado_at    TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_franq BIGINT;
BEGIN
  SELECT franqueado_id INTO v_franq FROM unidades WHERE id = p_unidade_id;
  IF NOT tem_permissao(v_franq, 'estoque.validar') THEN
    RAISE EXCEPTION 'Sem permissão para validar contagem';
  END IF;
  RETURN QUERY
    SELECT ci.id, ci.contagem_id, ci.produto_id, p.nome, p.emoji,
           ci.qtd_sistema, ci.qtd_contada, ci.qtd_recontada, ci.contado_at
      FROM contagem_itens ci
      JOIN contagens c ON c.id = ci.contagem_id
      JOIN produtos  p ON p.id = ci.produto_id
     WHERE c.unidade_id = p_unidade_id AND ci.status = 'recontado'
     ORDER BY ci.contado_at ASC;
END;
$$;

-- ------------------------------------------------------------
-- Gerente valida a divergência: aprova (atualiza estoque) | recusa
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION aprovar_divergencia(p_item_id BIGINT, p_aprovar BOOLEAN)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_unidade BIGINT; v_franq BIGINT; v_produto BIGINT; v_recontada INT; v_status TEXT;
BEGIN
  SELECT c.unidade_id, ci.produto_id, ci.qtd_recontada, ci.status
    INTO v_unidade, v_produto, v_recontada, v_status
    FROM contagem_itens ci JOIN contagens c ON c.id = ci.contagem_id
   WHERE ci.id = p_item_id FOR UPDATE;
  IF v_unidade IS NULL THEN RAISE EXCEPTION 'Item não encontrado'; END IF;
  IF v_status <> 'recontado' THEN RAISE EXCEPTION 'Item não está aguardando validação'; END IF;

  SELECT franqueado_id INTO v_franq FROM unidades WHERE id = v_unidade;
  IF NOT tem_permissao(v_franq, 'estoque.validar') THEN
    RAISE EXCEPTION 'Sem permissão para validar contagem';
  END IF;

  IF p_aprovar THEN
    UPDATE planograma SET quantidade = v_recontada
     WHERE unidade_id = v_unidade AND produto_id = v_produto AND controla_estoque = TRUE;
    UPDATE contagem_itens SET status = 'aprovado', decidido_por = auth.uid(), decided_at = NOW()
     WHERE id = p_item_id;
  ELSE
    UPDATE contagem_itens SET status = 'rejeitado', decidido_por = auth.uid(), decided_at = NOW()
     WHERE id = p_item_id;
  END IF;
END;
$$;

-- Lista de itens da sessão (agora com status/recontagem)
CREATE OR REPLACE FUNCTION listar_contagem_itens(p_contagem_id BIGINT)
RETURNS TABLE (
  produto_id    BIGINT,
  produto_nome  TEXT,
  emoji         TEXT,
  qtd_sistema   INT,
  qtd_contada   INT,
  qtd_recontada INT,
  diferenca     INT,
  status        TEXT,
  contado_at    TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ci.produto_id, p.nome, p.emoji, ci.qtd_sistema, ci.qtd_contada, ci.qtd_recontada,
         (COALESCE(ci.qtd_recontada, ci.qtd_contada) - COALESCE(ci.qtd_sistema,0)) AS diferenca,
         ci.status, ci.contado_at
    FROM contagem_itens ci
    JOIN contagens c ON c.id = ci.contagem_id
    JOIN produtos  p ON p.id = ci.produto_id
    JOIN usuarios_franqueados uf
      ON uf.user_id = auth.uid()
     AND uf.franqueado_id = (SELECT franqueado_id FROM unidades WHERE id = c.unidade_id)
   WHERE ci.contagem_id = p_contagem_id
   ORDER BY ci.contado_at DESC;
$$;

-- aplicar_contagem some: o ajuste de estoque agora é por aprovação de divergência.
DROP FUNCTION IF EXISTS aplicar_contagem(BIGINT);

-- Grants (só authenticated; guardas de permissão internas)
GRANT EXECUTE ON FUNCTION registrar_contagem_item(BIGINT, BIGINT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION recontar_item(BIGINT, BIGINT, INT)           TO authenticated;
GRANT EXECUTE ON FUNCTION listar_divergencias(BIGINT)                  TO authenticated;
GRANT EXECUTE ON FUNCTION aprovar_divergencia(BIGINT, BOOLEAN)         TO authenticated;
GRANT EXECUTE ON FUNCTION listar_contagem_itens(BIGINT)                TO authenticated;
REVOKE EXECUTE ON FUNCTION
  registrar_contagem_item(BIGINT, BIGINT, INT), recontar_item(BIGINT, BIGINT, INT),
  listar_divergencias(BIGINT), aprovar_divergencia(BIGINT, BOOLEAN), listar_contagem_itens(BIGINT)
  FROM anon;

NOTIFY pgrst, 'reload schema';

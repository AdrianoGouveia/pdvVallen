-- ============================================================
-- Hardening pós-revisão: invariante do dono + escopo de contagem
-- ------------------------------------------------------------
-- 1. Franquia com usuários nunca fica sem dono (último franqueado ativo) —
--    no BANCO, com lock, fechando a corrida TOCTOU do guard do endpoint.
-- 2. Reatribui responsavel_user_id quando o dono apontado é desativado.
-- 3. listar_contagem_itens escopa por loja (não por franqueado).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Protege o último dono (BEFORE) — lock nas linhas irmãs fecha a corrida
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION _protege_ultimo_dono() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_outros INT;
BEGIN
  -- Se a própria franquia está sendo excluída (cascade / rollback do wizard),
  -- não protege — senão travaria a exclusão legítima da franquia inteira.
  IF NOT EXISTS (SELECT 1 FROM franqueados WHERE id = OLD.franqueado_id) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF OLD.role = 'franqueado' AND OLD.ativo = TRUE
     AND (TG_OP = 'DELETE' OR NEW.ativo = FALSE OR NEW.role <> 'franqueado') THEN
    -- FOR UPDATE trava os outros donos ativos → transações concorrentes serializam
    PERFORM 1 FROM usuarios_franqueados
      WHERE franqueado_id = OLD.franqueado_id AND role = 'franqueado' AND ativo = TRUE AND id <> OLD.id
      FOR UPDATE;
    GET DIAGNOSTICS v_outros = ROW_COUNT;
    IF v_outros = 0 THEN
      RAISE EXCEPTION 'Não é possível remover o último dono (franqueado) da franquia. Crie/atribua outro dono antes.';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
DROP TRIGGER IF EXISTS trg_protege_ultimo_dono ON usuarios_franqueados;
CREATE TRIGGER trg_protege_ultimo_dono
  BEFORE UPDATE OR DELETE ON usuarios_franqueados
  FOR EACH ROW EXECUTE FUNCTION _protege_ultimo_dono();

-- ------------------------------------------------------------
-- 2. Reatribui o responsável (AFTER) se o dono apontado saiu
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION _reatribui_responsavel() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_novo UUID;
BEGIN
  IF OLD.role = 'franqueado' AND OLD.ativo = TRUE
     AND (TG_OP = 'DELETE' OR NEW.ativo = FALSE OR NEW.role <> 'franqueado') THEN
    IF EXISTS (SELECT 1 FROM franqueados WHERE id = OLD.franqueado_id AND responsavel_user_id = OLD.user_id) THEN
      SELECT user_id INTO v_novo FROM usuarios_franqueados
        WHERE franqueado_id = OLD.franqueado_id AND role = 'franqueado' AND ativo = TRUE AND id <> OLD.id
        ORDER BY created_at LIMIT 1;
      UPDATE franqueados SET responsavel_user_id = v_novo WHERE id = OLD.franqueado_id;
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
DROP TRIGGER IF EXISTS trg_reatribui_responsavel ON usuarios_franqueados;
CREATE TRIGGER trg_reatribui_responsavel
  AFTER UPDATE OR DELETE ON usuarios_franqueados
  FOR EACH ROW EXECUTE FUNCTION _reatribui_responsavel();

-- ------------------------------------------------------------
-- 3. listar_contagem_itens: escopo por LOJA (não por franqueado)
--    Repositor só vê a contagem das lojas que ele pode operar.
-- ------------------------------------------------------------
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
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_unidade BIGINT;
BEGIN
  SELECT c.unidade_id INTO v_unidade FROM contagens c WHERE c.id = p_contagem_id;
  IF v_unidade IS NULL OR NOT pode_na_unidade(v_unidade, 'estoque.contar') THEN
    RETURN;  -- sem acesso a esta loja → nada
  END IF;
  RETURN QUERY
    SELECT ci.produto_id, p.nome, p.emoji, ci.qtd_sistema, ci.qtd_contada, ci.qtd_recontada,
           (COALESCE(ci.qtd_recontada, ci.qtd_contada) - COALESCE(ci.qtd_sistema, 0)) AS diferenca,
           ci.status, ci.contado_at
      FROM contagem_itens ci
      JOIN produtos p ON p.id = ci.produto_id
     WHERE ci.contagem_id = p_contagem_id
     ORDER BY ci.contado_at DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION listar_contagem_itens(BIGINT) TO authenticated;
REVOKE EXECUTE ON FUNCTION listar_contagem_itens(BIGINT) FROM PUBLIC, anon;

NOTIFY pgrst, 'reload schema';

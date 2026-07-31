-- ============================================================
-- RBAC — Fase 3: log de auditoria + lockdown das escritas anônimas
-- ------------------------------------------------------------
-- 1. log_auditoria: rastro de quem mudou preço, contagem, usuário.
-- 2. Fecha a escrita direta (anon) em produtos/categorias/unidades/terminais.
--    O checkout usa vender_item (SECURITY DEFINER), então a venda não quebra.
--    Some o backdoor anônimo do totem (toca-logo) e o /reposicao órfão.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Permissão "global" (em qualquer franqueado do usuário)
--    Usada nas RLS de escrita que não têm franqueado_id garantido na linha.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION tem_permissao_global(p_permissao TEXT) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT eh_super_admin()
    OR EXISTS (
      SELECT 1 FROM usuarios_franqueados uf
       JOIN papel_permissao pp ON pp.role = uf.role
       WHERE uf.user_id = auth.uid() AND uf.ativo = TRUE AND pp.permissao = p_permissao)
    OR EXISTS (
      SELECT 1 FROM usuario_permissao up
       WHERE up.user_id = auth.uid() AND up.permissao = p_permissao AND up.concedida = TRUE);
$$;
GRANT EXECUTE ON FUNCTION tem_permissao_global(TEXT) TO authenticated;
REVOKE EXECUTE ON FUNCTION tem_permissao_global(TEXT) FROM PUBLIC, anon;

-- ------------------------------------------------------------
-- 2. Lockdown: produtos — escopo POR TENANT (tem_permissao no franqueado da linha)
--    tem_permissao() já cobre super_admin. Exige franqueado_id na linha
--    (as inserções do admin passam a setar franqueado_id).
-- ------------------------------------------------------------
-- Predicado: precisa da permissão (bloqueia anon/repositor) E, se a linha tem
-- franqueado_id, precisa da permissão NAQUELE tenant (fecha escrita cross-tenant).
-- Linhas/inserts sem franqueado_id (legado) caem no check global — não quebram.
DROP POLICY IF EXISTS "Inserção de produtos anon" ON produtos;
DROP POLICY IF EXISTS "Update de produtos anon"    ON produtos;
DROP POLICY IF EXISTS "Baixa de estoque anon"      ON produtos;
DROP POLICY IF EXISTS "Update destaque anon"       ON produtos;
CREATE POLICY produtos_ins ON produtos FOR INSERT TO authenticated
  WITH CHECK (tem_permissao_global('produtos.editar') AND (franqueado_id IS NULL OR tem_permissao(franqueado_id, 'produtos.editar')));
CREATE POLICY produtos_upd ON produtos FOR UPDATE TO authenticated
  USING      (tem_permissao_global('produtos.editar') AND (franqueado_id IS NULL OR tem_permissao(franqueado_id, 'produtos.editar')))
  WITH CHECK (tem_permissao_global('produtos.editar') AND (franqueado_id IS NULL OR tem_permissao(franqueado_id, 'produtos.editar')));
CREATE POLICY produtos_del ON produtos FOR DELETE TO authenticated
  USING (tem_permissao_global('produtos.editar') AND (franqueado_id IS NULL OR tem_permissao(franqueado_id, 'produtos.editar')));

-- ------------------------------------------------------------
-- 3. Lockdown: categorias (categorias_all cobria tudo — recria SELECT público).
--    Mantém check "global" (linhas legadas podem ter franqueado_id nulo; escopo
--    por tenant fica como follow-up após backfill do franqueado_id).
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "categorias_all" ON categorias;
CREATE POLICY categorias_read  ON categorias FOR SELECT USING (true);
CREATE POLICY categorias_write ON categorias FOR ALL TO authenticated
  USING (tem_permissao_global('produtos.editar')) WITH CHECK (tem_permissao_global('produtos.editar'));

-- ------------------------------------------------------------
-- 4. Lockdown: unidades — escopo por tenant (mantém "Leitura pública de unidades")
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Gestão de unidades anon" ON unidades;
CREATE POLICY unidades_write ON unidades FOR ALL TO authenticated
  USING      (tem_permissao_global('unidades.gerenciar') AND (franqueado_id IS NULL OR tem_permissao(franqueado_id, 'unidades.gerenciar')))
  WITH CHECK (tem_permissao_global('unidades.gerenciar') AND (franqueado_id IS NULL OR tem_permissao(franqueado_id, 'unidades.gerenciar')));

-- ------------------------------------------------------------
-- 5. Lockdown: terminais — escopo por tenant (mantém "Leitura pública de terminais")
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Inserção anon de terminais" ON terminais;
DROP POLICY IF EXISTS "Update anon de terminais"    ON terminais;
CREATE POLICY terminais_write ON terminais FOR ALL TO authenticated
  USING      (tem_permissao_global('unidades.gerenciar') AND (franqueado_id IS NULL OR tem_permissao(franqueado_id, 'unidades.gerenciar')))
  WITH CHECK (tem_permissao_global('unidades.gerenciar') AND (franqueado_id IS NULL OR tem_permissao(franqueado_id, 'unidades.gerenciar')));

-- ============================================================
-- 6. Log de auditoria
-- ============================================================
CREATE TABLE IF NOT EXISTS log_auditoria (
  id            BIGSERIAL PRIMARY KEY,
  ator          UUID,                 -- auth.uid() de quem fez
  franqueado_id BIGINT,
  acao          TEXT NOT NULL,        -- ex.: 'preco.aplicado', 'contagem.aprovada', 'usuario.criado'
  alvo          TEXT,
  detalhe       JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_log_franq ON log_auditoria(franqueado_id, created_at DESC);

ALTER TABLE log_auditoria ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='log_auditoria' AND policyname='log_read') THEN
    CREATE POLICY log_read ON log_auditoria FOR SELECT USING (
      eh_super_admin() OR franqueado_id IN (
        SELECT franqueado_id FROM usuarios_franqueados WHERE user_id = auth.uid() AND ativo = TRUE));
  END IF;
END $$;
REVOKE INSERT, UPDATE, DELETE ON log_auditoria FROM anon, authenticated;  -- só via trigger/service

-- Helper de escrita (SECURITY DEFINER; usado pelos triggers)
CREATE OR REPLACE FUNCTION registrar_log(p_franq BIGINT, p_acao TEXT, p_alvo TEXT, p_detalhe JSONB)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  INSERT INTO log_auditoria (ator, franqueado_id, acao, alvo, detalhe)
  VALUES (auth.uid(), p_franq, p_acao, p_alvo, p_detalhe);
$$;

-- Trigger: decisões de preço
CREATE OR REPLACE FUNCTION _log_preco() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('aplicado','rejeitado') THEN
    PERFORM registrar_log(
      (SELECT franqueado_id FROM unidades WHERE id = NEW.unidade_id),
      'preco.' || NEW.status, 'produto ' || NEW.produto_id,
      jsonb_build_object('de', NEW.preco_antigo, 'para', NEW.preco_novo, 'unidade', NEW.unidade_id));
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_log_preco ON alteracoes_preco;
CREATE TRIGGER trg_log_preco AFTER UPDATE ON alteracoes_preco FOR EACH ROW EXECUTE FUNCTION _log_preco();

-- Preço aplicado direto (com alçada) entra como INSERT status='aplicado' → logar tb.
CREATE OR REPLACE FUNCTION _log_preco_ins() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'aplicado' THEN
    PERFORM registrar_log(
      (SELECT franqueado_id FROM unidades WHERE id = NEW.unidade_id),
      'preco.aplicado', 'produto ' || NEW.produto_id,
      jsonb_build_object('de', NEW.preco_antigo, 'para', NEW.preco_novo, 'unidade', NEW.unidade_id));
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_log_preco_ins ON alteracoes_preco;
CREATE TRIGGER trg_log_preco_ins AFTER INSERT ON alteracoes_preco FOR EACH ROW EXECUTE FUNCTION _log_preco_ins();

-- Trigger: validação de divergência de contagem
CREATE OR REPLACE FUNCTION _log_contagem() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_franq BIGINT; v_unidade BIGINT;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('aprovado','rejeitado') THEN
    SELECT c.unidade_id INTO v_unidade FROM contagens c WHERE c.id = NEW.contagem_id;
    SELECT franqueado_id INTO v_franq FROM unidades WHERE id = v_unidade;
    PERFORM registrar_log(v_franq, 'contagem.' || NEW.status, 'produto ' || NEW.produto_id,
      jsonb_build_object('sistema', NEW.qtd_sistema, 'contado', NEW.qtd_contada,
                         'recontado', NEW.qtd_recontada, 'unidade', v_unidade));
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_log_contagem ON contagem_itens;
CREATE TRIGGER trg_log_contagem AFTER UPDATE ON contagem_itens FOR EACH ROW EXECUTE FUNCTION _log_contagem();

NOTIFY pgrst, 'reload schema';

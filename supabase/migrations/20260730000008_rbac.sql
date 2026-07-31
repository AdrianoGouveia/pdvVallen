-- ============================================================
-- RBAC — Fase 1: papéis, permissões, escopo por loja, controle no banco
-- ------------------------------------------------------------
-- Papéis: admin_vallen (super, global) > franqueado > gerente > repositor.
-- O controle real vive em tem_permissao(), usada por RPCs e (Fase 3) RLS.
-- admin_vallen NÃO é um valor de role — é pertencer a super_admins.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Super admins (nível Vallen, global)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS super_admins (
  user_id    UUID PRIMARY KEY,   -- auth.uid() (sem FK: auth.users é do supabase_auth_admin)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 2. usuarios_franqueados: novos papéis + ativo
-- ------------------------------------------------------------
ALTER TABLE usuarios_franqueados ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE usuarios_franqueados DROP CONSTRAINT IF EXISTS usuarios_franqueados_role_check;
UPDATE usuarios_franqueados SET role='franqueado' WHERE role='admin';
UPDATE usuarios_franqueados SET role='repositor'  WHERE role='operador';
ALTER TABLE usuarios_franqueados
  ADD CONSTRAINT usuarios_franqueados_role_check CHECK (role IN ('franqueado','gerente','repositor'));

-- ------------------------------------------------------------
-- 3. Lojas autorizadas (escopo do repositor)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuario_unidades (
  id                    BIGSERIAL PRIMARY KEY,
  usuario_franqueado_id BIGINT NOT NULL REFERENCES usuarios_franqueados(id) ON DELETE CASCADE,
  unidade_id            BIGINT NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
  UNIQUE (usuario_franqueado_id, unidade_id)
);
CREATE INDEX IF NOT EXISTS idx_usuario_unidades_uf ON usuario_unidades(usuario_franqueado_id);

-- ------------------------------------------------------------
-- 4. Catálogo de permissões
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS permissoes (
  codigo    TEXT PRIMARY KEY,
  descricao TEXT NOT NULL,
  grupo     TEXT
);
INSERT INTO permissoes (codigo, descricao, grupo) VALUES
  ('franqueados.gerenciar','Criar/editar franquias','Gestão'),
  ('usuarios.gerenciar',   'Criar/editar usuários e permissões','Gestão'),
  ('unidades.gerenciar',   'Criar/editar lojas e maquininhas','Gestão'),
  ('produtos.editar',      'Criar/editar catálogo','Catálogo'),
  ('preco.ajustar',        'Aplicar preço direto (alçada)','Preço'),
  ('preco.aprovar',        'Aprovar preços pendentes','Preço'),
  ('cadastro.criar',       'Cadastrar produto pelo scanner','Operação'),
  ('estoque.contar',       'Conferir estoque (contar/recontar)','Operação'),
  ('estoque.validar',      'Validar divergência e atualizar estoque','Operação'),
  ('validade.gerenciar',   'Registrar/baixar validade','Operação'),
  ('pendencias.resolver',  'Resolver pendências','Operação'),
  ('relatorios.ver',       'Ver relatórios','Visão')
ON CONFLICT (codigo) DO NOTHING;

-- ------------------------------------------------------------
-- 5. Matriz papel → permissão (dados editáveis)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS papel_permissao (
  role      TEXT NOT NULL,
  permissao TEXT NOT NULL REFERENCES permissoes(codigo) ON DELETE CASCADE,
  PRIMARY KEY (role, permissao)
);
INSERT INTO papel_permissao (role, permissao) VALUES
  -- franqueado: tudo do seu franqueado (menos criar franquias)
  ('franqueado','usuarios.gerenciar'),('franqueado','unidades.gerenciar'),
  ('franqueado','produtos.editar'),('franqueado','preco.ajustar'),('franqueado','preco.aprovar'),
  ('franqueado','cadastro.criar'),('franqueado','estoque.contar'),('franqueado','estoque.validar'),
  ('franqueado','validade.gerenciar'),('franqueado','pendencias.resolver'),('franqueado','relatorios.ver'),
  -- gerente: opera todas as lojas; gere só repositores (reforçado no endpoint de criação)
  ('gerente','usuarios.gerenciar'),
  ('gerente','produtos.editar'),('gerente','preco.ajustar'),('gerente','preco.aprovar'),
  ('gerente','cadastro.criar'),('gerente','estoque.contar'),('gerente','estoque.validar'),
  ('gerente','validade.gerenciar'),('gerente','pendencias.resolver'),('gerente','relatorios.ver'),
  -- repositor: conta, cadastra, validade (preço vai p/ aprovação; validar divergência = gerente+)
  ('repositor','cadastro.criar'),('repositor','estoque.contar'),('repositor','validade.gerenciar')
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 6. Overrides por usuário (concede/revoga permissão avulsa)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuario_permissao (
  user_id       UUID    NOT NULL,   -- auth.uid()
  franqueado_id BIGINT  NOT NULL REFERENCES franqueados(id) ON DELETE CASCADE,
  permissao     TEXT    NOT NULL REFERENCES permissoes(codigo) ON DELETE CASCADE,
  concedida     BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (user_id, franqueado_id, permissao)
);
-- Migra o flag antigo pode_ajustar_preco → override 'preco.ajustar'
INSERT INTO usuario_permissao (user_id, franqueado_id, permissao, concedida)
SELECT user_id, franqueado_id, 'preco.ajustar', TRUE
  FROM usuarios_franqueados WHERE pode_ajustar_preco = TRUE
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- 7. Helpers de autorização (o controle real)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION eh_super_admin() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM super_admins WHERE user_id = auth.uid());
$$;

-- Super → tudo. Senão: override (concede/revoga) tem prioridade; senão o papel.
CREATE OR REPLACE FUNCTION tem_permissao(p_franqueado_id BIGINT, p_permissao TEXT) RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_role TEXT; v_override BOOLEAN;
BEGIN
  IF eh_super_admin() THEN RETURN TRUE; END IF;
  SELECT concedida INTO v_override FROM usuario_permissao
   WHERE user_id = auth.uid() AND franqueado_id = p_franqueado_id AND permissao = p_permissao;
  IF FOUND THEN RETURN v_override; END IF;
  SELECT role INTO v_role FROM usuarios_franqueados
   WHERE user_id = auth.uid() AND franqueado_id = p_franqueado_id AND ativo = TRUE;
  IF v_role IS NULL THEN RETURN FALSE; END IF;
  RETURN EXISTS (SELECT 1 FROM papel_permissao WHERE role = v_role AND permissao = p_permissao);
END;
$$;

-- Papel efetivo do usuário no franqueado ('admin_vallen' se super).
CREATE OR REPLACE FUNCTION meu_papel(p_franqueado_id BIGINT) RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN eh_super_admin() THEN 'admin_vallen'
    ELSE (SELECT role FROM usuarios_franqueados
           WHERE user_id = auth.uid() AND franqueado_id = p_franqueado_id AND ativo = TRUE)
  END;
$$;

-- Conjunto de permissões do usuário no franqueado (p/ o front carregar).
CREATE OR REPLACE FUNCTION minhas_permissoes(p_franqueado_id BIGINT) RETURNS SETOF TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_role TEXT;
BEGIN
  IF eh_super_admin() THEN RETURN QUERY SELECT codigo FROM permissoes; RETURN; END IF;
  SELECT role INTO v_role FROM usuarios_franqueados
   WHERE user_id = auth.uid() AND franqueado_id = p_franqueado_id AND ativo = TRUE;
  IF v_role IS NULL THEN RETURN; END IF;
  RETURN QUERY
    (SELECT pp.permissao FROM papel_permissao pp WHERE pp.role = v_role
      UNION
     SELECT up.permissao FROM usuario_permissao up
      WHERE up.user_id = auth.uid() AND up.franqueado_id = p_franqueado_id AND up.concedida = TRUE)
    EXCEPT
     SELECT up.permissao FROM usuario_permissao up
      WHERE up.user_id = auth.uid() AND up.franqueado_id = p_franqueado_id AND up.concedida = FALSE;
END;
$$;

-- Unidades que o usuário pode operar (todas p/ super/franqueado/gerente; subset p/ repositor).
CREATE OR REPLACE FUNCTION minhas_unidades(p_franqueado_id BIGINT) RETURNS SETOF BIGINT
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_role TEXT;
BEGIN
  IF eh_super_admin() THEN
    RETURN QUERY SELECT id FROM unidades WHERE franqueado_id = p_franqueado_id; RETURN;
  END IF;
  SELECT role INTO v_role FROM usuarios_franqueados
   WHERE user_id = auth.uid() AND franqueado_id = p_franqueado_id AND ativo = TRUE;
  IF v_role IS NULL THEN RETURN; END IF;
  IF v_role IN ('franqueado','gerente') THEN
    RETURN QUERY SELECT id FROM unidades WHERE franqueado_id = p_franqueado_id; RETURN;
  END IF;
  RETURN QUERY
    SELECT uu.unidade_id FROM usuario_unidades uu
     JOIN usuarios_franqueados uf ON uf.id = uu.usuario_franqueado_id
    WHERE uf.user_id = auth.uid() AND uf.franqueado_id = p_franqueado_id AND uf.ativo = TRUE;
END;
$$;

-- Permissão + escopo de loja numa tacada.
CREATE OR REPLACE FUNCTION pode_na_unidade(p_unidade_id BIGINT, p_permissao TEXT) RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_franq BIGINT;
BEGIN
  SELECT franqueado_id INTO v_franq FROM unidades WHERE id = p_unidade_id;
  IF v_franq IS NULL THEN RETURN FALSE; END IF;
  IF NOT tem_permissao(v_franq, p_permissao) THEN RETURN FALSE; END IF;
  RETURN p_unidade_id IN (SELECT minhas_unidades(v_franq));
END;
$$;

-- ------------------------------------------------------------
-- 8. Seed: o dono como super admin (Admin Vallen)
-- ------------------------------------------------------------
DO $$
DECLARE v_id UUID;
BEGIN
  SELECT id INTO v_id FROM auth.users WHERE lower(email) = lower('adriano.gouveia83@gmail.com');
  IF v_id IS NULL THEN
    RAISE NOTICE 'ATENCAO: dono (adriano.gouveia83@gmail.com) nao encontrado em auth.users — super_admin NAO semeado. Rode manualmente depois.';
  ELSE
    INSERT INTO super_admins (user_id) VALUES (v_id) ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 9. Liga o preço do /operador ao RBAC (substitui checagens role='admin')
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION _op_tem_alcada(p_franqueado_id BIGINT) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT tem_permissao(p_franqueado_id, 'preco.ajustar');
$$;

CREATE OR REPLACE FUNCTION decidir_alteracao_preco(p_id BIGINT, p_aprovar BOOLEAN)
RETURNS alteracoes_preco
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_alt alteracoes_preco; v_franq BIGINT;
BEGIN
  SELECT * INTO v_alt FROM alteracoes_preco WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitação não encontrada'; END IF;
  IF v_alt.status <> 'pendente' THEN RAISE EXCEPTION 'Solicitação já decidida'; END IF;

  SELECT franqueado_id INTO v_franq FROM unidades WHERE id = v_alt.unidade_id;
  IF NOT tem_permissao(v_franq, 'preco.aprovar') THEN
    RAISE EXCEPTION 'Sem permissão para aprovar preço';
  END IF;

  UPDATE alteracoes_preco
     SET status = CASE WHEN p_aprovar THEN 'aplicado' ELSE 'rejeitado' END,
         decidido_por = auth.uid(), decided_at = NOW()
   WHERE id = p_id RETURNING * INTO v_alt;

  IF p_aprovar THEN
    PERFORM _op_aplicar_preco(v_alt.unidade_id, v_alt.produto_id, v_alt.preco_novo);
  END IF;
  RETURN v_alt;
END;
$$;

-- Seed helper legado: passa a vincular como 'franqueado' (o CHECK novo barra 'admin')
CREATE OR REPLACE FUNCTION seed_vincular_usuario(p_email TEXT) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_user UUID; v_franq BIGINT;
BEGIN
  SELECT id INTO v_user FROM auth.users WHERE email = p_email;
  IF v_user IS NULL THEN RAISE EXCEPTION 'Usuário % não encontrado', p_email; END IF;
  SELECT id INTO v_franq FROM franqueados WHERE documento = '00.000.000/0001-00';
  IF v_franq IS NULL THEN RAISE EXCEPTION 'Franqueado demo não encontrado'; END IF;
  INSERT INTO usuarios_franqueados (user_id, franqueado_id, role)
  VALUES (v_user, v_franq, 'franqueado')
  ON CONFLICT (user_id, franqueado_id) DO NOTHING;
END;
$$;

-- ------------------------------------------------------------
-- 10. RLS + grants nas tabelas novas
-- ------------------------------------------------------------
ALTER TABLE super_admins       ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuario_unidades   ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuario_permissao  ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissoes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE papel_permissao    ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='permissoes' AND policyname='perm_read') THEN
    CREATE POLICY perm_read ON permissoes FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='papel_permissao' AND policyname='papelperm_read') THEN
    CREATE POLICY papelperm_read ON papel_permissao FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='super_admins' AND policyname='superadm_self') THEN
    CREATE POLICY superadm_self ON super_admins FOR SELECT USING (user_id = auth.uid() OR eh_super_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='usuario_unidades' AND policyname='uu_read') THEN
    CREATE POLICY uu_read ON usuario_unidades FOR SELECT USING (
      eh_super_admin() OR usuario_franqueado_id IN (
        SELECT uf.id FROM usuarios_franqueados uf
         JOIN usuarios_franqueados me ON me.franqueado_id = uf.franqueado_id
        WHERE me.user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='usuario_permissao' AND policyname='up_read') THEN
    CREATE POLICY up_read ON usuario_permissao FOR SELECT USING (
      user_id = auth.uid() OR eh_super_admin() OR franqueado_id IN (
        SELECT franqueado_id FROM usuarios_franqueados WHERE user_id = auth.uid()));
  END IF;
END $$;

-- Escrita só via RPC / serverless service_role.
REVOKE INSERT, UPDATE, DELETE ON super_admins, usuario_unidades, usuario_permissao, permissoes, papel_permissao FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION eh_super_admin()                     TO authenticated;
GRANT EXECUTE ON FUNCTION tem_permissao(BIGINT, TEXT)          TO authenticated;
GRANT EXECUTE ON FUNCTION meu_papel(BIGINT)                    TO authenticated;
GRANT EXECUTE ON FUNCTION minhas_permissoes(BIGINT)            TO authenticated;
GRANT EXECUTE ON FUNCTION minhas_unidades(BIGINT)             TO authenticated;
GRANT EXECUTE ON FUNCTION pode_na_unidade(BIGINT, TEXT)        TO authenticated;
-- REVOKE de PUBLIC (grant base) E anon — só authenticated executa. (Anon receberia
-- vazio de qualquer forma, mas mantém explícito e consistente.)
REVOKE EXECUTE ON FUNCTION
  eh_super_admin(), tem_permissao(BIGINT, TEXT), meu_papel(BIGINT),
  minhas_permissoes(BIGINT), minhas_unidades(BIGINT), pode_na_unidade(BIGINT, TEXT)
  FROM PUBLIC, anon;

NOTIFY pgrst, 'reload schema';

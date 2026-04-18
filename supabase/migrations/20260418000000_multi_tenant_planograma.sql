-- ============================================================
-- Multi-tenant (franqueados) + Planograma + Pendências + Técnicos
-- ============================================================
-- Modelo:
--   Vallen (franquia) → franqueados (CNPJ/CPF) → unidades (filiais)
--     - produtos: catálogo por franqueado (estoque_cnpj = depósito)
--     - planograma: por filial, define preco_venda e (opcional) quantidade
--     - tecnicos: senha de acesso às Settings da maquininha
--     - pendencias_planograma: códigos lidos fora do planograma → admin
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ------------------------------------------------------------
-- 1. Franqueados (tenants)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS franqueados (
  id             BIGSERIAL PRIMARY KEY,
  tipo_doc       TEXT        NOT NULL CHECK (tipo_doc IN ('CNPJ','CPF')),
  documento      TEXT        NOT NULL UNIQUE,
  razao_social   TEXT        NOT NULL,
  nome_fantasia  TEXT,
  ativo          BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 2. auth.users ↔ franqueados (M:N)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios_franqueados (
  id              BIGSERIAL PRIMARY KEY,
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  franqueado_id   BIGINT      NOT NULL REFERENCES franqueados(id) ON DELETE CASCADE,
  role            TEXT        NOT NULL DEFAULT 'admin' CHECK (role IN ('admin','operador')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, franqueado_id)
);
CREATE INDEX IF NOT EXISTS idx_usu_franq_user  ON usuarios_franqueados(user_id);
CREATE INDEX IF NOT EXISTS idx_usu_franq_franq ON usuarios_franqueados(franqueado_id);

-- ------------------------------------------------------------
-- 3. Técnicos (senha bcrypt p/ Settings da maquininha)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tecnicos (
  id             BIGSERIAL PRIMARY KEY,
  franqueado_id  BIGINT      NOT NULL REFERENCES franqueados(id) ON DELETE CASCADE,
  nome           TEXT        NOT NULL,
  senha_hash     TEXT        NOT NULL,
  ativo          BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tecnicos_franq ON tecnicos(franqueado_id);

-- RPC de verificação de senha do técnico (usado pelo Settings)
CREATE OR REPLACE FUNCTION verificar_senha_tecnico(
  p_franqueado_id BIGINT,
  p_senha         TEXT
) RETURNS BOOLEAN AS $$
DECLARE v_ok BOOLEAN;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM tecnicos
    WHERE franqueado_id = p_franqueado_id
      AND ativo = TRUE
      AND senha_hash = extensions.crypt(p_senha, senha_hash)
  ) INTO v_ok;
  RETURN v_ok;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- 4. Unidades → franqueado_id
-- ------------------------------------------------------------
ALTER TABLE unidades ADD COLUMN IF NOT EXISTS franqueado_id BIGINT REFERENCES franqueados(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_unidades_franq ON unidades(franqueado_id);

-- ------------------------------------------------------------
-- 5. Produtos: multi-tenant + renomeia estoque → estoque_cnpj
-- ------------------------------------------------------------
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS franqueado_id BIGINT REFERENCES franqueados(id) ON DELETE CASCADE;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS emoji TEXT;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS controla_estoque_cnpj BOOLEAN NOT NULL DEFAULT TRUE;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='produtos' AND column_name='estoque')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='produtos' AND column_name='estoque_cnpj') THEN
    ALTER TABLE produtos RENAME COLUMN estoque TO estoque_cnpj;
  END IF;
END $$;

-- Preço no catálogo vira referencial — venda usa planograma.preco_venda
ALTER TABLE produtos ALTER COLUMN preco DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_produtos_franq ON produtos(franqueado_id);

-- ------------------------------------------------------------
-- 6. Categorias: multi-tenant + emoji/imagem
-- ------------------------------------------------------------
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS franqueado_id BIGINT REFERENCES franqueados(id) ON DELETE CASCADE;
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS emoji      TEXT;
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS imagem_url TEXT;
ALTER TABLE categorias DROP CONSTRAINT IF EXISTS categorias_nome_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_cat_franq_nome ON categorias(franqueado_id, nome);

-- ------------------------------------------------------------
-- 7. Estoque → Planograma
-- ------------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='estoque')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='planograma') THEN
    ALTER TABLE estoque RENAME TO planograma;
  END IF;
END $$;

-- Renomeia índices (se existirem com nome antigo)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='idx_estoque_unidade') THEN
    ALTER INDEX idx_estoque_unidade RENAME TO idx_planograma_unidade;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='idx_estoque_produto') THEN
    ALTER INDEX idx_estoque_produto RENAME TO idx_planograma_produto;
  END IF;
END $$;

ALTER TABLE planograma ADD COLUMN IF NOT EXISTS controla_estoque BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE planograma ADD COLUMN IF NOT EXISTS ativo            BOOLEAN NOT NULL DEFAULT TRUE;

-- Quantidade nullable quando controla_estoque=false
ALTER TABLE planograma ALTER COLUMN quantidade DROP NOT NULL;
ALTER TABLE planograma DROP CONSTRAINT IF EXISTS estoque_quantidade_check;

-- preco_venda NOT NULL (backfill de linhas antigas)
UPDATE planograma SET preco_venda = 0 WHERE preco_venda IS NULL;
ALTER TABLE planograma ALTER COLUMN preco_venda SET NOT NULL;

-- Coerência entre controla_estoque e quantidade
ALTER TABLE planograma DROP CONSTRAINT IF EXISTS chk_planograma_estoque;
ALTER TABLE planograma ADD CONSTRAINT chk_planograma_estoque
  CHECK (
    (controla_estoque = TRUE  AND quantidade IS NOT NULL AND quantidade >= 0) OR
    (controla_estoque = FALSE AND quantidade IS NULL)
  );

-- ------------------------------------------------------------
-- 8. Pendências (scanner lê código fora do planograma)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pendencias_planograma (
  id             BIGSERIAL PRIMARY KEY,
  unidade_id     BIGINT      NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
  codigo_barras  TEXT        NOT NULL,
  tentativas     INT         NOT NULL DEFAULT 1,
  last_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolvido      BOOLEAN     NOT NULL DEFAULT FALSE,
  resolvido_em   TIMESTAMPTZ,
  resolvido_por  UUID        REFERENCES auth.users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (unidade_id, codigo_barras)
);
CREATE INDEX IF NOT EXISTS idx_pend_unidade   ON pendencias_planograma(unidade_id);
CREATE INDEX IF NOT EXISTS idx_pend_pendentes ON pendencias_planograma(resolvido) WHERE resolvido = FALSE;

CREATE OR REPLACE FUNCTION registrar_pendencia(
  p_unidade_id    BIGINT,
  p_codigo_barras TEXT
) RETURNS void AS $$
BEGIN
  INSERT INTO pendencias_planograma (unidade_id, codigo_barras)
  VALUES (p_unidade_id, p_codigo_barras)
  ON CONFLICT (unidade_id, codigo_barras) DO UPDATE SET
    tentativas   = pendencias_planograma.tentativas + 1,
    last_seen_at = NOW(),
    resolvido    = FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- 9. Terminais: denormaliza franqueado_id
-- ------------------------------------------------------------
ALTER TABLE terminais ADD COLUMN IF NOT EXISTS franqueado_id BIGINT REFERENCES franqueados(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_terminais_franq ON terminais(franqueado_id);

-- ------------------------------------------------------------
-- 10. RPC: venda atômica — decrementa planograma + estoque_cnpj
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION vender_item(
  p_unidade_id BIGINT,
  p_produto_id BIGINT,
  p_qtd        INT
) RETURNS void AS $$
DECLARE
  pg RECORD;
  pd RECORD;
BEGIN
  IF p_qtd <= 0 THEN
    RAISE EXCEPTION 'Quantidade inválida: %', p_qtd;
  END IF;

  SELECT * INTO pg FROM planograma
   WHERE unidade_id = p_unidade_id AND produto_id = p_produto_id AND ativo = TRUE
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto % fora do planograma da unidade %', p_produto_id, p_unidade_id;
  END IF;

  SELECT * INTO pd FROM produtos WHERE id = p_produto_id FOR UPDATE;

  IF pg.controla_estoque THEN
    IF pg.quantidade < p_qtd THEN
      RAISE EXCEPTION 'Estoque planograma insuficiente (disp=%, ped=%)', pg.quantidade, p_qtd;
    END IF;
    UPDATE planograma SET quantidade = quantidade - p_qtd
     WHERE unidade_id = p_unidade_id AND produto_id = p_produto_id;
  END IF;

  IF pd.controla_estoque_cnpj THEN
    IF pd.estoque_cnpj < p_qtd THEN
      RAISE EXCEPTION 'Estoque CNPJ insuficiente (disp=%, ped=%)', pd.estoque_cnpj, p_qtd;
    END IF;
    UPDATE produtos SET estoque_cnpj = estoque_cnpj - p_qtd WHERE id = p_produto_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- 11. RLS nas tabelas novas
-- ------------------------------------------------------------
ALTER TABLE franqueados           ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios_franqueados  ENABLE ROW LEVEL SECURITY;
ALTER TABLE tecnicos              ENABLE ROW LEVEL SECURITY;
ALTER TABLE pendencias_planograma ENABLE ROW LEVEL SECURITY;

-- Franqueados: só os que o user é vinculado
CREATE POLICY "franq_self_read" ON franqueados FOR SELECT USING (
  id IN (SELECT franqueado_id FROM usuarios_franqueados WHERE user_id = auth.uid())
);

-- Vinculos: só os próprios
CREATE POLICY "usu_franq_self" ON usuarios_franqueados FOR SELECT USING (user_id = auth.uid());

-- Técnicos: só os do franqueado do user
CREATE POLICY "tecnicos_franq" ON tecnicos FOR SELECT USING (
  franqueado_id IN (SELECT franqueado_id FROM usuarios_franqueados WHERE user_id = auth.uid())
);

-- Pendências: só das unidades do franqueado do user
CREATE POLICY "pendencias_franq" ON pendencias_planograma FOR ALL USING (
  unidade_id IN (
    SELECT u.id FROM unidades u
    JOIN usuarios_franqueados uf ON uf.franqueado_id = u.franqueado_id
    WHERE uf.user_id = auth.uid()
  )
);

-- Planograma: também ganha RLS por franqueado (via unidade)
ALTER TABLE planograma ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "estoque_all" ON planograma;
CREATE POLICY "planograma_leitura_publica" ON planograma FOR SELECT USING (true);
CREATE POLICY "planograma_escrita_franq"   ON planograma FOR ALL USING (
  unidade_id IN (
    SELECT u.id FROM unidades u
    JOIN usuarios_franqueados uf ON uf.franqueado_id = u.franqueado_id
    WHERE uf.user_id = auth.uid()
  )
) WITH CHECK (
  unidade_id IN (
    SELECT u.id FROM unidades u
    JOIN usuarios_franqueados uf ON uf.franqueado_id = u.franqueado_id
    WHERE uf.user_id = auth.uid()
  )
);

-- ============================================================
-- SEED DEMO (franqueado + unidade + terminal + categorias + produtos + planograma + técnico)
-- ATENÇÃO: cria o auth.user teste@vallen.com / vallen123.
--          Se falhar (schema do auth mudou), crie manualmente via Supabase Studio
--          e rode SELECT seed_vincular_usuario('teste@vallen.com'); depois.
-- ============================================================

CREATE OR REPLACE FUNCTION seed_vincular_usuario(p_email TEXT)
RETURNS void AS $$
DECLARE
  v_user UUID;
  v_franq BIGINT;
BEGIN
  SELECT id INTO v_user FROM auth.users WHERE email = p_email;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Usuário % não encontrado em auth.users.', p_email;
  END IF;
  SELECT id INTO v_franq FROM franqueados WHERE documento = '00.000.000/0001-00';
  IF v_franq IS NULL THEN
    RAISE EXCEPTION 'Franqueado demo não encontrado. Rode o seed primeiro.';
  END IF;
  INSERT INTO usuarios_franqueados (user_id, franqueado_id, role)
  VALUES (v_user, v_franq, 'admin')
  ON CONFLICT (user_id, franqueado_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
DECLARE
  v_user_id     UUID;
  v_franq_id    BIGINT;
  v_unidade_id  BIGINT;
BEGIN
  -- auth.user NÃO é criado aqui — deve ser criado via Supabase Studio → Authentication.
  -- Após criar, rodar: SELECT seed_vincular_usuario('teste@vallen.com');
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'teste@vallen.com';

  -- Franqueado demo
  INSERT INTO franqueados (tipo_doc, documento, razao_social, nome_fantasia)
  VALUES ('CNPJ', '00.000.000/0001-00', 'Vallen Demo LTDA', 'Vallen Demo')
  ON CONFLICT (documento) DO NOTHING;
  SELECT id INTO v_franq_id FROM franqueados WHERE documento='00.000.000/0001-00';

  -- Vínculo user ↔ franqueado (se user existe)
  IF v_user_id IS NOT NULL THEN
    INSERT INTO usuarios_franqueados (user_id, franqueado_id, role)
    VALUES (v_user_id, v_franq_id, 'admin')
    ON CONFLICT (user_id, franqueado_id) DO NOTHING;
  END IF;

  -- Unidade Matriz
  INSERT INTO unidades (nome, codigo, cidade, ativo, tipo, franqueado_id)
  SELECT 'Matriz', 'VALLEN-MATRIZ', 'São Paulo', true, 'condominio', v_franq_id
  WHERE NOT EXISTS (SELECT 1 FROM unidades WHERE franqueado_id=v_franq_id AND codigo='VALLEN-MATRIZ');
  SELECT id INTO v_unidade_id FROM unidades WHERE franqueado_id=v_franq_id AND codigo='VALLEN-MATRIZ';

  -- Terminal
  INSERT INTO terminais (unidade_id, nome, ativo, franqueado_id)
  SELECT v_unidade_id, 'Caixa 01', true, v_franq_id
  WHERE NOT EXISTS (SELECT 1 FROM terminais WHERE unidade_id=v_unidade_id AND nome='Caixa 01');

  -- Categorias
  INSERT INTO categorias (nome, ordem, ativo, emoji, franqueado_id) VALUES
    ('REFRIGERANTES', 1, true, '🥤', v_franq_id),
    ('SNACKS',        2, true, '🍿', v_franq_id),
    ('CERVEJAS',      3, true, '🍺', v_franq_id),
    ('ÁGUA',          4, true, '💧', v_franq_id)
  ON CONFLICT (franqueado_id, nome) DO NOTHING;

  -- Produtos (catálogo do franqueado)
  INSERT INTO produtos (nome, codigo_barras, estoque_cnpj, categoria, emoji, franqueado_id, restrito_idade) VALUES
    ('Coca-Cola 350ml',    '7894900011517', 100, 'REFRIGERANTES', '🥤', v_franq_id, false),
    ('Guaraná Antarctica', '7891991010856',  80, 'REFRIGERANTES', '🥤', v_franq_id, false),
    ('Skol Lata 350ml',    '7891149102501',  60, 'CERVEJAS',      '🍺', v_franq_id, true ),
    ('Heineken Long Neck', '7896045503651',  40, 'CERVEJAS',      '🍺', v_franq_id, true ),
    ('Doritos Nacho',      '7892840819422',  50, 'SNACKS',        '🌮', v_franq_id, false),
    ('Água Crystal 500ml', '7894900530001', 120, 'ÁGUA',          '💧', v_franq_id, false)
  ON CONFLICT (codigo_barras) DO NOTHING;

  -- Planograma: todos os produtos na Matriz (preço e estoque por filial)
  INSERT INTO planograma (unidade_id, produto_id, preco_venda, quantidade, controla_estoque)
  SELECT v_unidade_id, p.id,
         CASE p.codigo_barras
           WHEN '7894900011517' THEN 6.00
           WHEN '7891991010856' THEN 6.50
           WHEN '7891149102501' THEN 7.50
           WHEN '7896045503651' THEN 10.00
           WHEN '7892840819422' THEN 9.90
           WHEN '7894900530001' THEN 4.00
         END,
         CASE p.codigo_barras
           WHEN '7894900011517' THEN 30
           WHEN '7891991010856' THEN 20
           WHEN '7891149102501' THEN 15
           WHEN '7896045503651' THEN 10
           WHEN '7892840819422' THEN 20
           WHEN '7894900530001' THEN 40
         END,
         TRUE
  FROM produtos p
  WHERE p.franqueado_id = v_franq_id
  ON CONFLICT (unidade_id, produto_id) DO NOTHING;

  -- Técnico default (senha "1234")
  INSERT INTO tecnicos (franqueado_id, nome, senha_hash)
  SELECT v_franq_id, 'Admin', extensions.crypt('1234', extensions.gen_salt('bf'))
  WHERE NOT EXISTS (SELECT 1 FROM tecnicos WHERE franqueado_id=v_franq_id AND nome='Admin');
END $$;

-- ------------------------------------------------------------
-- Realtime: expor pendências para o admin webapp
-- ------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND tablename='pendencias_planograma'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE pendencias_planograma;
  END IF;
END $$;

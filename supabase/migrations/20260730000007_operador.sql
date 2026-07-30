-- ============================================================
-- App do Operador / Repositor
-- ------------------------------------------------------------
-- Recursos:
--   1. Níveis de usuário  — alçada de ajuste de preço (usuarios_franqueados)
--   2. Ajuste de preço     — aplica direto (com alçada) ou fila de aprovação
--   3. Auditoria de estoque— sessão de contagem NÃO-destrutiva (snapshot)
--   4. Validade            — lotes com data de vencimento + alertas
--   5. buscar_produto_operador — resolve produto + planograma da unidade
--
-- Segurança: toda escrita passa por RPC SECURITY DEFINER com verificação de
-- vínculo (usuarios_franqueados) e SET search_path. Tabelas com RLS por
-- franqueado (via unidade). Grants só p/ authenticated (operador é logado).
-- ============================================================

-- ------------------------------------------------------------
-- 0. Níveis de usuário: alçada de preço
-- ------------------------------------------------------------
ALTER TABLE usuarios_franqueados
  ADD COLUMN IF NOT EXISTS pode_ajustar_preco BOOLEAN NOT NULL DEFAULT FALSE;
-- Semântica: role='admin' OU pode_ajustar_preco=TRUE  → aplica preço direto.
--            operador sem o flag                       → gera solicitação pendente.

-- Helper: franqueado_id da unidade SE o usuário atual tem vínculo; senão NULL.
CREATE OR REPLACE FUNCTION _op_franq_do_user(p_unidade_id BIGINT)
RETURNS BIGINT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.franqueado_id
    FROM unidades u
    JOIN usuarios_franqueados uf
      ON uf.franqueado_id = u.franqueado_id AND uf.user_id = auth.uid()
   WHERE u.id = p_unidade_id
   LIMIT 1;
$$;

-- Helper: usuário atual pode aplicar preço direto neste franqueado?
CREATE OR REPLACE FUNCTION _op_tem_alcada(p_franqueado_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM usuarios_franqueados
     WHERE user_id = auth.uid()
       AND franqueado_id = p_franqueado_id
       AND (role = 'admin' OR pode_ajustar_preco = TRUE)
  );
$$;

-- ------------------------------------------------------------
-- 1. Resolver produto + planograma da unidade (leitura do scanner)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION buscar_produto_operador(
  p_unidade_id    BIGINT,
  p_codigo_barras TEXT
) RETURNS TABLE (
  produto_id       BIGINT,
  nome             TEXT,
  codigo_barras    TEXT,
  emoji            TEXT,
  imagem_url       TEXT,
  categoria        TEXT,
  preco_ref        NUMERIC,
  estoque_cnpj     INT,
  restrito_idade   BOOLEAN,
  no_planograma    BOOLEAN,
  preco_venda      NUMERIC,
  quantidade       INT,
  controla_estoque BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    p.id, p.nome, p.codigo_barras, p.emoji, p.imagem_url, p.categoria,
    p.preco, p.estoque_cnpj, p.restrito_idade,
    (pl.produto_id IS NULL) AS no_planograma,
    pl.preco_venda, pl.quantidade,
    COALESCE(pl.controla_estoque, FALSE)
  FROM unidades u
  -- Escopo: só se o usuário atual tem vínculo com o franqueado da unidade.
  JOIN usuarios_franqueados uf
    ON uf.franqueado_id = u.franqueado_id AND uf.user_id = auth.uid()
  JOIN produtos p
    ON p.franqueado_id = u.franqueado_id AND p.codigo_barras = p_codigo_barras
  LEFT JOIN planograma pl
    ON pl.unidade_id = u.id AND pl.produto_id = p.id AND pl.ativo = TRUE
  WHERE u.id = p_unidade_id
  LIMIT 1;
$$;

-- ============================================================
-- 2. Ajuste de preço — log imutável + fila de aprovação
-- ============================================================
CREATE TABLE IF NOT EXISTS alteracoes_preco (
  id             BIGSERIAL PRIMARY KEY,
  unidade_id     BIGINT      NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
  produto_id     BIGINT      NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  preco_antigo   NUMERIC,
  preco_novo     NUMERIC     NOT NULL CHECK (preco_novo > 0),
  origem         TEXT        NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual','markup')),
  status         TEXT        NOT NULL CHECK (status IN ('pendente','aplicado','rejeitado')),
  solicitado_por UUID,  -- auth.uid() (sem FK: auth.users é do supabase_auth_admin)
  decidido_por   UUID,  -- auth.uid() (sem FK: auth.users é do supabase_auth_admin)
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_altpreco_unidade   ON alteracoes_preco(unidade_id);
CREATE INDEX IF NOT EXISTS idx_altpreco_pendentes ON alteracoes_preco(unidade_id) WHERE status = 'pendente';

-- Aplica o preço na planograma + espelha em produtos.preco (referencial → dispara
-- o outbox p/ DWPDV). Uso interno; assume autorização já verificada.
CREATE OR REPLACE FUNCTION _op_aplicar_preco(p_unidade_id BIGINT, p_produto_id BIGINT, p_preco NUMERIC)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE planograma SET preco_venda = p_preco
   WHERE unidade_id = p_unidade_id AND produto_id = p_produto_id;
  -- Espelha no catálogo p/ o push DWPDV carregar o preço de venda.
  UPDATE produtos SET preco = p_preco WHERE id = p_produto_id;
END;
$$;

-- Solicita alteração de preço. Com alçada → aplica na hora (status 'aplicado').
-- Sem alçada → enfileira (status 'pendente'). Retorna a linha criada.
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

  SELECT preco_venda INTO v_antigo FROM planograma
   WHERE unidade_id = p_unidade_id AND produto_id = p_produto_id AND ativo = TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto fora do planograma desta unidade';
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

-- Admin decide uma solicitação pendente (aprovar aplica; rejeitar arquiva).
CREATE OR REPLACE FUNCTION decidir_alteracao_preco(
  p_id      BIGINT,
  p_aprovar BOOLEAN
) RETURNS alteracoes_preco
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_alt   alteracoes_preco;
  v_franq BIGINT;
BEGIN
  SELECT * INTO v_alt FROM alteracoes_preco WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitação não encontrada'; END IF;
  IF v_alt.status <> 'pendente' THEN RAISE EXCEPTION 'Solicitação já decidida'; END IF;

  SELECT franqueado_id INTO v_franq FROM unidades WHERE id = v_alt.unidade_id;
  -- Só admin do franqueado decide.
  IF NOT EXISTS (
    SELECT 1 FROM usuarios_franqueados
     WHERE user_id = auth.uid() AND franqueado_id = v_franq AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Apenas o admin aprova alteração de preço';
  END IF;

  UPDATE alteracoes_preco
     SET status       = CASE WHEN p_aprovar THEN 'aplicado' ELSE 'rejeitado' END,
         decidido_por = auth.uid(),
         decided_at   = NOW()
   WHERE id = p_id
   RETURNING * INTO v_alt;

  IF p_aprovar THEN
    PERFORM _op_aplicar_preco(v_alt.unidade_id, v_alt.produto_id, v_alt.preco_novo);
  END IF;

  RETURN v_alt;
END;
$$;

-- Lista solicitações pendentes de uma unidade (para o admin decidir).
CREATE OR REPLACE FUNCTION listar_alteracoes_pendentes(p_unidade_id BIGINT)
RETURNS TABLE (
  id             BIGINT,
  produto_id     BIGINT,
  produto_nome   TEXT,
  codigo_barras  TEXT,
  preco_antigo   NUMERIC,
  preco_novo     NUMERIC,
  origem         TEXT,
  created_at     TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, a.produto_id, p.nome, p.codigo_barras,
         a.preco_antigo, a.preco_novo, a.origem, a.created_at
    FROM alteracoes_preco a
    JOIN produtos  p ON p.id = a.produto_id
    JOIN unidades  u ON u.id = a.unidade_id
    JOIN usuarios_franqueados uf
      ON uf.franqueado_id = u.franqueado_id AND uf.user_id = auth.uid()
   WHERE a.unidade_id = p_unidade_id AND a.status = 'pendente'
   ORDER BY a.created_at ASC;
$$;

-- ============================================================
-- 3. Auditoria de estoque — sessão de contagem NÃO-destrutiva
-- ============================================================
CREATE TABLE IF NOT EXISTS contagens (
  id           BIGSERIAL PRIMARY KEY,
  unidade_id   BIGINT      NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
  status       TEXT        NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','aplicada','descartada')),
  aberta_por   UUID,  -- auth.uid() (sem FK: auth.users é do supabase_auth_admin)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  aplicada_por UUID,  -- auth.uid() (sem FK: auth.users é do supabase_auth_admin)
  applied_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_contagens_abertas ON contagens(unidade_id) WHERE status = 'aberta';

CREATE TABLE IF NOT EXISTS contagem_itens (
  id           BIGSERIAL PRIMARY KEY,
  contagem_id  BIGINT      NOT NULL REFERENCES contagens(id) ON DELETE CASCADE,
  produto_id   BIGINT      NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  qtd_sistema  INT,        -- snapshot da planograma.quantidade na 1ª contagem
  qtd_contada  INT         NOT NULL CHECK (qtd_contada >= 0),
  contado_por  UUID,  -- auth.uid() (sem FK: auth.users é do supabase_auth_admin)
  contado_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (contagem_id, produto_id)
);

-- Abre (ou reaproveita) a sessão aberta da unidade. Retorna o id.
CREATE OR REPLACE FUNCTION abrir_contagem(p_unidade_id BIGINT)
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id BIGINT;
BEGIN
  IF _op_franq_do_user(p_unidade_id) IS NULL THEN
    RAISE EXCEPTION 'Sem permissão para esta unidade';
  END IF;
  SELECT id INTO v_id FROM contagens
   WHERE unidade_id = p_unidade_id AND status = 'aberta'
   ORDER BY created_at DESC LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO contagens (unidade_id, aberta_por) VALUES (p_unidade_id, auth.uid())
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;

-- Registra a contagem de um item. Snapshot do sistema é tirado na 1ª vez e
-- preservado em recontagens (não move a base). Retorna sistema/contado/diferença.
CREATE OR REPLACE FUNCTION registrar_contagem_item(
  p_contagem_id BIGINT,
  p_produto_id  BIGINT,
  p_qtd_contada INT
) RETURNS TABLE (qtd_sistema INT, qtd_contada INT, diferenca INT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_unidade BIGINT;
  v_sis     INT;
BEGIN
  IF p_qtd_contada IS NULL OR p_qtd_contada < 0 THEN
    RAISE EXCEPTION 'Quantidade inválida';
  END IF;
  SELECT unidade_id INTO v_unidade FROM contagens
   WHERE id = p_contagem_id AND status = 'aberta';
  IF v_unidade IS NULL THEN RAISE EXCEPTION 'Contagem não está aberta'; END IF;
  IF _op_franq_do_user(v_unidade) IS NULL THEN
    RAISE EXCEPTION 'Sem permissão para esta unidade';
  END IF;

  SELECT quantidade INTO v_sis FROM planograma
   WHERE unidade_id = v_unidade AND produto_id = p_produto_id AND controla_estoque = TRUE;

  INSERT INTO contagem_itens (contagem_id, produto_id, qtd_sistema, qtd_contada, contado_por)
  VALUES (p_contagem_id, p_produto_id, v_sis, p_qtd_contada, auth.uid())
  ON CONFLICT (contagem_id, produto_id) DO UPDATE SET
    qtd_contada = EXCLUDED.qtd_contada,   -- recontagem sobrescreve o contado
    contado_por = auth.uid(),
    contado_at  = NOW();                  -- qtd_sistema (snapshot) preservado

  SELECT ci.qtd_sistema INTO v_sis FROM contagem_itens ci
   WHERE ci.contagem_id = p_contagem_id AND ci.produto_id = p_produto_id;

  RETURN QUERY SELECT v_sis, p_qtd_contada, (p_qtd_contada - COALESCE(v_sis, 0));
END;
$$;

-- Itens já contados na sessão (para revisão antes de aplicar).
CREATE OR REPLACE FUNCTION listar_contagem_itens(p_contagem_id BIGINT)
RETURNS TABLE (
  produto_id    BIGINT,
  produto_nome  TEXT,
  emoji         TEXT,
  qtd_sistema   INT,
  qtd_contada   INT,
  diferenca     INT,
  contado_at    TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ci.produto_id, p.nome, p.emoji,
         ci.qtd_sistema, ci.qtd_contada,
         (ci.qtd_contada - COALESCE(ci.qtd_sistema, 0)) AS diferenca,
         ci.contado_at
    FROM contagem_itens ci
    JOIN contagens c ON c.id = ci.contagem_id
    JOIN produtos  p ON p.id = ci.produto_id
    JOIN usuarios_franqueados uf
      ON uf.user_id = auth.uid()
     AND uf.franqueado_id = (SELECT franqueado_id FROM unidades WHERE id = c.unidade_id)
   WHERE ci.contagem_id = p_contagem_id
   ORDER BY ci.contado_at DESC;
$$;

-- Aplica a contagem: ajusta planograma.quantidade = qtd_contada (só itens com
-- controle de estoque) e fecha a sessão. Ação de estoque — logada em applied_at.
CREATE OR REPLACE FUNCTION aplicar_contagem(p_contagem_id BIGINT)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_unidade BIGINT;
  v_n       INT;
BEGIN
  SELECT unidade_id INTO v_unidade FROM contagens
   WHERE id = p_contagem_id AND status = 'aberta' FOR UPDATE;
  IF v_unidade IS NULL THEN RAISE EXCEPTION 'Contagem não está aberta'; END IF;
  IF _op_franq_do_user(v_unidade) IS NULL THEN
    RAISE EXCEPTION 'Sem permissão para esta unidade';
  END IF;

  WITH upd AS (
    UPDATE planograma pl
       SET quantidade = ci.qtd_contada
      FROM contagem_itens ci
     WHERE ci.contagem_id = p_contagem_id
       AND pl.unidade_id  = v_unidade
       AND pl.produto_id  = ci.produto_id
       AND pl.controla_estoque = TRUE
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_n FROM upd;

  UPDATE contagens
     SET status = 'aplicada', aplicada_por = auth.uid(), applied_at = NOW()
   WHERE id = p_contagem_id;

  RETURN v_n;
END;
$$;

-- ============================================================
-- 4. Validade — lotes com data de vencimento
-- ============================================================
CREATE TABLE IF NOT EXISTS validades (
  id             BIGSERIAL PRIMARY KEY,
  unidade_id     BIGINT      NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
  produto_id     BIGINT      NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  data_validade  DATE        NOT NULL,
  quantidade     INT         NOT NULL DEFAULT 1 CHECK (quantidade > 0),
  status         TEXT        NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','baixado')),
  registrado_por UUID,  -- auth.uid() (sem FK: auth.users é do supabase_auth_admin)
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_validades_unidade_data
  ON validades(unidade_id, data_validade) WHERE status = 'ativo';

CREATE OR REPLACE FUNCTION registrar_validade(
  p_unidade_id    BIGINT,
  p_produto_id    BIGINT,
  p_data_validade DATE,
  p_quantidade    INT DEFAULT 1
) RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id BIGINT;
BEGIN
  IF p_data_validade IS NULL THEN RAISE EXCEPTION 'Data de validade obrigatória'; END IF;
  IF p_quantidade IS NULL OR p_quantidade <= 0 THEN RAISE EXCEPTION 'Quantidade inválida'; END IF;
  IF _op_franq_do_user(p_unidade_id) IS NULL THEN
    RAISE EXCEPTION 'Sem permissão para esta unidade';
  END IF;
  INSERT INTO validades (unidade_id, produto_id, data_validade, quantidade, registrado_por)
  VALUES (p_unidade_id, p_produto_id, p_data_validade, p_quantidade, auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Lotes ativos que vencem em até p_dias (inclui já vencidos: data <= hoje+dias).
CREATE OR REPLACE FUNCTION listar_validades(p_unidade_id BIGINT, p_dias INT DEFAULT 30)
RETURNS TABLE (
  id            BIGINT,
  produto_id    BIGINT,
  produto_nome  TEXT,
  emoji         TEXT,
  data_validade DATE,
  dias_restantes INT,
  quantidade    INT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT v.id, v.produto_id, p.nome, p.emoji, v.data_validade,
         (v.data_validade - CURRENT_DATE) AS dias_restantes,
         v.quantidade
    FROM validades v
    JOIN produtos  p ON p.id = v.produto_id
    JOIN unidades  u ON u.id = v.unidade_id
    JOIN usuarios_franqueados uf
      ON uf.franqueado_id = u.franqueado_id AND uf.user_id = auth.uid()
   WHERE v.unidade_id = p_unidade_id
     AND v.status = 'ativo'
     AND v.data_validade <= CURRENT_DATE + p_dias
   ORDER BY v.data_validade ASC;
$$;

CREATE OR REPLACE FUNCTION baixar_validade(p_id BIGINT)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_unidade BIGINT;
BEGIN
  SELECT unidade_id INTO v_unidade FROM validades WHERE id = p_id;
  IF v_unidade IS NULL THEN RAISE EXCEPTION 'Lote não encontrado'; END IF;
  IF _op_franq_do_user(v_unidade) IS NULL THEN
    RAISE EXCEPTION 'Sem permissão para esta unidade';
  END IF;
  UPDATE validades SET status = 'baixado' WHERE id = p_id;
END;
$$;

-- ============================================================
-- 5. RLS — tabelas novas (leitura por franqueado; escrita só via RPC)
-- ============================================================
ALTER TABLE alteracoes_preco ENABLE ROW LEVEL SECURITY;
ALTER TABLE contagens        ENABLE ROW LEVEL SECURITY;
ALTER TABLE contagem_itens   ENABLE ROW LEVEL SECURITY;
ALTER TABLE validades        ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  -- Leitura escopada por franqueado (via unidade). Escrita passa por RPC DEFINER.
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='alteracoes_preco' AND policyname='altpreco_franq_read') THEN
    CREATE POLICY "altpreco_franq_read" ON alteracoes_preco FOR SELECT USING (
      unidade_id IN (SELECT u.id FROM unidades u JOIN usuarios_franqueados uf
        ON uf.franqueado_id = u.franqueado_id WHERE uf.user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='contagens' AND policyname='contagens_franq_read') THEN
    CREATE POLICY "contagens_franq_read" ON contagens FOR SELECT USING (
      unidade_id IN (SELECT u.id FROM unidades u JOIN usuarios_franqueados uf
        ON uf.franqueado_id = u.franqueado_id WHERE uf.user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='contagem_itens' AND policyname='contitens_franq_read') THEN
    CREATE POLICY "contitens_franq_read" ON contagem_itens FOR SELECT USING (
      contagem_id IN (SELECT c.id FROM contagens c JOIN unidades u ON u.id = c.unidade_id
        JOIN usuarios_franqueados uf ON uf.franqueado_id = u.franqueado_id WHERE uf.user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='validades' AND policyname='validades_franq_read') THEN
    CREATE POLICY "validades_franq_read" ON validades FOR SELECT USING (
      unidade_id IN (SELECT u.id FROM unidades u JOIN usuarios_franqueados uf
        ON uf.franqueado_id = u.franqueado_id WHERE uf.user_id = auth.uid()));
  END IF;
END $$;

-- Tira o acesso direto de escrita (mutação só via RPC SECURITY DEFINER).
REVOKE INSERT, UPDATE, DELETE ON alteracoes_preco, contagens, contagem_itens, validades FROM anon, authenticated;

-- ============================================================
-- 6. Grants — RPCs (operador é sempre logado → só authenticated)
-- ============================================================
-- Defense-in-depth: tira o EXECUTE default de PUBLIC. As guardas auth.uid() já
-- barram anon, mas assim o "só authenticated" fica explícito no grant.
REVOKE EXECUTE ON FUNCTION buscar_produto_operador(BIGINT, TEXT)                    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION solicitar_alteracao_preco(BIGINT, BIGINT, NUMERIC, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION decidir_alteracao_preco(BIGINT, BOOLEAN)                  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION listar_alteracoes_pendentes(BIGINT)                       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION abrir_contagem(BIGINT)                                    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION registrar_contagem_item(BIGINT, BIGINT, INT)              FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION listar_contagem_itens(BIGINT)                             FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION aplicar_contagem(BIGINT)                                  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION registrar_validade(BIGINT, BIGINT, DATE, INT)             FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION listar_validades(BIGINT, INT)                             FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION baixar_validade(BIGINT)                                   FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION buscar_produto_operador(BIGINT, TEXT)                        TO authenticated;
GRANT EXECUTE ON FUNCTION solicitar_alteracao_preco(BIGINT, BIGINT, NUMERIC, TEXT)     TO authenticated;
GRANT EXECUTE ON FUNCTION decidir_alteracao_preco(BIGINT, BOOLEAN)                      TO authenticated;
GRANT EXECUTE ON FUNCTION listar_alteracoes_pendentes(BIGINT)                           TO authenticated;
GRANT EXECUTE ON FUNCTION abrir_contagem(BIGINT)                                        TO authenticated;
GRANT EXECUTE ON FUNCTION registrar_contagem_item(BIGINT, BIGINT, INT)                  TO authenticated;
GRANT EXECUTE ON FUNCTION listar_contagem_itens(BIGINT)                                 TO authenticated;
GRANT EXECUTE ON FUNCTION aplicar_contagem(BIGINT)                                      TO authenticated;
GRANT EXECUTE ON FUNCTION registrar_validade(BIGINT, BIGINT, DATE, INT)                 TO authenticated;
GRANT EXECUTE ON FUNCTION listar_validades(BIGINT, INT)                                 TO authenticated;
GRANT EXECUTE ON FUNCTION baixar_validade(BIGINT)                                       TO authenticated;
-- Helpers internos: uso só dentro das RPCs SECURITY DEFINER (rodam como owner).
-- Supabase concede EXECUTE a anon/authenticated por default-privilege, então
-- revogar de PUBLIC não basta — revogar explicitamente de anon E authenticated
-- (senão _op_aplicar_preco fica chamável direto pelo REST, furando a alçada).
REVOKE EXECUTE ON FUNCTION _op_franq_do_user(BIGINT)                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION _op_tem_alcada(BIGINT)                     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION _op_aplicar_preco(BIGINT, BIGINT, NUMERIC) FROM PUBLIC, anon, authenticated;

-- PostgREST enxerga as novas tabelas/RPCs.
NOTIFY pgrst, 'reload schema';

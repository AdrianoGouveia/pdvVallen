-- ==========================================================================
-- Push de produto Vallen → Beepay (substitui o DWPDV como destino — decisão 2026-10-19).
-- Regra (pedido do Adriano: "cadastro e atualização de preço pelo app deve subir"), com o
-- escopo da LOJA mapeada (revisão adversarial: sem isso produto/preço de OUTRA loja ia p/ o
-- totem da Porto Príncipe — _op_aplicar_preco copia o preço de qualquer loja em produtos.preco):
--  • Produto DA LOJA = catalogo_ativo, OU no planograma ATIVO de unidade mapeada, OU já
--    vendido no app numa unidade mapeada. NÃO usa franqueado_id (os 47k são do franqueado 1).
--  • Cadastro/alteração (nome, preço, categoria, +18, foto) de produto da loja → sobe. O
--    cadastro pelo /operador grava o planograma da loja na mesma operação → sobe.
--  • Planograma da loja (insert / preco_venda / ativo) e VENDA no app em unidade mapeada
--    também enfileiram. Preço enviado = planograma.preco_venda da loja.
--  • Mudança SÓ de preço feita por script (service_role/psql — ex.: sync de preço do DWPDV)
--    NÃO sobe: preço do Beepay vem do app/planograma, não do DWPDV aposentado.
--  • Fila PRÓPRIA integracao.produto_beepay_outbox (a do DWPDV tem status único).
--  • Worker api/cron/push-produtos-beepay.js (login do painel; sem client_secret).
--  • DWPDV PARADO: trg_produto_push removido (p/ voltar: recriar como em 20260730000003).
-- Depende de 20261017000001_vendas_beepay.sql (integracao.beepay_filial).
-- ==========================================================================

-- produtos sincronizam independente de `ativo` (que liga as VENDAS dessa filial)
ALTER TABLE integracao.beepay_filial ADD COLUMN IF NOT EXISTS sync_produtos boolean NOT NULL DEFAULT true;
COMMENT ON COLUMN integracao.beepay_filial.sync_produtos IS 'Envia os produtos da loja p/ o Beepay (independe de ativo, que liga as vendas). false = desliga.';

CREATE TABLE IF NOT EXISTS integracao.produto_beepay_outbox (
  produto_id  bigint PRIMARY KEY REFERENCES public.produtos(id) ON DELETE CASCADE,
  status      text NOT NULL DEFAULT 'pendente'
              CHECK (status IN ('pendente','enviando','enviado','erro','ignorado')),
  tentativas  int  NOT NULL DEFAULT 0,
  acao        text,          -- último envio: criado | atualizado
  erro        text,          -- erro, ou avisos não-fatais do último envio
  origem      text,          -- o que enfileirou por último (app | loja | planograma | venda | backfill)
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  sent_at     timestamptz
);
CREATE INDEX IF NOT EXISTS idx_produto_beepay_outbox_fila
  ON integracao.produto_beepay_outbox (updated_at) WHERE status IN ('pendente','enviando');

-- chave/valor da integração: dica do próximo código de venda + lease do worker
CREATE TABLE IF NOT EXISTS integracao.beepay_config (
  chave      text PRIMARY KEY,
  valor      text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- 2026-10-19: códigos 1..342 em uso no Beepay; o worker sobe daqui até achar um livre
INSERT INTO integracao.beepay_config (chave, valor) VALUES ('cod_venda_dica', '343') ON CONFLICT DO NOTHING;

-- papel da requisição PostgREST (anon/authenticated = app; service_role/sem JWT = script)
CREATE OR REPLACE FUNCTION integracao.papel_requisicao()
RETURNS text LANGUAGE plpgsql STABLE SET search_path = pg_catalog, pg_temp AS $$
DECLARE c text := current_setting('request.jwt.claims', true);
BEGIN
  IF c IS NOT NULL AND c <> '' THEN RETURN COALESCE(c::jsonb->>'role', 'sem_papel'); END IF;
  RETURN COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'sem_jwt');
EXCEPTION WHEN OTHERS THEN RETURN 'invalido';
END; $$;

-- alguma filial com produtos ligados?
CREATE OR REPLACE FUNCTION integracao.beepay_sync_ligado()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = integracao, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM integracao.beepay_filial WHERE sync_produtos)
$$;

-- produto é "da loja"? (catálogo ativo, planograma ativo de unidade mapeada, ou vendido nela).
-- Ter linha na fila NÃO conta (senão uma vez dentro, sempre dentro).
CREATE INDEX IF NOT EXISTS idx_itens_pedido_produto ON public.itens_pedido (produto_id);
CREATE OR REPLACE FUNCTION integracao.produto_da_loja_beepay(p_id bigint, p_catalogo boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = integracao, public, pg_temp AS $$
  SELECT COALESCE(p_catalogo, false)
      OR EXISTS (SELECT 1 FROM public.planograma pl JOIN integracao.beepay_filial f ON f.unidade_id = pl.unidade_id
                  WHERE f.sync_produtos AND pl.produto_id = p_id AND pl.ativo)
      OR EXISTS (SELECT 1 FROM public.itens_pedido ip JOIN public.pedidos pd ON pd.id = ip.pedido_id
                 JOIN integracao.beepay_filial f ON f.unidade_id = pd.unidade_id
                  WHERE f.sync_produtos AND ip.produto_id = p_id)
$$;

-- coloca/volta na fila. Mudança durante um envio volta p/ 'pendente' → o worker (que só
-- fecha 'enviando') reenvia com o dado novo; erro esgotado é zerado por mudança nova.
CREATE OR REPLACE FUNCTION integracao.enfileira_beepay(p_id bigint, p_origem text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = integracao, pg_temp AS $$
  INSERT INTO integracao.produto_beepay_outbox (produto_id, origem) VALUES (p_id, p_origem)
  ON CONFLICT (produto_id) DO UPDATE SET status = 'pendente', tentativas = 0, erro = NULL, origem = EXCLUDED.origem, updated_at = now();
$$;

CREATE OR REPLACE FUNCTION integracao.enfileira_produto_beepay()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = integracao, public, pg_temp AS $$
DECLARE app boolean;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.nome           IS NOT DISTINCT FROM OLD.nome
     AND NEW.preco          IS NOT DISTINCT FROM OLD.preco
     AND NEW.categoria      IS NOT DISTINCT FROM OLD.categoria
     AND NEW.restrito_idade IS NOT DISTINCT FROM OLD.restrito_idade
     AND NEW.imagem_url     IS NOT DISTINCT FROM OLD.imagem_url
     AND NEW.codigo_barras  IS NOT DISTINCT FROM OLD.codigo_barras
     AND NEW.catalogo_ativo IS NOT DISTINCT FROM OLD.catalogo_ativo THEN
    RETURN NEW;
  END IF;
  -- RESILIENTE: falha ao enfileirar NUNCA pode reverter o save do produto
  BEGIN
    IF integracao.beepay_sync_ligado() THEN
      app := integracao.papel_requisicao() IN ('anon', 'authenticated');
      -- script mudando SÓ o preço (sync do DWPDV) não manda no Beepay
      IF NOT app AND TG_OP = 'UPDATE'
         AND NEW.nome IS NOT DISTINCT FROM OLD.nome AND NEW.categoria IS NOT DISTINCT FROM OLD.categoria
         AND NEW.restrito_idade IS NOT DISTINCT FROM OLD.restrito_idade AND NEW.imagem_url IS NOT DISTINCT FROM OLD.imagem_url
         AND NEW.codigo_barras IS NOT DISTINCT FROM OLD.codigo_barras AND NEW.catalogo_ativo IS NOT DISTINCT FROM OLD.catalogo_ativo THEN
        RETURN NEW;
      END IF;
      IF integracao.produto_da_loja_beepay(NEW.id, NEW.catalogo_ativo) THEN
        PERFORM integracao.enfileira_beepay(NEW.id, CASE WHEN app THEN 'app' ELSE 'script' END);
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'produto_beepay_outbox: falha ao enfileirar produto %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_produto_beepay ON public.produtos;
CREATE TRIGGER trg_produto_beepay
  AFTER INSERT OR UPDATE ON public.produtos
  FOR EACH ROW EXECUTE FUNCTION integracao.enfileira_produto_beepay();

-- planograma de loja mapeada: entrada, preço da loja (preco_venda) ou reativação
CREATE OR REPLACE FUNCTION integracao.enfileira_planograma_beepay()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = integracao, public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.preco_venda IS NOT DISTINCT FROM OLD.preco_venda
     AND NEW.ativo IS NOT DISTINCT FROM OLD.ativo AND NEW.produto_id IS NOT DISTINCT FROM OLD.produto_id THEN
    RETURN NEW;
  END IF;
  BEGIN
    IF NEW.ativo AND EXISTS (SELECT 1 FROM integracao.beepay_filial f WHERE f.unidade_id = NEW.unidade_id AND f.sync_produtos) THEN
      PERFORM integracao.enfileira_beepay(NEW.produto_id, 'planograma');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'produto_beepay_outbox: falha ao enfileirar planograma %: %', NEW.produto_id, SQLERRM;
  END;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_planograma_beepay ON public.planograma;
CREATE TRIGGER trg_planograma_beepay
  AFTER INSERT OR UPDATE OF preco_venda, ativo, produto_id ON public.planograma
  FOR EACH ROW EXECUTE FUNCTION integracao.enfileira_planograma_beepay();

-- produto VENDIDO no app numa loja mapeada e ainda não acompanhado → sobe (1ª vez só;
-- DO NOTHING: não reenvia a cada venda). Resiliente: nunca atrapalha o pagamento.
CREATE OR REPLACE FUNCTION integracao.enfileira_venda_produto_beepay()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = integracao, public, pg_temp AS $$
BEGIN
  BEGIN
    IF NEW.produto_id IS NOT NULL AND EXISTS (
         SELECT 1 FROM public.pedidos pd JOIN integracao.beepay_filial f ON f.unidade_id = pd.unidade_id
          WHERE pd.id = NEW.pedido_id AND f.sync_produtos) THEN
      INSERT INTO integracao.produto_beepay_outbox (produto_id, origem) VALUES (NEW.produto_id, 'venda')
      ON CONFLICT (produto_id) DO NOTHING;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'produto_beepay_outbox: falha ao enfileirar item vendido %: %', NEW.produto_id, SQLERRM;
  END;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_item_pedido_beepay ON public.itens_pedido;
CREATE TRIGGER trg_item_pedido_beepay
  AFTER INSERT ON public.itens_pedido
  FOR EACH ROW EXECUTE FUNCTION integracao.enfileira_venda_produto_beepay();

-- lease do worker (um por vez; vence sozinho se o worker morrer). Devolve true se pegou.
CREATE OR REPLACE FUNCTION integracao.beepay_lease(p_chave text, p_dono text, p_segundos int)
RETURNS boolean LANGUAGE plpgsql SET search_path = integracao, pg_temp AS $$
BEGIN
  INSERT INTO integracao.beepay_config (chave, valor, updated_at) VALUES (p_chave, p_dono, now())
  ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, updated_at = now()
    WHERE beepay_config.valor IN ('', EXCLUDED.valor)
       OR beepay_config.updated_at < now() - make_interval(secs => p_segundos);
  RETURN FOUND;
END; $$;
CREATE OR REPLACE FUNCTION integracao.beepay_lease_solta(p_chave text, p_dono text)
RETURNS void LANGUAGE sql SET search_path = integracao, pg_temp AS $$
  UPDATE integracao.beepay_config SET valor = '', updated_at = now() WHERE chave = p_chave AND valor = p_dono;
$$;

-- ── DWPDV deixa de receber produto (decisão 2026-10-19). O cron push-produtos.js também
--    só roda com DWPDV_PUSH_PRODUTOS=on. Fila antiga (produto_outbox) fica como histórico.
DROP TRIGGER IF EXISTS trg_produto_push ON public.produtos;

-- ── backfill (uma vez): o que é da loja e o que foi vendido, p/ o Beepay ficar igual ao
--    Vallen. Existente no Beepay é só ATUALIZADO (casa por EAN; não duplica). Volume
--    ~450: drenar com o CLI na VPS (produtos-push), não pelo cron de 8 s.
-- (união de conjuntos de ids — EXISTS por linha nos 47k varreria venda_externa_item)
INSERT INTO integracao.produto_beepay_outbox (produto_id, origem)
SELECT DISTINCT s.id, 'backfill' FROM (
  SELECT p.id FROM public.produtos p WHERE p.catalogo_ativo OR p.created_at >= '2026-10-17' -- pós-upload do catálogo
  UNION SELECT pl.produto_id FROM public.planograma pl JOIN integracao.beepay_filial f ON f.unidade_id = pl.unidade_id
         WHERE f.sync_produtos AND pl.ativo
  UNION SELECT ip.produto_id FROM public.itens_pedido ip JOIN public.pedidos pd ON pd.id = ip.pedido_id
         JOIN integracao.beepay_filial f ON f.unidade_id = pd.unidade_id WHERE f.sync_produtos
  -- vendido no DWPDV numa maquininha DA LOJA mapeada (venda_externa.pdv → terminais.dwpdv_destino)
  UNION SELECT p.id FROM integracao.venda_externa_item vi
         JOIN integracao.venda_externa ve ON ve.dwpdv_sale_id = vi.dwpdv_sale_id AND ve.origem = 'dwpdv'
         JOIN public.terminais t ON t.dwpdv_destino = ve.pdv
         JOIN integracao.beepay_filial f ON f.unidade_id = t.unidade_id AND f.sync_produtos
         JOIN public.produtos p ON p.codigo_barras = vi.codigo_barras
) s
WHERE s.id IS NOT NULL AND integracao.beepay_sync_ligado()
ON CONFLICT DO NOTHING;

-- ── blindagem: RLS deny-all + só service_role
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['produto_beepay_outbox','beepay_config'] LOOP
    EXECUTE format('ALTER TABLE integracao.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON integracao.%I FROM anon, authenticated, PUBLIC', t);
    EXECUTE format('GRANT ALL ON integracao.%I TO service_role', t);
  END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION integracao.papel_requisicao() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION integracao.beepay_sync_ligado() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION integracao.produto_da_loja_beepay(bigint, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION integracao.enfileira_beepay(bigint, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION integracao.enfileira_produto_beepay() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION integracao.enfileira_planograma_beepay() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION integracao.enfileira_venda_produto_beepay() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION integracao.beepay_lease(text, text, int) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION integracao.beepay_lease_solta(text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION integracao.beepay_lease(text, text, int), integracao.beepay_lease_solta(text, text) TO service_role;

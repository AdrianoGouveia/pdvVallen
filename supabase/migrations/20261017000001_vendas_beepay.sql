-- ==========================================================================
-- Vendas Vallen ⇄ Beepay Cloud — pronto e ADORMECIDO até a conta ter credencial/config.
--  (1) Vallen → Beepay: pedido que vira 'aprovado' numa unidade MAPEADA p/ uma filial
--      Beepay entra em integracao.venda_beepay_outbox (trigger em public.pedidos). O
--      worker api/cron/push-vendas-beepay.js drena via API cupom/save; enquanto faltar
--      credencial/forma/terminal a venda fica 'pendente' (com o motivo em `aguardando`).
--  (2) Beepay → Vallen: api/cron/sync-vendas-beepay.js lê cupom/get e grava em
--      integracao.venda_externa com origem='beepay' (importar_vendas_beepay), EXCLUINDO
--      os cupons que nós mandamos (codPedidoParceiro) → a venda do app não conta 2x.
-- Isolado em `integracao` (deletável). Nada aqui emite NFC-e.
-- ==========================================================================

-- ── mapa unidade Vallen ↔ filial Beepay, 1:1. Cada loja é um CNPJ: uma unidade NUNCA
--    pode cair na filial de outra. Só unidade listada (e ativa) integra.
CREATE TABLE IF NOT EXISTS integracao.beepay_filial (
  cod_filial  text PRIMARY KEY,
  unidade_id  integer NOT NULL UNIQUE REFERENCES public.unidades(id) ON DELETE CASCADE,
  ativo       boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE integracao.beepay_filial IS 'Unidade Vallen ↔ filial Beepay (1:1, mesmo CNPJ). ativo=false desliga o enfileiramento de vendas dessa unidade.';

-- Porto Príncipe (unidade 1) = filial 40967 "BYP Totem - Vallen Market" (CNPJ 11.408.982/0001-71).
-- Guarda pelo nome: se a unidade 1 não for Porto Príncipe neste banco, NÃO mapeia nada.
-- Nasce DESLIGADO (ativo=false): nada enfileira nem importa até o go-live, que é UM comando
-- (depois de client_secret + formas + terminal configurados e validados):
--   UPDATE integracao.beepay_filial SET ativo = true WHERE cod_filial = '40967';
-- Vendas aprovadas ANTES do go-live não vão p/ o Beepay (evita backlog baixando estoque).
INSERT INTO integracao.beepay_filial (cod_filial, unidade_id, ativo)
SELECT '40967', 1, false WHERE EXISTS (SELECT 1 FROM public.unidades WHERE id = 1 AND nome ILIKE '%pr_ncipe%')
ON CONFLICT DO NOTHING;

-- ── cache EAN ↔ código interno Beepay (o item do cupom usa o código interno)
CREATE TABLE IF NOT EXISTS integracao.beepay_produto (
  codigo_barras text PRIMARY KEY,
  codigo        text NOT NULL,
  codigo_venda  text,
  nome          text,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_beepay_produto_codigo ON integracao.beepay_produto (codigo);

-- ── outbox Vallen → Beepay. FK sem cascade: pedido já enviado não some do rastro.
--    'enviando' = reservado por um worker; se travar, vira 'erro' p/ conferência manual
--    (o cupom pode ter sido gravado) — nunca reenvia sozinho um envio de resultado incerto.
CREATE TABLE IF NOT EXISTS integracao.venda_beepay_outbox (
  pedido_id   bigint PRIMARY KEY REFERENCES public.pedidos(id),
  unidade_id  integer NOT NULL,
  cod_filial  text NOT NULL,
  status      text NOT NULL DEFAULT 'pendente'
              CHECK (status IN ('pendente','enviando','enviado','erro','ignorado')),
  tentativas  int  NOT NULL DEFAULT 0,
  aguardando  text,          -- o que falta configurar (não é erro, não gasta tentativa)
  erro        text,
  cupom       jsonb,         -- payload enviado (auditoria)
  resposta    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  sent_at     timestamptz
);
CREATE INDEX IF NOT EXISTS idx_venda_beepay_outbox_fila
  ON integracao.venda_beepay_outbox (updated_at) WHERE status IN ('pendente','enviando');

-- Enfileira quando o pedido PASSA a 'aprovado' (INSERT já aprovado também conta: o
-- default de pedidos.status é 'aprovado' — o worker dá uma CARÊNCIA e reconfere o status
-- antes de enviar). Reaprovar não duplica; só volta p/ a fila o que tinha sido 'ignorado'.
CREATE OR REPLACE FUNCTION integracao.enfileira_venda_beepay()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = integracao, public, pg_temp AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'aprovado' OR NEW.unidade_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM 'aprovado' THEN RETURN NEW; END IF;
  -- RESILIENTE: falha ao enfileirar NUNCA pode reverter a aprovação do pagamento.
  BEGIN
    INSERT INTO integracao.venda_beepay_outbox (pedido_id, unidade_id, cod_filial)
    SELECT NEW.id, NEW.unidade_id, f.cod_filial
      FROM integracao.beepay_filial f
     WHERE f.unidade_id = NEW.unidade_id AND f.ativo
    ON CONFLICT (pedido_id) DO UPDATE
      SET status = 'pendente', erro = NULL, aguardando = NULL, updated_at = now()
      WHERE venda_beepay_outbox.status = 'ignorado';
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'venda_beepay_outbox: falha ao enfileirar pedido %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_pedido_venda_beepay ON public.pedidos;
CREATE TRIGGER trg_pedido_venda_beepay
  AFTER INSERT OR UPDATE OF status ON public.pedidos
  FOR EACH ROW EXECUTE FUNCTION integracao.enfileira_venda_beepay();

-- ── venda_externa passa a ter ORIGEM (dwpdv | beepay) e loja atribuída direto.
--    Default 'dwpdv' → o import do DWPDV (importar_vendas) segue igual.
ALTER TABLE integracao.venda_externa ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'dwpdv';
ALTER TABLE integracao.venda_externa ADD COLUMN IF NOT EXISTS unidade_id integer REFERENCES public.unidades(id) ON DELETE SET NULL;
DO $$ BEGIN
  ALTER TABLE integracao.venda_externa ADD CONSTRAINT venda_externa_origem_chk CHECK (origem IN ('dwpdv','beepay'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_venda_externa_origem_data ON integracao.venda_externa (origem, data);

-- Import Beepay TRANSACIONAL (header upsert + replace de itens). Chave = 'beepay:<codcupom>'
-- (prefixo impede colidir/sobrescrever venda DWPDV). Loja vem do mapa de filial (não do
-- payload). Cupom cancelado/estornado é REMOVIDO (o relatório soma tudo o que existe).
-- p = [{venda_id, cod_filial, codigovenda, pdv, data, total, recebido, canal,
--       forma_pagamento, status, cancelado, itens:[{codigo_barras,descricao,quantidade,preco,pdv}]}]
CREATE OR REPLACE FUNCTION integracao.importar_vendas_beepay(p jsonb)
RETURNS integer LANGUAGE plpgsql SET search_path = integracao, public AS $$
DECLARE v jsonb; k text; n int := 0;
BEGIN
  FOR v IN SELECT value FROM jsonb_array_elements(p) LOOP
    k := v->>'venda_id';
    IF k IS NULL OR k NOT LIKE 'beepay:%' THEN
      RAISE EXCEPTION 'importar_vendas_beepay: chave inválida %', k;
    END IF;
    IF COALESCE((v->>'cancelado')::boolean, false) THEN
      DELETE FROM integracao.venda_externa WHERE dwpdv_sale_id = k AND origem = 'beepay'; -- itens em cascata
      n := n + 1;
      CONTINUE;
    END IF;
    INSERT INTO integracao.venda_externa
      (dwpdv_sale_id, origem, unidade_id, codigovenda, pdv, data, total, recebido, canal, forma_pagamento, status)
    VALUES
      (k, 'beepay', (SELECT f.unidade_id FROM integracao.beepay_filial f WHERE f.cod_filial = v->>'cod_filial'),
       v->>'codigovenda', v->>'pdv', (v->>'data')::timestamptz, (v->>'total')::numeric,
       (v->>'recebido')::numeric, v->>'canal', v->'forma_pagamento', (v->>'status')::int)
    ON CONFLICT (dwpdv_sale_id) DO UPDATE SET
      unidade_id=EXCLUDED.unidade_id, codigovenda=EXCLUDED.codigovenda, pdv=EXCLUDED.pdv,
      data=EXCLUDED.data, total=EXCLUDED.total, recebido=EXCLUDED.recebido, canal=EXCLUDED.canal,
      forma_pagamento=EXCLUDED.forma_pagamento, status=EXCLUDED.status, importado_em=now()
      WHERE venda_externa.origem = 'beepay';
    DELETE FROM integracao.venda_externa_item WHERE dwpdv_sale_id = k;
    INSERT INTO integracao.venda_externa_item (dwpdv_sale_id, codigo_barras, descricao, quantidade, preco, pdv)
    SELECT k, it->>'codigo_barras', it->>'descricao', (it->>'quantidade')::numeric, (it->>'preco')::numeric, it->>'pdv'
      FROM jsonb_array_elements(COALESCE(v->'itens','[]'::jsonb)) it;
    n := n + 1;
  END LOOP;
  RETURN n;
END; $$;

-- ── view consolidada: mesmas colunas; `fonte` agora é a origem real da venda externa e
--    do Vallen só entra pedido APROVADO (aguardando/recusado não é venda)
CREATE OR REPLACE VIEW integracao.v_vendas_consolidado
  WITH (security_invoker = true) AS
  SELECT 'vallen'::text AS fonte, p.id::text AS referencia, p.created_at AS data, p.total AS total, NULL::text AS canal, NULL::text AS pdv
    FROM public.pedidos p
   WHERE p.status = 'aprovado'
  UNION ALL
  SELECT ve.origem, ve.dwpdv_sale_id, ve.data, ve.total, ve.canal, ve.pdv
    FROM integracao.venda_externa ve;

-- ── relatório por loja (public.relatorio_vendas_loja): NÃO é recriado aqui. A fonte única é
--    20261021000000_relatorio_vendas_loja_fix.sql, que já lê `origem`/`unidade_id` desta
--    migration (Beepay pela filial, DWPDV pela maquininha) e vale em qualquer ordem de aplicação.

-- ── blindagem (igual ao resto de integracao): RLS deny-all + só service_role
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['beepay_filial','beepay_produto','venda_beepay_outbox'] LOOP
    EXECUTE format('ALTER TABLE integracao.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON integracao.%I FROM anon, authenticated, PUBLIC', t);
    EXECUTE format('GRANT ALL ON integracao.%I TO service_role', t);
  END LOOP;
END $$;
REVOKE ALL    ON integracao.v_vendas_consolidado FROM anon, authenticated, PUBLIC;
GRANT  SELECT ON integracao.v_vendas_consolidado TO service_role;
REVOKE EXECUTE ON FUNCTION integracao.enfileira_venda_beepay() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION integracao.importar_vendas_beepay(jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION integracao.importar_vendas_beepay(jsonb) TO service_role;

-- ==========================================================================
-- Push p/ o Beepay sem depender de planograma (decisão do Adriano 2026-10-22: "não
-- quero que trave por planograma" — a loja não usa planograma; o preço é produtos.preco,
-- e com 20261022000000 o /operador ajusta preço de qualquer produto da franquia).
-- Regra para o que vem do APP (PostgREST anon/authenticated, inclusive via RPC):
--  • CADASTRO novo (INSERT) → sobe sempre.
--  • ALTERAÇÃO → sobe se: o produto já está no Beepay (cache beepay_produto ou fila
--    'enviado'), OU é da loja (catálogo ativo / planograma ativo / vendido na loja), OU
--    veio do /operador de uma unidade mapeada (preço via _op_aplicar_preco — marca a
--    unidade da requisição em integracao.unidade_req).
--    Revisão adversarial: sem esse filtro, a importação de planilha do armazém e edições
--    em massa no /admin criariam no Beepay produtos que a loja não vende.
-- Script/serviço: igual antes (só produto da loja; preço-só por script não sobe).
-- ==========================================================================

-- unidade da requisição atual é uma loja mapeada (com produtos ligados)?
CREATE OR REPLACE FUNCTION integracao.unidade_req_mapeada()
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = integracao, pg_temp AS $$
DECLARE u text := NULLIF(current_setting('integracao.unidade_req', true), '');
BEGIN
  RETURN u IS NOT NULL AND EXISTS (SELECT 1 FROM integracao.beepay_filial f WHERE f.unidade_id = u::bigint AND f.sync_produtos);
EXCEPTION WHEN OTHERS THEN RETURN false;
END; $$;

-- produto já existe no Beepay (enviado por este worker ou resolvido pelo cache de códigos)?
CREATE OR REPLACE FUNCTION integracao.produto_no_beepay(p_id bigint, p_ean text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = integracao, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM integracao.beepay_produto b WHERE b.codigo_barras = p_ean)
      OR EXISTS (SELECT 1 FROM integracao.produto_beepay_outbox o WHERE o.produto_id = p_id AND o.status = 'enviado')
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
      IF app THEN
        IF TG_OP = 'INSERT'
           OR integracao.unidade_req_mapeada()
           OR integracao.produto_no_beepay(NEW.id, NEW.codigo_barras)
           OR integracao.produto_da_loja_beepay(NEW.id, NEW.catalogo_ativo) THEN
          PERFORM integracao.enfileira_beepay(NEW.id, 'app');
        END IF;
      ELSE
        -- script mudando SÓ o preço (sync do DWPDV) não manda no Beepay
        IF TG_OP = 'UPDATE'
           AND NEW.nome IS NOT DISTINCT FROM OLD.nome AND NEW.categoria IS NOT DISTINCT FROM OLD.categoria
           AND NEW.restrito_idade IS NOT DISTINCT FROM OLD.restrito_idade AND NEW.imagem_url IS NOT DISTINCT FROM OLD.imagem_url
           AND NEW.codigo_barras IS NOT DISTINCT FROM OLD.codigo_barras AND NEW.catalogo_ativo IS NOT DISTINCT FROM OLD.catalogo_ativo THEN
          RETURN NEW;
        END IF;
        IF integracao.produto_da_loja_beepay(NEW.id, NEW.catalogo_ativo) THEN
          PERFORM integracao.enfileira_beepay(NEW.id, 'script');
        END IF;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'produto_beepay_outbox: falha ao enfileirar produto %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END; $$;

-- _op_aplicar_preco (20260730000007): mesmo comportamento + marca a unidade da
-- requisição (local à transação) p/ o trigger saber que veio do /operador dessa loja.
CREATE OR REPLACE FUNCTION public._op_aplicar_preco(p_unidade_id BIGINT, p_produto_id BIGINT, p_preco NUMERIC)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM set_config('integracao.unidade_req', COALESCE(p_unidade_id::text, ''), true);
  UPDATE planograma SET preco_venda = p_preco
   WHERE unidade_id = p_unidade_id AND produto_id = p_produto_id;
  -- Espelha no catálogo (o push p/ o Beepay carrega o preço de venda).
  UPDATE produtos SET preco = p_preco WHERE id = p_produto_id;
  -- limpa a marca: outra alteração na mesma transação não herda a "loja do operador"
  PERFORM set_config('integracao.unidade_req', '', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION integracao.enfileira_produto_beepay() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION integracao.unidade_req_mapeada() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION integracao.produto_no_beepay(bigint, text) FROM PUBLIC, anon, authenticated;

-- recarrega o cache do PostgREST (funções/assinaturas novas) ao fim da transação
NOTIFY pgrst, 'reload schema';

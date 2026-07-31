-- ============================================================
-- Outbox DWPDV: observar preco_custo — mudar só o custo re-enfileira
-- ------------------------------------------------------------
-- O trigger não observava preco_custo, então atualizar apenas o custo de um
-- produto NÃO gerava push pro DWPDV. Agora observa preco_custo também.
-- ============================================================

CREATE OR REPLACE FUNCTION integracao.enfileira_produto_push()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = integracao, public AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.nome           IS NOT DISTINCT FROM OLD.nome
     AND NEW.preco          IS NOT DISTINCT FROM OLD.preco
     AND NEW.preco_custo    IS NOT DISTINCT FROM OLD.preco_custo
     AND NEW.categoria      IS NOT DISTINCT FROM OLD.categoria
     AND NEW.catalogo_ativo IS NOT DISTINCT FROM OLD.catalogo_ativo
     AND NEW.restrito_idade IS NOT DISTINCT FROM OLD.restrito_idade THEN
    RETURN NEW; -- nada relevante mudou → não enfileira
  END IF;
  BEGIN
    INSERT INTO integracao.produto_outbox (produto_id, status, updated_at)
    VALUES (NEW.id, 'pendente', now())
    ON CONFLICT (produto_id) DO UPDATE SET status = 'pendente', updated_at = now(), erro = NULL;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'produto_outbox: falha ao enfileirar produto %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END; $$;

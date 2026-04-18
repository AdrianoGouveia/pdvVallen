-- ============================================================
-- Complementa seed demo da migration anterior.
-- A maioria dos códigos de barras reais colidiu com produtos
-- legados do webapp (inseridos via admin). Aqui uso códigos
-- claramente de demo para garantir 6 produtos no franqueado demo.
-- ============================================================

DO $$
DECLARE
  v_franq_id   BIGINT;
  v_unidade_id BIGINT;
BEGIN
  SELECT id INTO v_franq_id FROM franqueados WHERE documento='00.000.000/0001-00';
  SELECT id INTO v_unidade_id FROM unidades WHERE franqueado_id=v_franq_id AND codigo='VALLEN-MATRIZ';

  IF v_franq_id IS NULL OR v_unidade_id IS NULL THEN
    RAISE NOTICE 'Franqueado ou unidade demo ausentes — pulando seed extra.';
    RETURN;
  END IF;

  INSERT INTO produtos (nome, codigo_barras, estoque_cnpj, categoria, emoji, franqueado_id, restrito_idade) VALUES
    ('Coca-Cola 350ml',    'VALLEN-DEMO-001', 100, 'REFRIGERANTES', '🥤', v_franq_id, false),
    ('Guaraná Antarctica', 'VALLEN-DEMO-002',  80, 'REFRIGERANTES', '🥤', v_franq_id, false),
    ('Heineken Long Neck', 'VALLEN-DEMO-003',  40, 'CERVEJAS',      '🍺', v_franq_id, true ),
    ('Doritos Nacho',      'VALLEN-DEMO-004',  50, 'SNACKS',        '🌮', v_franq_id, false),
    ('Água Crystal 500ml', 'VALLEN-DEMO-005', 120, 'ÁGUA',          '💧', v_franq_id, false)
  ON CONFLICT (codigo_barras) DO NOTHING;

  INSERT INTO planograma (unidade_id, produto_id, preco_venda, quantidade, controla_estoque)
  SELECT v_unidade_id, p.id,
         CASE p.codigo_barras
           WHEN 'VALLEN-DEMO-001' THEN  6.00
           WHEN 'VALLEN-DEMO-002' THEN  6.50
           WHEN 'VALLEN-DEMO-003' THEN 10.00
           WHEN 'VALLEN-DEMO-004' THEN  9.90
           WHEN 'VALLEN-DEMO-005' THEN  4.00
         END,
         CASE p.codigo_barras
           WHEN 'VALLEN-DEMO-001' THEN 30
           WHEN 'VALLEN-DEMO-002' THEN 20
           WHEN 'VALLEN-DEMO-003' THEN 10
           WHEN 'VALLEN-DEMO-004' THEN 20
           WHEN 'VALLEN-DEMO-005' THEN 40
         END,
         TRUE
  FROM produtos p
  WHERE p.franqueado_id = v_franq_id
    AND p.codigo_barras LIKE 'VALLEN-DEMO-%'
  ON CONFLICT (unidade_id, produto_id) DO NOTHING;
END $$;

-- View para listar categorias distintas sem varrer toda a tabela
CREATE OR REPLACE VIEW categorias_disponiveis AS
SELECT DISTINCT categoria
FROM produtos
WHERE categoria IS NOT NULL AND categoria <> ''
ORDER BY categoria;

-- ============================================================
-- Franquias (franqueados): super vê e gerencia TODAS; membro vê a(s) sua(s)
-- ------------------------------------------------------------
-- Fecha a lacuna: a policy antiga só deixava ver franquias com vínculo, então
-- nem o super via as demais. Agora eh_super_admin() enxerga tudo e escreve
-- (criar/editar franquia = franqueados.gerenciar, que só o super tem).
-- ============================================================

DROP POLICY IF EXISTS "franq_self_read" ON franqueados;

CREATE POLICY franq_read ON franqueados FOR SELECT USING (
  eh_super_admin()
  OR id IN (SELECT franqueado_id FROM usuarios_franqueados WHERE user_id = auth.uid() AND ativo = TRUE)
);

CREATE POLICY franq_write ON franqueados FOR ALL TO authenticated
  USING      (tem_permissao_global('franqueados.gerenciar'))
  WITH CHECK (tem_permissao_global('franqueados.gerenciar'));

NOTIFY pgrst, 'reload schema';

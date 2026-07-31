-- ============================================================
-- Franquia: âncora do dono (responsável) — provisionamento com dono obrigatório
-- ------------------------------------------------------------
-- responsavel_user_id = quem é o dono de fato da franquia (contato/cobrança/LGPD).
-- Setado no provisionamento atômico (endpoint api/admin/franquias). Nullable p/
-- não quebrar franquias legadas (badge "sem dono" cobre esses casos).
-- Sem FK a auth.users (é do supabase_auth_admin, como nas outras tabelas).
-- ============================================================

ALTER TABLE franqueados ADD COLUMN IF NOT EXISTS responsavel_user_id UUID;
COMMENT ON COLUMN franqueados.responsavel_user_id IS 'Dono/responsável (auth.uid); setado no provisionamento; sem FK';

NOTIFY pgrst, 'reload schema';

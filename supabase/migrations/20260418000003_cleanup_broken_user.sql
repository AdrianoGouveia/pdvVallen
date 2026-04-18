-- Remove user teste@vallen.com criado via INSERT direto em auth.users
-- (faltavam campos internos que o GoTrue precisa → "Database error querying schema").
-- Após esta migration: criar o user via Supabase Studio → Authentication → Add user,
-- depois rodar: SELECT seed_vincular_usuario('teste@vallen.com');

DELETE FROM auth.identities WHERE user_id IN (
  SELECT id FROM auth.users WHERE email = 'teste@vallen.com'
);
DELETE FROM auth.users WHERE email = 'teste@vallen.com';

-- Remove também o teste2 criado em diagnóstico se existir
DELETE FROM auth.identities WHERE user_id IN (
  SELECT id FROM auth.users WHERE email = 'teste2@vallen.com'
);
DELETE FROM auth.users WHERE email = 'teste2@vallen.com';

-- Remove vínculos órfãos na usuarios_franqueados
DELETE FROM usuarios_franqueados
 WHERE user_id NOT IN (SELECT id FROM auth.users);

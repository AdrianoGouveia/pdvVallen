import { createClient } from '@supabase/supabase-js'

// Provisionamento ATÔMICO de franquia (só Admin Vallen / franqueados.gerenciar):
// cria franquia + dono (auth user + vínculo role='franqueado' + responsavel_user_id)
// + 1ª loja opcional. Saga com rollback: desfaz o que criou se algo falhar (nunca
// deixa franquia órfã nem auth.users órfão).

const URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const ANON = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })
  if (!URL || !SERVICE || !ANON) return res.status(500).json({ error: 'faltam env (URL/ANON/SERVICE)' })

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'sem token' })

  const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })
  const asUser = createClient(URL, ANON, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } })

  // Só quem tem franqueados.gerenciar (super) cria franquia
  const { data: pode, error: aErr } = await asUser.rpc('tem_permissao_global', { p_permissao: 'franqueados.gerenciar' })
  if (aErr) return res.status(401).json({ error: 'sessão inválida ou expirada — saia e entre de novo' })
  if (pode !== true) return res.status(403).json({ error: 'só o Admin Vallen cria franquias' })

  let atorId = null
  try { atorId = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).sub } catch { /* */ }

  const body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}')
  const { action, franquia, dono, loja } = body
  if (action !== 'criar') return res.status(400).json({ error: 'ação inválida' })
  if (!franquia?.razao_social?.trim() || !franquia?.documento?.trim())
    return res.status(400).json({ error: 'razão social e documento da franquia são obrigatórios' })
  if (!dono?.email?.trim() || !dono?.senha || dono.senha.length < 6)
    return res.status(400).json({ error: 'e-mail do dono e senha (mín. 6) são obrigatórios' })

  // ---- Saga com rollback (ordem reversa no erro)
  let franqId = null, userId = null, lojaId = null
  try {
    // 1. Franquia
    const { data: f, error: e1 } = await svc.from('franqueados').insert({
      razao_social: franquia.razao_social.trim(),
      nome_fantasia: franquia.nome_fantasia?.trim() || null,
      tipo_doc: franquia.tipo_doc === 'CPF' ? 'CPF' : 'CNPJ',
      documento: franquia.documento.trim(),
      ativo: true,
    }).select('id').single()
    if (e1) throw new Error(e1.message.includes('duplicate') ? 'Já existe franquia com esse documento' : e1.message)
    franqId = f.id

    // 2. Dono (auth user)
    const { data: created, error: e2 } = await svc.auth.admin.createUser({
      email: dono.email.trim(), password: dono.senha, email_confirm: true,
    })
    if (e2) throw new Error(e2.message.includes('already') ? 'e-mail do dono já cadastrado' : e2.message)
    userId = created.user.id

    // 3. Vínculo franqueado
    const { error: e3 } = await svc.from('usuarios_franqueados')
      .insert({ user_id: userId, franqueado_id: franqId, role: 'franqueado', ativo: true })
    if (e3) throw new Error(e3.message)

    // 4. Âncora do dono
    const { error: e4 } = await svc.from('franqueados').update({ responsavel_user_id: userId }).eq('id', franqId)
    if (e4) throw new Error(e4.message)

    // 5. 1ª loja (opcional)
    if (loja?.nome?.trim()) {
      const { data: u, error: e5 } = await svc.from('unidades').insert({
        nome: loja.nome.trim(),
        codigo: loja.codigo?.trim() || `LOJA-${franqId}`,
        franqueado_id: franqId, ativo: true,
      }).select('id').single()
      if (e5) throw new Error(e5.message)
      lojaId = u.id
    }

    // Auditoria (best-effort)
    try {
      await svc.from('log_auditoria').insert({
        ator: atorId, franqueado_id: franqId, acao: 'franquia.criada',
        alvo: dono.email.trim(),
        detalhe: { razao_social: franquia.razao_social, com_loja: !!lojaId },
      })
    } catch { /* */ }

    return res.json({ ok: true, franqueado_id: franqId, user_id: userId, unidade_id: lojaId })
  } catch (err) {
    // Apaga a franquia primeiro: o ON DELETE CASCADE remove loja + vínculo (e o
    // trigger "protege último dono" pula quando a franquia está sendo excluída).
    try { if (franqId) await svc.from('franqueados').delete().eq('id', franqId) } catch { /* */ }
    try { if (userId) await svc.auth.admin.deleteUser(userId) } catch { /* */ }
    return res.status(400).json({ error: String(err?.message || err).slice(0, 300) })
  }
}

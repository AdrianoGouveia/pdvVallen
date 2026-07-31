import { createClient } from '@supabase/supabase-js'

// Gestão de usuários (Fase 2). Usa service_role, mas SEMPRE valida a permissão
// do solicitante (usuarios.gerenciar no franqueado) antes de qualquer operação.
// Regras de alçada de criação:
//   super      → franqueado | gerente | repositor
//   franqueado → gerente | repositor
//   gerente    → repositor
// Ações (POST { action, ... }): list | create | update | reset_senha | set_override

const URL = process.env.SUPABASE_URL
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY

const CRIAVEIS = {
  super:      ['franqueado', 'gerente', 'repositor'],
  franqueado: ['gerente', 'repositor'],
  gerente:    ['repositor'],
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })
  if (!URL || !SERVICE) return res.status(500).json({ error: 'faltam SUPABASE_URL / SERVICE_ROLE_KEY' })

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return res.status(401).json({ error: 'sem token' })

  const svc = createClient(URL, SERVICE, { auth: { persistSession: false } })

  // 1. Autentica o solicitante
  const { data: userData, error: uErr } = await svc.auth.getUser(token)
  const caller = userData?.user
  if (uErr || !caller) return res.status(401).json({ error: 'token inválido' })

  const body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}')
  const { action, franqueado_id } = body
  if (!franqueado_id) return res.status(400).json({ error: 'franqueado_id obrigatório' })

  // 2. Autoriza: super, ou papel com usuarios.gerenciar nesse franqueado
  const authz = await autoridade(svc, caller.id, franqueado_id)
  authz.uid = caller.id
  if (!authz.podeGerenciar) return res.status(403).json({ error: 'sem permissão para gerenciar usuários' })

  try {
    let result
    switch (action) {
      case 'list':        return res.json(await listar(svc, franqueado_id))
      case 'create':      result = await criar(svc, authz, franqueado_id, body); break
      case 'update':      result = await atualizar(svc, authz, franqueado_id, body); break
      case 'reset_senha': result = await resetSenha(svc, authz, franqueado_id, body); break
      case 'set_override':result = await setOverride(svc, authz, franqueado_id, body); break
      default: return res.status(400).json({ error: 'ação inválida' })
    }
    // Auditoria (nunca grava a senha)
    await svc.from('log_auditoria').insert({
      ator: caller.id, franqueado_id, acao: 'usuario.' + action,
      alvo: body.email || (body.user_id ?? body.uf_id ?? null)?.toString() || null,
      detalhe: { role: body.role, ativo: body.ativo, unidade_ids: body.unidade_ids, permissao: body.permissao, concedida: body.concedida },
    })
    return res.json(result)
  } catch (e) {
    return res.status(400).json({ error: String(e?.message || e).slice(0, 300) })
  }
}

// Autoridade do solicitante no franqueado (override-first, igual a tem_permissao)
async function autoridade(svc, uid, franqueadoId) {
  const { data: sa } = await svc.from('super_admins').select('user_id').eq('user_id', uid).maybeSingle()
  if (sa) return { isSuper: true, papel: 'super', podeGerenciar: true }
  const { data: uf } = await svc.from('usuarios_franqueados')
    .select('role, ativo').eq('user_id', uid).eq('franqueado_id', franqueadoId).maybeSingle()
  if (!uf || !uf.ativo) return { podeGerenciar: false }
  return { isSuper: false, papel: uf.role, podeGerenciar: await temPermissao(svc, uid, franqueadoId, uf.role, 'usuarios.gerenciar') }
}

// Espelha a lógica de tem_permissao(): override (concede/revoga) vence o papel.
async function temPermissao(svc, uid, franqueadoId, role, permissao) {
  const { data: ovr } = await svc.from('usuario_permissao')
    .select('concedida').eq('user_id', uid).eq('franqueado_id', franqueadoId).eq('permissao', permissao).maybeSingle()
  if (ovr) return ovr.concedida === true
  const { data: pp } = await svc.from('papel_permissao')
    .select('permissao').eq('role', role).eq('permissao', permissao).maybeSingle()
  return !!pp
}

function alvoPermitido(authz, role) {
  const permitidos = CRIAVEIS[authz.isSuper ? 'super' : authz.papel] || []
  return permitidos.includes(role)
}

async function listar(svc, franqueadoId) {
  const { data: vinc } = await svc.from('usuarios_franqueados')
    .select('id, user_id, role, ativo').eq('franqueado_id', franqueadoId)
  const ufIds = (vinc || []).map(v => v.id)
  const { data: uu } = await svc.from('usuario_unidades')
    .select('usuario_franqueado_id, unidade_id').in('usuario_franqueado_id', ufIds.length ? ufIds : [-1])
  const porUF = new Map()
  for (const r of uu || []) {
    if (!porUF.has(r.usuario_franqueado_id)) porUF.set(r.usuario_franqueado_id, [])
    porUF.get(r.usuario_franqueado_id).push(r.unidade_id)
  }
  const { data: ovr } = await svc.from('usuario_permissao')
    .select('user_id, permissao, concedida').eq('franqueado_id', franqueadoId)
  const porUser = new Map()
  for (const o of ovr || []) {
    if (!porUser.has(o.user_id)) porUser.set(o.user_id, {})
    porUser.get(o.user_id)[o.permissao] = o.concedida
  }
  // emails via admin API
  const { data: list } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const email = new Map((list?.users || []).map(u => [u.id, u.email]))
  const usuarios = (vinc || []).map(v => ({
    uf_id: v.id, user_id: v.user_id, email: email.get(v.user_id) || '—',
    role: v.role, ativo: v.ativo, unidade_ids: porUF.get(v.id) || [],
    overrides: porUser.get(v.user_id) || {},
  }))
  return { usuarios }
}

async function criar(svc, authz, franqueadoId, body) {
  const { email, senha, role, unidade_ids } = body
  if (!email || !senha) throw new Error('email e senha obrigatórios')
  if (senha.length < 6) throw new Error('senha muito curta (mín. 6)')
  if (!alvoPermitido(authz, role)) throw new Error(`seu perfil não pode criar ${role}`)

  const { data: created, error } = await svc.auth.admin.createUser({
    email, password: senha, email_confirm: true,
  })
  if (error) throw new Error(error.message.includes('already') ? 'e-mail já cadastrado' : error.message)
  const userId = created.user.id

  const { data: uf, error: e2 } = await svc.from('usuarios_franqueados')
    .insert({ user_id: userId, franqueado_id: franqueadoId, role, ativo: true })
    .select('id').single()
  if (e2) throw new Error(e2.message)

  if (role === 'repositor' && Array.isArray(unidade_ids) && unidade_ids.length) {
    await svc.from('usuario_unidades').insert(
      unidade_ids.map(id => ({ usuario_franqueado_id: uf.id, unidade_id: id })))
  }
  return { ok: true, user_id: userId }
}

async function atualizar(svc, authz, franqueadoId, body) {
  const { uf_id, role, ativo, unidade_ids } = body
  const { data: alvo } = await svc.from('usuarios_franqueados')
    .select('id, role, franqueado_id').eq('id', uf_id).single()
  if (!alvo || alvo.franqueado_id !== franqueadoId) throw new Error('vínculo inválido')
  // gerente só mexe em repositor
  if (!alvoPermitido(authz, alvo.role)) throw new Error('sem alçada sobre este usuário')

  const patch = {}
  if (role !== undefined) {
    if (!alvoPermitido(authz, role)) throw new Error(`não pode atribuir ${role}`)
    patch.role = role
  }
  if (ativo !== undefined) patch.ativo = ativo
  if (Object.keys(patch).length) {
    const { error } = await svc.from('usuarios_franqueados').update(patch).eq('id', uf_id)
    if (error) throw new Error(error.message)
  }
  if (Array.isArray(unidade_ids)) {
    await svc.from('usuario_unidades').delete().eq('usuario_franqueado_id', uf_id)
    if (unidade_ids.length) {
      await svc.from('usuario_unidades').insert(unidade_ids.map(id => ({ usuario_franqueado_id: uf_id, unidade_id: id })))
    }
  }
  return { ok: true }
}

async function resetSenha(svc, authz, franqueadoId, body) {
  const { user_id, senha } = body
  if (!senha || senha.length < 6) throw new Error('senha muito curta (mín. 6)')
  const { data: alvo } = await svc.from('usuarios_franqueados')
    .select('role, franqueado_id').eq('user_id', user_id).eq('franqueado_id', franqueadoId).maybeSingle()
  if (!alvo) throw new Error('usuário não pertence a este franqueado')
  if (!alvoPermitido(authz, alvo.role)) throw new Error('sem alçada sobre este usuário')
  const { error } = await svc.auth.admin.updateUserById(user_id, { password: senha })
  if (error) throw new Error(error.message)
  return { ok: true }
}

// Overrides que a gestão pode conceder (nunca preco.aprovar/estoque.validar — isso
// abriria escalonamento repositor→gerente). Só a alçada de preço individual.
const OVERRIDES_PERMITIDOS = ['preco.ajustar']

async function setOverride(svc, authz, franqueadoId, body) {
  const { user_id, permissao, concedida } = body
  if (!OVERRIDES_PERMITIDOS.includes(permissao)) throw new Error('permissão não pode ser concedida por override')
  // alvo pertence ao franqueado + solicitante tem alçada sobre o papel dele
  const { data: alvo } = await svc.from('usuarios_franqueados')
    .select('role').eq('user_id', user_id).eq('franqueado_id', franqueadoId).maybeSingle()
  if (!alvo) throw new Error('usuário não pertence a este franqueado')
  if (!alvoPermitido(authz, alvo.role)) throw new Error('sem alçada sobre este usuário')
  // não pode conceder acima da própria alçada: solicitante precisa ter a permissão
  if (!authz.isSuper && !(await temPermissao(svc, authz.uid, franqueadoId, authz.papel, permissao))) {
    throw new Error('você não tem essa permissão para conceder')
  }
  if (concedida === null) {
    await svc.from('usuario_permissao').delete()
      .eq('user_id', user_id).eq('franqueado_id', franqueadoId).eq('permissao', permissao)
  } else {
    await svc.from('usuario_permissao').upsert(
      { user_id, franqueado_id: franqueadoId, permissao, concedida },
      { onConflict: 'user_id,franqueado_id,permissao' })
  }
  return { ok: true }
}

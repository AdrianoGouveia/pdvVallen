import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useFranqueado } from '../lib/franqueadoContext.jsx'

const PAPEL_LABEL = { franqueado: 'Franqueado', gerente: 'Gerente', repositor: 'Repositor' }
const CRIAVEIS = { admin_vallen: ['franqueado', 'gerente', 'repositor'], franqueado: ['gerente', 'repositor'], gerente: ['repositor'] }

async function api(action, franqueadoId, extra = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch('/api/admin/usuarios', {
    method: 'POST',
    headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, franqueado_id: franqueadoId, ...extra }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || 'Falha na operação')
  return json
}

export function Usuarios() {
  const { franqueadoId, unidades, papel, isSuperAdmin } = useFranqueado()
  const papelAtual = isSuperAdmin ? 'admin_vallen' : papel
  const criaveis = CRIAVEIS[papelAtual] || []

  const [lista, setLista] = useState(null)
  const [erro, setErro]   = useState('')
  const [criando, setCriando] = useState(false)

  function carregar() {
    setErro('')
    api('list', franqueadoId).then(r => setLista(r.usuarios)).catch(e => { setErro(e.message); setLista([]) })
  }
  useEffect(() => { if (franqueadoId) carregar() }, [franqueadoId])

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-vallen-white">Usuários</h1>
          <p className="text-vallen-muted text-sm">Papéis, lojas e permissões deste franqueado.</p>
        </div>
        {criaveis.length > 0 && (
          <button onClick={() => setCriando(true)}
            className="px-4 py-2.5 bg-vallen-green text-white font-bold rounded-lg text-sm">+ Novo usuário</button>
        )}
      </div>

      {erro && <p className="text-red-400 text-sm mb-4">{erro}</p>}

      {criando && (
        <NovoUsuario franqueadoId={franqueadoId} criaveis={criaveis} unidades={unidades}
          onClose={() => setCriando(false)} onCriado={() => { setCriando(false); carregar() }} />
      )}

      {lista === null ? (
        <p className="text-vallen-muted">Carregando…</p>
      ) : lista.length === 0 ? (
        <p className="text-vallen-muted">Nenhum usuário ainda.</p>
      ) : (
        <div className="space-y-2">
          {lista.map(u => (
            <UsuarioRow key={u.uf_id} u={u} franqueadoId={franqueadoId} unidades={unidades}
              criaveis={criaveis} onChange={carregar} />
          ))}
        </div>
      )}
    </div>
  )
}

function NovoUsuario({ franqueadoId, criaveis, unidades, onClose, onCriado }) {
  const [form, setForm] = useState({ email: '', senha: '', role: criaveis[0] || 'repositor', unidade_ids: [] })
  const [busy, setBusy] = useState(false)
  const [err, setErr]   = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const toggleLoja = id => setForm(f => ({ ...f, unidade_ids: f.unidade_ids.includes(id) ? f.unidade_ids.filter(x => x !== id) : [...f.unidade_ids, id] }))

  async function salvar() {
    setErr(''); setBusy(true)
    try {
      await api('create', franqueadoId, { email: form.email.trim(), senha: form.senha, role: form.role, unidade_ids: form.unidade_ids })
      onCriado()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="bg-vallen-card border border-vallen-border rounded-xl p-5 mb-5 space-y-3">
      <h3 className="text-vallen-white font-bold">Novo usuário</h3>
      <div className="grid grid-cols-2 gap-3">
        <input value={form.email} onChange={e => set('email', e.target.value)} placeholder="E-mail" type="email"
          className="bg-vallen-dark border border-vallen-border rounded-lg px-3 py-2.5 text-vallen-white text-sm" />
        <input value={form.senha} onChange={e => set('senha', e.target.value)} placeholder="Senha (mín. 6)" type="text"
          className="bg-vallen-dark border border-vallen-border rounded-lg px-3 py-2.5 text-vallen-white text-sm" />
      </div>
      <div>
        <label className="text-vallen-muted text-xs">Papel</label>
        <select value={form.role} onChange={e => set('role', e.target.value)}
          className="mt-1 w-full bg-vallen-dark border border-vallen-border rounded-lg px-3 py-2.5 text-vallen-white text-sm">
          {criaveis.map(r => <option key={r} value={r}>{PAPEL_LABEL[r]}</option>)}
        </select>
      </div>
      {form.role === 'repositor' && (
        <div>
          <label className="text-vallen-muted text-xs">Lojas autorizadas</label>
          <div className="mt-1 flex flex-wrap gap-2">
            {unidades.map(u => (
              <button key={u.id} type="button" onClick={() => toggleLoja(u.id)}
                className={`px-3 py-1.5 rounded-lg border text-sm ${form.unidade_ids.includes(u.id) ? 'bg-vallen-green border-vallen-green text-white' : 'bg-vallen-dark border-vallen-border text-vallen-muted'}`}>
                {u.nome}
              </button>
            ))}
          </div>
        </div>
      )}
      {err && <p className="text-red-400 text-sm">{err}</p>}
      <div className="flex gap-2 justify-end">
        <button onClick={onClose} className="px-4 py-2 text-vallen-muted text-sm">Cancelar</button>
        <button onClick={salvar} disabled={busy || !form.email || form.senha.length < 6}
          className="px-4 py-2 bg-vallen-green text-white font-bold rounded-lg text-sm disabled:opacity-40">
          {busy ? 'Criando…' : 'Criar'}
        </button>
      </div>
    </div>
  )
}

function UsuarioRow({ u, franqueadoId, unidades, criaveis, onChange }) {
  const [aberto, setAberto] = useState(false)
  const [busy, setBusy]     = useState(false)
  const podeMexer = criaveis.includes(u.role)
  const temAlcada = u.overrides?.['preco.ajustar'] === true

  async function acao(fn) {
    setBusy(true)
    try { await fn() ; onChange() } catch (e) { alert(e.message) } finally { setBusy(false) }
  }
  const toggleAtivo = () => acao(() => api('update', franqueadoId, { uf_id: u.uf_id, ativo: !u.ativo }))
  const resetSenha = () => {
    const s = prompt('Nova senha (mín. 6):')
    if (s) acao(() => api('reset_senha', franqueadoId, { user_id: u.user_id, senha: s }))
  }
  const toggleAlcada = () => acao(() => api('set_override', franqueadoId, {
    user_id: u.user_id, permissao: 'preco.ajustar', concedida: temAlcada ? null : true }))
  const setLojas = (ids) => acao(() => api('update', franqueadoId, { uf_id: u.uf_id, unidade_ids: ids }))

  return (
    <div className={`bg-vallen-card border border-vallen-border rounded-xl ${!u.ativo ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <p className="text-vallen-white font-medium truncate">{u.email}</p>
          <p className="text-vallen-muted text-xs">
            {PAPEL_LABEL[u.role] || u.role}
            {u.role === 'repositor' && ` · ${u.unidade_ids.length} loja(s)`}
            {temAlcada && ' · alçada de preço'}
            {!u.ativo && ' · inativo'}
          </p>
        </div>
        {podeMexer && (
          <button onClick={() => setAberto(a => !a)} className="text-vallen-green text-sm font-semibold">
            {aberto ? 'fechar' : 'editar'}
          </button>
        )}
      </div>

      {aberto && podeMexer && (
        <div className="px-4 pb-4 pt-1 border-t border-vallen-border space-y-3">
          {u.role === 'repositor' && (
            <div>
              <label className="text-vallen-muted text-xs">Lojas autorizadas</label>
              <div className="mt-1 flex flex-wrap gap-2">
                {unidades.map(un => {
                  const on = u.unidade_ids.includes(un.id)
                  return (
                    <button key={un.id} disabled={busy}
                      onClick={() => setLojas(on ? u.unidade_ids.filter(x => x !== un.id) : [...u.unidade_ids, un.id])}
                      className={`px-3 py-1.5 rounded-lg border text-sm ${on ? 'bg-vallen-green border-vallen-green text-white' : 'bg-vallen-dark border-vallen-border text-vallen-muted'}`}>
                      {un.nome}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {u.role === 'repositor' && (
              <button onClick={toggleAlcada} disabled={busy}
                className="px-3 py-2 rounded-lg bg-vallen-dark border border-vallen-border text-vallen-white text-sm">
                {temAlcada ? 'Tirar alçada de preço' : 'Dar alçada de preço'}
              </button>
            )}
            <button onClick={resetSenha} disabled={busy}
              className="px-3 py-2 rounded-lg bg-vallen-dark border border-vallen-border text-vallen-white text-sm">Resetar senha</button>
            <button onClick={toggleAtivo} disabled={busy}
              className={`px-3 py-2 rounded-lg border text-sm ${u.ativo ? 'border-red-500/40 text-red-400' : 'border-vallen-green text-vallen-green'} bg-vallen-dark`}>
              {u.ativo ? 'Desativar' : 'Reativar'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

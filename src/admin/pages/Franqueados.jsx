import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useFranqueado } from '../lib/franqueadoContext.jsx'

const vazio = { razao_social: '', nome_fantasia: '', tipo_doc: 'CNPJ', documento: '', ativo: true }

async function apiFranquia(body) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch('/api/admin/franquias', {
    method: 'POST',
    headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || 'Falha ao criar franquia')
  return json
}

// Gestão de franquias (só Admin Vallen). Criação = wizard atômico (franquia + dono
// + 1ª loja) via endpoint; edição simples via RLS (franqueados.gerenciar = super).
export function Franqueados() {
  const { selectFranqueado } = useFranqueado()
  const [lista, setLista]   = useState(null)
  const [modal, setModal]   = useState(null)   // registro em edição
  const [wizard, setWizard] = useState(false)
  const [form, setForm]     = useState(vazio)
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState('')
  const [msg, setMsg]       = useState('')

  function load() {
    supabase.from('franqueados')
      .select('id, razao_social, nome_fantasia, tipo_doc, documento, ativo, responsavel_user_id')
      .order('id')
      .then(({ data }) => setLista(data || []))
  }
  useEffect(() => { load() }, [])

  function editar(item) { setErr(''); setForm({ ...item }); setModal(item) }
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function salvarEdicao(e) {
    e.preventDefault(); setErr(''); setSaving(true)
    const payload = {
      razao_social: form.razao_social.trim(),
      nome_fantasia: form.nome_fantasia?.trim() || null,
      tipo_doc: form.tipo_doc, documento: form.documento.trim(), ativo: form.ativo,
    }
    const { error } = await supabase.from('franqueados').update(payload).eq('id', form.id)
    setSaving(false)
    if (error) { setErr(error.message.includes('duplicate') ? 'Já existe uma franquia com esse documento' : error.message); return }
    setModal(null); load()
  }

  async function toggle(item) {
    await supabase.from('franqueados').update({ ativo: !item.ativo }).eq('id', item.id)
    load()
  }

  function aoCriar(franqId, nome) {
    setWizard(false); load()
    selectFranqueado(franqId)
    setMsg(`Franquia "${nome}" criada com o dono. Você já está nela — agora cadastre lojas e o restante do time.`)
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-vallen-white">Franquias</h1>
          <p className="text-vallen-muted text-sm">Cada franquia tem seu dono, lojas, produtos e usuários.</p>
        </div>
        <button onClick={() => setWizard(true)} className="px-4 py-2.5 bg-vallen-green text-white font-bold rounded-lg text-sm">+ Nova franquia</button>
      </div>

      {msg && (
        <div className="mb-4 flex items-start gap-3 bg-vallen-green/15 border border-vallen-green/40 rounded-xl px-4 py-3">
          <span className="text-xl">✅</span>
          <p className="text-vallen-white text-sm flex-1">{msg}</p>
          <button onClick={() => setMsg('')} className="text-vallen-muted text-sm">✕</button>
        </div>
      )}

      {lista === null ? (
        <p className="text-vallen-muted">Carregando…</p>
      ) : (
        <div className="space-y-2">
          {lista.map(f => (
            <div key={f.id} className={`bg-vallen-card border border-vallen-border rounded-xl px-4 py-3 flex items-center gap-3 ${!f.ativo ? 'opacity-60' : ''}`}>
              <span className="text-2xl">🏛️</span>
              <div className="flex-1 min-w-0">
                <p className="text-vallen-white font-bold truncate">{f.nome_fantasia || f.razao_social}</p>
                <p className="text-vallen-muted text-xs">{f.tipo_doc} {f.documento}{!f.ativo && ' · inativa'}</p>
              </div>
              {f.ativo && !f.responsavel_user_id && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-orange-500/20 text-orange-400 border border-orange-500/40">sem dono</span>
              )}
              <button onClick={() => selectFranqueado(f.id)} className="text-vallen-green text-sm font-semibold px-2">entrar</button>
              <button onClick={() => editar(f)} className="text-vallen-muted text-sm px-2">editar</button>
            </div>
          ))}
        </div>
      )}

      {wizard && <NovaFranquiaWizard onClose={() => setWizard(false)} onCriada={aoCriar} />}

      {modal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <form onSubmit={salvarEdicao} className="bg-vallen-card border border-vallen-border rounded-2xl p-6 w-full max-w-md space-y-3">
            <h3 className="text-vallen-white font-bold text-lg">Editar franquia</h3>
            <label className="block">
              <span className="text-vallen-muted text-xs">Razão social</span>
              <input value={form.razao_social} onChange={e => set('razao_social', e.target.value)} autoFocus required
                className="mt-1 w-full bg-vallen-dark border border-vallen-border rounded-lg px-3 py-2.5 text-vallen-white text-sm" />
            </label>
            <label className="block">
              <span className="text-vallen-muted text-xs">Nome fantasia</span>
              <input value={form.nome_fantasia || ''} onChange={e => set('nome_fantasia', e.target.value)}
                className="mt-1 w-full bg-vallen-dark border border-vallen-border rounded-lg px-3 py-2.5 text-vallen-white text-sm" />
            </label>
            <div className="grid grid-cols-3 gap-2">
              <label className="block">
                <span className="text-vallen-muted text-xs">Tipo</span>
                <select value={form.tipo_doc} onChange={e => set('tipo_doc', e.target.value)}
                  className="mt-1 w-full bg-vallen-dark border border-vallen-border rounded-lg px-2 py-2.5 text-vallen-white text-sm">
                  <option>CNPJ</option><option>CPF</option>
                </select>
              </label>
              <label className="block col-span-2">
                <span className="text-vallen-muted text-xs">Documento</span>
                <input value={form.documento} onChange={e => set('documento', e.target.value)} required
                  className="mt-1 w-full bg-vallen-dark border border-vallen-border rounded-lg px-3 py-2.5 text-vallen-white text-sm" />
              </label>
            </div>
            {err && <p className="text-red-400 text-sm">{err}</p>}
            <div className="flex gap-2 justify-between pt-1">
              <button type="button" onClick={() => toggle(form)} className="text-sm text-vallen-muted">{form.ativo ? 'Desativar' : 'Reativar'}</button>
              <div className="flex gap-2">
                <button type="button" onClick={() => setModal(null)} className="px-4 py-2 text-vallen-muted text-sm">Cancelar</button>
                <button disabled={saving || !form.razao_social || !form.documento}
                  className="px-4 py-2 bg-vallen-green text-white font-bold rounded-lg text-sm disabled:opacity-40">
                  {saving ? 'Salvando…' : 'Salvar'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

// ---- Wizard: franquia → dono → 1ª loja (opcional)
function NovaFranquiaWizard({ onClose, onCriada }) {
  const [passo, setPasso] = useState(1)
  const [f, setF] = useState({ razao_social: '', nome_fantasia: '', tipo_doc: 'CNPJ', documento: '' })
  const [d, setD] = useState({ email: '', senha: '' })
  const [l, setL] = useState({ nome: '', codigo: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr]   = useState('')

  const setFf = (k, v) => setF(s => ({ ...s, [k]: v }))
  const setDd = (k, v) => setD(s => ({ ...s, [k]: v }))
  const setLl = (k, v) => setL(s => ({ ...s, [k]: v }))

  const passo1ok = f.razao_social.trim() && f.documento.trim()
  const passo2ok = d.email.trim() && d.senha.length >= 6

  async function criar(comLoja) {
    setErr(''); setBusy(true)
    try {
      const r = await apiFranquia({
        action: 'criar', franquia: f, dono: d,
        loja: comLoja && l.nome.trim() ? l : null,
      })
      onCriada(r.franqueado_id, f.nome_fantasia.trim() || f.razao_social.trim())
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
      <div className="bg-vallen-card border border-vallen-border rounded-2xl p-6 w-full max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-vallen-white font-bold text-lg">Nova franquia</h3>
          <span className="text-vallen-muted text-xs">Passo {passo} de 3</span>
        </div>
        <div className="flex gap-1">
          {[1, 2, 3].map(n => <div key={n} className={`h-1.5 flex-1 rounded-full ${n <= passo ? 'bg-vallen-green' : 'bg-vallen-border'}`} />)}
        </div>

        {passo === 1 && (
          <div className="space-y-3">
            <p className="text-vallen-muted text-sm">Dados da franquia</p>
            <input value={f.razao_social} onChange={e => setFf('razao_social', e.target.value)} placeholder="Razão social *" autoFocus
              className="w-full bg-vallen-dark border border-vallen-border rounded-lg px-3 py-2.5 text-vallen-white text-sm" />
            <input value={f.nome_fantasia} onChange={e => setFf('nome_fantasia', e.target.value)} placeholder="Nome fantasia"
              className="w-full bg-vallen-dark border border-vallen-border rounded-lg px-3 py-2.5 text-vallen-white text-sm" />
            <div className="grid grid-cols-3 gap-2">
              <select value={f.tipo_doc} onChange={e => setFf('tipo_doc', e.target.value)}
                className="bg-vallen-dark border border-vallen-border rounded-lg px-2 py-2.5 text-vallen-white text-sm">
                <option>CNPJ</option><option>CPF</option>
              </select>
              <input value={f.documento} onChange={e => setFf('documento', e.target.value)} placeholder="Documento *"
                className="col-span-2 bg-vallen-dark border border-vallen-border rounded-lg px-3 py-2.5 text-vallen-white text-sm" />
            </div>
          </div>
        )}

        {passo === 2 && (
          <div className="space-y-3">
            <p className="text-vallen-muted text-sm">Dono da franquia (quem vai administrá-la)</p>
            <input value={d.email} onChange={e => setDd('email', e.target.value)} type="email" placeholder="E-mail do dono *" autoFocus
              className="w-full bg-vallen-dark border border-vallen-border rounded-lg px-3 py-2.5 text-vallen-white text-sm" />
            <input value={d.senha} onChange={e => setDd('senha', e.target.value)} type="text" placeholder="Senha (mín. 6) *"
              className="w-full bg-vallen-dark border border-vallen-border rounded-lg px-3 py-2.5 text-vallen-white text-sm" />
            <p className="text-vallen-muted text-xs">O dono entra com esse e-mail/senha e assume a franquia.</p>
          </div>
        )}

        {passo === 3 && (
          <div className="space-y-3">
            <p className="text-vallen-muted text-sm">1ª loja (opcional — pode cadastrar depois)</p>
            <input value={l.nome} onChange={e => setLl('nome', e.target.value)} placeholder="Nome da loja" autoFocus
              className="w-full bg-vallen-dark border border-vallen-border rounded-lg px-3 py-2.5 text-vallen-white text-sm" />
            <input value={l.codigo} onChange={e => setLl('codigo', e.target.value)} placeholder="Código (opcional)"
              className="w-full bg-vallen-dark border border-vallen-border rounded-lg px-3 py-2.5 text-vallen-white text-sm" />
          </div>
        )}

        {err && <p className="text-red-400 text-sm">{err}</p>}

        <div className="flex justify-between pt-1">
          <button onClick={passo === 1 ? onClose : () => setPasso(passo - 1)} disabled={busy}
            className="px-4 py-2 text-vallen-muted text-sm">{passo === 1 ? 'Cancelar' : 'Voltar'}</button>
          {passo === 1 && (
            <button onClick={() => setPasso(2)} disabled={!passo1ok}
              className="px-5 py-2 bg-vallen-green text-white font-bold rounded-lg text-sm disabled:opacity-40">Próximo</button>
          )}
          {passo === 2 && (
            <button onClick={() => setPasso(3)} disabled={!passo2ok}
              className="px-5 py-2 bg-vallen-green text-white font-bold rounded-lg text-sm disabled:opacity-40">Próximo</button>
          )}
          {passo === 3 && (
            <div className="flex gap-2">
              <button onClick={() => criar(false)} disabled={busy}
                className="px-4 py-2 border border-vallen-border text-vallen-muted rounded-lg text-sm disabled:opacity-40">Pular loja</button>
              <button onClick={() => criar(true)} disabled={busy}
                className="px-5 py-2 bg-vallen-green text-white font-bold rounded-lg text-sm disabled:opacity-40">
                {busy ? 'Criando…' : 'Criar franquia'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

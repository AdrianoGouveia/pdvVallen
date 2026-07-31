import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useFranqueado } from '../lib/franqueadoContext.jsx'

const vazio = { razao_social: '', nome_fantasia: '', tipo_doc: 'CNPJ', documento: '', ativo: true }

// Gestão de franquias (só Admin Vallen). Escrita via RLS (franqueados.gerenciar = super).
export function Franqueados() {
  const { selectFranqueado } = useFranqueado()
  const [lista, setLista]   = useState(null)
  const [modal, setModal]   = useState(null)   // null | 'new' | registro
  const [form, setForm]     = useState(vazio)
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState('')
  const [msg, setMsg]       = useState('')

  function load() {
    supabase.from('franqueados')
      .select('id, razao_social, nome_fantasia, tipo_doc, documento, ativo')
      .order('id')
      .then(({ data }) => setLista(data || []))
  }
  useEffect(() => { load() }, [])

  function abrir(item) { setErr(''); setForm(item ? { ...item } : vazio); setModal(item || 'new') }
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function salvar(e) {
    e.preventDefault(); setErr(''); setSaving(true)
    const payload = {
      razao_social: form.razao_social.trim(),
      nome_fantasia: form.nome_fantasia?.trim() || null,
      tipo_doc: form.tipo_doc,
      documento: form.documento.trim(),
      ativo: form.ativo,
    }
    if (modal === 'new') {
      const { data, error } = await supabase.from('franqueados').insert(payload).select('id').single()
      setSaving(false)
      if (error) { setErr(error.message.includes('duplicate') ? 'Já existe uma franquia com esse documento' : error.message); return }
      setModal(null); load()
      selectFranqueado(data.id)  // entra na franquia recém-criada
      setMsg(`Você está agora na franquia "${payload.nome_fantasia || payload.razao_social}". Cadastre as lojas (Condomínios) e o dono/usuários (Usuários) dela.`)
    } else {
      const { error } = await supabase.from('franqueados').update(payload).eq('id', form.id)
      setSaving(false)
      if (error) { setErr(error.message.includes('duplicate') ? 'Já existe uma franquia com esse documento' : error.message); return }
      setModal(null); load()
    }
  }

  async function toggle(item) {
    await supabase.from('franqueados').update({ ativo: !item.ativo }).eq('id', item.id)
    load()
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-vallen-white">Franquias</h1>
          <p className="text-vallen-muted text-sm">Cada franquia tem suas próprias lojas, produtos e usuários.</p>
        </div>
        <button onClick={() => abrir(null)} className="px-4 py-2.5 bg-vallen-green text-white font-bold rounded-lg text-sm">+ Nova franquia</button>
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
              <button onClick={() => selectFranqueado(f.id)} className="text-vallen-green text-sm font-semibold px-2">entrar</button>
              <button onClick={() => abrir(f)} className="text-vallen-muted text-sm px-2">editar</button>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <form onSubmit={salvar} className="bg-vallen-card border border-vallen-border rounded-2xl p-6 w-full max-w-md space-y-3">
            <h3 className="text-vallen-white font-bold text-lg">{modal === 'new' ? 'Nova franquia' : 'Editar franquia'}</h3>
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
            <label className="flex items-center gap-2 text-vallen-white text-sm">
              <input type="checkbox" checked={form.ativo} onChange={e => set('ativo', e.target.checked)} /> Ativa
            </label>
            {err && <p className="text-red-400 text-sm">{err}</p>}
            <div className="flex gap-2 justify-between pt-1">
              {modal !== 'new'
                ? <button type="button" onClick={() => toggle(form)} className="text-sm text-vallen-muted">{form.ativo ? 'Desativar' : 'Reativar'}</button>
                : <span />}
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

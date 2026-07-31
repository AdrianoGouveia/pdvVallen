import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useFranqueado } from '../lib/franqueadoContext.jsx'
import { Condominios } from './Condominios.jsx'
import { Usuarios } from './Usuarios.jsx'
import { Produtos } from './Produtos.jsx'

const TABS = [
  { id: 'dados',    label: 'Dados',    icon: '📋' },
  { id: 'lojas',    label: 'Lojas',    icon: '🏢' },
  { id: 'usuarios', label: 'Usuários', icon: '🔐' },
  { id: 'catalogo', label: 'Catálogo', icon: '📦' },
]

// Detalhe de UMA franquia, com abas — o admin trabalha "dentro" dela. Reaproveita
// as telas existentes, já escopadas pelo franqueado selecionado no contexto.
export function FranquiaDetalhe() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { selectFranqueado, franqueadoId } = useFranqueado()
  const fid = Number(id)
  const [tab, setTab]   = useState('lojas')
  const [franq, setFranq] = useState(null)
  const [counts, setCounts] = useState({ lojas: 0, usuarios: 0 })

  // Entra na franquia (troca o contexto) — os componentes embutidos leem daqui.
  useEffect(() => { if (fid && franqueadoId !== fid) selectFranqueado(fid) }, [fid, franqueadoId, selectFranqueado])

  function carregar() {
    supabase.from('franqueados').select('*').eq('id', fid).maybeSingle().then(({ data }) => setFranq(data))
    supabase.from('unidades').select('id', { count: 'exact', head: true }).eq('franqueado_id', fid).then(({ count }) => setCounts(c => ({ ...c, lojas: count || 0 })))
    supabase.from('usuarios_franqueados').select('id', { count: 'exact', head: true }).eq('franqueado_id', fid).then(({ count }) => setCounts(c => ({ ...c, usuarios: count || 0 })))
  }
  useEffect(() => { carregar() }, [fid])

  const pronto = franqueadoId === fid  // espera o contexto trocar p/ não carregar a franquia errada

  return (
    <div className="flex flex-col h-full">
      <header className="bg-vallen-black border-b border-vallen-border px-6 pt-5 pb-0">
        <button onClick={() => navigate('/admin/franqueados')} className="text-vallen-muted text-sm mb-2">← Franquias</button>
        <div className="flex items-center gap-3">
          <span className="text-2xl">🏛️</span>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-vallen-white truncate">{franq?.nome_fantasia || franq?.razao_social || '…'}</h1>
            <p className="text-vallen-muted text-xs">
              {franq?.tipo_doc} {franq?.documento} · {counts.lojas} loja(s) · {counts.usuarios} usuário(s)
              {franq && !franq.responsavel_user_id && <span className="text-orange-400 font-semibold"> · sem dono</span>}
            </p>
          </div>
        </div>
        <nav className="flex gap-1 mt-4 -mb-px">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors
                ${tab === t.id ? 'text-vallen-white border-vallen-green bg-vallen-dark' : 'text-vallen-muted border-transparent hover:text-vallen-white'}`}>
              <span className="mr-1.5">{t.icon}</span>{t.label}
            </button>
          ))}
        </nav>
      </header>

      <div className="flex-1 overflow-auto bg-vallen-dark">
        {!pronto ? (
          <div className="flex items-center justify-center h-full text-vallen-muted">Entrando na franquia…</div>
        ) : tab === 'dados' ? (
          <DadosFranquia franq={franq} onSaved={carregar} />
        ) : tab === 'lojas' ? (
          <Condominios />
        ) : tab === 'usuarios' ? (
          <Usuarios />
        ) : (
          <Produtos />
        )}
      </div>
    </div>
  )
}

// Aba Dados: edição dos campos da franquia + aviso de dono
function DadosFranquia({ franq, onSaved }) {
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg]   = useState('')
  useEffect(() => { setForm(franq ? { ...franq } : null) }, [franq])
  if (!form) return null
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function salvar(e) {
    e.preventDefault(); setSaving(true); setMsg('')
    const { error } = await supabase.from('franqueados').update({
      razao_social: form.razao_social?.trim(),
      nome_fantasia: form.nome_fantasia?.trim() || null,
      tipo_doc: form.tipo_doc, documento: form.documento?.trim(), ativo: form.ativo,
    }).eq('id', form.id)
    setSaving(false)
    if (error) { setMsg(error.message.includes('duplicate') ? 'Documento já usado por outra franquia' : error.message); return }
    setMsg('Salvo'); onSaved()
  }

  return (
    <form onSubmit={salvar} className="p-6 max-w-xl space-y-3">
      {!form.responsavel_user_id && (
        <div className="bg-orange-500/15 border border-orange-500/40 rounded-xl px-4 py-3 text-orange-300 text-sm">
          ⚠️ Esta franquia está <b>sem dono</b>. Crie um usuário com papel <b>Franqueado</b> na aba Usuários.
        </div>
      )}
      <label className="block">
        <span className="text-vallen-muted text-xs">Razão social</span>
        <input value={form.razao_social || ''} onChange={e => set('razao_social', e.target.value)} required
          className="mt-1 w-full bg-vallen-card border border-vallen-border rounded-lg px-3 py-2.5 text-vallen-white text-sm" />
      </label>
      <label className="block">
        <span className="text-vallen-muted text-xs">Nome fantasia</span>
        <input value={form.nome_fantasia || ''} onChange={e => set('nome_fantasia', e.target.value)}
          className="mt-1 w-full bg-vallen-card border border-vallen-border rounded-lg px-3 py-2.5 text-vallen-white text-sm" />
      </label>
      <div className="grid grid-cols-3 gap-2">
        <label className="block">
          <span className="text-vallen-muted text-xs">Tipo</span>
          <select value={form.tipo_doc} onChange={e => set('tipo_doc', e.target.value)}
            className="mt-1 w-full bg-vallen-card border border-vallen-border rounded-lg px-2 py-2.5 text-vallen-white text-sm">
            <option>CNPJ</option><option>CPF</option>
          </select>
        </label>
        <label className="block col-span-2">
          <span className="text-vallen-muted text-xs">Documento</span>
          <input value={form.documento || ''} onChange={e => set('documento', e.target.value)} required
            className="mt-1 w-full bg-vallen-card border border-vallen-border rounded-lg px-3 py-2.5 text-vallen-white text-sm" />
        </label>
      </div>
      <label className="flex items-center gap-2 text-vallen-white text-sm">
        <input type="checkbox" checked={form.ativo} onChange={e => set('ativo', e.target.checked)} /> Franquia ativa
      </label>
      <div className="flex items-center gap-3">
        <button disabled={saving} className="px-4 py-2 bg-vallen-green text-white font-bold rounded-lg text-sm disabled:opacity-40">
          {saving ? 'Salvando…' : 'Salvar'}
        </button>
        {msg && <span className="text-sm text-vallen-muted">{msg}</span>}
      </div>
    </form>
  )
}

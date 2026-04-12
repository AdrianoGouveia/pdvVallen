import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { PageHeader } from '../components/PageHeader.jsx'
import { Modal } from '../components/Modal.jsx'
import { Field, inputCls, Btn } from '../components/Field.jsx'

const empty = { nome: '', codigo_barras: '', preco: '', categoria: '', imagem_url: '', restrito_idade: false, destaque: false }

export function Produtos() {
  const [lista, setLista]   = useState([])
  const [busca, setBusca]   = useState('')
  const [modal, setModal]   = useState(null)
  const [form, setForm]     = useState(empty)
  const [saving, setSaving] = useState(false)
  const [page, setPage]     = useState(0)
  const PAGE = 50

  async function load(termo = busca, pg = page) {
    let q = supabase.from('produtos').select('*').order('nome').range(pg * PAGE, pg * PAGE + PAGE - 1)
    if (termo) q = q.or(`nome.ilike.%${termo}%,codigo_barras.ilike.%${termo}%`)
    const { data } = await q
    setLista(data || [])
  }

  useEffect(() => { load() }, [])

  async function salvar(e) {
    e.preventDefault(); setSaving(true)
    const p = { ...form, preco: parseFloat(form.preco) || 0 }
    if (!p.id) { delete p.id; await supabase.from('produtos').insert(p) }
    else await supabase.from('produtos').update(p).eq('id', p.id)
    setSaving(false); setModal(null); load()
  }

  const f = k => e => setForm(p => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  return (
    <div>
      <PageHeader title="Produtos"
        action={<Btn onClick={() => { setForm(empty); setModal('new') }}>+ Novo</Btn>} />

      <div className="px-6 py-4">
        <input value={busca} onChange={e => { setBusca(e.target.value); setPage(0); load(e.target.value, 0) }}
          placeholder="Buscar por nome ou código..." className={inputCls} />
      </div>

      <div className="px-6 pb-6">
        <div className="bg-vallen-card border border-vallen-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-vallen-border text-vallen-muted text-left">
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Categoria</th>
              <th className="px-4 py-3">Preço</th>
              <th className="px-4 py-3">Flags</th>
              <th className="px-4 py-3"></th>
            </tr></thead>
            <tbody>
              {lista.map(p => (
                <tr key={p.id} className="border-b border-vallen-border/50 hover:bg-vallen-dark/40">
                  <td className="px-4 py-2 font-mono text-xs text-vallen-muted">{p.codigo_barras}</td>
                  <td className="px-4 py-2 text-vallen-white">{p.nome}</td>
                  <td className="px-4 py-2 text-vallen-muted">{p.categoria || '—'}</td>
                  <td className="px-4 py-2 text-vallen-green font-medium">R$ {Number(p.preco).toFixed(2)}</td>
                  <td className="px-4 py-2 space-x-1">
                    {p.restrito_idade && <span className="text-xs bg-yellow-900/40 text-yellow-400 px-1.5 py-0.5 rounded">+18</span>}
                    {p.destaque && <span className="text-xs bg-vallen-green/20 text-vallen-green px-1.5 py-0.5 rounded">⭐</span>}
                  </td>
                  <td className="px-4 py-2">
                    <Btn variant="ghost" onClick={() => { setForm(p); setModal('edit') }}>Editar</Btn>
                  </td>
                </tr>
              ))}
              {!lista.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-vallen-muted">Nenhum produto</td></tr>}
            </tbody>
          </table>
          {lista.length === PAGE && (
            <div className="p-4 flex justify-center gap-3">
              {page > 0 && <Btn variant="ghost" onClick={() => { setPage(p => p-1); load(busca, page-1) }}>← Anterior</Btn>}
              <Btn variant="ghost" onClick={() => { setPage(p => p+1); load(busca, page+1) }}>Próxima →</Btn>
            </div>
          )}
        </div>
      </div>

      {modal && (
        <Modal title={modal === 'new' ? 'Novo Produto' : 'Editar Produto'} onClose={() => setModal(null)}>
          <form onSubmit={salvar} className="space-y-3">
            <Field label="Nome *"><input required className={inputCls} value={form.nome} onChange={f('nome')} /></Field>
            <Field label="Código de barras *"><input required className={inputCls} value={form.codigo_barras} onChange={f('codigo_barras')} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Preço de venda *"><input required type="number" step="0.01" className={inputCls} value={form.preco} onChange={f('preco')} /></Field>
              <Field label="Categoria"><input className={inputCls} value={form.categoria||''} onChange={f('categoria')} /></Field>
            </div>
            <Field label="URL da imagem"><input className={inputCls} value={form.imagem_url||''} onChange={f('imagem_url')} /></Field>
            <div className="flex gap-4 pt-1">
              <label className="flex items-center gap-2 text-sm text-vallen-muted cursor-pointer">
                <input type="checkbox" checked={form.restrito_idade} onChange={f('restrito_idade')} className="accent-yellow-500" />
                Restrito +18
              </label>
              <label className="flex items-center gap-2 text-sm text-vallen-muted cursor-pointer">
                <input type="checkbox" checked={form.destaque} onChange={f('destaque')} className="accent-vallen-green" />
                Destaque
              </label>
            </div>
            <div className="flex gap-3 pt-2">
              <Btn type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Btn>
              <Btn type="button" variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

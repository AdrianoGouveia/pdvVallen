import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { PageHeader } from '../components/PageHeader.jsx'
import { Field, inputCls, Btn } from '../components/Field.jsx'
import { Modal } from '../components/Modal.jsx'

export function Categorias() {
  const [lista, setLista]   = useState([])
  const [modal, setModal]   = useState(false)
  const [form, setForm]     = useState({ nome: '', ordem: 0 })
  const [saving, setSaving] = useState(false)

  async function load() {
    const { data } = await supabase
      .from('categorias')
      .select('*')
      .order('ordem')
      .order('nome')
    setLista(data || [])
  }

  useEffect(() => { load() }, [])

  function abrir(item) {
    setForm(item ?? { nome: '', ordem: lista.length })
    setModal(true)
  }

  async function salvar(e) {
    e.preventDefault(); setSaving(true)
    const payload = { nome: form.nome.toUpperCase().trim(), ordem: parseInt(form.ordem) || 0, ativo: form.ativo ?? true }
    if (form.id) await supabase.from('categorias').update(payload).eq('id', form.id)
    else         await supabase.from('categorias').insert(payload)
    setSaving(false); setModal(false); load()
  }

  async function toggle(item) {
    await supabase.from('categorias').update({ ativo: !item.ativo }).eq('id', item.id)
    load()
  }

  async function excluir(item) {
    if (!confirm(`Excluir categoria "${item.nome}"?`)) return
    await supabase.from('categorias').delete().eq('id', item.id)
    load()
  }

  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }))

  return (
    <div>
      <PageHeader title="Categorias"
        action={<Btn onClick={() => abrir(null)}>+ Nova</Btn>} />

      <div className="p-6">
        <div className="bg-vallen-card border border-vallen-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-vallen-border text-vallen-muted text-left">
                <th className="px-4 py-3 w-16">Ordem</th>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {lista.map(cat => (
                <tr key={cat.id} className="border-b border-vallen-border/50 hover:bg-vallen-dark/40">
                  <td className="px-4 py-3 text-vallen-muted text-center">{cat.ordem}</td>
                  <td className="px-4 py-3 text-vallen-white font-medium">{cat.nome}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cat.ativo ? 'bg-green-900/40 text-green-400' : 'bg-gray-800 text-gray-500'}`}>
                      {cat.ativo ? 'Ativa' : 'Inativa'}
                    </span>
                  </td>
                  <td className="px-4 py-3 flex gap-2 justify-end">
                    <Btn variant="ghost" onClick={() => abrir(cat)}>Editar</Btn>
                    <Btn variant={cat.ativo ? 'danger' : 'ghost'} onClick={() => toggle(cat)}>
                      {cat.ativo ? 'Desativar' : 'Ativar'}
                    </Btn>
                    <Btn variant="danger" onClick={() => excluir(cat)}>Excluir</Btn>
                  </td>
                </tr>
              ))}
              {!lista.length && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-vallen-muted">Nenhuma categoria</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <Modal title={form.id ? 'Editar Categoria' : 'Nova Categoria'} onClose={() => setModal(false)}>
          <form onSubmit={salvar} className="space-y-4">
            <Field label="Nome *">
              <input required autoFocus className={inputCls} value={form.nome}
                onChange={f('nome')} placeholder="Ex: BEBIDAS" />
            </Field>
            <Field label="Ordem (menor aparece primeiro)">
              <input type="number" className={inputCls} value={form.ordem} onChange={f('ordem')} />
            </Field>
            <div className="flex gap-3 pt-2">
              <Btn type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Btn>
              <Btn type="button" variant="ghost" onClick={() => setModal(false)}>Cancelar</Btn>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

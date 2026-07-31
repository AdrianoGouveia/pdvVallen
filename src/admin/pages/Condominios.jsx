import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useFranqueado } from '../lib/franqueadoContext.jsx'
import { PageHeader } from '../components/PageHeader.jsx'
import { Modal } from '../components/Modal.jsx'
import { Field, inputCls, Btn } from '../components/Field.jsx'
import { MaquininhasLoja } from '../components/MaquininhasLoja.jsx'

const empty = { nome: '', codigo: '', endereco: '', cidade: '', cep: '', whatsapp: '', ativo: true }

export function Condominios() {
  const { franqueadoId } = useFranqueado()
  const [lista, setLista]   = useState([])
  const [modal, setModal]   = useState(null) // null | 'new' | item
  const [form, setForm]     = useState(empty)
  const [saving, setSaving] = useState(false)

  async function load() {
    if (!franqueadoId) { setLista([]); return }
    const { data } = await supabase.from('unidades').select('*').eq('franqueado_id', franqueadoId).order('nome')
    setLista(data || [])
  }
  useEffect(() => { load() }, [franqueadoId])

  function abrir(item) { setForm(item ?? empty); setModal(item ?? 'new') }

  async function salvar(e) {
    e.preventDefault(); setSaving(true)
    const payload = { nome: form.nome, codigo: form.codigo, endereco: form.endereco, cidade: form.cidade, cep: form.cep, whatsapp: form.whatsapp || null, ativo: form.ativo }
    if (modal === 'new') await supabase.from('unidades').insert({ ...payload, franqueado_id: franqueadoId })
    else await supabase.from('unidades').update(payload).eq('id', form.id)
    setSaving(false); setModal(null); load()
  }

  async function toggle(item) {
    await supabase.from('unidades').update({ ativo: !item.ativo }).eq('id', item.id)
    load()
  }

  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }))

  return (
    <div>
      <PageHeader title="Condomínios"
        action={<Btn onClick={() => abrir(null)}>+ Novo</Btn>} />

      <div className="p-6">
        <div className="bg-vallen-card border border-vallen-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-vallen-border text-vallen-muted text-left">
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Cidade</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr></thead>
            <tbody>
              {lista.map(u => (
                <tr key={u.id} className="border-b border-vallen-border/50 hover:bg-vallen-dark/40">
                  <td className="px-4 py-3 text-vallen-white font-medium">{u.nome}</td>
                  <td className="px-4 py-3 text-vallen-muted font-mono">{u.codigo}</td>
                  <td className="px-4 py-3 text-vallen-muted">{u.cidade || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.ativo ? 'bg-green-900/40 text-green-400' : 'bg-gray-800 text-gray-500'}`}>
                      {u.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 flex gap-2 justify-end">
                    <Btn variant="ghost" onClick={() => abrir(u)}>Editar</Btn>
                    <Btn variant={u.ativo ? 'danger' : 'ghost'} onClick={() => toggle(u)}>
                      {u.ativo ? 'Desativar' : 'Ativar'}
                    </Btn>
                  </td>
                </tr>
              ))}
              {!lista.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-vallen-muted">Nenhum condomínio</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <Modal title={modal === 'new' ? 'Novo Condomínio' : 'Editar'} onClose={() => setModal(null)}>
          <form onSubmit={salvar} className="space-y-4">
            <Field label="Nome *"><input required className={inputCls} value={form.nome} onChange={f('nome')} /></Field>
            <Field label="Código único *"><input required className={inputCls} value={form.codigo} onChange={f('codigo')} /></Field>
            <Field label="Endereço"><input className={inputCls} value={form.endereco||''} onChange={f('endereco')} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Cidade"><input className={inputCls} value={form.cidade||''} onChange={f('cidade')} /></Field>
              <Field label="CEP"><input className={inputCls} value={form.cep||''} onChange={f('cep')} /></Field>
            </div>
            <Field label="WhatsApp suporte (DDD + número)">
              <input className={inputCls} value={form.whatsapp||''} onChange={f('whatsapp')}
                placeholder="11987654321" inputMode="numeric" />
            </Field>
            <div className="flex gap-3 pt-2">
              <Btn type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Btn>
              <Btn type="button" variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
            </div>
          </form>
          {modal !== 'new' && form.id
            ? <MaquininhasLoja unidadeId={form.id} franqueadoId={franqueadoId} />
            : <p className="text-xs text-vallen-muted border-t border-vallen-border pt-4 mt-4">Salve a loja para cadastrar as maquininhas.</p>}
        </Modal>
      )}
    </div>
  )
}

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { PageHeader } from '../components/PageHeader.jsx'
import { Field, inputCls } from '../components/Field.jsx'

export function Clientes() {
  const [lista, setLista]     = useState([])
  const [unidades, setUnidades] = useState([])
  const [filtro, setFiltro]   = useState('')
  const [unidade, setUnidade] = useState('')

  useEffect(() => {
    supabase.from('unidades').select('id,nome').order('nome').then(({ data }) => setUnidades(data || []))
  }, [])

  useEffect(() => {
    let q = supabase.from('clientes').select('*, unidades(nome)').order('nome')
    if (unidade) q = q.eq('unidade_id', unidade)
    q.then(({ data }) => setLista(data || []))
  }, [unidade])

  const filtrado = lista.filter(c => !filtro || c.nome?.toLowerCase().includes(filtro.toLowerCase()) || c.cpf?.includes(filtro))

  function idade(dn) {
    if (!dn) return '—'
    const d = new Date(dn), h = new Date()
    let a = h.getFullYear() - d.getFullYear()
    if (h < new Date(h.getFullYear(), d.getMonth(), d.getDate())) a--
    return a + ' anos'
  }

  return (
    <div>
      <PageHeader title="Clientes" />
      <div className="px-6 py-4 flex gap-4 flex-wrap">
        <Field label="Filtrar condomínio">
          <select value={unidade} onChange={e => setUnidade(e.target.value)} className={inputCls + ' w-56'}>
            <option value="">Todos</option>
            {unidades.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        </Field>
        <Field label="Buscar">
          <input value={filtro} onChange={e => setFiltro(e.target.value)}
            placeholder="Nome ou CPF..." className={inputCls + ' w-56'} />
        </Field>
        <div className="flex items-end">
          <span className="text-sm text-vallen-muted">{filtrado.length} cliente(s)</span>
        </div>
      </div>
      <div className="px-6 pb-6">
        <div className="bg-vallen-card border border-vallen-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-vallen-border text-vallen-muted text-left">
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">CPF</th>
              <th className="px-4 py-3">Idade</th>
              <th className="px-4 py-3">Condomínio</th>
              <th className="px-4 py-3">Cadastro</th>
            </tr></thead>
            <tbody>
              {filtrado.map(c => (
                <tr key={c.cpf} className="border-b border-vallen-border/50 hover:bg-vallen-dark/40">
                  <td className="px-4 py-2 text-vallen-white">{c.nome}</td>
                  <td className="px-4 py-2 font-mono text-vallen-muted">{c.cpf}</td>
                  <td className="px-4 py-2 text-vallen-muted">{idade(c.data_nascimento)}</td>
                  <td className="px-4 py-2 text-vallen-muted">{c.unidades?.nome || '—'}</td>
                  <td className="px-4 py-2 text-vallen-muted text-xs">{new Date(c.created_at).toLocaleDateString('pt-BR')}</td>
                </tr>
              ))}
              {!filtrado.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-vallen-muted">Nenhum cliente</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

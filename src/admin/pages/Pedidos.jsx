import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { PageHeader } from '../components/PageHeader.jsx'
import { Field, inputCls } from '../components/Field.jsx'

const STATUS_CLS = {
  aprovado:   'bg-green-900/40 text-green-400',
  aguardando: 'bg-yellow-900/40 text-yellow-400',
  cancelado:  'bg-red-900/40 text-red-400',
}

export function Pedidos() {
  const [lista, setLista]     = useState([])
  const [unidades, setUnidades] = useState([])
  const [unidade, setUnidade] = useState('')
  const [status, setStatus]   = useState('')

  useEffect(() => {
    supabase.from('unidades').select('id,nome').order('nome').then(({ data }) => setUnidades(data || []))
  }, [])

  useEffect(() => {
    let q = supabase.from('pedidos').select('*, unidades(nome)').order('created_at', { ascending: false }).limit(100)
    if (unidade) q = q.eq('unidade_id', unidade)
    if (status)  q = q.eq('status', status)
    q.then(({ data }) => setLista(data || []))
  }, [unidade, status])

  const total = lista.reduce((a, p) => p.status === 'aprovado' ? a + Number(p.total) : a, 0)

  return (
    <div>
      <PageHeader title="Pedidos" />
      <div className="px-6 py-4 flex gap-4 flex-wrap items-end">
        <Field label="Condomínio">
          <select value={unidade} onChange={e => setUnidade(e.target.value)} className={inputCls + ' w-56'}>
            <option value="">Todos</option>
            {unidades.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select value={status} onChange={e => setStatus(e.target.value)} className={inputCls + ' w-40'}>
            <option value="">Todos</option>
            <option value="aprovado">Aprovado</option>
            <option value="aguardando">Aguardando</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </Field>
        <div className="text-sm text-vallen-muted">
          {lista.length} pedidos · <span className="text-vallen-green font-medium">R$ {total.toFixed(2)}</span> aprovados
        </div>
      </div>
      <div className="px-6 pb-6">
        <div className="bg-vallen-card border border-vallen-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-vallen-border text-vallen-muted text-left">
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Condomínio</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Provider</th>
              <th className="px-4 py-3">Status</th>
            </tr></thead>
            <tbody>
              {lista.map(p => (
                <tr key={p.id} className="border-b border-vallen-border/50 hover:bg-vallen-dark/40">
                  <td className="px-4 py-2 text-vallen-muted font-mono">#{p.id}</td>
                  <td className="px-4 py-2 text-vallen-muted text-xs">{new Date(p.created_at).toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-2 text-vallen-muted">{p.unidades?.nome || '—'}</td>
                  <td className="px-4 py-2 text-vallen-green font-medium">R$ {Number(p.total).toFixed(2)}</td>
                  <td className="px-4 py-2 text-vallen-muted text-xs">{p.provider || '—'}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLS[p.status] || 'bg-gray-800 text-gray-400'}`}>
                      {p.status}
                    </span>
                  </td>
                </tr>
              ))}
              {!lista.length && <tr><td colSpan={6} className="px-4 py-8 text-center text-vallen-muted">Nenhum pedido</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

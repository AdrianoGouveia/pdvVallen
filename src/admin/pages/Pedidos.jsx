import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { PageHeader } from '../components/PageHeader.jsx'
import { Field, inputCls } from '../components/Field.jsx'

const STATUS_CLS = {
  aprovado:   'bg-green-900/40 text-green-400 border border-green-800/40',
  aguardando: 'bg-yellow-900/40 text-yellow-400 border border-yellow-800/40',
  cancelado:  'bg-red-900/40 text-red-400 border border-red-800/40',
}

const STATUS_LABEL = {
  aprovado:   'Aprovado',
  aguardando: 'Aguardando',
  cancelado:  'Cancelado',
}

export function Pedidos() {
  const [lista, setLista]       = useState([])
  const [unidades, setUnidades] = useState([])
  const [unidade, setUnidade]   = useState('')
  const [status, setStatus]     = useState('')
  const [confirmando, setConfirmando] = useState({}) // id → bool

  useEffect(() => {
    supabase.from('unidades').select('id,nome').order('nome').then(({ data }) => setUnidades(data || []))
  }, [])

  function carregar() {
    let q = supabase.from('pedidos').select('*, unidades(nome)').order('created_at', { ascending: false }).limit(100)
    if (unidade) q = q.eq('unidade_id', unidade)
    if (status)  q = q.eq('status', status)
    q.then(({ data }) => setLista(data || []))
  }

  useEffect(() => { carregar() }, [unidade, status])

  async function confirmarPagamento(pedido) {
    setConfirmando(s => ({ ...s, [pedido.id]: true }))
    await supabase.from('pedidos').update({ status: 'aprovado' }).eq('id', pedido.id)
    setLista(prev => prev.map(p => p.id === pedido.id ? { ...p, status: 'aprovado' } : p))
    setConfirmando(s => ({ ...s, [pedido.id]: false }))
  }

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
        <button onClick={carregar} className="px-3 py-2 bg-vallen-card border border-vallen-border rounded-lg text-xs text-vallen-muted hover:text-vallen-white transition-colors">
          ↻ Atualizar
        </button>
      </div>

      <div className="px-6 pb-6">
        <div className="bg-vallen-card border border-vallen-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-vallen-border text-vallen-muted text-left">
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Condomínio</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Pagamento</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Ação</th>
              </tr>
            </thead>
            <tbody>
              {lista.map(p => (
                <tr key={p.id} className="border-b border-vallen-border/50 hover:bg-vallen-dark/40">
                  <td className="px-4 py-3 text-vallen-muted font-mono text-xs">#{p.id}</td>
                  <td className="px-4 py-3 text-vallen-muted text-xs whitespace-nowrap">
                    {new Date(p.created_at).toLocaleString('pt-BR')}
                  </td>
                  <td className="px-4 py-3 text-vallen-muted">{p.unidades?.nome || '—'}</td>
                  <td className="px-4 py-3 text-vallen-green font-semibold">R$ {Number(p.total).toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                      ${p.provider === 'maquininha' ? 'bg-blue-900/40 text-blue-300 border border-blue-800/40' :
                        p.provider?.includes('efi') ? 'bg-green-900/30 text-green-400 border border-green-800/30' :
                        'bg-vallen-dark text-vallen-muted border border-vallen-border'}`}>
                      {p.provider === 'maquininha' ? '💳 Maquininha' :
                       p.provider === 'efi_pix'    ? '🟢 EFI PIX'    :
                       p.provider === 'asaas'      ? '🔵 Asaas PIX'  :
                       p.provider || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLS[p.status] || 'bg-gray-800 text-gray-400'}`}>
                      {STATUS_LABEL[p.status] || p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {p.provider === 'maquininha' && p.status === 'aguardando' && (
                      <button
                        onClick={() => confirmarPagamento(p)}
                        disabled={confirmando[p.id]}
                        className="px-3 py-1.5 bg-vallen-green hover:bg-vallen-greenLight disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors whitespace-nowrap"
                      >
                        {confirmando[p.id] ? '...' : '✓ Confirmar'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!lista.length && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-vallen-muted">Nenhum pedido encontrado</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

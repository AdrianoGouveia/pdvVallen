import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { PageHeader } from '../components/PageHeader.jsx'
import { Field, inputCls } from '../components/Field.jsx'

export function Clientes() {
  const [lista, setLista]         = useState([])
  const [filtro, setFiltro]       = useState('')
  const [expandido, setExpandido] = useState(null) // id do cliente expandido
  const [historico, setHistorico] = useState({})   // { clienteId: [pedidos] }
  const [loadingH, setLoadingH]   = useState({})

  useEffect(() => {
    supabase.from('clientes')
      .select('*')
      .order('created_at', { ascending: false })
      .then(({ data }) => setLista(data || []))
  }, [])

  const filtrado = lista.filter(c =>
    !filtro ||
    c.nome?.toLowerCase().includes(filtro.toLowerCase()) ||
    c.cpf?.includes(filtro) ||
    c.telefone?.includes(filtro)
  )

  async function toggleHistorico(clienteId) {
    if (expandido === clienteId) { setExpandido(null); return }
    setExpandido(clienteId)
    if (historico[clienteId]) return // já carregado

    setLoadingH(s => ({ ...s, [clienteId]: true }))
    const { data } = await supabase
      .from('pedidos')
      .select('id, total, status, provider, created_at')
      .eq('cliente_id', clienteId)
      .order('created_at', { ascending: false })
      .limit(20)
    setHistorico(s => ({ ...s, [clienteId]: data || [] }))
    setLoadingH(s => ({ ...s, [clienteId]: false }))
  }

  function idade(dn) {
    if (!dn) return '—'
    const d = new Date(dn), h = new Date()
    let a = h.getFullYear() - d.getFullYear()
    if (h < new Date(h.getFullYear(), d.getMonth(), d.getDate())) a--
    return a
  }

  const STATUS_CLS = {
    aprovado:   'text-green-400',
    aguardando: 'text-yellow-400',
    cancelado:  'text-red-400',
  }

  return (
    <div>
      <PageHeader title="Clientes" />
      <div className="px-6 py-4 flex gap-4 flex-wrap items-end">
        <Field label="Buscar">
          <input value={filtro} onChange={e => setFiltro(e.target.value)}
            placeholder="Nome, telefone ou CPF..." className={inputCls + ' w-64'} />
        </Field>
        <span className="text-sm text-vallen-muted pb-1">{filtrado.length} cliente(s)</span>
      </div>

      <div className="px-6 pb-6 space-y-2">
        {filtrado.map((c, idx) => {
          const anos   = idade(c.data_nascimento)
          const is18   = anos >= 18
          const aberto = expandido === (c.id ?? c.cpf)
          const cid    = c.id ?? c.cpf

          return (
            <div key={cid ?? idx} className="bg-vallen-card border border-vallen-border rounded-xl overflow-hidden">
              {/* Linha do cliente */}
              <div
                className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-vallen-dark/40 transition-colors"
                onClick={() => toggleHistorico(cid)}
              >
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-vallen-green/20 border border-vallen-green/30 flex items-center justify-center text-vallen-green font-bold text-base flex-shrink-0">
                  {c.nome?.charAt(0).toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-vallen-white">{c.nome}</p>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${is18 ? 'bg-green-900/40 text-green-400' : 'bg-amber-900/40 text-amber-400'}`}>
                      {anos !== '—' ? (is18 ? `+18 (${anos}a)` : `-18 (${anos}a)`) : '—'}
                    </span>
                  </div>
                  <div className="flex gap-3 mt-0.5 flex-wrap">
                    {c.telefone && <p className="text-xs text-vallen-muted font-mono">{c.telefone}</p>}
                    {c.cpf      && <p className="text-xs text-vallen-gray font-mono">CPF: {c.cpf}</p>}
                  </div>
                </div>

                <div className="text-right flex-shrink-0">
                  <p className="text-xs text-vallen-muted">{new Date(c.created_at).toLocaleDateString('pt-BR')}</p>
                  <p className="text-xs text-vallen-green mt-0.5">Ver compras {aberto ? '▲' : '▼'}</p>
                </div>
              </div>

              {/* Histórico de compras */}
              {aberto && (
                <div className="border-t border-vallen-border bg-vallen-dark/40 px-4 py-3">
                  {loadingH[cid] ? (
                    <p className="text-xs text-vallen-muted text-center py-2">Carregando...</p>
                  ) : !historico[cid]?.length ? (
                    <p className="text-xs text-vallen-muted text-center py-2">Nenhum pedido encontrado para este cliente.</p>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-xs text-vallen-muted font-medium mb-2">HISTÓRICO DE COMPRAS</p>
                      {historico[cid].map(p => (
                        <div key={p.id} className="flex items-center justify-between text-xs py-1.5 border-b border-vallen-border/30 last:border-0">
                          <span className="text-vallen-muted font-mono">#{p.id}</span>
                          <span className="text-vallen-muted">{new Date(p.created_at).toLocaleDateString('pt-BR')}</span>
                          <span className="text-vallen-muted">{p.provider === 'maquininha' ? '💳' : '📱'} {p.provider}</span>
                          <span className={`font-medium ${STATUS_CLS[p.status] || 'text-vallen-muted'}`}>{p.status}</span>
                          <span className="text-vallen-green font-bold">R$ {Number(p.total).toFixed(2)}</span>
                        </div>
                      ))}
                      <p className="text-xs text-vallen-muted text-right pt-1">
                        Total gasto: <span className="text-vallen-green font-bold">
                          R$ {historico[cid].filter(p => p.status === 'aprovado').reduce((a, p) => a + Number(p.total), 0).toFixed(2)}
                        </span>
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
        {!filtrado.length && (
          <div className="text-center py-12 text-vallen-muted">Nenhum cliente encontrado</div>
        )}
      </div>
    </div>
  )
}

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { PageHeader } from '../components/PageHeader.jsx'

const brl = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const num = (n) => (Number(n) || 0).toLocaleString('pt-BR')

function Card({ titulo, valor, sub, destaque }) {
  return (
    <div className={`rounded-xl border p-4 ${destaque ? 'border-vallen-green bg-vallen-green/10' : 'border-vallen-border bg-vallen-card'}`}>
      <p className="text-xs text-vallen-muted">{titulo}</p>
      <p className={`text-2xl font-bold mt-1 ${destaque ? 'text-vallen-green' : 'text-vallen-white'}`}>{valor}</p>
      {sub && <p className="text-xs text-vallen-muted mt-1">{sub}</p>}
    </div>
  )
}

export function RelatorioVendas() {
  const [linhas, setLinhas]   = useState([])
  const [loading, setLoading] = useState(true)
  const [de, setDe]           = useState('')
  const [ate, setAte]         = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.rpc('relatorio_vendas_loja', { p_de: de || null, p_ate: ate || null })
    setLinhas(error ? [] : (data || []))
    setLoading(false)
  }, [de, ate])
  useEffect(() => { load() }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  const tot = linhas.reduce((a, r) => ({
    vendas: a.vendas + Number(r.vendas_total),
    valor:  a.valor  + Number(r.valor_total),
    vallen: a.vallen + Number(r.valor_vallen),
    dwpdv:  a.dwpdv  + Number(r.valor_dwpdv),
  }), { vendas: 0, valor: 0, vallen: 0, dwpdv: 0 })
  const maxValor = Math.max(1, ...linhas.map(r => Number(r.valor_total)))

  const dateCls = 'bg-vallen-dark border border-vallen-border rounded-lg px-3 py-2 text-sm text-vallen-white'

  return (
    <div>
      <PageHeader title="Vendas por loja" />

      <div className="p-6 space-y-6">
        {/* período */}
        <div className="flex gap-3 items-end flex-wrap">
          <label className="text-xs text-vallen-muted">De<br /><input type="date" value={de} onChange={e => setDe(e.target.value)} className={dateCls} /></label>
          <label className="text-xs text-vallen-muted">Até<br /><input type="date" value={ate} onChange={e => setAte(e.target.value)} className={dateCls} /></label>
          <button onClick={load} className="bg-vallen-green hover:bg-vallen-greenLight text-white font-medium rounded-lg px-4 py-2 text-sm">Aplicar</button>
          {(de || ate) && <button onClick={() => { setDe(''); setAte(''); setTimeout(load, 0) }} className="text-vallen-muted text-sm underline">limpar</button>}
        </div>

        {/* resumo */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card titulo="Faturamento total" valor={brl(tot.valor)} sub={`${num(tot.vendas)} vendas`} destaque />
          <Card titulo="Vendas" valor={num(tot.vendas)} />
          <Card titulo="Vallen (Scan & Go)" valor={brl(tot.vallen)} />
          <Card titulo="DWPDV (PDV)" valor={brl(tot.dwpdv)} />
        </div>

        {/* por loja */}
        <div className="bg-vallen-card border border-vallen-border rounded-xl p-5">
          <p className="text-sm font-medium text-vallen-white mb-4">Por loja</p>
          {loading ? (
            <p className="text-vallen-muted text-center py-8">Carregando…</p>
          ) : !linhas.length ? (
            <p className="text-vallen-muted text-center py-8">Sem vendas no período.</p>
          ) : (
            <div className="space-y-4">
              {linhas.map(r => (
                <div key={r.unidade_id ?? 'na'}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className={`text-sm font-medium ${r.unidade_id ? 'text-vallen-white' : 'text-amber-400'}`}>{r.loja}</span>
                    <span className="text-vallen-white font-semibold tabular-nums">{brl(r.valor_total)}</span>
                  </div>
                  <div className="h-2.5 bg-vallen-dark rounded-full overflow-hidden mt-1.5 flex">
                    <div className="h-full bg-vallen-green" style={{ width: `${(Number(r.valor_vallen) / maxValor) * 100}%` }} title="Vallen" />
                    <div className="h-full bg-vallen-greenLight/60" style={{ width: `${(Number(r.valor_dwpdv) / maxValor) * 100}%` }} title="DWPDV" />
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-vallen-muted mt-1.5">
                    <span>{num(r.vendas_total)} vendas</span>
                    <span>· Vallen: {num(r.vendas_vallen)} ({brl(r.valor_vallen)})</span>
                    <span>· DWPDV: {num(r.vendas_dwpdv)} ({brl(r.valor_dwpdv)})</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {linhas.some(r => !r.unidade_id) && (
            <p className="text-xs text-amber-400/80 mt-4 border-t border-vallen-border pt-3">
              ⚠️ Vendas em <b>"(não atribuída)"</b> são do DWPDV cujo destino da maquininha ainda não foi cadastrado.
              Preencha o <b>Destino</b> em Condomínios → Editar → Maquininhas.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

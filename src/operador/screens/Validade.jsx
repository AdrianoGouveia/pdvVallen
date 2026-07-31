import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { tocarSucesso, tocarErro } from '../../mesa/utils/audio.js'
import { Header } from '../components/Header'
import { ScanBox } from '../components/ScanBox'
import { DateInput } from '../components/DateInput'

// Cor por urgência: vencido (vermelho) · ≤7 dias (laranja) · resto (neutro).
function corValidade(dias) {
  if (dias < 0)  return { cls: 'text-red-400',    tag: 'VENCIDO' }
  if (dias <= 7) return { cls: 'text-orange-400',  tag: `${dias}d` }
  return { cls: 'text-vallen-muted', tag: `${dias}d` }
}
const fmtData = d => { const [a, m, dia] = d.split('-'); return `${dia}/${m}/${a.slice(2)}` }

export function Validade({ unidadeId, unidadeNome, onVoltar }) {
  const [lista, setLista]     = useState(null)
  const [modo, setModo]       = useState('lista')  // 'lista' | 'scan' | 'form'
  const [produto, setProduto] = useState(null)
  const [data, setData]       = useState('')
  const [qtd, setQtd]         = useState('1')
  const [salvando, setSalvando] = useState(false)

  function carregar() {
    supabase.rpc('listar_validades', { p_unidade_id: unidadeId, p_dias: 30 })
      .then(({ data }) => setLista(data || []))
  }
  useEffect(() => { carregar() }, [unidadeId])

  function aoEscanear(row) {
    if (row.no_planograma) { tocarErro(); return }
    setProduto(row); setData(''); setQtd('1'); setModo('form')
  }

  async function salvar() {
    if (!data) { tocarErro(); return }
    const q = parseInt(qtd, 10) || 1
    setSalvando(true)
    const { error } = await supabase.rpc('registrar_validade', {
      p_unidade_id: unidadeId, p_produto_id: produto.produto_id,
      p_data_validade: data, p_quantidade: q,
    })
    setSalvando(false)
    if (error) { tocarErro(); alert(error.message); return }
    tocarSucesso()
    setProduto(null); setModo('lista'); carregar()
  }

  async function baixar(id) {
    await supabase.rpc('baixar_validade', { p_id: id })
    carregar()
  }

  // ---- formulário de registro
  if (modo === 'form' && produto) {
    return (
      <div className="flex flex-col h-full bg-vallen-dark">
        <Header titulo="Registrar validade" emoji="📅" unidadeNome={unidadeNome} onVoltar={() => setModo('scan')} />
        <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6">
          <div className="text-center">
            <span className="text-6xl">{produto.emoji || '📦'}</span>
            <p className="text-vallen-white font-bold text-2xl mt-3">{produto.nome}</p>
          </div>
          <label className="block w-full max-w-xs">
            <span className="text-vallen-white font-semibold">Vence em</span>
            <DateInput key={produto?.produto_id ?? 'v'} value={data} onChange={setData}
              className="mt-1 w-full bg-vallen-dark border-2 border-vallen-green rounded-xl px-4 py-3.5 text-xl text-vallen-white text-center focus:outline-none" />
          </label>
          <label className="block w-full max-w-xs">
            <span className="text-vallen-white font-semibold">Quantidade</span>
            <input value={qtd} onChange={e => setQtd(e.target.value.replace(/\D/g, ''))} inputMode="numeric"
              className="mt-1 w-full bg-vallen-dark border border-vallen-border rounded-xl px-4 py-3.5 text-xl text-vallen-white focus:outline-none focus:border-vallen-green" />
          </label>
        </div>
        <div className="p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] border-t border-vallen-border bg-vallen-black">
          <button onClick={salvar} disabled={salvando || !data}
            className="w-full py-4 bg-vallen-green disabled:opacity-40 text-white font-bold rounded-2xl text-lg">
            {salvando ? 'Salvando…' : 'Salvar validade'}
          </button>
        </div>
      </div>
    )
  }

  // ---- escaneando
  if (modo === 'scan') {
    return (
      <div className="flex flex-col h-full bg-vallen-dark">
        <Header titulo="Registrar validade" emoji="📅" unidadeNome={unidadeNome} onVoltar={() => setModo('lista')} />
        <ScanBox unidadeId={unidadeId} onProduto={aoEscanear}
          hint="Escaneie o produto para registrar a validade" />
      </div>
    )
  }

  // ---- lista de vencimentos
  return (
    <div className="flex flex-col h-full bg-vallen-dark">
      <Header titulo="Validade" emoji="📅" unidadeNome={unidadeNome} onVoltar={onVoltar} />
      <div className="flex-1 overflow-y-auto">
        {lista === null ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-4 border-vallen-green border-t-transparent rounded-full animate-spin" />
          </div>
        ) : lista.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-vallen-gray p-6 text-center">
            <span className="text-5xl">📅</span>
            <p>Nenhum produto vencendo nos próximos 30 dias</p>
          </div>
        ) : (
          <div className="divide-y divide-vallen-border">
            <p className="px-4 py-2 text-xs text-vallen-muted">Vencendo nos próximos 30 dias</p>
            {lista.map(v => {
              const c = corValidade(v.dias_restantes)
              return (
                <div key={v.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="text-2xl">{v.emoji || '📦'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-vallen-white font-medium truncate">{v.produto_nome}</p>
                    <p className="text-vallen-muted text-xs">{fmtData(v.data_validade)} · {v.quantidade} un.</p>
                  </div>
                  <span className={`font-black text-sm ${c.cls}`}>{c.tag}</span>
                  <button onClick={() => baixar(v.id)} aria-label="Dar baixa"
                    className="w-9 h-9 rounded-lg bg-vallen-card border border-vallen-border text-vallen-muted">✓</button>
                </div>
              )
            })}
          </div>
        )}
      </div>
      <div className="p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] border-t border-vallen-border bg-vallen-black">
        <button onClick={() => setModo('scan')}
          className="w-full py-4 bg-vallen-green text-white font-bold rounded-2xl text-lg">
          + Registrar validade
        </button>
      </div>
    </div>
  )
}

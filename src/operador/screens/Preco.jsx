import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { tocarSucesso, tocarErro } from '../../mesa/utils/audio.js'
import { Header } from '../components/Header'
import { ScanBox } from '../components/ScanBox'

const brl = v => `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`
const AJUSTES = [-10, -5, +5, +10]

// Ajuste de preço. Com alçada → aplica direto. Sem alçada → envia p/ o admin aprovar.
export function Preco({ unidadeId, unidadeNome, podeAjustarPreco, onVoltar }) {
  const [produto, setProduto] = useState(null)
  const [novo, setNovo]       = useState('')     // preço em string (reais)
  const [origem, setOrigem]   = useState('manual')
  const [salvando, setSalvando] = useState(false)
  const [resultado, setResultado] = useState(null)

  function aoEscanear(row) {
    if (row.no_planograma) {
      tocarErro()
      setResultado({ aviso: `${row.nome} não está no planograma desta loja. Cadastre primeiro.` })
      setTimeout(() => setResultado(null), 2600)
      return
    }
    setProduto(row)
    setNovo(Number(row.preco_venda).toFixed(2))
    setOrigem('manual')
  }

  function aplicarMarkup(pct) {
    const base = parseFloat(String(novo).replace(',', '.')) || Number(produto.preco_venda)
    const v = base * (1 + pct / 100)
    setNovo(v.toFixed(2))
    setOrigem('markup')
  }

  async function confirmar() {
    const preco = parseFloat(String(novo).replace(',', '.'))
    if (Number.isNaN(preco) || preco <= 0) { tocarErro(); return }
    setSalvando(true)
    const { data, error } = await supabase.rpc('solicitar_alteracao_preco', {
      p_unidade_id: unidadeId, p_produto_id: produto.produto_id,
      p_preco_novo: preco, p_origem: origem,
    })
    setSalvando(false)
    if (error) { tocarErro(); setResultado({ aviso: error.message }); setTimeout(() => setResultado(null), 2600); return }
    const row = Array.isArray(data) ? data[0] : data
    tocarSucesso()
    setResultado({ status: row.status, nome: produto.nome, preco })
    setProduto(null); setNovo('')
    setTimeout(() => setResultado(null), 2600)
  }

  // ---- card de resultado
  if (resultado) {
    if (resultado.aviso) {
      return (
        <div className="flex flex-col h-full bg-vallen-dark">
          <Header titulo="Ajustar preço" emoji="🏷️" unidadeNome={unidadeNome} onVoltar={onVoltar} />
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
            <span className="text-6xl">⚠️</span>
            <p className="text-vallen-white text-lg">{resultado.aviso}</p>
          </div>
        </div>
      )
    }
    const aplicado = resultado.status === 'aplicado'
    return (
      <div className="flex flex-col h-full bg-vallen-dark">
        <Header titulo="Ajustar preço" emoji="🏷️" unidadeNome={unidadeNome} onVoltar={onVoltar} />
        <div className={`flex-1 flex flex-col items-center justify-center gap-5 text-white p-6 ${aplicado ? 'bg-vallen-green' : 'bg-orange-500'}`}>
          <span className="text-7xl">{aplicado ? '✅' : '⏳'}</span>
          <p className="text-2xl font-bold text-center">{resultado.nome}</p>
          <p className="text-5xl font-black">{brl(resultado.preco)}</p>
          <p className="text-xl font-bold text-center">
            {aplicado ? 'Preço atualizado' : 'Enviado para o admin aprovar'}
          </p>
        </div>
      </div>
    )
  }

  // ---- painel de ajuste
  if (produto) {
    const precoNum = parseFloat(String(novo).replace(',', '.')) || 0
    const dif = precoNum - Number(produto.preco_venda)
    return (
      <div className="flex flex-col h-full bg-vallen-dark">
        <Header titulo="Ajustar preço" emoji="🏷️" unidadeNome={unidadeNome} onVoltar={() => setProduto(null)} />
        <div className="flex-1 flex flex-col items-center justify-center gap-5 p-6">
          <div className="text-center">
            <span className="text-6xl">{produto.emoji || '📦'}</span>
            <p className="text-vallen-white font-bold text-2xl mt-3">{produto.nome}</p>
            <p className="text-vallen-muted mt-1">Preço atual: <span className="line-through">{brl(produto.preco_venda)}</span></p>
          </div>

          <div className="text-center">
            <p className="text-vallen-muted text-sm mb-1">Novo preço</p>
            <div className="flex items-center gap-2 justify-center">
              <span className="text-vallen-white text-3xl font-bold">R$</span>
              <input value={novo} onChange={e => { setNovo(e.target.value.replace(/[^\d.,]/g, '')); setOrigem('manual') }}
                inputMode="decimal" autoFocus
                className="w-40 text-center bg-vallen-dark border-2 border-vallen-green rounded-2xl text-vallen-white text-4xl font-black py-2 focus:outline-none" />
            </div>
            {dif !== 0 && (
              <p className={`mt-2 font-bold ${dif > 0 ? 'text-vallen-green' : 'text-orange-400'}`}>
                {dif > 0 ? '↑' : '↓'} {brl(Math.abs(dif))}
              </p>
            )}
          </div>

          <div className="flex gap-2">
            {AJUSTES.map(p => (
              <button key={p} onClick={() => aplicarMarkup(p)}
                className="px-4 py-3 rounded-xl bg-vallen-card border border-vallen-border text-vallen-white font-bold text-base">
                {p > 0 ? `+${p}` : p}%
              </button>
            ))}
          </div>

          {!podeAjustarPreco && (
            <p className="text-center text-orange-400 text-sm px-4">
              Você não tem alçada — o preço vai para o admin aprovar.
            </p>
          )}
        </div>
        <div className="p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] border-t border-vallen-border bg-vallen-black">
          <button onClick={confirmar} disabled={salvando || precoNum <= 0}
            className="w-full py-4 bg-vallen-green disabled:opacity-40 text-white font-bold rounded-2xl text-lg">
            {salvando ? 'Salvando…' : podeAjustarPreco ? 'Salvar preço' : 'Enviar para aprovação'}
          </button>
        </div>
      </div>
    )
  }

  // ---- escaneando
  return (
    <div className="flex flex-col h-full bg-vallen-dark">
      <Header titulo="Ajustar preço" emoji="🏷️" unidadeNome={unidadeNome} onVoltar={onVoltar} />
      <ScanBox unidadeId={unidadeId} onProduto={aoEscanear}
        hint="Escaneie o produto para ver e mudar o preço" />
    </div>
  )
}

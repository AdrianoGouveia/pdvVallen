import { useState, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { tocarSucesso, tocarErro } from '../../mesa/utils/audio.js'
import { Header } from '../components/Header'
import { ScanBox } from '../components/ScanBox'
import { DateInput } from '../components/DateInput'

// Entrada de estoque — SOMA quantidade ao estoque (recebimento de mercadoria).
// Escaneia → mostra o estoque atual → quantidade recebida → soma. Validade opcional.
export function EntradaEstoque({ unidadeId, unidadeNome, onVoltar }) {
  const [produto, setProduto]     = useState(null)  // null = escaneando
  const [qtd, setQtd]             = useState('')
  const [validade, setValidade]   = useState('')
  const [salvando, setSalvando]   = useState(false)
  const [resultado, setResultado] = useState(null)
  const abertoRef = useRef(false) // já tem item aberto → ignora leitura zumbi

  function aoEscanear(row) {
    if (abertoRef.current) return
    if (row.no_planograma || !row.controla_estoque) {
      tocarErro()
      setResultado({ aviso: `${row.nome} não está no planograma desta loja (ou não controla estoque). Cadastre primeiro.` })
      setTimeout(() => setResultado(null), 2800)
      return
    }
    abertoRef.current = true
    setProduto(row); setQtd(''); setValidade(''); setResultado(null)
  }

  function fechar(res) {
    abertoRef.current = false
    setResultado(res); setProduto(null); setQtd(''); setValidade('')
    setTimeout(() => setResultado(null), 2400)
  }

  async function confirmar() {
    const n = parseInt(qtd, 10)
    if (Number.isNaN(n) || n <= 0) { tocarErro(); return }
    setSalvando(true)
    const { data, error } = await supabase.rpc('registrar_entrada', {
      p_unidade_id: unidadeId, p_produto_id: produto.produto_id, p_qtd: n, p_validade: validade || null,
    })
    setSalvando(false)
    if (error) { tocarErro(); alert(error.message); return }
    const novo = Array.isArray(data) ? data[0] : data
    tocarSucesso()
    fechar({ nome: produto.nome, qtd: n, novo })
  }

  // ---- card de resultado
  if (resultado) {
    if (resultado.aviso) {
      return (
        <div className="flex flex-col h-full bg-vallen-dark">
          <Header titulo="Entrada de estoque" emoji="📥" unidadeNome={unidadeNome} onVoltar={onVoltar} />
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
            <span className="text-6xl">⚠️</span><p className="text-vallen-white text-lg">{resultado.aviso}</p>
          </div>
        </div>
      )
    }
    return (
      <div className="flex flex-col h-full bg-vallen-dark">
        <Header titulo="Entrada de estoque" emoji="📥" unidadeNome={unidadeNome} onVoltar={onVoltar} />
        <button onClick={() => setResultado(null)} className="flex-1 flex flex-col items-center justify-center gap-5 text-white bg-vallen-green p-6">
          <span className="text-7xl">📥</span>
          <p className="text-2xl font-bold text-center">{resultado.nome}</p>
          <p className="text-4xl font-black">+{resultado.qtd}</p>
          <p className="text-xl font-bold">Estoque agora: {resultado.novo}</p>
          <span className="text-sm opacity-80 mt-2">toque para continuar</span>
        </button>
      </div>
    )
  }

  // ---- painel de entrada
  if (produto) {
    return (
      <div className="flex flex-col h-full bg-vallen-dark">
        <Header titulo="Entrada de estoque" emoji="📥" unidadeNome={unidadeNome}
          onVoltar={() => { abertoRef.current = false; setProduto(null) }} />
        <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6">
          <div className="text-center">
            <span className="text-6xl">{produto.emoji || '📦'}</span>
            <p className="text-vallen-white font-bold text-2xl mt-3">{produto.nome}</p>
          </div>

          <div className="text-center bg-vallen-card border border-vallen-border rounded-2xl px-8 py-4">
            <p className="text-vallen-muted text-sm">Estoque atual</p>
            <p className="text-vallen-white text-5xl font-black tabular-nums">{produto.quantidade ?? 0}</p>
          </div>

          <div className="w-full">
            <p className="text-center text-vallen-muted text-base mb-2">Quantas chegaram?</p>
            <div className="flex items-center gap-3 justify-center">
              <button onClick={() => setQtd(q => String(Math.max(0, (parseInt(q, 10) || 0) - 1)))}
                className="w-16 h-16 rounded-2xl bg-vallen-card border border-vallen-border text-vallen-white text-3xl font-bold">−</button>
              <input value={qtd} onChange={e => setQtd(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="0" autoFocus
                className="w-28 h-16 text-center bg-vallen-dark border-2 border-vallen-green rounded-2xl text-vallen-white text-4xl font-black focus:outline-none" />
              <button onClick={() => setQtd(q => String((parseInt(q, 10) || 0) + 1))}
                className="w-16 h-16 rounded-2xl bg-vallen-card border border-vallen-border text-vallen-white text-3xl font-bold">+</button>
            </div>
          </div>

          <div className="w-full max-w-xs">
            <span className="block text-center text-vallen-muted text-sm mb-1">Validade (opcional)</span>
            <DateInput key={produto.produto_id} value={validade} onChange={setValidade}
              className="w-full bg-vallen-dark border border-vallen-border rounded-2xl px-4 py-3 text-base text-vallen-white text-center focus:outline-none focus:border-vallen-green" />
          </div>
        </div>
        <div className="p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] border-t border-vallen-border bg-vallen-black">
          <button onClick={confirmar} disabled={salvando || qtd === '' || parseInt(qtd, 10) <= 0}
            className="w-full py-4 bg-vallen-green disabled:opacity-40 text-white font-bold rounded-2xl text-lg">
            {salvando ? 'Salvando…' : `Dar entrada${qtd ? ` (+${qtd})` : ''}`}
          </button>
        </div>
      </div>
    )
  }

  // ---- escaneando
  return (
    <div className="flex flex-col h-full bg-vallen-dark">
      <Header titulo="Entrada de estoque" emoji="📥" unidadeNome={unidadeNome} onVoltar={onVoltar} />
      <ScanBox unidadeId={unidadeId} onProduto={aoEscanear} hint="Escaneie o produto que chegou" />
    </div>
  )
}

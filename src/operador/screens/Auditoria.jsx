import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { tocarSucesso, tocarErro } from '../../mesa/utils/audio.js'
import { Header } from '../components/Header'
import { ScanBox } from '../components/ScanBox'

// Auditoria de estoque — contagem NÃO-destrutiva com divergência.
// Conta → bateu (conferido) | divergiu → 2ª contagem → confirma → gerente valida.
// Nada muda no estoque aqui; só a aprovação do gerente ajusta.
export function Auditoria({ unidadeId, unidadeNome, onVoltar }) {
  const [contagemId, setContagemId] = useState(null)
  const [erroInit, setErroInit]     = useState('')
  const [produto, setProduto]       = useState(null)   // null = escaneando
  const [fase, setFase]             = useState('contar') // 'contar' | 'recontar'
  const [primeira, setPrimeira]     = useState(null)   // {contada} da 1ª contagem
  const [qtd, setQtd]               = useState('')
  const [resultado, setResultado]   = useState(null)   // card de fim
  const [salvando, setSalvando]     = useState(false)
  const [contados, setContados]     = useState(0)

  useEffect(() => {
    supabase.rpc('abrir_contagem', { p_unidade_id: unidadeId })
      .then(({ data, error }) => {
        if (error) setErroInit(error.message || 'Falha ao abrir contagem')
        else setContagemId(data)
      })
  }, [unidadeId])

  function aoEscanear(row) {
    setProduto(row); setFase('contar'); setPrimeira(null); setQtd(''); setResultado(null)
  }

  async function confirmar() {
    const n = parseInt(qtd, 10)
    if (Number.isNaN(n) || n < 0) { tocarErro(); return }
    setSalvando(true)
    if (fase === 'contar') {
      const { data, error } = await supabase.rpc('registrar_contagem_item', {
        p_contagem_id: contagemId, p_produto_id: produto.produto_id, p_qtd_contada: n,
      })
      setSalvando(false)
      if (error) { tocarErro(); alert(error.message); return }
      const r = Array.isArray(data) ? data[0] : data
      setContados(c => c + 1)
      if (r.status === 'divergente') {
        // pede 2ª contagem
        tocarErro()
        setPrimeira({ contada: r.qtd_contada, sistema: r.qtd_sistema })
        setFase('recontar'); setQtd('')
        return
      }
      tocarSucesso()
      fecharComResultado({ tipo: 'ok', nome: produto.nome, sistema: r.qtd_sistema, contada: r.qtd_contada })
    } else {
      const { data, error } = await supabase.rpc('recontar_item', {
        p_contagem_id: contagemId, p_produto_id: produto.produto_id, p_qtd_recontada: n,
      })
      setSalvando(false)
      if (error) { tocarErro(); alert(error.message); return }
      const r = Array.isArray(data) ? data[0] : data
      if (r.status === 'conferido') {
        tocarSucesso()
        fecharComResultado({ tipo: 'ok', nome: produto.nome, sistema: r.qtd_sistema, contada: r.qtd_recontada })
      } else {
        tocarSucesso()
        fecharComResultado({ tipo: 'gerente', nome: produto.nome, sistema: r.qtd_sistema, contada: r.qtd_recontada })
      }
    }
  }

  function fecharComResultado(res) {
    setResultado(res); setProduto(null); setFase('contar'); setPrimeira(null); setQtd('')
    setTimeout(() => setResultado(null), 2400)
  }

  // ---- card de resultado
  if (resultado) {
    const gerente = resultado.tipo === 'gerente'
    const bg = gerente ? 'bg-orange-500' : 'bg-vallen-green'
    return (
      <div className="flex flex-col h-full bg-vallen-dark">
        <Header titulo="Conferir estoque" emoji="📋" unidadeNome={unidadeNome} onVoltar={onVoltar} />
        <button onClick={() => setResultado(null)} className={`flex-1 flex flex-col items-center justify-center gap-5 text-white ${bg} p-6`}>
          <span className="text-7xl">{gerente ? '📤' : '✅'}</span>
          <p className="text-2xl font-bold text-center">{resultado.nome}</p>
          <div className="flex items-center gap-5 text-center">
            <div><p className="text-sm opacity-80">Sistema</p><p className="text-5xl font-black tabular-nums">{resultado.sistema ?? '—'}</p></div>
            <span className="text-4xl opacity-80">→</span>
            <div><p className="text-sm opacity-80">Contado</p><p className="text-5xl font-black tabular-nums">{resultado.contada}</p></div>
          </div>
          <p className="text-2xl font-black text-center">
            {gerente ? 'Divergência enviada pro gerente validar' : 'Bateu certinho'}
          </p>
          <span className="text-sm opacity-80 mt-2">toque para continuar</span>
        </button>
      </div>
    )
  }

  // ---- painel de contagem / recontagem
  if (produto) {
    const recontar = fase === 'recontar'
    const semControle = produto.no_planograma || !produto.controla_estoque
    return (
      <div className="flex flex-col h-full bg-vallen-dark">
        <Header titulo={recontar ? 'Conte de novo' : 'Conferir estoque'} emoji="📋" unidadeNome={unidadeNome}
          onVoltar={() => { setProduto(null); setFase('contar') }} />
        <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6">
          <div className="text-center">
            <span className="text-6xl">{produto.emoji || '📦'}</span>
            <p className="text-vallen-white font-bold text-2xl mt-3">{produto.nome}</p>
          </div>

          {recontar ? (
            <div className="text-center bg-orange-500/15 border border-orange-500/40 rounded-2xl px-6 py-4">
              <p className="text-orange-300 text-sm font-semibold">Deu diferente. Conte de novo com calma.</p>
              <p className="text-vallen-muted text-xs mt-1">1ª contagem: {primeira?.contada}</p>
            </div>
          ) : (
            <div className="text-center bg-vallen-card border border-vallen-border rounded-2xl px-8 py-4">
              <p className="text-vallen-muted text-sm">No sistema tem</p>
              <p className="text-vallen-white text-5xl font-black tabular-nums">{semControle ? '—' : produto.quantidade}</p>
              {produto.no_planograma && <p className="text-orange-400 text-xs mt-1">fora do planograma desta loja</p>}
            </div>
          )}

          <div className="w-full">
            <p className="text-center text-vallen-muted text-base mb-2">Quantas você contou?</p>
            <div className="flex items-center gap-3 justify-center">
              <button onClick={() => setQtd(q => String(Math.max(0, (parseInt(q, 10) || 0) - 1)))}
                className="w-16 h-16 rounded-2xl bg-vallen-card border border-vallen-border text-vallen-white text-3xl font-bold">−</button>
              <input value={qtd} onChange={e => setQtd(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="0" autoFocus
                className="w-28 h-16 text-center bg-vallen-dark border-2 border-vallen-green rounded-2xl text-vallen-white text-4xl font-black focus:outline-none" />
              <button onClick={() => setQtd(q => String((parseInt(q, 10) || 0) + 1))}
                className="w-16 h-16 rounded-2xl bg-vallen-card border border-vallen-border text-vallen-white text-3xl font-bold">+</button>
            </div>
          </div>
        </div>
        <div className="p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] border-t border-vallen-border bg-vallen-black">
          <button onClick={confirmar} disabled={salvando || qtd === ''}
            className="w-full py-4 bg-vallen-green disabled:opacity-40 text-white font-bold rounded-2xl text-lg">
            {salvando ? 'Salvando…' : recontar ? 'Confirmar 2ª contagem' : 'Confirmar contagem'}
          </button>
        </div>
      </div>
    )
  }

  // ---- escaneando
  return (
    <div className="flex flex-col h-full bg-vallen-dark">
      <Header titulo="Conferir estoque" emoji="📋" unidadeNome={unidadeNome} onVoltar={onVoltar} />
      {erroInit ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
          <span className="text-5xl">⚠️</span><p className="text-red-400">{erroInit}</p>
        </div>
      ) : !contagemId ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-10 h-10 border-4 border-vallen-green border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <ScanBox unidadeId={unidadeId} onProduto={aoEscanear} hint="Escaneie um produto para conferir" />
          {contados > 0 && (
            <div className="px-4 py-2 text-center text-vallen-muted text-sm bg-vallen-black border-t border-vallen-border flex-shrink-0">
              {contados} {contados === 1 ? 'item conferido' : 'itens conferidos'} nesta contagem
            </div>
          )}
        </>
      )}
    </div>
  )
}

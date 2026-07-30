import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { tocarSucesso, tocarErro } from '../../mesa/utils/audio.js'
import { Header } from '../components/Header'
import { ScanBox } from '../components/ScanBox'

// Auditoria de estoque — sessão de contagem NÃO-destrutiva.
// Escaneia → mostra o que o sistema tem → conta → mostra a diferença (cor + seta).
// Nada muda no estoque até "Aplicar contagem".
export function Auditoria({ unidadeId, unidadeNome, onVoltar }) {
  const [contagemId, setContagemId] = useState(null)
  const [erroInit, setErroInit]     = useState('')
  const [produto, setProduto]       = useState(null)   // null = escaneando
  const [qtd, setQtd]               = useState('')
  const [resultado, setResultado]   = useState(null)   // card de diferença
  const [salvando, setSalvando]     = useState(false)
  const [contados, setContados]     = useState(0)
  const [revisao, setRevisao]       = useState(null)   // null | array de itens
  const [aplicando, setAplicando]   = useState(false)

  useEffect(() => {
    supabase.rpc('abrir_contagem', { p_unidade_id: unidadeId })
      .then(({ data, error }) => {
        if (error) setErroInit(error.message || 'Falha ao abrir contagem')
        else setContagemId(data)
      })
  }, [unidadeId])

  function aoEscanear(row) {
    setProduto(row)
    setQtd('')
    setResultado(null)
  }

  async function confirmar() {
    const n = parseInt(qtd, 10)
    if (Number.isNaN(n) || n < 0) { tocarErro(); return }
    setSalvando(true)
    const { data, error } = await supabase.rpc('registrar_contagem_item', {
      p_contagem_id: contagemId, p_produto_id: produto.produto_id, p_qtd_contada: n,
    })
    setSalvando(false)
    if (error) { tocarErro(); setResultado({ erro: error.message }); return }
    const r = Array.isArray(data) ? data[0] : data
    tocarSucesso()
    setContados(c => c + 1)
    setResultado({
      nome: produto.nome, emoji: produto.emoji,
      sistema: r.qtd_sistema, contada: r.qtd_contada, diff: r.diferenca,
    })
    setProduto(null); setQtd('')
    setTimeout(() => setResultado(null), 2200)
  }

  async function abrirRevisao() {
    const { data } = await supabase.rpc('listar_contagem_itens', { p_contagem_id: contagemId })
    setRevisao(data || [])
  }

  async function aplicar() {
    setAplicando(true)
    const { error } = await supabase.rpc('aplicar_contagem', { p_contagem_id: contagemId })
    setAplicando(false)
    if (error) { tocarErro(); alert(error.message); return }
    tocarSucesso()
    onVoltar()
  }

  // ---- tela de revisão + aplicar
  if (revisao) {
    return (
      <div className="flex flex-col h-full bg-vallen-dark">
        <Header titulo="Revisar contagem" emoji="📋" unidadeNome={unidadeNome} onVoltar={() => setRevisao(null)} />
        <div className="flex-1 overflow-y-auto divide-y divide-vallen-border">
          {revisao.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-vallen-gray">
              <span className="text-4xl">📭</span><p>Nenhum item contado ainda</p>
            </div>
          )}
          {revisao.map(it => {
            const d = it.diferenca
            const cor = d === 0 ? 'text-vallen-green' : d < 0 ? 'text-red-400' : 'text-orange-400'
            const seta = d === 0 ? '=' : d < 0 ? '↓' : '↑'
            return (
              <div key={it.produto_id} className="flex items-center gap-3 px-4 py-3">
                <span className="text-2xl">{it.emoji || '📦'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-vallen-white font-medium truncate">{it.produto_nome}</p>
                  <p className="text-vallen-muted text-xs">
                    Sistema {it.qtd_sistema ?? '—'} · Contado {it.qtd_contada}
                  </p>
                </div>
                <span className={`font-black text-lg ${cor}`}>{seta} {d === 0 ? '' : Math.abs(d)}</span>
              </div>
            )
          })}
        </div>
        <div className="p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] border-t border-vallen-border bg-vallen-black">
          <button onClick={aplicar} disabled={aplicando || revisao.length === 0}
            className="w-full py-4 bg-vallen-green disabled:opacity-40 text-white font-bold rounded-2xl text-lg">
            {aplicando ? 'Aplicando…' : `Aplicar contagem (${revisao.length})`}
          </button>
          <p className="text-center text-vallen-muted text-xs mt-2">Isso atualiza o estoque do sistema.</p>
        </div>
      </div>
    )
  }

  // ---- card de diferença (pós-confirmação)
  if (resultado && !resultado.erro) {
    const d = resultado.diff
    const ok = d === 0
    const falta = d < 0
    const bg = ok ? 'bg-vallen-green' : falta ? 'bg-red-600' : 'bg-orange-500'
    return (
      <div className="flex flex-col h-full bg-vallen-dark">
        <Header titulo="Conferir estoque" emoji="📋" unidadeNome={unidadeNome} onVoltar={onVoltar} />
        <button onClick={() => setResultado(null)}
          className={`flex-1 flex flex-col items-center justify-center gap-5 text-white ${bg} p-6`}>
          <span className="text-7xl">{ok ? '✅' : falta ? '⬇️' : '⬆️'}</span>
          <p className="text-2xl font-bold text-center">{resultado.nome}</p>
          <div className="flex items-center gap-5 text-center">
            <div><p className="text-sm opacity-80">Sistema</p><p className="text-5xl font-black tabular-nums">{resultado.sistema ?? '—'}</p></div>
            <span className="text-4xl opacity-80">→</span>
            <div><p className="text-sm opacity-80">Contado</p><p className="text-5xl font-black tabular-nums">{resultado.contada}</p></div>
          </div>
          <p className="text-3xl font-black">
            {ok ? 'Bateu certinho' : falta ? `Faltou ${Math.abs(d)}` : `Sobrou ${d}`}
          </p>
          <span className="text-sm opacity-80 mt-2">toque para continuar</span>
        </button>
      </div>
    )
  }

  // ---- painel de contagem (produto escaneado)
  if (produto) {
    const semControle = produto.no_planograma || !produto.controla_estoque
    return (
      <div className="flex flex-col h-full bg-vallen-dark">
        <Header titulo="Conferir estoque" emoji="📋" unidadeNome={unidadeNome} onVoltar={() => setProduto(null)} />
        <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6">
          <div className="text-center">
            <span className="text-6xl">{produto.emoji || '📦'}</span>
            <p className="text-vallen-white font-bold text-2xl mt-3">{produto.nome}</p>
          </div>

          <div className="text-center bg-vallen-card border border-vallen-border rounded-2xl px-8 py-4">
            <p className="text-vallen-muted text-sm">No sistema tem</p>
            <p className="text-vallen-white text-5xl font-black tabular-nums">
              {semControle ? '—' : produto.quantidade}
            </p>
            {produto.no_planograma && <p className="text-orange-400 text-xs mt-1">fora do planograma desta loja</p>}
          </div>

          <div className="w-full">
            <p className="text-center text-vallen-muted text-base mb-2">Quantas você contou?</p>
            <div className="flex items-center gap-3 justify-center">
              <button onClick={() => setQtd(q => String(Math.max(0, (parseInt(q, 10) || 0) - 1)))}
                className="w-16 h-16 rounded-2xl bg-vallen-card border border-vallen-border text-vallen-white text-3xl font-bold">−</button>
              <input value={qtd} onChange={e => setQtd(e.target.value.replace(/\D/g, ''))}
                inputMode="numeric" placeholder="0" autoFocus
                className="w-28 h-16 text-center bg-vallen-dark border-2 border-vallen-green rounded-2xl text-vallen-white text-4xl font-black focus:outline-none" />
              <button onClick={() => setQtd(q => String((parseInt(q, 10) || 0) + 1))}
                className="w-16 h-16 rounded-2xl bg-vallen-card border border-vallen-border text-vallen-white text-3xl font-bold">+</button>
            </div>
          </div>
        </div>
        <div className="p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] border-t border-vallen-border bg-vallen-black">
          <button onClick={confirmar} disabled={salvando || qtd === ''}
            className="w-full py-4 bg-vallen-green disabled:opacity-40 text-white font-bold rounded-2xl text-lg">
            {salvando ? 'Salvando…' : 'Confirmar contagem'}
          </button>
        </div>
      </div>
    )
  }

  // ---- estado: escaneando
  return (
    <div className="flex flex-col h-full bg-vallen-dark">
      <Header titulo="Conferir estoque" emoji="📋" unidadeNome={unidadeNome} onVoltar={onVoltar} />
      {erroInit ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
          <span className="text-5xl">⚠️</span>
          <p className="text-red-400">{erroInit}</p>
        </div>
      ) : !contagemId ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-10 h-10 border-4 border-vallen-green border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <ScanBox unidadeId={unidadeId} onProduto={aoEscanear}
            hint="Escaneie um produto para conferir" />
          {contados > 0 && (
            <div className="p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] border-t border-vallen-border bg-vallen-black">
              <button onClick={abrirRevisao}
                className="w-full py-4 bg-vallen-card border border-vallen-border text-vallen-white font-bold rounded-2xl text-base">
                Revisar e aplicar ({contados})
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

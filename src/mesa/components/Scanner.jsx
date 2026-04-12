import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { supabase } from '../../lib/supabase'
import { desbloquearAudio, tocarSucesso, tocarErro } from '../utils/audio.js'

export function Scanner({ onScan, cart, setCart, onFinalizar, onVoltar }) {
  const videoRef  = useRef(null)
  const readerRef = useRef(null)
  const lastRef   = useRef('')
  const [feedback, setFeedback] = useState(null)
  const [manual, setManual]     = useState('')
  const [loading, setLoading]   = useState(true)
  const [semCamera, setSemCamera] = useState(false)

  const total = cart.reduce((a, i) => a + i.preco * i.quantidade, 0)

  useEffect(() => {
    // Desbloqueia áudio ao entrar na tela do scanner
    desbloquearAudio()

    const reader = new BrowserMultiFormatReader()
    readerRef.current = reader

    reader.decodeFromConstraints(
      { video: { facingMode: 'environment' } },
      videoRef.current,
      (result) => {
        if (!result) return
        const code = result.getText()
        if (code === lastRef.current) return
        lastRef.current = code
        setTimeout(() => { lastRef.current = '' }, 2500)
        buscarProduto(code)
      }
    )
      .then(() => setLoading(false))
      .catch(() => { setLoading(false); setSemCamera(true) })

    return () => { try { reader.reset() } catch (_) {} }
  }, [])

  async function buscarProduto(codigo) {
    const { data } = await supabase
      .from('produtos')
      .select('id,nome,preco,restrito_idade,imagem_url,categoria,estoque')
      .eq('codigo_barras', codigo)
      .single()

    if (!data) {
      tocarErro()
      setFeedback({ tipo: 'err', msg: 'Produto não encontrado' })
    } else {
      tocarSucesso()
      onScan(data)
      setFeedback({ tipo: 'ok', msg: `+ ${data.nome}` })
    }
    setTimeout(() => setFeedback(null), 2000)
  }

  async function handleManual(e) {
    e.preventDefault()
    if (!manual.trim()) return
    await buscarProduto(manual.trim())
    setManual('')
  }

  function inc(id) { setCart(p => p.map(i => i.id === id ? { ...i, quantidade: i.quantidade + 1 } : i)) }
  function dec(id) { setCart(p => p.map(i => i.id === id ? { ...i, quantidade: i.quantidade - 1 } : i).filter(i => i.quantidade > 0)) }

  return (
    <div className="flex-1 flex flex-col overflow-hidden" onTouchStart={desbloquearAudio}>

      {/* Scanner quadrado */}
      <div className="relative bg-black flex-shrink-0" style={{ aspectRatio: '4/3', maxHeight: '60vw' }}>
        <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" muted playsInline />

        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black gap-3">
            <div className="w-10 h-10 border-4 border-vallen-green border-t-transparent rounded-full animate-spin" />
            <p className="text-white/60 text-sm">Iniciando câmera...</p>
          </div>
        )}

        {semCamera && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 gap-3 p-4">
            <div className="text-5xl">📷</div>
            <p className="text-white text-center text-sm">Câmera indisponível.<br/>Use o campo abaixo.</p>
          </div>
        )}

        {/* Mira com cantos */}
        {!loading && !semCamera && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-48 h-32">
              <span className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-vallen-green rounded-tl-md" />
              <span className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-vallen-green rounded-tr-md" />
              <span className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-vallen-green rounded-bl-md" />
              <span className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-vallen-green rounded-br-md" />
              <div className="absolute left-2 right-2 h-0.5 bg-vallen-green/80 animate-scan" style={{ top: '50%' }} />
            </div>
          </div>
        )}

        {/* Feedback sobreposto */}
        {feedback && (
          <div className={`absolute bottom-2 left-2 right-2 rounded-xl px-4 py-2.5 flex items-center gap-2
            ${feedback.tipo === 'ok' ? 'bg-vallen-green' : 'bg-red-600'}`}>
            <span className="text-xl">{feedback.tipo === 'ok' ? '✅' : '❌'}</span>
            <p className="text-white font-semibold text-sm truncate">{feedback.msg}</p>
          </div>
        )}
      </div>

      {/* Input manual */}
      <form onSubmit={handleManual}
        className="flex gap-2 px-3 py-2 bg-vallen-black border-b border-vallen-border flex-shrink-0">
        <input
          value={manual}
          onChange={e => setManual(e.target.value)}
          placeholder="Digitar código manualmente..."
          inputMode="numeric"
          className="flex-1 bg-vallen-dark border border-vallen-border rounded-xl px-3 py-2.5 text-sm text-vallen-white focus:outline-none focus:border-vallen-green"
        />
        <button type="submit"
          className="px-4 py-2.5 bg-vallen-green text-white rounded-xl text-sm font-bold">
          OK
        </button>
      </form>

      {/* Lista de itens */}
      <div className="flex-1 overflow-y-auto">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-vallen-gray">
            <span className="text-4xl">📦</span>
            <p className="text-sm">Escaneie um produto para começar</p>
          </div>
        ) : (
          <div className="divide-y divide-vallen-border">
            {cart.map(item => (
              <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-vallen-white truncate">{item.nome}</p>
                  <p className="text-xs text-vallen-muted">R$ {Number(item.preco).toFixed(2)} un.</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => dec(item.id)}
                    className="w-7 h-7 rounded-full bg-vallen-dark border border-vallen-border text-vallen-white font-bold flex items-center justify-center">
                    −
                  </button>
                  <span className="w-5 text-center text-vallen-white font-bold text-sm">{item.quantidade}</span>
                  <button onClick={() => inc(item.id)}
                    className="w-7 h-7 rounded-full bg-vallen-green text-white font-bold flex items-center justify-center">
                    +
                  </button>
                </div>
                <p className="w-16 text-right text-sm font-bold text-vallen-green flex-shrink-0">
                  R$ {(item.preco * item.quantidade).toFixed(2)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Rodapé */}
      <div className="bg-vallen-black border-t border-vallen-border px-4 py-3 space-y-2 flex-shrink-0">
        <div className="flex justify-between items-center">
          <span className="text-vallen-muted text-sm">{cart.reduce((a, i) => a + i.quantidade, 0)} itens</span>
          <span className="text-2xl font-black text-vallen-green">R$ {total.toFixed(2)}</span>
        </div>
        <div className="flex gap-2">
          <button onClick={onVoltar}
            className="px-4 py-3 bg-vallen-card border border-vallen-border text-vallen-muted rounded-xl text-sm">
            ← Loja
          </button>
          <button
            onClick={onFinalizar}
            disabled={cart.length === 0}
            className="flex-1 py-3 bg-vallen-green hover:bg-vallen-greenLight disabled:opacity-40 text-white font-bold rounded-xl text-sm transition-colors">
            Finalizar compra →
          </button>
        </div>
      </div>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { supabase } from '../../lib/supabase'

export function Scanner({ unidadeId, onScan }) {
  const videoRef  = useRef(null)
  const readerRef = useRef(null)
  const lastRef   = useRef('')
  const [feedback, setFeedback] = useState(null) // { tipo: 'ok'|'err', msg, produto }
  const [manual, setManual]     = useState('')
  const [loading, setLoading]   = useState(true)
  const [semCamera, setSemCamera] = useState(false)

  useEffect(() => {
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
      setFeedback({ tipo: 'err', msg: 'Produto não encontrado' })
    } else {
      onScan(data)
      setFeedback({ tipo: 'ok', msg: data.nome, preco: data.preco })
      tocarBeep()
    }
    setTimeout(() => setFeedback(null), 2500)
  }

  async function handleManual(e) {
    e.preventDefault()
    if (!manual.trim()) return
    await buscarProduto(manual.trim())
    setManual('')
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">

      {/* Área da câmera */}
      <div className="relative flex-1 bg-black overflow-hidden">
        <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />

        {/* Loading */}
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black gap-3">
            <div className="w-12 h-12 border-4 border-vallen-green border-t-transparent rounded-full animate-spin" />
            <p className="text-white/60 text-sm">Iniciando câmera...</p>
          </div>
        )}

        {/* Sem câmera */}
        {semCamera && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 gap-4 p-6">
            <div className="text-5xl">📷</div>
            <p className="text-white text-center font-medium">Câmera não disponível</p>
            <p className="text-white/50 text-sm text-center">Use o campo abaixo para digitar o código</p>
          </div>
        )}

        {/* Moldura mira */}
        {!loading && !semCamera && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-4">
            <div className="relative w-72 h-48">
              {/* Cantos */}
              <span className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-vallen-green rounded-tl-lg" />
              <span className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-vallen-green rounded-tr-lg" />
              <span className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-vallen-green rounded-bl-lg" />
              <span className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-vallen-green rounded-br-lg" />
              {/* Linha de scan animada */}
              <div className="absolute left-2 right-2 h-0.5 bg-vallen-green/70 animate-scan" style={{ top: '50%' }} />
            </div>
            <p className="text-white/60 text-sm">Aponte para o código de barras</p>
          </div>
        )}

        {/* Feedback */}
        {feedback && (
          <div className={`absolute bottom-20 left-4 right-4 rounded-2xl px-5 py-4 flex items-center gap-3 shadow-2xl transition-all
            ${feedback.tipo === 'ok' ? 'bg-vallen-green' : 'bg-red-600'}`}>
            <span className="text-3xl">{feedback.tipo === 'ok' ? '✅' : '❌'}</span>
            <div>
              <p className="text-white font-bold text-base leading-tight">{feedback.msg}</p>
              {feedback.preco != null && (
                <p className="text-white/80 text-sm">R$ {Number(feedback.preco).toFixed(2)} adicionado</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Input manual */}
      <form onSubmit={handleManual}
        className="flex gap-2 px-4 py-3 bg-vallen-black border-t border-vallen-border">
        <input
          value={manual}
          onChange={e => setManual(e.target.value)}
          placeholder="Digitar código manualmente..."
          inputMode="numeric"
          className="flex-1 bg-vallen-dark border border-vallen-border rounded-xl px-4 py-3 text-sm text-vallen-white focus:outline-none focus:border-vallen-green"
        />
        <button type="submit"
          className="px-5 py-3 bg-vallen-green text-white rounded-xl text-sm font-bold">
          OK
        </button>
      </form>
    </div>
  )
}

function tocarBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.connect(g); g.connect(ctx.destination)
    o.type = 'sine'; o.frequency.value = 880
    g.gain.setValueAtTime(0.3, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15)
    o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.15)
  } catch (_) {}
}

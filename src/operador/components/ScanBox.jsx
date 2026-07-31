import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatOneDReader } from '@zxing/browser'
import { BarcodeFormat, DecodeHintType } from '@zxing/library'
import { supabase } from '../../lib/supabase'
import { desbloquearAudio, tocarSucesso, tocarErro } from '../../mesa/utils/audio.js'

// Scanner de leitura única — reusa a config rápida do Scan & Go (só decoders 1D,
// intervalo curto). Resolve produto + planograma via RPC buscar_produto_operador.
//   onProduto(row, codigo)     → achou no catálogo da unidade
//   onDesconhecido(codigo)     → código não está no catálogo (ex.: cadastro novo)
export function ScanBox({ unidadeId, onProduto, onDesconhecido, hint }) {
  const videoRef  = useRef(null)
  const readerRef = useRef(null)
  const streamRef = useRef(null)
  const mountedRef = useRef(true)
  const lastRef   = useRef('')
  const [feedback, setFeedback] = useState(null)
  const [manual, setManual]     = useState('')
  const [loading, setLoading]   = useState(true)
  const [semCamera, setSemCamera] = useState(false)
  const [buscando, setBuscando] = useState(false)

  useEffect(() => {
    desbloquearAudio()
    const hints = new Map()
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.EAN_13, BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.CODE_128,
    ])
    const reader = new BrowserMultiFormatOneDReader(hints, { delayBetweenScanAttempts: 100 })
    readerRef.current = reader

    const onDecode = (result) => {
      if (!result) return
      const code = result.getText()
      if (code === lastRef.current) return
      lastRef.current = code
      setTimeout(() => { lastRef.current = '' }, 2500)
      resolver(code)
    }

    // Guarda o stream num ref (sobrevive ao unmount) pra parar a câmera com certeza.
    const capturar = () => { setLoading(false); streamRef.current = videoRef.current?.srcObject || streamRef.current }
    reader.decodeFromConstraints(
      { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } },
      videoRef.current, onDecode,
    )
      .then(capturar)
      .catch(() =>
        reader.decodeFromConstraints({ video: true }, videoRef.current, onDecode)
          .then(capturar)
          .catch(() => { setLoading(false); setSemCamera(true) }),
      )

    return () => {
      mountedRef.current = false // desmontou → nenhum callback zumbi dispara
      try { reader.reset() } catch (_) {}
      // iOS/Safari: reset() nem sempre solta o stream → para as tracks na mão (via
      // streamRef, que sobrevive ao unmount), senão a câmera continua e re-escaneia
      // o mesmo código, resetando o painel de contagem.
      try {
        const s = streamRef.current || videoRef.current?.srcObject
        if (s && s.getTracks) s.getTracks().forEach(t => t.stop())
        if (videoRef.current) videoRef.current.srcObject = null
        streamRef.current = null
      } catch (_) {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function resolver(codigo) {
    if (!mountedRef.current) return // câmera zumbi após desmontar → não dispara callback
    setBuscando(true)
    const { data, error } = await supabase.rpc('buscar_produto_operador', {
      p_unidade_id: unidadeId, p_codigo_barras: String(codigo),
    })
    setBuscando(false)
    const row = Array.isArray(data) ? data[0] : data
    if (error || !row) {
      tocarErro()
      setFeedback({ tipo: 'err', msg: 'Produto não encontrado' })
      setTimeout(() => setFeedback(null), 1600)
      onDesconhecido?.(String(codigo))
      return
    }
    tocarSucesso()
    setManual('')
    onProduto?.(row, String(codigo))
  }

  function submitManual(e) {
    e.preventDefault()
    const digits = manual.replace(/\D/g, '')
    if (digits.length < 8) {
      setFeedback({ tipo: 'err', msg: 'Digite o código completo' })
      setTimeout(() => setFeedback(null), 1600)
      return
    }
    resolver(digits)
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden" onTouchStart={desbloquearAudio}>
      {hint && (
        <p className="px-4 py-2 text-center text-sm text-vallen-muted bg-vallen-black flex-shrink-0">{hint}</p>
      )}

      <div className="relative bg-black flex-shrink-0 overflow-hidden" style={{ aspectRatio: '4/3', maxHeight: '46dvh' }}>
        <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" muted playsInline autoPlay />

        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black gap-3">
            <div className="w-10 h-10 border-4 border-vallen-green border-t-transparent rounded-full animate-spin" />
            <p className="text-white/60 text-sm">Ligando a câmera…</p>
          </div>
        )}

        {semCamera && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 gap-3 p-4">
            <div className="text-5xl">📷</div>
            <p className="text-white text-center text-sm">Câmera indisponível.<br />Digite o código abaixo.</p>
          </div>
        )}

        {!loading && !semCamera && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-52 h-32">
              <span className="absolute top-0 left-0 w-7 h-7 border-t-4 border-l-4 border-vallen-green rounded-tl-md" />
              <span className="absolute top-0 right-0 w-7 h-7 border-t-4 border-r-4 border-vallen-green rounded-tr-md" />
              <span className="absolute bottom-0 left-0 w-7 h-7 border-b-4 border-l-4 border-vallen-green rounded-bl-md" />
              <span className="absolute bottom-0 right-0 w-7 h-7 border-b-4 border-r-4 border-vallen-green rounded-br-md" />
              <div className="absolute left-2 right-2 h-0.5 bg-vallen-green/80 animate-scan" style={{ top: '50%' }} />
            </div>
          </div>
        )}

        {buscando && (
          <div className="absolute bottom-2 left-2 right-2 rounded-xl px-4 py-2.5 bg-black/70 flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            <p className="text-white text-sm">Buscando…</p>
          </div>
        )}

        {feedback && !buscando && (
          <div className={`absolute bottom-2 left-2 right-2 rounded-xl px-4 py-2.5 flex items-center gap-2
            ${feedback.tipo === 'ok' ? 'bg-vallen-green' : 'bg-red-600'}`}>
            <span className="text-xl">{feedback.tipo === 'ok' ? '✅' : '❌'}</span>
            <p className="text-white font-semibold text-sm truncate">{feedback.msg}</p>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
        <span className="text-5xl">🔦</span>
        <p className="text-vallen-muted text-base">Aponte a câmera para o código de barras</p>
      </div>

      <form onSubmit={submitManual}
        className="flex gap-2 px-3 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] bg-vallen-black border-t border-vallen-border flex-shrink-0">
        <input
          value={manual}
          onChange={e => setManual(e.target.value)}
          placeholder="Ou digite o código"
          inputMode="numeric"
          className="flex-1 bg-vallen-dark border border-vallen-border rounded-xl px-4 py-3.5 text-lg text-vallen-white focus:outline-none focus:border-vallen-green"
        />
        <button type="submit" className="px-6 bg-vallen-green text-white rounded-xl text-base font-bold">OK</button>
      </form>
    </div>
  )
}

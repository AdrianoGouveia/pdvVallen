import { useEffect, useRef, useState } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { supabase } from '../../lib/supabase'

export function Scanner({ unidadeId, onScan }) {
  const videoRef   = useRef(null)
  const readerRef  = useRef(null)
  const lastRef    = useRef('')
  const [feedback, setFeedback] = useState(null)
  const [manual, setManual]     = useState('')
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    const reader = new BrowserMultiFormatReader()
    readerRef.current = reader

    reader.decodeFromConstraints(
      { video: { facingMode: 'environment' } },
      videoRef.current,
      (result, err) => {
        if (result) {
          const code = result.getText()
          if (code === lastRef.current) return
          lastRef.current = code
          setTimeout(() => { lastRef.current = '' }, 2000) // debounce 2s
          buscarProduto(code)
        }
      }
    ).then(() => setLoading(false)).catch(() => setLoading(false))

    return () => { try { reader.reset() } catch (_) {} }
  }, [])

  async function buscarProduto(codigo) {
    const { data } = await supabase
      .from('produtos')
      .select('id,nome,preco,restrito_idade,imagem_url,categoria')
      .eq('codigo_barras', codigo)
      .single()

    if (!data) {
      setFeedback({ tipo: 'err', msg: `Produto não encontrado: ${codigo}` })
    } else {
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

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Câmera */}
      <div className="relative flex-1 bg-black">
        <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <div className="w-10 h-10 border-4 border-vallen-green border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Mira */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-64 h-40 border-2 border-vallen-green rounded-xl opacity-70" />
        </div>

        {/* Feedback */}
        {feedback && (
          <div className={`absolute top-4 left-1/2 -translate-x-1/2 px-5 py-2.5 rounded-full text-sm font-medium shadow-lg
            ${feedback.tipo === 'ok' ? 'bg-vallen-green text-white' : 'bg-red-600 text-white'}`}>
            {feedback.msg}
          </div>
        )}

        <p className="absolute bottom-4 left-0 right-0 text-center text-xs text-white/50">
          Aponte a câmera para o código de barras
        </p>
      </div>

      {/* Entrada manual */}
      <form onSubmit={handleManual}
        className="flex gap-2 px-4 py-3 bg-vallen-black border-t border-vallen-border">
        <input value={manual} onChange={e => setManual(e.target.value)}
          placeholder="Digitar código manualmente..."
          inputMode="numeric"
          className="flex-1 bg-vallen-dark border border-vallen-border rounded-lg px-3 py-2 text-sm text-vallen-white focus:outline-none focus:border-vallen-green" />
        <button type="submit"
          className="px-4 py-2 bg-vallen-green text-white rounded-lg text-sm font-medium">
          OK
        </button>
      </form>
    </div>
  )
}

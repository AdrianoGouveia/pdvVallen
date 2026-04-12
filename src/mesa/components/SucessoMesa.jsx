import { useEffect, useState } from 'react'
import { tocarSucessoPagamento } from '../utils/audio.js'

export function SucessoMesa({ total, onDone, cliente }) {
  const [contador, setContador] = useState(8)

  useEffect(() => {
    tocarSucessoPagamento()
    const tick = setInterval(() => setContador(c => c - 1), 1000)
    const fim  = setTimeout(onDone, 8000)
    return () => { clearInterval(tick); clearTimeout(fim) }
  }, [onDone])

  const nome = cliente?.nome?.split(' ')[0] || null

  return (
    <div className="fixed inset-0 bg-vallen-green flex flex-col items-center justify-center p-8 text-white">

      {/* Ícone */}
      <div className="w-28 h-28 rounded-full bg-white/20 flex items-center justify-center mb-6 animate-bounce-once">
        <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>

      <h1 className="text-4xl font-black mb-1 text-center">Pagamento confirmado!</h1>

      {nome && (
        <p className="text-lg opacity-80 mb-1">Obrigado, {nome}!</p>
      )}
      <p className="opacity-70 text-sm mb-8">Sua compra foi concluída com sucesso</p>

      {/* Valor */}
      <div className="bg-white/20 rounded-2xl px-10 py-5 text-center mb-8">
        <p className="text-sm opacity-70 mb-1">Valor pago</p>
        <p className="text-5xl font-black">R$ {Number(total).toFixed(2)}</p>
      </div>

      {/* Contador */}
      <div className="flex items-center gap-2 opacity-60">
        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
        <p className="text-sm">Voltando em {contador}s...</p>
      </div>

      <button onClick={onDone}
        className="mt-6 px-8 py-3 bg-white/20 hover:bg-white/30 rounded-2xl text-sm font-medium transition-colors">
        Voltar agora
      </button>
    </div>
  )
}

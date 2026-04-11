import { useEffect, useState } from 'react'

export function PaymentSuccess({ total, unidade, onDone }) {
  const [segundos, setSegundos] = useState(30)

  useEffect(() => {
    const id = setInterval(() => {
      setSegundos(s => {
        if (s <= 1) { clearInterval(id); onDone(); return 0 }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [onDone])

  return (
    <div className="fixed inset-0 z-50 bg-vallen-green flex flex-col items-center justify-center p-8 text-white">
      {/* Ícone de check animado */}
      <div className="w-28 h-28 rounded-full bg-white/20 flex items-center justify-center mb-8">
        <svg className="w-16 h-16 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>

      {/* Logo */}
      <img
        src="https://d2xsxph8kpxj0f.cloudfront.net/310419663030100181/bfwXvEbkbq6M7kWytZDaKG/v3_logo_fundo_preto_85834ede.webp"
        alt="Vallen Market"
        className="h-10 w-auto object-contain mb-6 opacity-90 invert"
      />

      <h1 className="text-4xl font-black mb-2 tracking-tight">Pagamento confirmado!</h1>
      <p className="text-xl font-light opacity-90 mb-8">Obrigado pela sua compra</p>

      {/* Valor */}
      <div className="bg-white/20 rounded-2xl px-10 py-5 text-center mb-8">
        <p className="text-sm opacity-80 mb-1">Valor pago</p>
        <p className="text-5xl font-black">R$ {Number(total).toFixed(2)}</p>
        {unidade && (
          <p className="text-sm opacity-70 mt-2">{unidade.nome}</p>
        )}
      </div>

      <p className="text-base opacity-70 mb-2">Volte sempre!</p>

      {/* Contador regressivo */}
      <div className="flex items-center gap-2 opacity-60 mt-4">
        <div
          className="w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-sm font-bold"
          style={{ animation: 'none' }}
        >
          {segundos}
        </div>
        <span className="text-sm">Voltando à tela inicial...</span>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'

/**
 * Tela de descanso exibida quando o PDV está ocioso.
 * Qualquer toque/clique dispara onWake().
 */
export function Screensaver({ onWake }) {
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const hora = time.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const data = time.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div
      className="fixed inset-0 z-50 bg-vallen-black flex flex-col items-center justify-center cursor-pointer select-none"
      onClick={onWake}
      onTouchStart={onWake}
    >
      {/* Logo / nome */}
      <div className="flex flex-col items-center gap-8 animate-pulse-slow">
        <img
          src="https://d2xsxph8kpxj0f.cloudfront.net/310419663030100181/bfwXvEbkbq6M7kWytZDaKG/v3_logo_fundo_preto_85834ede.webp"
          alt="Vallen Market"
          className="h-20 w-auto object-contain drop-shadow-lg"
        />
        <p className="text-vallen-muted text-lg">O mercado do seu condomínio · Aberto 24h</p>
      </div>

      {/* Relógio */}
      <div className="mt-16 text-center">
        <p className="text-7xl font-thin text-vallen-white tracking-wider">{hora}</p>
        <p className="text-vallen-muted text-base mt-2 capitalize">{data}</p>
      </div>

      {/* Instrução */}
      <div className="absolute bottom-12 text-center">
        <p className="text-vallen-gray text-sm animate-bounce">Toque para começar</p>
      </div>
    </div>
  )
}

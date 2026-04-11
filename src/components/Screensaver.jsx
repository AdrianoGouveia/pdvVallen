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
      <div className="flex flex-col items-center gap-6 animate-pulse-slow">
        <div className="w-24 h-24 bg-vallen-green rounded-2xl flex items-center justify-center shadow-lg shadow-vallen-green/30">
          <span className="text-white font-black text-5xl">V</span>
        </div>
        <div className="text-center">
          <h1 className="text-4xl font-black text-vallen-white tracking-wide">Vallen Market</h1>
          <p className="text-vallen-muted text-lg mt-1">O mercado do seu condomínio · 24h</p>
        </div>
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

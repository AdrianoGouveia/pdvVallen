import { useEffect } from 'react'

function tocarSom() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    ;[523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.connect(g); g.connect(ctx.destination)
      o.type = 'sine'; o.frequency.value = freq
      const t = ctx.currentTime + i * 0.15
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(0.3, t + 0.05)
      g.gain.linearRampToValueAtTime(0, t + 0.25)
      o.start(t); o.stop(t + 0.3)
    })
  } catch (_) {}
}

export function SucessoMesa({ total, onDone }) {
  useEffect(() => {
    tocarSom()
    const t = setTimeout(onDone, 8000)
    return () => clearTimeout(t)
  }, [onDone])

  return (
    <div className="fixed inset-0 bg-vallen-green flex flex-col items-center justify-center p-8 text-white">
      <div className="w-24 h-24 rounded-full bg-white/20 flex items-center justify-center mb-6">
        <svg className="w-14 h-14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h1 className="text-3xl font-black mb-1">Pagamento confirmado!</h1>
      <p className="opacity-80 mb-6">Obrigado pela compra</p>
      <div className="bg-white/20 rounded-2xl px-8 py-4 text-center mb-6">
        <p className="text-sm opacity-70 mb-1">Valor pago</p>
        <p className="text-5xl font-black">R$ {Number(total).toFixed(2)}</p>
      </div>
      <p className="text-sm opacity-60">Voltando em instantes...</p>
    </div>
  )
}

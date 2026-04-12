// AudioContext precisa ser desbloqueado por gesto do usuário no iOS/Android
let ctx = null

function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)()
  return ctx
}

// Chame isso num onClick/onTouchStart para desbloquear o áudio
export function desbloquearAudio() {
  try {
    const c = getCtx()
    // Toca buffer silencioso para desbloquear
    const buf = c.createBuffer(1, 1, 22050)
    const src = c.createBufferSource()
    src.buffer = buf
    src.connect(c.destination)
    src.start(0)
    if (c.state === 'suspended') c.resume()
  } catch (_) {}
}

export function tocarSucesso() {
  try {
    const c = getCtx()
    if (c.state === 'suspended') c.resume()
    // Dois bipes curtos ascendentes
    ;[880, 1108].forEach((freq, i) => {
      const o = c.createOscillator(), g = c.createGain()
      o.connect(g); g.connect(c.destination)
      o.type = 'sine'; o.frequency.value = freq
      const t = c.currentTime + i * 0.12
      g.gain.setValueAtTime(0.35, t)
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.1)
      o.start(t); o.stop(t + 0.12)
    })
  } catch (_) {}
}

export function tocarErro() {
  try {
    const c = getCtx()
    if (c.state === 'suspended') c.resume()
    // Tom grave descendente
    const o = c.createOscillator(), g = c.createGain()
    o.connect(g); g.connect(c.destination)
    o.type = 'sawtooth'
    o.frequency.setValueAtTime(300, c.currentTime)
    o.frequency.linearRampToValueAtTime(150, c.currentTime + 0.3)
    g.gain.setValueAtTime(0.25, c.currentTime)
    g.gain.linearRampToValueAtTime(0, c.currentTime + 0.3)
    o.start(c.currentTime); o.stop(c.currentTime + 0.3)
  } catch (_) {}
}

export function tocarSucessoPagamento() {
  try {
    const c = getCtx()
    if (c.state === 'suspended') c.resume()
    ;[523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      const o = c.createOscillator(), g = c.createGain()
      o.connect(g); g.connect(c.destination)
      o.type = 'sine'; o.frequency.value = freq
      const t = c.currentTime + i * 0.15
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(0.3, t + 0.05)
      g.gain.linearRampToValueAtTime(0, t + 0.25)
      o.start(t); o.stop(t + 0.3)
    })
  } catch (_) {}
}

import { useEffect, useState } from 'react'

const DISMISS_KEY = 'loja_install_dismiss'

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
}
function isIOS() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent) && !window.MSStream
}

/**
 * Banner discreto de "Adicionar à tela inicial".
 * - Android/Chrome: usa o evento beforeinstallprompt (botão Instalar).
 * - iOS/Safari: mostra instrução manual (não há API de install).
 * Dispensável e lembra a dispensa em localStorage.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState(null)
  const [visivel, setVisivel]   = useState(false)
  const [iosHint, setIosHint]   = useState(false)

  useEffect(() => {
    if (isStandalone()) return
    if (localStorage.getItem(DISMISS_KEY)) return

    const onBIP = (e) => { e.preventDefault(); setDeferred(e); setVisivel(true) }
    window.addEventListener('beforeinstallprompt', onBIP)

    if (isIOS()) { setIosHint(true); setVisivel(true) }

    return () => window.removeEventListener('beforeinstallprompt', onBIP)
  }, [])

  if (!visivel) return null

  function fechar() { localStorage.setItem(DISMISS_KEY, '1'); setVisivel(false) }

  async function instalar() {
    if (!deferred) return
    deferred.prompt()
    try { await deferred.userChoice } catch (_) {}
    setDeferred(null)
    setVisivel(false)
  }

  return (
    <div className="mx-3 mt-3 flex items-center gap-3 bg-vallen-card border border-vallen-border rounded-2xl px-3 py-2.5">
      <img src="/icons/icon-192.png" className="w-9 h-9 rounded-lg flex-shrink-0" alt="" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-vallen-white leading-tight">Instalar o app Vallen</p>
        <p className="text-xs text-vallen-muted leading-tight truncate">
          {iosHint
            ? 'Toque em Compartilhar → "Adicionar à Tela de Início".'
            : 'Acesse mais rápido na próxima compra.'}
        </p>
      </div>
      {!iosHint && (
        <button onClick={instalar}
          className="px-3 py-1.5 bg-vallen-green text-white text-xs font-bold rounded-xl flex-shrink-0">
          Instalar
        </button>
      )}
      <button onClick={fechar}
        className="text-vallen-muted hover:text-vallen-white text-xl leading-none px-1 flex-shrink-0">
        ×
      </button>
    </div>
  )
}

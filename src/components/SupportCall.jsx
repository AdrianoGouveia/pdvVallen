import { useState, useEffect, useRef } from 'react'

const JITSI_ROOM   = 'suporte-pdv-vallen-01'
const JITSI_DOMAIN = 'meet.jit.si'

/**
 * Painel de videochamada usando Jitsi Meet via API JS (sem SDK externo).
 * O iframe é montado/desmontado com a visibilidade para não consumir câmera
 * quando minimizado.
 *
 * Props:
 *  onClose — callback para fechar completamente o painel
 */
export function SupportCall({ onClose }) {
  const [minimized, setMinimized] = useState(false)
  const [apiReady, setApiReady]   = useState(false)
  const containerRef = useRef(null)
  const apiRef       = useRef(null)

  // Carregar o script do Jitsi uma vez
  useEffect(() => {
    if (window.JitsiMeetExternalAPI) { setApiReady(true); return }

    const script = document.createElement('script')
    script.src   = `https://${JITSI_DOMAIN}/external_api.js`
    script.async = true
    script.onload  = () => setApiReady(true)
    script.onerror = () => console.error('Não foi possível carregar a API do Jitsi.')
    document.head.appendChild(script)
  }, [])

  // Iniciar chamada assim que o container e a API estiverem prontos
  useEffect(() => {
    if (!apiReady || !containerRef.current || minimized) return

    // Destruir instância anterior se existir
    if (apiRef.current) {
      try { apiRef.current.dispose() } catch {}
      apiRef.current = null
    }

    const api = new window.JitsiMeetExternalAPI(JITSI_DOMAIN, {
      roomName  : JITSI_ROOM,
      parentNode: containerRef.current,
      width     : '100%',
      height    : '100%',
      configOverwrite: {
        startWithAudioMuted: false,
        startWithVideoMuted: false,
        disableDeepLinking : true,
        prejoinPageEnabled : false,
      },
      interfaceConfigOverwrite: {
        SHOW_JITSI_WATERMARK    : false,
        SHOW_WATERMARK_FOR_GUESTS: false,
        TOOLBAR_BUTTONS: [
          'microphone', 'camera', 'hangup',
          'chat', 'raisehand', 'tileview',
        ],
        DEFAULT_BACKGROUND: '#111111',
      },
      userInfo: {
        displayName: 'PDV Vallen · Autoatendimento',
      },
    })

    api.addEventListener('videoConferenceLeft', onClose)
    apiRef.current = api

    return () => {
      if (apiRef.current) {
        try { apiRef.current.dispose() } catch {}
        apiRef.current = null
      }
    }
  }, [apiReady, minimized, onClose])

  // ── Minimizado — botão flutuante ─────────────────────────────────────────
  if (minimized) {
    return (
      <button
        onClick={() => setMinimized(false)}
        className="fixed bottom-6 right-6 z-40 w-16 h-16 bg-vallen-green hover:bg-vallen-greenLight rounded-full shadow-lg shadow-vallen-green/40 flex items-center justify-center"
        title="Expandir suporte"
      >
        <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
        </svg>
        <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full border-2 border-vallen-dark animate-pulse" />
      </button>
    )
  }

  // ── Painel lateral ───────────────────────────────────────────────────────
  return (
    <div className="fixed right-0 top-0 h-full w-80 xl:w-96 z-30 flex flex-col bg-vallen-black border-l border-vallen-border shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-vallen-border bg-vallen-card">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          <span className="text-xs font-semibold text-vallen-white">Suporte em andamento</span>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => setMinimized(true)}
            className="p-1.5 rounded hover:bg-vallen-border text-vallen-muted hover:text-vallen-white"
            title="Minimizar"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
            </svg>
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-red-600 text-vallen-muted hover:text-white"
            title="Encerrar chamada"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Jitsi container */}
      <div ref={containerRef} className="flex-1 bg-vallen-dark" />

      {/* Footer info */}
      <div className="px-3 py-2 border-t border-vallen-border bg-vallen-card">
        <p className="text-xs text-vallen-gray text-center">
          Sala: <span className="text-vallen-muted font-mono">{JITSI_ROOM}</span>
        </p>
      </div>
    </div>
  )
}

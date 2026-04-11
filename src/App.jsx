import { useState, useCallback, useEffect, useRef } from 'react'
import { ProductGrid }          from './components/ProductGrid'
import { Cart }                 from './components/Cart'
import { AgeVerificationModal } from './components/AgeVerificationModal'
import { PixModal }             from './components/PixModal'
import { Screensaver }          from './components/Screensaver'
import { SupportCall }          from './components/SupportCall'
import { useBarcodeScanner }    from './hooks/useBarcodeScanner'

// Tempo de inatividade para ativar screensaver (ms)
const IDLE_TIMEOUT = 2 * 60 * 1000 // 2 minutos

export default function App() {
  const [cart, setCart]                 = useState([])
  const [showAgeModal, setShowAgeModal] = useState(false)
  const [showPixModal, setShowPixModal] = useState(false)
  const [ageVerified, setAgeVerified]   = useState(false)
  const [scanFeedback, setScanFeedback] = useState(null)
  const [screensaver, setScreensaver]   = useState(true)
  const [showSupport, setShowSupport]   = useState(false)
  const idleTimerRef = useRef(null)

  // ── Screensaver / idle timer ──────────────────────────────────────────────
  const resetIdle = useCallback(() => {
    clearTimeout(idleTimerRef.current)
    idleTimerRef.current = setTimeout(() => setScreensaver(true), IDLE_TIMEOUT)
  }, [])

  useEffect(() => {
    const events = ['mousemove', 'mousedown', 'touchstart', 'keydown']
    events.forEach(e => window.addEventListener(e, resetIdle))
    resetIdle()
    return () => {
      events.forEach(e => window.removeEventListener(e, resetIdle))
      clearTimeout(idleTimerRef.current)
    }
  }, [resetIdle])

  function handleWake() {
    setScreensaver(false)
    resetIdle()
  }

  // ── Carrinho helpers ──────────────────────────────────────────────────────
  const addToCart = useCallback((produto) => {
    if (produto.estoque <= 0) return

    setCart(prev => {
      const idx = prev.findIndex(i => i.id === produto.id)
      if (idx >= 0) {
        const updated = [...prev]
        if (updated[idx].quantidade >= produto.estoque) return prev
        updated[idx] = { ...updated[idx], quantidade: updated[idx].quantidade + 1 }
        return updated
      }
      return [...prev, { ...produto, quantidade: 1 }]
    })

    setScanFeedback({ type: 'ok', msg: `+ ${produto.nome}` })
    setTimeout(() => setScanFeedback(null), 1500)
  }, [])

  const incrementItem = useCallback((id) => {
    setCart(prev => prev.map(i =>
      i.id === id && i.quantidade < i.estoque ? { ...i, quantidade: i.quantidade + 1 } : i
    ))
  }, [])

  const decrementItem = useCallback((id) => {
    setCart(prev =>
      prev.map(i => i.id === id ? { ...i, quantidade: i.quantidade - 1 } : i)
          .filter(i => i.quantidade > 0)
    )
  }, [])

  const removeItem = useCallback((id) => {
    setCart(prev => {
      const remaining = prev.filter(i => i.id !== id)
      if (!remaining.some(i => i.restrito_idade)) setAgeVerified(false)
      return remaining
    })
  }, [])

  const clearCart = useCallback(() => {
    setCart([])
    setAgeVerified(false)
  }, [])

  // ── Lógica de idade ───────────────────────────────────────────────────────
  const hasRestrictedItem = cart.some(i => i.restrito_idade)
  const ageBlocked        = hasRestrictedItem && !ageVerified

  // ── Scanner ───────────────────────────────────────────────────────────────
  const handleScanned  = useCallback((produto) => addToCart(produto), [addToCart])
  const handleNotFound = useCallback((codigo) => {
    setScanFeedback({ type: 'err', msg: `Código não encontrado: ${codigo}` })
    setTimeout(() => setScanFeedback(null), 2500)
  }, [])

  useBarcodeScanner(handleScanned, handleNotFound)

  // ── Checkout ──────────────────────────────────────────────────────────────
  function handleCheckout() {
    if (ageBlocked) setShowAgeModal(true)
    else            setShowPixModal(true)
  }

  const total = cart.reduce((acc, i) => acc + i.preco * i.quantidade, 0)

  // ── Layout ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen bg-vallen-dark">

      {/* Screensaver */}
      {screensaver && <Screensaver onWake={handleWake} />}

      {/* Header */}
      <header className="flex items-center justify-between px-5 py-3 bg-vallen-black border-b border-vallen-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <img
            src="https://d2xsxph8kpxj0f.cloudfront.net/310419663030100181/bfwXvEbkbq6M7kWytZDaKG/v3_logo_fundo_preto_85834ede.webp"
            alt="Vallen Market"
            className="h-9 w-auto object-contain"
          />
          <p className="text-xs text-vallen-muted leading-tight hidden sm:block">Autoatendimento · Aberto 24h</p>
        </div>

        {/* Botão de suporte */}
        <button
          onClick={() => setShowSupport(s => !s)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
            ${showSupport
              ? 'bg-vallen-green text-white'
              : 'bg-vallen-card border border-vallen-border text-vallen-muted hover:text-vallen-white hover:border-vallen-green'
            }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
          </svg>
          {showSupport ? 'Suporte ativo' : 'Chamar suporte'}
        </button>
      </header>

      {/* Feedback do scanner */}
      {scanFeedback && (
        <div className={`fixed top-16 left-1/2 -translate-x-1/2 z-40 px-5 py-2 rounded-full text-sm font-medium shadow-lg
          ${scanFeedback.type === 'ok' ? 'bg-vallen-green text-white' : 'bg-red-600 text-white'}`}>
          {scanFeedback.msg}
        </div>
      )}

      {/* Main — ajusta margem direita se suporte estiver aberto */}
      <div className={`flex flex-1 overflow-hidden transition-all ${showSupport ? 'mr-80 xl:mr-96' : ''}`}>
        {/* Produtos */}
        <div className="flex-1 overflow-hidden">
          <ProductGrid onAddToCart={addToCart} />
        </div>

        {/* Carrinho */}
        <div className="w-80 xl:w-96 flex-shrink-0 overflow-hidden">
          <Cart
            items={cart}
            onIncrement={incrementItem}
            onDecrement={decrementItem}
            onRemove={removeItem}
            onCheckout={handleCheckout}
            ageBlocked={ageBlocked}
          />
        </div>
      </div>

      {/* Painel de suporte (Jitsi) */}
      {showSupport && (
        <SupportCall onClose={() => setShowSupport(false)} />
      )}

      {/* Modal de verificação de idade */}
      {showAgeModal && (
        <AgeVerificationModal
          onVerified={() => {
            setAgeVerified(true)
            setShowAgeModal(false)
            setShowPixModal(true)
          }}
          onClose={() => setShowAgeModal(false)}
        />
      )}

      {/* Modal PIX */}
      {showPixModal && (
        <PixModal
          items={cart}
          total={total}
          onPaymentSuccess={() => { setShowPixModal(false); clearCart() }}
          onClose={() => setShowPixModal(false)}
        />
      )}
    </div>
  )
}

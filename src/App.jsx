import { useState, useCallback, useEffect, useRef } from 'react'
import { ProductGrid }          from './components/ProductGrid'
import { Cart }                 from './components/Cart'
import { AgeVerificationModal } from './components/AgeVerificationModal'
import { PaymentMethodModal }   from './components/PaymentMethodModal'
import { Screensaver }          from './components/Screensaver'
import { SupportCall }          from './components/SupportCall'
import { PaymentSuccess }       from './components/PaymentSuccess'
import { AdminPanel, useUnidade } from './components/AdminPanel'
import { useBarcodeScanner }    from './hooks/useBarcodeScanner'

const IDLE_TIMEOUT       = 2 * 60 * 1000  // 2 minutos sem toque → screensaver
const CART_IDLE_TIMEOUT  = 60            // segundos sem novas inserções → cancela compra
const LOGO_TAPS_ADM      = 5             // toques no logo para abrir admin

export default function App() {
  const [cart, setCart]                 = useState([])
  const [showAgeModal, setShowAgeModal] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [ageVerified, setAgeVerified]   = useState(false)
  const [scanFeedback, setScanFeedback] = useState(null)
  const [screensaver, setScreensaver]   = useState(true)
  const [showSupport, setShowSupport]   = useState(false)
  const [showAdmin, setShowAdmin]       = useState(false)
  const [successData, setSuccessData]   = useState(null) // { total, unidade }
  const [cartCountdown, setCartCountdown] = useState(null) // null = inativo
  const idleTimerRef   = useRef(null)
  const cartTimerRef   = useRef(null)
  const cartTickRef    = useRef(null)
  const logoTapsRef    = useRef(0)
  const logoTimerRef   = useRef(null)

  const { unidade } = useUnidade()

  // ── Screensaver / idle ────────────────────────────────────────────────────
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
    setShowSupport(true)
    resetIdle()
  }

  // ── Toque múltiplo no logo → admin ───────────────────────────────────────
  function handleLogoTap() {
    logoTapsRef.current += 1
    clearTimeout(logoTimerRef.current)
    logoTimerRef.current = setTimeout(() => { logoTapsRef.current = 0 }, 2000)
    if (logoTapsRef.current >= LOGO_TAPS_ADM) {
      logoTapsRef.current = 0
      setShowAdmin(true)
    }
  }

  // ── Timer de inatividade do carrinho ─────────────────────────────────────
  const stopCartTimer = useCallback(() => {
    clearTimeout(cartTimerRef.current)
    clearInterval(cartTickRef.current)
    setCartCountdown(null)
  }, [])

  const startCartTimer = useCallback(() => {
    clearTimeout(cartTimerRef.current)
    clearInterval(cartTickRef.current)
    setCartCountdown(CART_IDLE_TIMEOUT)
    let remaining = CART_IDLE_TIMEOUT
    cartTickRef.current = setInterval(() => {
      remaining -= 1
      setCartCountdown(remaining)
    }, 1000)
    cartTimerRef.current = setTimeout(() => {
      clearInterval(cartTickRef.current)
      setCartCountdown(null)
      setCart([])
      setAgeVerified(false)
      setShowPaymentModal(false)
      setScreensaver(true)
    }, CART_IDLE_TIMEOUT * 1000)
  }, [])

  const clearCart = useCallback(() => {
    stopCartTimer()
    setCart([])
    setAgeVerified(false)
  }, [stopCartTimer])

  // ── Carrinho ──────────────────────────────────────────────────────────────
  const addToCart = useCallback((produto) => {
    setCart(prev => {
      const idx = prev.findIndex(i => i.id === produto.id)
      if (idx >= 0) {
        const updated = [...prev]
        updated[idx] = { ...updated[idx], quantidade: updated[idx].quantidade + 1 }
        return updated
      }
      return [...prev, { ...produto, quantidade: 1 }]
    })
    setScanFeedback({ type: 'ok', msg: `+ ${produto.nome}` })
    setTimeout(() => setScanFeedback(null), 1500)
    startCartTimer()
  }, [startCartTimer])

  const incrementItem = useCallback((id) => {
    setCart(prev => prev.map(i => i.id === id ? { ...i, quantidade: i.quantidade + 1 } : i))
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

  // ── Idade / checkout ──────────────────────────────────────────────────────
  const hasRestrictedItem = cart.some(i => i.restrito_idade)
  const ageBlocked        = hasRestrictedItem && !ageVerified

  function handleCheckout() {
    if (ageBlocked) setShowAgeModal(true)
    else { stopCartTimer(); setShowPaymentModal(true) }
  }

  // ── Scanner ───────────────────────────────────────────────────────────────
  useBarcodeScanner(
    useCallback((produto) => addToCart(produto), [addToCart]),
    useCallback((codigo) => {
      setScanFeedback({ type: 'err', msg: `Código não encontrado: ${codigo}` })
      setTimeout(() => setScanFeedback(null), 2500)
    }, [])
  )

  const total = cart.reduce((acc, i) => acc + i.preco * i.quantidade, 0)

  // ── Pagamento confirmado ──────────────────────────────────────────────────
  const handlePaymentSuccess = useCallback(() => {
    stopCartTimer()
    setShowPaymentModal(false)
    setSuccessData(sd => sd ?? { total, unidade })
    clearCart()
    setShowSupport(false)
  }, [stopCartTimer, clearCart, total, unidade])

  function handleSuccessDone() {
    setSuccessData(null)
    setScreensaver(true)  // volta para o screensaver após 30s
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen bg-vallen-dark">

      {screensaver && <Screensaver onWake={handleWake} />}

      {successData && (
        <PaymentSuccess
          total={successData.total}
          unidade={successData.unidade}
          onDone={handleSuccessDone}
        />
      )}

      {/* Header */}
      <header className="flex items-center justify-between px-5 py-3 bg-vallen-black border-b border-vallen-border flex-shrink-0">
        <div className="flex items-center gap-3">
          <img
            src="https://d2xsxph8kpxj0f.cloudfront.net/310419663030100181/bfwXvEbkbq6M7kWytZDaKG/v3_logo_fundo_preto_85834ede.webp"
            alt="Vallen Market"
            className="h-14 w-auto object-contain cursor-pointer"
            onClick={handleLogoTap}
            title="Toque 5x para admin"
          />
          {unidade && (
            <span className="text-xs text-vallen-muted border border-vallen-border rounded px-2 py-0.5 hidden sm:inline">
              {unidade.nome}
            </span>
          )}
        </div>

        <button
          onClick={() => setShowSupport(s => !s)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
            ${showSupport
              ? 'bg-vallen-green text-white'
              : 'bg-vallen-card border border-vallen-border text-vallen-muted hover:text-vallen-white hover:border-vallen-green'}`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
          </svg>
          {showSupport ? 'Suporte ativo' : 'Chamar suporte'}
        </button>
      </header>

      {/* Feedback scanner */}
      {scanFeedback && (
        <div className={`fixed top-16 left-1/2 -translate-x-1/2 z-40 px-5 py-2 rounded-full text-sm font-medium shadow-lg
          ${scanFeedback.type === 'ok' ? 'bg-vallen-green text-white' : 'bg-red-600 text-white'}`}>
          {scanFeedback.msg}
        </div>
      )}

      {/* Main */}
      <div className={`flex flex-1 overflow-hidden transition-all ${showSupport ? 'mr-80 xl:mr-96' : ''}`}>
        <div className="flex-1 overflow-hidden">
          <ProductGrid
            onAddToCart={addToCart}
            focusEnabled={!showAgeModal && !showPaymentModal && !showAdmin && !showSupport}
          />
        </div>
        <div className="w-80 xl:w-96 flex-shrink-0 overflow-hidden">
          <Cart
            items={cart}
            onIncrement={incrementItem}
            onDecrement={decrementItem}
            onRemove={removeItem}
            onCheckout={handleCheckout}
            onCancel={clearCart}
            ageBlocked={ageBlocked}
            countdown={cartCountdown}
          />
        </div>
      </div>

      {showSupport && <SupportCall onClose={() => setShowSupport(false)} />}

      {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} />}

      {showAgeModal && (
        <AgeVerificationModal
          onVerified={() => { setAgeVerified(true); setShowAgeModal(false) }}
          onClose={() => setShowAgeModal(false)}
        />
      )}

      {showPaymentModal && (
        <PaymentMethodModal
          items={cart}
          total={total}
          unidadeId={unidade?.id ?? null}
          onPaymentSuccess={handlePaymentSuccess}
          onClose={() => setShowPaymentModal(false)}
        />
      )}
    </div>
  )
}

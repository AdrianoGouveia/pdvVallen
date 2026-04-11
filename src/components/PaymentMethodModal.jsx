import { useState } from 'react'
import { PixModal }  from './PixModal'
import { CardModal } from './CardModal'

export function PaymentMethodModal({ items, total, unidadeId, onPaymentSuccess, onClose }) {
  const [metodo, setMetodo] = useState(null)   // null | 'pix' | 'cartao'

  function voltarSelecao() { setMetodo(null) }

  // Tela de seleção
  if (!metodo) return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4">
      <div className="bg-vallen-card border border-vallen-border rounded-xl w-full max-w-sm p-6 shadow-2xl">

        <div className="text-center mb-6">
          <img
            src="https://d2xsxph8kpxj0f.cloudfront.net/310419663030100181/bfwXvEbkbq6M7kWytZDaKG/v3_logo_fundo_preto_85834ede.webp"
            alt="Vallen Market"
            className="h-8 w-auto object-contain mx-auto mb-4"
          />
          <h2 className="text-xl font-bold text-vallen-white">Como deseja pagar?</h2>
          <p className="text-3xl font-black text-vallen-green mt-1">R$ {total.toFixed(2)}</p>
        </div>

        <div className="space-y-3 mb-4">

          {/* PIX */}
          <button
            onClick={() => setMetodo('pix')}
            className="w-full flex items-center gap-4 p-4 bg-vallen-dark border-2 border-vallen-border rounded-xl
                       hover:border-vallen-green active:scale-95 transition-all group"
          >
            <div className="w-12 h-12 rounded-xl bg-vallen-green/20 flex items-center justify-center flex-shrink-0 group-hover:bg-vallen-green/30 transition-colors">
              <svg className="w-7 h-7 text-vallen-green" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className="text-left flex-1">
              <p className="text-base font-bold text-vallen-white">Pagar com PIX</p>
              <p className="text-xs text-vallen-muted">Aprovação instantânea</p>
            </div>
            <svg className="w-5 h-5 text-vallen-muted group-hover:text-vallen-green transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          {/* Cartão */}
          <button
            onClick={() => setMetodo('cartao')}
            className="w-full flex items-center gap-4 p-4 bg-vallen-dark border-2 border-vallen-border rounded-xl
                       hover:border-blue-500 active:scale-95 transition-all group"
          >
            <div className="w-12 h-12 rounded-xl bg-blue-900/30 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-900/50 transition-colors">
              <svg className="w-7 h-7 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
            </div>
            <div className="text-left flex-1">
              <p className="text-base font-bold text-vallen-white">Pagar com Cartão</p>
              <p className="text-xs text-vallen-muted">Crédito ou débito • parcele no crédito</p>
            </div>
            <svg className="w-5 h-5 text-vallen-muted group-hover:text-blue-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2 text-sm text-vallen-muted hover:text-vallen-white transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  )

  if (metodo === 'pix') return (
    <PixModal
      items={items}
      total={total}
      unidadeId={unidadeId}
      onPaymentSuccess={onPaymentSuccess}
      onClose={onClose}
    />
  )

  return (
    <CardModal
      items={items}
      total={total}
      unidadeId={unidadeId}
      onPaymentSuccess={onPaymentSuccess}
      onClose={onClose}
      onVoltar={voltarSelecao}
    />
  )
}

import { CartItem } from './CartItem'

export function Cart({ items, onIncrement, onDecrement, onRemove, onCheckout, onCancel, ageBlocked, countdown }) {
  const total   = items.reduce((acc, i) => acc + i.preco * i.quantidade, 0)
  const isEmpty = items.length === 0
  const showWarning = countdown !== null && countdown <= 20

  return (
    <div className="flex flex-col h-full bg-vallen-black border-l border-vallen-border">
      {/* Header */}
      <div className="px-4 py-4 border-b border-vallen-border">
        <h2 className="text-lg font-semibold text-vallen-white">Carrinho</h2>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto cart-scroll px-3 py-3 space-y-2">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full text-vallen-gray text-sm gap-2">
            <span className="text-4xl">🛒</span>
            <p>Carrinho vazio</p>
            <p className="text-xs text-center">Passe um item no leitor<br/>ou toque em um produto</p>
          </div>
        ) : (
          items.map(item => (
            <CartItem
              key={item.id}
              item={item}
              onIncrement={onIncrement}
              onDecrement={onDecrement}
              onRemove={onRemove}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-vallen-border space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-sm text-vallen-muted">Total</span>
          <span className="text-2xl font-bold text-vallen-green">
            R$ {total.toFixed(2)}
          </span>
        </div>

        {/* Aviso de timeout iminente */}
        {showWarning && (
          <div className="bg-orange-900/40 border border-orange-600/60 rounded-lg px-3 py-2">
            <p className="text-xs text-orange-300 text-center font-medium">
              Compra cancelada em {countdown}s sem atividade
            </p>
          </div>
        )}

        {/* Aviso de verificação de idade pendente */}
        {ageBlocked && !isEmpty && (
          <div className="bg-yellow-900/30 border border-yellow-700/50 rounded-lg px-3 py-2">
            <p className="text-xs text-yellow-400 text-center">
              🔞 Produto restrito — verifique a idade antes de pagar
            </p>
          </div>
        )}

        {/* Botão principal */}
        <button
          onClick={onCheckout}
          disabled={isEmpty}
          className={`w-full py-3 rounded-lg font-bold text-base transition-colors
            ${isEmpty
              ? 'bg-vallen-border text-vallen-gray cursor-not-allowed'
              : ageBlocked
                ? 'bg-yellow-600 hover:bg-yellow-500 text-white'
                : 'bg-vallen-green hover:bg-vallen-greenLight text-white'
            }`}
        >
          {ageBlocked ? '🔞 Verificar Idade' : 'Pagar com PIX'}
        </button>

        {/* Cancelar compra */}
        {!isEmpty && (
          <button
            onClick={onCancel}
            className="w-full py-2 text-sm text-vallen-muted hover:text-red-400 transition-colors"
          >
            Cancelar compra
          </button>
        )}
      </div>
    </div>
  )
}

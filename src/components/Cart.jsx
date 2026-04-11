import { CartItem } from './CartItem'

export function Cart({ items, onIncrement, onDecrement, onRemove, onCheckout, ageBlocked }) {
  const total = items.reduce((acc, i) => acc + i.preco * i.quantidade, 0)
  const isEmpty = items.length === 0

  return (
    <div className="flex flex-col h-full bg-vallen-black border-l border-vallen-border">
      {/* Header */}
      <div className="px-4 py-4 border-b border-vallen-border">
        <h2 className="text-lg font-semibold text-vallen-white">Carrinho</h2>
        {ageBlocked && (
          <p className="text-xs text-yellow-400 mt-1">
            ⚠️ Verifique a idade para continuar
          </p>
        )}
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

        <button
          onClick={onCheckout}
          disabled={isEmpty || ageBlocked}
          className={`w-full py-3 rounded-lg font-bold text-base transition-colors
            ${isEmpty || ageBlocked
              ? 'bg-vallen-border text-vallen-gray cursor-not-allowed'
              : 'bg-vallen-green hover:bg-vallen-greenLight text-white'
            }`}
        >
          {ageBlocked ? '🔒 Verificar Idade' : 'Pagar com PIX'}
        </button>

        {ageBlocked && !isEmpty && (
          <button
            onClick={onCheckout}
            className="w-full py-2 rounded-lg font-semibold text-sm bg-yellow-600 hover:bg-yellow-500 text-white"
          >
            Verificar Idade Agora
          </button>
        )}
      </div>
    </div>
  )
}

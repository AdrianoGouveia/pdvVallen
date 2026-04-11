export function CartItem({ item, onIncrement, onDecrement, onRemove }) {
  return (
    <div className="flex items-center gap-3 bg-vallen-card border border-vallen-border rounded-lg p-3">
      {item.imagem_url ? (
        <img
          src={item.imagem_url}
          alt={item.nome}
          className="w-14 h-14 object-cover rounded-md flex-shrink-0"
        />
      ) : (
        <div className="w-14 h-14 bg-vallen-gray rounded-md flex items-center justify-center flex-shrink-0">
          <span className="text-2xl">🛒</span>
        </div>
      )}

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-vallen-white truncate">{item.nome}</p>
        <p className="text-xs text-vallen-muted">
          R$ {item.preco.toFixed(2)} / un
        </p>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={() => onDecrement(item.id)}
          className="w-7 h-7 bg-vallen-border hover:bg-vallen-gray rounded-full text-white font-bold text-sm flex items-center justify-center"
        >
          −
        </button>
        <span className="w-6 text-center text-sm font-semibold">{item.quantidade}</span>
        <button
          onClick={() => onIncrement(item.id)}
          className="w-7 h-7 bg-vallen-green hover:bg-vallen-greenLight rounded-full text-white font-bold text-sm flex items-center justify-center"
        >
          +
        </button>
      </div>

      <div className="text-right flex-shrink-0 min-w-[60px]">
        <p className="text-sm font-semibold text-vallen-green">
          R$ {(item.preco * item.quantidade).toFixed(2)}
        </p>
        <button
          onClick={() => onRemove(item.id)}
          className="text-xs text-red-400 hover:text-red-300 mt-0.5"
        >
          remover
        </button>
      </div>
    </div>
  )
}

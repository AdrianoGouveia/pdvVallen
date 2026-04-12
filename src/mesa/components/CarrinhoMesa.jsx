export function CarrinhoMesa({ cart, setCart, onVoltar, onPix, onMaquininha }) {
  const total = cart.reduce((a, i) => a + i.preco * i.quantidade, 0)

  function inc(id) { setCart(p => p.map(i => i.id === id ? { ...i, quantidade: i.quantidade + 1 } : i)) }
  function dec(id) { setCart(p => p.map(i => i.id === id ? { ...i, quantidade: i.quantidade - 1 } : i).filter(i => i.quantidade > 0)) }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {cart.map(item => (
          <div key={item.id} className="flex items-center gap-3 bg-vallen-card border border-vallen-border rounded-xl p-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-vallen-white truncate">{item.nome}</p>
              <p className="text-xs text-vallen-muted">R$ {Number(item.preco).toFixed(2)} un.</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => dec(item.id)}
                className="w-8 h-8 rounded-full bg-vallen-dark border border-vallen-border text-vallen-white font-bold flex items-center justify-center">
                −
              </button>
              <span className="w-6 text-center text-vallen-white font-bold">{item.quantidade}</span>
              <button onClick={() => inc(item.id)}
                className="w-8 h-8 rounded-full bg-vallen-green text-white font-bold flex items-center justify-center">
                +
              </button>
            </div>
            <p className="text-sm font-bold text-vallen-green w-16 text-right">
              R$ {(item.preco * item.quantidade).toFixed(2)}
            </p>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="px-4 py-4 bg-vallen-black border-t border-vallen-border space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-vallen-muted">Total</span>
          <span className="text-3xl font-black text-vallen-green">R$ {total.toFixed(2)}</span>
        </div>
        <button onClick={onPix}
          className="w-full py-4 bg-vallen-green text-white font-bold rounded-xl text-lg">
          Pagar com PIX
        </button>
        <button onClick={onMaquininha}
          className="w-full py-3 bg-vallen-card border border-vallen-border text-vallen-white font-medium rounded-xl">
          💳 Pagar na maquininha
        </button>
        <button onClick={onVoltar}
          className="w-full py-2 text-sm text-vallen-muted hover:text-vallen-white">
          ← Continuar comprando
        </button>
      </div>
    </div>
  )
}

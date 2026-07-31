export function CarrinhoMesa({ cart, setCart, onVoltar, onPix, onMaquininha, cliente }) {
  const total = cart.reduce((a, i) => a + i.preco * i.quantidade, 0)
  const temAlcool = cart.some(i => i.restrito_idade)
  const bloqueadoPorIdade = temAlcool && cliente?.is18 === false

  function inc(id) {
    setCart(p => p.map(i => i.id === id ? { ...i, quantidade: i.quantidade + 1 } : i))
  }
  function dec(id) {
    setCart(p => p.map(i => i.id === id ? { ...i, quantidade: i.quantidade - 1 } : i).filter(i => i.quantidade > 0))
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">

      {/* Saudação */}
      {cliente?.nome && (
        <div className="px-4 pt-4 pb-2">
          <p className="text-vallen-muted text-sm">Olá, <span className="text-vallen-white font-semibold">{cliente.nome.split(' ')[0]}</span>! Confira seu carrinho 🛒</p>
        </div>
      )}

      {/* Lista */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {cart.map(item => (
          <div key={item.id} className="flex items-center gap-3 bg-vallen-card border border-vallen-border rounded-2xl p-3">
            {item.imagem_url
              ? <img src={item.imagem_url} alt={item.nome} className="w-14 h-14 object-cover rounded-xl flex-shrink-0" />
              : <div className="w-14 h-14 rounded-xl bg-vallen-dark flex items-center justify-center flex-shrink-0 text-2xl">🛍️</div>
            }
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-vallen-white leading-tight truncate">{item.nome}</p>
              <p className="text-xs text-vallen-muted mt-0.5">R$ {Number(item.preco).toFixed(2)} un.</p>
              {item.restrito_idade && (
                <span className="text-xs bg-amber-900/40 text-amber-400 border border-amber-700/40 px-2 py-0.5 rounded-full mt-1 inline-block">
                  🍷 +18
                </span>
              )}
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <p className="text-sm font-bold text-vallen-green">R$ {(item.preco * item.quantidade).toFixed(2)}</p>
              <div className="flex items-center gap-2">
                <button onClick={() => dec(item.id)}
                  className="w-8 h-8 rounded-full bg-vallen-dark border border-vallen-border text-vallen-white font-bold flex items-center justify-center text-lg leading-none">
                  −
                </button>
                <span className="w-5 text-center text-vallen-white font-bold text-sm">{item.quantidade}</span>
                <button onClick={() => inc(item.id)}
                  className="w-8 h-8 rounded-full bg-vallen-green text-white font-bold flex items-center justify-center text-lg leading-none">
                  +
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Bloqueio menor de idade */}
      {bloqueadoPorIdade && (
        <div className="mx-4 mb-2 px-4 py-3 bg-red-900/30 border border-red-700/50 rounded-xl">
          <p className="text-red-400 text-sm font-semibold">🚫 Venda não permitida</p>
          <p className="text-red-300 text-xs mt-0.5">Seu carrinho contém produtos restritos para maiores de 18 anos. Remova esses itens para continuar.</p>
        </div>
      )}

      {/* Aviso álcool (maior de idade) */}
      {temAlcool && !bloqueadoPorIdade && (
        <div className="mx-4 mb-2 px-4 py-3 bg-amber-900/20 border border-amber-700/40 rounded-xl">
          <p className="text-amber-400 text-xs">⚠️ Seu carrinho contém bebida alcoólica. A venda é permitida apenas para maiores de 18 anos.</p>
        </div>
      )}

      {/* Footer */}
      <div className="px-4 py-4 bg-vallen-black border-t border-vallen-border space-y-3">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-xs text-vallen-muted">{cart.reduce((a, i) => a + i.quantidade, 0)} {cart.length === 1 ? 'item' : 'itens'}</p>
            <p className="text-vallen-muted text-sm">Total</p>
          </div>
          <span className="text-3xl font-black text-vallen-green">R$ {total.toFixed(2)}</span>
        </div>

        <button onClick={onPix}
          disabled={bloqueadoPorIdade}
          className="w-full py-4 bg-vallen-green hover:bg-vallen-greenLight disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-2xl text-lg transition-colors flex items-center justify-center gap-2">
          <span className="text-xl">📱</span> Pagar com PIX
        </button>

        {onMaquininha && (
          <button onClick={onMaquininha}
            disabled={bloqueadoPorIdade}
            className="w-full py-3.5 bg-vallen-card border border-vallen-border hover:border-vallen-green disabled:opacity-40 disabled:cursor-not-allowed text-vallen-white font-medium rounded-2xl transition-colors flex items-center justify-center gap-2">
            <span>💳</span> Pagar na maquininha
          </button>
        )}

        <button onClick={onVoltar}
          className="w-full py-2 text-sm text-vallen-muted hover:text-vallen-white transition-colors">
          ← Continuar comprando
        </button>
      </div>
    </div>
  )
}

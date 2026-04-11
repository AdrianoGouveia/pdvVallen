import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function ProductGrid({ onAddToCart }) {
  const [produtos, setProdutos] = useState([])
  const [loading, setLoading]   = useState(true)
  const [busca, setBusca]       = useState('')

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('produtos')
        .select('*')
        .gt('estoque', 0)
        .order('nome')
      setProdutos(data || [])
      setLoading(false)
    }
    load()
  }, [])

  const filtrados = produtos.filter(p =>
    p.nome.toLowerCase().includes(busca.toLowerCase()) ||
    p.codigo_barras.includes(busca)
  )

  return (
    <div className="flex flex-col h-full">
      {/* Barra de busca */}
      <div className="p-3 border-b border-vallen-border">
        <input
          type="text"
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar produto ou código..."
          className="w-full bg-vallen-dark border border-vallen-border rounded-lg px-4 py-2 text-sm text-vallen-white placeholder-vallen-gray focus:outline-none focus:border-vallen-green"
        />
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto cart-scroll p-3">
        {loading ? (
          <div className="flex items-center justify-center h-full text-vallen-gray text-sm">
            Carregando produtos...
          </div>
        ) : filtrados.length === 0 ? (
          <div className="flex items-center justify-center h-full text-vallen-gray text-sm">
            Nenhum produto encontrado.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {filtrados.map(produto => (
              <button
                key={produto.id}
                onClick={() => onAddToCart(produto)}
                className="bg-vallen-card border border-vallen-border rounded-xl p-3 text-left hover:border-vallen-green active:scale-95 transition-transform"
              >
                {produto.imagem_url ? (
                  <img
                    src={produto.imagem_url}
                    alt={produto.nome}
                    className="w-full h-24 object-cover rounded-lg mb-2"
                  />
                ) : (
                  <div className="w-full h-24 bg-vallen-dark rounded-lg mb-2 flex items-center justify-center text-3xl">
                    🛍️
                  </div>
                )}
                <p className="text-xs font-medium text-vallen-white leading-tight line-clamp-2">
                  {produto.nome}
                </p>
                <p className="text-sm font-bold text-vallen-green mt-1">
                  R$ {produto.preco.toFixed(2)}
                </p>
                {produto.restrito_idade && (
                  <span className="text-xs text-yellow-400">🔞 +18</span>
                )}
                {produto.estoque <= 5 && (
                  <span className="text-xs text-red-400 block">Últimas unidades!</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

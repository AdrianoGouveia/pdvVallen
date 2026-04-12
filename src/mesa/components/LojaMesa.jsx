import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../../lib/supabase'

export function LojaMesa({ cart, onAddToCart, onIniciarScanner, onVerCarrinho, cliente }) {
  const [produtos, setProdutos]     = useState([])
  const [categorias, setCategorias] = useState([])
  const [loading, setLoading]       = useState(true)
  const [busca, setBusca]           = useState('')
  const [categoria, setCategoria]   = useState('destaques')
  const debounceRef                 = useRef(null)

  const total = cart.reduce((a, i) => a + i.preco * i.quantidade, 0)

  useEffect(() => {
    supabase.from('categorias_disponiveis').select('categoria')
      .then(({ data }) => { if (data) setCategorias(data.map(r => r.categoria)) })
  }, [])

  const carregar = useCallback(async (termo, cat) => {
    setLoading(true)
    let query = supabase
      .from('produtos')
      .select('id,nome,preco,imagem_url,restrito_idade,destaque,categoria,estoque')
      .order('estoque', { ascending: false })
      .order('nome', { ascending: true })
      .limit(60)

    if (termo.trim()) {
      query = query.or(`nome.ilike.%${termo.trim()}%,codigo_barras.ilike.%${termo.trim()}%`)
    } else if (cat === 'destaques') {
      query = query.eq('destaque', true)
    } else if (cat !== 'todos') {
      query = query.eq('categoria', cat)
    }

    const { data } = await query
    setProdutos(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { carregar('', 'destaques') }, [carregar])

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => carregar(busca, categoria), 300)
    return () => clearTimeout(debounceRef.current)
  }, [busca, categoria, carregar])

  function selecionarCat(cat) { setCategoria(cat); setBusca('') }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">

      {/* Boas-vindas */}
      {cliente?.nome && (
        <div className="px-4 pt-4 pb-1">
          <p className="text-vallen-muted text-sm">
            Seja bem-vindo, <span className="text-vallen-white font-bold">{cliente.nome.split(' ')[0]}</span>! 👋
          </p>
        </div>
      )}

      {/* Busca */}
      <div className="px-3 pt-3 pb-2 border-b border-vallen-border">
        <div className="relative">
          <input
            type="text"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar produto..."
            className="w-full bg-vallen-dark border border-vallen-border rounded-xl pl-9 pr-4 py-3 text-sm text-vallen-white placeholder-vallen-gray focus:outline-none focus:border-vallen-green"
          />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-vallen-gray" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
      </div>

      {/* Categorias */}
      {!busca && (
        <div className="flex gap-2 px-3 py-2 overflow-x-auto border-b border-vallen-border" style={{ scrollbarWidth: 'none' }}>
          <CatBtn label="⭐ Destaques" value="destaques" atual={categoria} onClick={selecionarCat} />
          <CatBtn label="Todos"        value="todos"      atual={categoria} onClick={selecionarCat} />
          {categorias.map(cat => <CatBtn key={cat} label={cat} value={cat} atual={categoria} onClick={selecionarCat} />)}
        </div>
      )}

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-3 pb-28">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3">
            <div className="w-8 h-8 border-4 border-vallen-green border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-vallen-muted">Carregando...</p>
          </div>
        ) : produtos.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2 text-vallen-gray">
            <span className="text-4xl">🔍</span>
            <p className="text-sm text-center">Nenhum produto encontrado.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {produtos.map(produto => (
              <button
                key={produto.id}
                onClick={() => onAddToCart(produto)}
                className="bg-vallen-card border border-vallen-border rounded-2xl p-3 text-left active:scale-95 transition-all"
              >
                {produto.imagem_url
                  ? <img src={produto.imagem_url} alt={produto.nome} className="w-full h-28 object-cover rounded-xl mb-2 bg-vallen-dark" />
                  : <div className="w-full h-28 bg-vallen-dark rounded-xl mb-2 flex items-center justify-center text-4xl">🛍️</div>
                }
                <p className="text-xs font-semibold text-vallen-white leading-tight line-clamp-2">{produto.nome}</p>
                <p className="text-sm font-bold text-vallen-green mt-1">R$ {Number(produto.preco).toFixed(2)}</p>
                {produto.restrito_idade && <span className="text-xs text-yellow-400">🔞 +18</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Barra inferior fixa */}
      <div className="fixed bottom-0 left-0 right-0 bg-vallen-black border-t border-vallen-border px-4 py-3 space-y-2">
        {cart.length > 0 && (
          <button
            onClick={onVerCarrinho}
            className="w-full py-3 bg-vallen-card border border-vallen-green text-vallen-green font-bold rounded-xl text-sm flex items-center justify-between px-4"
          >
            <span>🛒 {cart.reduce((a, i) => a + i.quantidade, 0)} itens no carrinho</span>
            <span className="text-vallen-white font-black">R$ {total.toFixed(2)}</span>
          </button>
        )}
        <button
          onClick={onIniciarScanner}
          className="w-full py-4 bg-vallen-green hover:bg-vallen-greenLight text-white font-bold rounded-xl text-base transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 9V5a2 2 0 012-2h4M3 15v4a2 2 0 002 2h4m6-18h4a2 2 0 012 2v4m0 6v4a2 2 0 01-2 2h-4" />
          </svg>
          Escanear código de barras
        </button>
      </div>
    </div>
  )
}

function CatBtn({ label, value, atual, onClick }) {
  return (
    <button
      onClick={() => onClick(value)}
      className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap
        ${value === atual
          ? 'bg-vallen-green text-white'
          : 'bg-vallen-dark border border-vallen-border text-vallen-muted'}`}
    >
      {label}
    </button>
  )
}

import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

const PAGE_SIZE = 60

export function ProductGrid({ onAddToCart, focusEnabled = true }) {
  const [produtos, setProdutos]       = useState([])
  const [categorias, setCategorias]   = useState([])
  const [loading, setLoading]         = useState(true)
  const [busca, setBusca]             = useState('')
  const [categoria, setCategoria]     = useState('destaques') // 'destaques' | 'todos' | string
  const [pagina, setPagina]           = useState(0)
  const [temMais, setTemMais]         = useState(true)
  const [buscando, setBuscando]       = useState(false)
  const debounceRef                   = useRef(null)
  const searchRef                     = useRef(null)

  // ── Manter foco na busca (só quando não há modal aberta) ─────────────────
  useEffect(() => {
    if (!focusEnabled) return
    searchRef.current?.focus()
    const id = setInterval(() => {
      if (focusEnabled && document.activeElement !== searchRef.current) {
        searchRef.current?.focus()
      }
    }, 2000)
    return () => clearInterval(id)
  }, [focusEnabled])

  // ── Buscar categorias disponíveis via view ───────────────────────────────
  useEffect(() => {
    supabase
      .from('categorias_disponiveis')
      .select('categoria')
      .then(({ data }) => {
        if (!data) return
        setCategorias(data.map(r => r.categoria))
      })
  }, [])

  // ── Carregar produtos ────────────────────────────────────────────────────
  const carregarProdutos = useCallback(async (termo, cat, pag, acumular = false) => {
    pag === 0 && !acumular ? setLoading(true) : setBuscando(true)

    const from = pag * PAGE_SIZE
    const to   = from + PAGE_SIZE - 1

    let query = supabase
      .from('produtos')
      .select('id, nome, preco, codigo_barras, estoque, imagem_url, restrito_idade, destaque, categoria')
      .order('estoque', { ascending: false })
      .order('nome',    { ascending: true })
      .range(from, to)

    if (termo.trim()) {
      query = query.or(`nome.ilike.%${termo.trim()}%,codigo_barras.ilike.%${termo.trim()}%`)
    } else if (cat === 'destaques') {
      query = query.eq('destaque', true)
    } else if (cat !== 'todos') {
      query = query.eq('categoria', cat)
    }

    const { data, error } = await query
    if (!error && data) {
      setProdutos(prev => acumular ? [...prev, ...data] : data)
      setTemMais(data.length === PAGE_SIZE)
    }

    setLoading(false)
    setBuscando(false)
  }, [])

  // Carga inicial
  useEffect(() => {
    carregarProdutos('', 'destaques', 0)
  }, [carregarProdutos])

  // Busca com debounce
  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setPagina(0)
      carregarProdutos(busca, categoria, 0)
    }, 350)
    return () => clearTimeout(debounceRef.current)
  }, [busca, categoria, carregarProdutos])

  function selecionarCategoria(cat) {
    setCategoria(cat)
    setBusca('')
    setPagina(0)
  }

  function carregarMais() {
    const prox = pagina + 1
    setPagina(prox)
    carregarProdutos(busca, categoria, prox, true)
  }

  const tituloVazio = busca
    ? 'Nenhum produto encontrado.'
    : categoria === 'destaques'
      ? 'Nenhum produto em destaque ainda.'
      : `Nenhum produto em "${categoria}".`

  return (
    <div className="flex flex-col h-full" onClick={() => searchRef.current?.focus()}>

      {/* Barra de busca */}
      <div className="px-3 pt-3 pb-2 border-b border-vallen-border">
        <div className="relative">
          <input
            ref={searchRef}
            type="text"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar produto ou código de barras..."
            autoFocus
            className="w-full bg-vallen-dark border border-vallen-border rounded-lg pl-9 pr-4 py-2.5 text-sm text-vallen-white placeholder-vallen-gray focus:outline-none focus:border-vallen-green"
          />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-vallen-gray" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {buscando && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-vallen-green border-t-transparent rounded-full animate-spin" />
          )}
        </div>
      </div>

      {/* Menu de categorias */}
      {!busca && (
        <div className="flex gap-2 px-3 py-2 overflow-x-auto border-b border-vallen-border scrollbar-none flex-shrink-0">
          <CatBtn label="⭐ Destaques" value="destaques" atual={categoria} onClick={selecionarCategoria} />
          <CatBtn label="Todos"        value="todos"      atual={categoria} onClick={selecionarCategoria} />
          {categorias.map(cat => (
            <CatBtn key={cat} label={cat} value={cat} atual={categoria} onClick={selecionarCategoria} />
          ))}
        </div>
      )}

      {/* Grid */}
      <div className="flex-1 overflow-y-auto cart-scroll p-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-vallen-gray">
            <div className="w-8 h-8 border-4 border-vallen-green border-t-transparent rounded-full animate-spin" />
            <p className="text-sm">Carregando produtos...</p>
          </div>
        ) : produtos.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-vallen-gray gap-2">
            <span className="text-4xl">{busca ? '🔍' : '⭐'}</span>
            <p className="text-sm text-center">{tituloVazio}</p>
            {busca
              ? <button onClick={() => setBusca('')} className="text-xs text-vallen-green hover:underline">Limpar busca</button>
              : categoria !== 'destaques' && (
                  <button onClick={() => selecionarCategoria('destaques')} className="text-xs text-vallen-green hover:underline">Ver destaques</button>
                )
            }
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {produtos.map(produto => (
                <button
                  key={produto.id}
                  onClick={e => { e.stopPropagation(); onAddToCart(produto) }}
                  className="bg-vallen-card border border-vallen-border rounded-xl p-3 text-left hover:border-vallen-green active:scale-95 transition-all"
                >
                  {produto.imagem_url ? (
                    <img
                      src={produto.imagem_url}
                      alt={produto.nome}
                      className="w-full h-24 object-cover rounded-lg mb-2 bg-vallen-dark"
                      onError={e => { e.target.style.display='none'; e.target.nextSibling.style.display='flex' }}
                    />
                  ) : null}
                  <div
                    className="w-full h-24 bg-vallen-dark rounded-lg mb-2 items-center justify-center text-3xl"
                    style={{ display: produto.imagem_url ? 'none' : 'flex' }}
                  >
                    🛍️
                  </div>
                  <p className="text-xs font-medium text-vallen-white leading-tight line-clamp-2">
                    {produto.nome}
                  </p>
                  <p className="text-sm font-bold text-vallen-green mt-1">
                    R$ {Number(produto.preco).toFixed(2)}
                  </p>
                  {produto.restrito_idade && (
                    <span className="text-xs text-yellow-400">🔞 +18</span>
                  )}
                </button>
              ))}
            </div>

            {temMais && (
              <div className="mt-4 text-center">
                <button
                  onClick={carregarMais}
                  disabled={buscando}
                  className="px-6 py-2 bg-vallen-card border border-vallen-border rounded-lg text-sm text-vallen-muted hover:text-vallen-white hover:border-vallen-green disabled:opacity-50 transition-colors"
                >
                  {buscando ? 'Carregando...' : 'Carregar mais produtos'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function CatBtn({ label, value, atual, onClick }) {
  const ativo = value === atual
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick(value) }}
      className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-all whitespace-nowrap
        ${ativo
          ? 'bg-vallen-green text-white shadow-sm'
          : 'bg-vallen-dark border border-vallen-border text-vallen-muted hover:text-vallen-white hover:border-vallen-green'
        }`}
    >
      {label}
    </button>
  )
}

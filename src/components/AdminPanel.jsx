import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const PIN_CORRETO = '1234' // altere conforme necessário

// ── Hook: unidade salva no localStorage do tablet ────────────────────────────
export function useUnidade() {
  const [unidade, setUnidadeState] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pdv_unidade') || 'null') }
    catch { return null }
  })

  const salvarUnidade = (u) => {
    localStorage.setItem('pdv_unidade', JSON.stringify(u))
    setUnidadeState(u)
  }

  return { unidade, salvarUnidade }
}

// ── Painel administrativo ─────────────────────────────────────────────────────
export function AdminPanel({ onClose }) {
  const [aba, setAba]           = useState('unidade')   // 'unidade' | 'destaque'
  const [pin, setPin]           = useState('')
  const [autenticado, setAuth]  = useState(false)
  const [pinErro, setPinErro]   = useState(false)

  // Unidades
  const [unidades, setUnidades]       = useState([])
  const [novaUnidade, setNovaUnidade] = useState({ nome: '', codigo: '' })
  const [unidadeAtual, setUnidadeAtual] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pdv_unidade') || 'null') } catch { return null }
  })

  // Destaque
  const [busca, setBusca]         = useState('')
  const [produtos, setProdutos]   = useState([])
  const [loadingP, setLoadingP]   = useState(false)
  const [salvando, setSalvando]   = useState({})

  function verificarPin(e) {
    e.preventDefault()
    if (pin === PIN_CORRETO) { setAuth(true); setPinErro(false) }
    else { setPinErro(true); setPin('') }
  }

  // Carregar unidades
  useEffect(() => {
    if (!autenticado) return
    supabase.from('unidades').select('*').order('nome').then(({ data }) => setUnidades(data || []))
  }, [autenticado])

  // Buscar produtos para destaque
  const buscarProdutos = useCallback(async (termo) => {
    if (!termo.trim()) { setProdutos([]); return }
    setLoadingP(true)
    const { data } = await supabase
      .from('produtos')
      .select('id, nome, destaque, preco')
      .ilike('nome', `%${termo}%`)
      .order('nome')
      .limit(30)
    setProdutos(data || [])
    setLoadingP(false)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => buscarProdutos(busca), 350)
    return () => clearTimeout(t)
  }, [busca, buscarProdutos])

  async function toggleDestaque(produto) {
    setSalvando(s => ({ ...s, [produto.id]: true }))
    const novoValor = !produto.destaque
    await supabase.from('produtos').update({ destaque: novoValor }).eq('id', produto.id)
    setProdutos(prev => prev.map(p => p.id === produto.id ? { ...p, destaque: novoValor } : p))
    setSalvando(s => ({ ...s, [produto.id]: false }))
  }

  async function criarUnidade(e) {
    e.preventDefault()
    if (!novaUnidade.nome || !novaUnidade.codigo) return
    const { data, error } = await supabase
      .from('unidades').insert(novaUnidade).select().single()
    if (!error && data) {
      setUnidades(prev => [...prev, data])
      setNovaUnidade({ nome: '', codigo: '' })
    }
  }

  async function excluirUnidade(id) {
    await supabase.from('unidades').delete().eq('id', id)
    setUnidades(prev => prev.filter(u => u.id !== id))
    if (unidadeAtual?.id === id) {
      localStorage.removeItem('pdv_unidade')
      setUnidadeAtual(null)
    }
  }

  function vincularUnidade(u) {
    localStorage.setItem('pdv_unidade', JSON.stringify(u))
    setUnidadeAtual(u)
    window.location.reload() // recarrega para App pegar a unidade
  }

  // ── PIN ──────────────────────────────────────────────────────────────────
  if (!autenticado) return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-vallen-card border border-vallen-border rounded-xl w-full max-w-xs p-6">
        <h2 className="text-lg font-bold text-vallen-white text-center mb-4">Área Administrativa</h2>
        <form onSubmit={verificarPin} className="space-y-4">
          <input
            type="password" inputMode="numeric" maxLength={6}
            value={pin} onChange={e => setPin(e.target.value)}
            placeholder="PIN"
            autoFocus
            className="w-full bg-vallen-dark border border-vallen-border rounded-lg px-4 py-3 text-center text-2xl tracking-widest text-vallen-white focus:outline-none focus:border-vallen-green"
          />
          {pinErro && <p className="text-red-400 text-sm text-center">PIN incorreto</p>}
          <button type="submit" className="w-full py-3 bg-vallen-green hover:bg-vallen-greenLight text-white font-bold rounded-lg">
            Entrar
          </button>
          <button type="button" onClick={onClose} className="w-full py-2 text-sm text-vallen-muted hover:text-vallen-white">
            Cancelar
          </button>
        </form>
      </div>
    </div>
  )

  // ── Painel ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 bg-vallen-black border-b border-vallen-border">
        <h2 className="text-base font-bold text-vallen-white">Administração</h2>
        <button onClick={onClose} className="text-vallen-muted hover:text-vallen-white text-sm">✕ Fechar</button>
      </div>

      {/* Abas */}
      <div className="flex border-b border-vallen-border">
        {[['unidade','🏪 Unidades'],['destaque','⭐ Destaques']].map(([id, label]) => (
          <button key={id} onClick={() => setAba(id)}
            className={`flex-1 py-3 text-sm font-medium transition-colors
              ${aba === id ? 'text-vallen-green border-b-2 border-vallen-green' : 'text-vallen-muted hover:text-vallen-white'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">

        {/* ── ABA: UNIDADES ── */}
        {aba === 'unidade' && (
          <div className="space-y-4 max-w-lg mx-auto">
            {unidadeAtual && (
              <div className="bg-vallen-green/20 border border-vallen-green rounded-lg px-4 py-3">
                <p className="text-xs text-vallen-muted">Este tablet está vinculado a:</p>
                <p className="text-base font-bold text-vallen-white">{unidadeAtual.nome}</p>
                <p className="text-xs text-vallen-muted font-mono">{unidadeAtual.codigo}</p>
              </div>
            )}

            <h3 className="text-sm font-semibold text-vallen-muted">Unidades cadastradas</h3>
            {unidades.length === 0 && (
              <p className="text-vallen-gray text-sm">Nenhuma unidade cadastrada.</p>
            )}
            {unidades.map(u => (
              <div key={u.id} className="flex items-center justify-between bg-vallen-card border border-vallen-border rounded-lg px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-vallen-white">{u.nome}</p>
                  <p className="text-xs text-vallen-muted font-mono">{u.codigo}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => vincularUnidade(u)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                      ${unidadeAtual?.id === u.id
                        ? 'bg-vallen-green text-white'
                        : 'bg-vallen-border text-vallen-muted hover:bg-vallen-green hover:text-white'}`}>
                    {unidadeAtual?.id === u.id ? '✓ Vinculado' : 'Vincular'}
                  </button>
                  <button onClick={() => excluirUnidade(u.id)}
                    className="px-3 py-1.5 rounded-lg text-xs text-red-400 hover:bg-red-900/30 transition-colors">
                    Excluir
                  </button>
                </div>
              </div>
            ))}

            <h3 className="text-sm font-semibold text-vallen-muted pt-2">Nova unidade</h3>
            <form onSubmit={criarUnidade} className="space-y-3">
              <input
                value={novaUnidade.nome} onChange={e => setNovaUnidade(p => ({...p, nome: e.target.value}))}
                placeholder="Nome (ex: Porto Príncipe)"
                className="w-full bg-vallen-dark border border-vallen-border rounded-lg px-4 py-2.5 text-sm text-vallen-white focus:outline-none focus:border-vallen-green"
              />
              <input
                value={novaUnidade.codigo} onChange={e => setNovaUnidade(p => ({...p, codigo: e.target.value.toUpperCase()}))}
                placeholder="Código (ex: PORTO-01)"
                className="w-full bg-vallen-dark border border-vallen-border rounded-lg px-4 py-2.5 text-sm text-vallen-white font-mono focus:outline-none focus:border-vallen-green"
              />
              <button type="submit"
                className="w-full py-2.5 bg-vallen-green hover:bg-vallen-greenLight text-white font-bold rounded-lg text-sm">
                Cadastrar Unidade
              </button>
            </form>
          </div>
        )}

        {/* ── ABA: DESTAQUE ── */}
        {aba === 'destaque' && (
          <div className="space-y-4 max-w-2xl mx-auto">
            <p className="text-sm text-vallen-muted">
              Produtos marcados como destaque aparecem na tela inicial do PDV.
              Busque pelo nome para localizar e marcar/desmarcar.
            </p>
            <input
              value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="Buscar produto pelo nome..."
              autoFocus
              className="w-full bg-vallen-dark border border-vallen-border rounded-lg px-4 py-2.5 text-sm text-vallen-white focus:outline-none focus:border-vallen-green"
            />

            {loadingP && <p className="text-vallen-muted text-sm text-center">Buscando...</p>}

            {produtos.length === 0 && busca && !loadingP && (
              <p className="text-vallen-gray text-sm text-center">Nenhum produto encontrado.</p>
            )}

            {!busca && (
              <div className="space-y-2">
                <p className="text-xs text-vallen-muted font-medium">PRODUTOS EM DESTAQUE ATUALMENTE</p>
                <DestaqueAtivos />
              </div>
            )}

            <div className="space-y-2">
              {produtos.map(p => (
                <div key={p.id} className="flex items-center justify-between bg-vallen-card border border-vallen-border rounded-lg px-4 py-3">
                  <div className="flex-1 min-w-0 mr-3">
                    <p className="text-sm text-vallen-white truncate">{p.nome}</p>
                    <p className="text-xs text-vallen-muted">R$ {Number(p.preco).toFixed(2)}</p>
                  </div>
                  <button
                    onClick={() => toggleDestaque(p)}
                    disabled={salvando[p.id]}
                    className={`flex-shrink-0 px-4 py-1.5 rounded-lg text-xs font-bold transition-colors
                      ${p.destaque
                        ? 'bg-yellow-500 hover:bg-yellow-400 text-black'
                        : 'bg-vallen-border text-vallen-muted hover:bg-yellow-600 hover:text-white'}`}>
                    {salvando[p.id] ? '...' : p.destaque ? '⭐ Destaque' : 'Marcar'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Lista produtos em destaque
function DestaqueAtivos() {
  const [lista, setLista] = useState([])
  useEffect(() => {
    supabase.from('produtos').select('id, nome, preco').eq('destaque', true).order('nome').limit(50)
      .then(({ data }) => setLista(data || []))
  }, [])
  if (!lista.length) return <p className="text-vallen-gray text-sm">Nenhum produto em destaque ainda.</p>
  return (
    <div className="space-y-1">
      {lista.map(p => (
        <div key={p.id} className="flex justify-between text-sm px-3 py-1.5 bg-yellow-900/20 border border-yellow-800/30 rounded-lg">
          <span className="text-vallen-white truncate">{p.nome}</span>
          <span className="text-vallen-muted ml-2 flex-shrink-0">R$ {Number(p.preco).toFixed(2)}</span>
        </div>
      ))}
    </div>
  )
}

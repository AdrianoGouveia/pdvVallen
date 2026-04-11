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
  const [aba, setAba]           = useState('unidade')
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
  const [busca, setBusca]       = useState('')
  const [produtos, setProdutos] = useState([])
  const [loadingP, setLoadingP] = useState(false)
  const [salvando, setSalvando] = useState({})

  // Pagamentos
  const [cfgPag, setCfgPag]       = useState({ provider_modo: 'auto', limite_efi: 80 })
  const [salvandoCfg, setSalvandoCfg] = useState(false)
  const [cfgSalva, setCfgSalva]   = useState(false)

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

  // Carregar config de pagamento
  useEffect(() => {
    if (!autenticado) return
    supabase.from('config_pagamento').select('provider_modo, limite_efi').eq('id', 1).single()
      .then(({ data }) => { if (data) setCfgPag(data) })
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
    window.location.reload()
  }

  async function salvarConfigPagamento(e) {
    e.preventDefault()
    setSalvandoCfg(true)
    await supabase.from('config_pagamento')
      .update({
        provider_modo: cfgPag.provider_modo,
        limite_efi   : Number(cfgPag.limite_efi),
        updated_at   : new Date().toISOString(),
      })
      .eq('id', 1)
    setSalvandoCfg(false)
    setCfgSalva(true)
    setTimeout(() => setCfgSalva(false), 2500)
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
      <div className="flex border-b border-vallen-border overflow-x-auto">
        {[
          ['unidade',  '🏪 Unidades'],
          ['destaque', '⭐ Destaques'],
          ['pagamento','💳 Pagamentos'],
        ].map(([id, label]) => (
          <button key={id} onClick={() => setAba(id)}
            className={`flex-1 min-w-max py-3 px-4 text-sm font-medium transition-colors whitespace-nowrap
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

        {/* ── ABA: PAGAMENTOS ── */}
        {aba === 'pagamento' && (
          <div className="max-w-lg mx-auto space-y-6">

            {/* Status atual */}
            <div className="bg-vallen-card border border-vallen-border rounded-xl p-4 space-y-1">
              <p className="text-xs text-vallen-muted font-medium uppercase tracking-wide">Gateway ativo agora</p>
              <GatewayAtivo cfg={cfgPag} />
            </div>

            <form onSubmit={salvarConfigPagamento} className="space-y-5">

              {/* Modo */}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-vallen-muted">Modo de seleção do gateway</label>
                <div className="space-y-2">
                  {[
                    ['auto',  '🔀 Automático (EFI até limite, Asaas acima)'],
                    ['efi',   '🟢 Sempre EFI Pay'],
                    ['asaas', '🔵 Sempre Asaas'],
                  ].map(([val, label]) => (
                    <label key={val} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors
                      ${cfgPag.provider_modo === val
                        ? 'border-vallen-green bg-vallen-green/10'
                        : 'border-vallen-border bg-vallen-card hover:border-vallen-green/50'}`}>
                      <input
                        type="radio" name="provider_modo" value={val}
                        checked={cfgPag.provider_modo === val}
                        onChange={() => setCfgPag(c => ({ ...c, provider_modo: val }))}
                        className="accent-vallen-green"
                      />
                      <span className="text-sm text-vallen-white">{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Limite EFI (só aparece no modo auto) */}
              {cfgPag.provider_modo === 'auto' && (
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-vallen-muted">
                    Limite para EFI Pay (R$)
                  </label>
                  <p className="text-xs text-vallen-gray">
                    Pagamentos até este valor usam EFI Pay. Acima disso, usa Asaas.
                  </p>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-vallen-muted text-sm">R$</span>
                    <input
                      type="number" min="1" max="9999" step="0.01"
                      value={cfgPag.limite_efi}
                      onChange={e => setCfgPag(c => ({ ...c, limite_efi: e.target.value }))}
                      className="w-full bg-vallen-dark border border-vallen-border rounded-lg pl-10 pr-4 py-2.5 text-sm text-vallen-white focus:outline-none focus:border-vallen-green"
                    />
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {[50, 80, 100, 150, 200].map(v => (
                      <button key={v} type="button"
                        onClick={() => setCfgPag(c => ({ ...c, limite_efi: v }))}
                        className={`px-3 py-1 rounded-lg text-xs transition-colors
                          ${Number(cfgPag.limite_efi) === v
                            ? 'bg-vallen-green text-white'
                            : 'bg-vallen-border text-vallen-muted hover:text-vallen-white'}`}>
                        R$ {v}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Info gateways */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-vallen-dark border border-vallen-border rounded-lg p-3">
                  <p className="text-xs font-bold text-green-400 mb-1">EFI Pay</p>
                  <p className="text-xs text-vallen-muted">PIX dinâmico com certificado mTLS</p>
                  <p className="text-xs text-vallen-gray mt-1">Sem taxa fixa por transação</p>
                </div>
                <div className="bg-vallen-dark border border-vallen-border rounded-lg p-3">
                  <p className="text-xs font-bold text-blue-400 mb-1">Asaas</p>
                  <p className="text-xs text-vallen-muted">PIX via API Asaas</p>
                  <p className="text-xs text-vallen-gray mt-1">Fallback para valores altos</p>
                </div>
              </div>

              <button type="submit" disabled={salvandoCfg}
                className="w-full py-3 bg-vallen-green hover:bg-vallen-greenLight disabled:opacity-50 text-white font-bold rounded-lg text-sm transition-colors">
                {salvandoCfg ? 'Salvando...' : cfgSalva ? '✓ Configuração salva!' : 'Salvar configuração'}
              </button>
            </form>
          </div>
        )}

      </div>
    </div>
  )
}

// ── Sub-componentes ──────────────────────────────────────────────────────────

function GatewayAtivo({ cfg }) {
  if (cfg.provider_modo === 'efi') {
    return <p className="text-base font-bold text-green-400">EFI Pay (sempre)</p>
  }
  if (cfg.provider_modo === 'asaas') {
    return <p className="text-base font-bold text-blue-400">Asaas (sempre)</p>
  }
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="text-sm text-green-400 font-bold">EFI Pay</span>
      <span className="text-xs text-vallen-muted">até R$ {Number(cfg.limite_efi).toFixed(2)}</span>
      <span className="text-vallen-border">→</span>
      <span className="text-sm text-blue-400 font-bold">Asaas</span>
      <span className="text-xs text-vallen-muted">acima</span>
    </div>
  )
}

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

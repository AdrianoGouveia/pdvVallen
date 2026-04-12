import { useState, useEffect, useRef } from 'react'
import { Html5Qrcode }  from 'html5-qrcode'
import { supabase }     from '../../lib/supabase.js'
import { LogoVR }       from '../components/Logo.jsx'

const HIST_KEY = 'vr_historico'

export default function ScannerReposicao({ ctx, onProduto, onVoltar }) {
  const [manual, setManual]         = useState('')
  const [busca, setBusca]           = useState('')
  const [resultados, setResultados] = useState([])
  const [modalNome, setModalNome]   = useState(false)
  const [loading, setLoading]       = useState(false)
  const [erro, setErro]             = useState('')
  const [scanAtivo, setScanAtivo]   = useState(true)
  const scannerRef  = useRef(null)
  const buscandoRef = useRef(false)   // guard: evita disparos duplos do scanner

  const historico = JSON.parse(localStorage.getItem(HIST_KEY) || '[]')

  // ── Iniciar câmera ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!scanAtivo) return

    const scanner = new Html5Qrcode('qr-reader', { verbose: false })
    scannerRef.current = scanner

    scanner.start(
      { facingMode: 'environment' },
      { fps: 12, qrbox: { width: 280, height: 170 } },
      async (codigo) => {
        if (buscandoRef.current) return   // guard: descarta disparos duplos
        buscandoRef.current = true
        try {
          await scanner.stop()
        } catch { /* ignora */ }
        setScanAtivo(false)
        await buscarProduto(codigo.trim())
      },
      () => {} // ignora erros de frame (sem QR visível)
    ).catch(err => {
      setErro('Câmera não disponível. Use o campo de texto abaixo.')
      console.warn('html5-qrcode:', err)
    })

    return () => { scanner.stop().catch(() => {}); scanner.clear().catch(() => {}) }
  }, [scanAtivo])

  // ── Buscar produto por código ───────────────────────────────────────────────
  async function buscarProduto(codigo) {
    setErro(''); setLoading(true)
    try {
      const { data: produto, error: errP } = await supabase
        .from('produtos').select('*')
        .eq('codigo_barras', codigo)
        .maybeSingle()

      if (errP) throw errP

      if (!produto) {
        setErro(`Código "${codigo}" não cadastrado no sistema.`)
        setLoading(false)
        buscandoRef.current = false
        setScanAtivo(true)
        return
      }

      const { data: estoqueItem } = await supabase
        .from('estoque').select('*')
        .eq('unidade_id', ctx.condominio.id)
        .eq('produto_id', produto.id)
        .maybeSingle()

      setLoading(false)
      onProduto({ produto, estoqueItem })
    } catch (err) {
      console.error('buscarProduto:', err)
      setErro('Erro ao buscar produto. Tente novamente.')
      setLoading(false)
      buscandoRef.current = false
      setScanAtivo(true)
    }
  }

  function handleManual(e) {
    e.preventDefault()
    if (!manual.trim()) return
    scannerRef.current?.stop().catch(() => {})
    setScanAtivo(false)
    buscarProduto(manual.trim())
  }

  async function buscarPorNome() {
    if (!busca.trim()) return
    setLoading(true)
    const { data } = await supabase
      .from('produtos').select('id, nome, codigo_barras, preco, imagem_url')
      .ilike('nome', `%${busca}%`).limit(25)
    setResultados(data || [])
    setLoading(false)
  }

  function reativarScanner() {
    setErro('')
    setManual('')
    setScanAtivo(true)
  }

  return (
    <div className="min-h-screen bg-black flex flex-col">

      {/* ── Header ── */}
      <header className="bg-zinc-950 border-b border-zinc-800 px-4 py-3 flex items-center gap-3 sticky top-0 z-20">
        <button onClick={onVoltar} className="text-zinc-400 hover:text-white p-1 text-xl leading-none">←</button>
        <LogoVR size={30} />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-pink-500 font-bold uppercase tracking-[0.18em]">Reposição</p>
          <p className="text-sm text-white font-semibold truncate leading-tight">{ctx.condominio.nome}</p>
        </div>
        <span className="text-[10px] text-zinc-400 bg-zinc-800 border border-zinc-700 px-2 py-1 rounded-lg max-w-[100px] truncate">
          {ctx.armazem.nome}
        </span>
      </header>

      {/* ── Câmera ── */}
      <div className="relative bg-zinc-950 border-b border-zinc-800">
        <div id="qr-reader" className="w-full" />
        {/* Mira sobreposta */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative w-64 h-36">
            {/* Cantos rosa */}
            {[
              'top-0 left-0 border-t-2 border-l-2 rounded-tl-lg',
              'top-0 right-0 border-t-2 border-r-2 rounded-tr-lg',
              'bottom-0 left-0 border-b-2 border-l-2 rounded-bl-lg',
              'bottom-0 right-0 border-b-2 border-r-2 rounded-br-lg',
            ].map((cls, i) => (
              <div key={i} className={`absolute w-6 h-6 border-pink-500 ${cls}`} />
            ))}
            {/* Linha de scan animada */}
            <div className="absolute inset-x-2 top-1/2 h-0.5 bg-pink-500/70 rounded-full"
              style={{ animation: 'scanLine 2s ease-in-out infinite' }} />
          </div>
        </div>
        <p className="text-center text-xs text-zinc-600 py-2">
          Aponte para o código de barras do produto
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">

        {/* Erro */}
        {erro && (
          <div className="bg-red-950/80 border border-red-700/60 rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
            <p className="text-red-300 text-sm flex-1">{erro}</p>
            <button onClick={reativarScanner}
              className="text-xs text-pink-400 hover:text-pink-300 font-bold whitespace-nowrap">
              Tentar novamente
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center gap-3 py-4 text-pink-400">
            <div className="w-5 h-5 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Buscando produto...</span>
          </div>
        )}

        {/* Input manual */}
        <form onSubmit={handleManual} className="flex gap-2">
          <input
            type="text"
            value={manual}
            onChange={e => setManual(e.target.value)}
            placeholder="Digitar código de barras..."
            inputMode="numeric"
            className="flex-1 bg-zinc-900 border-2 border-zinc-700 focus:border-pink-500 text-white rounded-2xl px-4 py-3.5 text-base focus:outline-none transition-colors placeholder:text-zinc-600"
          />
          <button type="submit" disabled={!manual.trim()}
            className="bg-pink-500 hover:bg-pink-400 disabled:opacity-40 text-white px-5 rounded-2xl font-black text-xl transition-colors active:scale-95">
            →
          </button>
        </form>

        {/* Buscar por nome */}
        <button
          onClick={() => { setModalNome(true); setResultados([]); setBusca('') }}
          className="w-full py-3.5 rounded-2xl border-2 border-zinc-700 hover:border-pink-500 text-zinc-400 hover:text-pink-400 text-sm font-medium transition-all">
          🔍 Buscar produto por nome
        </button>

        {/* ── Histórico (últimos 8) ── */}
        {historico.length > 0 && (
          <div className="pt-2">
            <p className="text-[10px] text-zinc-600 uppercase tracking-[0.2em] font-bold mb-3">
              Últimos atualizados
            </p>
            <div className="space-y-1.5">
              {historico.slice(0, 8).map((h, i) => (
                <button key={i} onClick={() => buscarProduto(h.codigo_barras)}
                  className="w-full flex items-center gap-3 bg-zinc-900 hover:bg-zinc-800 rounded-2xl px-3.5 py-3 transition-colors active:scale-[0.98] text-left">
                  <div className="w-9 h-9 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-pink-500 font-black text-sm flex-shrink-0">
                    {h.nome?.charAt(0) ?? '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-semibold truncate">{h.nome}</p>
                    <p className="text-[10px] text-zinc-500 font-mono">{h.codigo_barras}</p>
                  </div>
                  <span className="text-pink-500 text-lg leading-none">›</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Modal busca por nome ── */}
      {modalNome && (
        <div className="fixed inset-0 bg-black z-50 flex flex-col">
          <div className="bg-zinc-950 border-b border-zinc-800 px-4 py-3 flex items-center gap-3">
            <button
              onClick={() => setModalNome(false)}
              className="text-zinc-400 hover:text-white text-xl leading-none p-1">
              ←
            </button>
            <p className="text-white font-bold">Buscar produto por nome</p>
          </div>

          <div className="px-4 pt-4 pb-2 flex gap-2">
            <input
              autoFocus
              type="text"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && buscarPorNome()}
              placeholder="Ex: Coca Cola, Arroz..."
              className="flex-1 bg-zinc-900 border-2 border-zinc-700 focus:border-pink-500 text-white rounded-2xl px-4 py-3 focus:outline-none transition-colors"
            />
            <button onClick={buscarPorNome}
              className="bg-pink-500 hover:bg-pink-400 text-white px-5 rounded-2xl font-black transition-colors active:scale-95">
              Buscar
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2">
            {loading && (
              <div className="flex items-center justify-center gap-2 py-8 text-pink-400">
                <div className="w-5 h-5 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Buscando...</span>
              </div>
            )}
            {resultados.map(p => (
              <button key={p.id}
                onClick={() => { setModalNome(false); buscarProduto(p.codigo_barras) }}
                className="w-full flex items-center gap-3 bg-zinc-900 hover:bg-zinc-800 rounded-2xl px-4 py-3 transition-colors active:scale-[0.98] text-left">
                {p.imagem_url
                  ? <img src={p.imagem_url} alt="" className="w-11 h-11 rounded-xl object-cover flex-shrink-0" />
                  : <div className="w-11 h-11 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-pink-500 font-black flex-shrink-0">
                      {p.nome?.charAt(0)}
                    </div>
                }
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-sm truncate">{p.nome}</p>
                  <p className="text-zinc-500 text-xs font-mono">{p.codigo_barras}</p>
                </div>
                <span className="text-pink-500 font-bold">R$ {Number(p.preco).toFixed(2)}</span>
              </button>
            ))}
            {!loading && busca && resultados.length === 0 && (
              <p className="text-center text-zinc-600 py-10 text-sm">Nenhum produto encontrado</p>
            )}
          </div>
        </div>
      )}

      {/* CSS da linha de scan */}
      <style>{`
        @keyframes scanLine {
          0%, 100% { transform: translateY(-52px); opacity: 0.5; }
          50%       { transform: translateY(52px);  opacity: 1; }
        }
      `}</style>
    </div>
  )
}

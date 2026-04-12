import { useState } from 'react'
import { supabase } from '../../lib/supabase.js'
import { LogoVR }   from '../components/Logo.jsx'

const HIST_KEY = 'vr_historico'

// ── Utilitários ─────────────────────────────────────────────────────────────
function tocarSucesso() {
  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)()
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.type             = 'sine'
    osc.frequency.value  = 880
    gain.gain.setValueAtTime(0.25, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
    osc.start(); osc.stop(ctx.currentTime + 0.5)
  } catch { /* silencia erros de AudioContext */ }
}

function salvarHistorico(produto) {
  const prev = JSON.parse(localStorage.getItem(HIST_KEY) || '[]')
  const novo  = [
    { nome: produto.nome, codigo_barras: produto.codigo_barras, ts: Date.now() },
    ...prev.filter(h => h.codigo_barras !== produto.codigo_barras),
  ].slice(0, 8)
  localStorage.setItem(HIST_KEY, JSON.stringify(novo))
}

// ── Componente principal ─────────────────────────────────────────────────────
export default function ProdutoForm({ ctx, prod, onSalvo, onVoltar }) {
  const { produto, estoqueItem } = prod
  const custo = Number(produto.preco_custo ?? 0)

  const [qtd, setQtd]       = useState(String(estoqueItem?.quantidade ?? 0))
  const [preco, setPreco]   = useState(Number(produto.preco ?? 0).toFixed(2))
  const [markup, setMarkup] = useState(Number(produto.markup ?? 0).toFixed(1))
  const [venc, setVenc]     = useState('')
  const [saving, setSaving] = useState(false)
  const [sucesso, setSucesso] = useState(false)
  const [erros, setErros]   = useState({})

  // Cálculos de margem
  const precoN   = parseFloat(preco) || 0
  const margem   = precoN - custo
  const margemPct = custo > 0 ? (margem / custo) * 100 : 0
  const margemOk  = custo === 0 || precoN > custo

  // ── Cálculo automático markup ↔ preço ──────────────────────────────────────
  function handleMarkup(v) {
    setMarkup(v)
    const m = parseFloat(v) || 0
    if (custo > 0 && m > 0) setPreco((custo * (1 + m / 100)).toFixed(2))
  }

  function handlePreco(v) {
    setPreco(v)
    const p = parseFloat(v) || 0
    if (custo > 0 && p > 0) setMarkup((((p / custo) - 1) * 100).toFixed(1))
  }

  // ── Validação ──────────────────────────────────────────────────────────────
  function validar() {
    const e = {}
    if (parseInt(qtd) <= 0 || isNaN(parseInt(qtd)))
      e.qtd  = 'Quantidade deve ser maior que zero'
    if (!venc)
      e.venc = 'Data de vencimento obrigatória'
    else if (new Date(venc) < new Date(new Date().toDateString()))
      e.venc = 'Data não pode estar no passado'
    setErros(e)
    return Object.keys(e).length === 0
  }

  // ── Salvar ─────────────────────────────────────────────────────────────────
  async function salvar() {
    if (!validar()) return
    setSaving(true)

    // 1. Atualizar produto (preço e markup)
    await supabase.from('produtos').update({
      preco : precoN,
      markup: parseFloat(markup) || null,
    }).eq('id', produto.id)

    // 2. Upsert estoque no condomínio
    if (estoqueItem) {
      await supabase.from('estoque')
        .update({ quantidade: parseInt(qtd) })
        .eq('id', estoqueItem.id)
    } else {
      await supabase.from('estoque').insert({
        unidade_id: ctx.condominio.id,
        produto_id: produto.id,
        quantidade : parseInt(qtd),
      })
    }

    // 3. Registrar reposição com data de vencimento
    await supabase.from('reposicoes').insert({
      produto_id     : produto.id,
      unidade_id     : ctx.condominio.id,
      quantidade     : parseInt(qtd),
      preco_custo    : custo || null,
      preco_venda    : precoN,
      markup         : parseFloat(markup) || null,
      data_vencimento: venc,
    })

    salvarHistorico(produto)
    tocarSucesso()
    if ('vibrate' in navigator) navigator.vibrate([100, 50, 100])

    setSaving(false)
    setSucesso(true)
  }

  // ── Tela de sucesso ────────────────────────────────────────────────────────
  async function reporMaisLote() {
    // Recarrega quantidade atual do banco e limpa campos de lote
    const { data: est } = await supabase.from('estoque')
      .select('quantidade')
      .eq('unidade_id', ctx.condominio.id)
      .eq('produto_id', produto.id)
      .maybeSingle()
    setQtd(String(est?.quantidade ?? parseInt(qtd)))
    setVenc('')
    setErros({})
    setSucesso(false)
  }

  if (sucesso) return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-8 gap-6">
      {/* Ícone animado */}
      <div className="w-28 h-28 rounded-full bg-pink-500/15 border-2 border-pink-500 flex items-center justify-center"
        style={{ animation: 'pulseGlow 1.5s ease-in-out infinite' }}>
        <svg className="w-14 h-14" fill="none" viewBox="0 0 24 24" stroke="#ec4899" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>

      <div className="text-center">
        <h2 className="text-3xl font-black text-white">Reposição salva!</h2>
        <p className="text-zinc-400 text-sm mt-2 max-w-xs">{produto.nome}</p>
        <p className="text-pink-500 font-bold mt-1">
          {parseInt(qtd)} un · vence {new Date(venc + 'T12:00:00').toLocaleDateString('pt-BR')}
        </p>
      </div>

      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button onClick={reporMaisLote}
          className="w-full py-4 bg-pink-500 hover:bg-pink-400 text-white font-black rounded-2xl text-base transition-all active:scale-95 shadow-[0_0_25px_rgba(236,72,153,0.4)]">
          📦 Repor outro lote do mesmo produto
        </button>
        <button onClick={onSalvo}
          className="w-full py-3.5 border-2 border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-white rounded-2xl text-sm font-medium transition-colors">
          ← Escanear outro produto
        </button>
      </div>

      <style>{`
        @keyframes pulseGlow {
          0%, 100% { box-shadow: 0 0 15px rgba(236,72,153,0.3); }
          50%       { box-shadow: 0 0 40px rgba(236,72,153,0.6); }
        }
      `}</style>
    </div>
  )

  // ── Tela do formulário ─────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-black flex flex-col">

      {/* Header */}
      <header className="bg-zinc-950 border-b border-zinc-800 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={onVoltar} className="text-zinc-400 hover:text-white text-xl leading-none p-1">←</button>
        <LogoVR size={28} />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-pink-500 font-bold uppercase tracking-[0.18em]">Reposição</p>
          <p className="text-xs text-zinc-400 truncate">{ctx.condominio.nome}</p>
        </div>
        {/* Botão flutuante voltar ao scanner */}
        <button onClick={onVoltar}
          className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs text-zinc-300 px-3 py-1.5 rounded-xl transition-colors">
          Scanner
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 pb-10 space-y-4">

        {/* Card do produto */}
        <div className="bg-zinc-900 rounded-2xl overflow-hidden border border-zinc-800">
          {produto.imagem_url && (
            <div className="bg-zinc-800 h-44 flex items-center justify-center overflow-hidden">
              <img src={produto.imagem_url} alt={produto.nome}
                className="h-full w-full object-contain" />
            </div>
          )}
          <div className="p-4">
            {produto.categoria && (
              <span className="text-[10px] text-pink-500 font-bold uppercase tracking-[0.15em]">
                {produto.categoria}
              </span>
            )}
            <h2 className="text-lg font-black text-white leading-snug mt-0.5">{produto.nome}</h2>
            <p className="text-zinc-500 text-xs font-mono mt-1">{produto.codigo_barras}</p>
          </div>
        </div>

        {/* Preço de compra — BLOQUEADO */}
        <div className="bg-zinc-900/60 rounded-2xl p-4 border border-zinc-800 flex items-center justify-between">
          <div>
            <p className="text-[10px] text-zinc-600 uppercase tracking-[0.15em] font-bold">
              Preço de Compra (bloqueado)
            </p>
            <p className="text-2xl font-black text-zinc-500 mt-1">
              {custo > 0 ? `R$ ${custo.toFixed(2)}` : '—'}
            </p>
          </div>
          <div className="text-3xl opacity-20">🔒</div>
        </div>

        {/* Quantidade */}
        <div>
          <label className="block text-xs text-pink-400 font-bold uppercase tracking-[0.15em] mb-2">
            Quantidade em estoque *
          </label>
          <input
            type="number" min="0" inputMode="numeric"
            value={qtd}
            onChange={e => setQtd(e.target.value)}
            className={`w-full bg-zinc-900 border-2 rounded-2xl px-5 py-4 text-3xl font-black text-center text-white focus:outline-none transition-colors
              ${erros.qtd ? 'border-red-500' : 'border-zinc-700 focus:border-pink-500'}`}
          />
          {erros.qtd && <p className="text-red-400 text-xs mt-1.5 ml-1">{erros.qtd}</p>}
        </div>

        {/* Markup % + Preço de Venda */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-pink-400 font-bold uppercase tracking-[0.12em] mb-2">
              Markup %
            </label>
            <input
              type="number" step="0.1" min="0" inputMode="decimal"
              value={markup}
              onChange={e => handleMarkup(e.target.value)}
              className="w-full bg-zinc-900 border-2 border-zinc-700 focus:border-pink-500 text-white rounded-2xl px-4 py-3.5 text-xl font-bold focus:outline-none transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs text-pink-400 font-bold uppercase tracking-[0.12em] mb-2">
              Preço de Venda *
            </label>
            <input
              type="number" step="0.01" min="0" inputMode="decimal"
              value={preco}
              onChange={e => handlePreco(e.target.value)}
              className={`w-full bg-zinc-900 border-2 rounded-2xl px-4 py-3.5 text-xl font-bold text-white focus:outline-none transition-colors
                ${erros.preco ? 'border-red-500' : !margemOk && custo > 0 ? 'border-amber-500' : 'border-zinc-700 focus:border-pink-500'}`}
            />
          </div>
        </div>

        {/* Margem de lucro */}
        {custo > 0 && precoN > 0 && (
          <div className={`rounded-2xl px-5 py-3.5 flex items-center justify-between border
            ${margemOk
              ? 'bg-emerald-950/60 border-emerald-800/60'
              : 'bg-amber-950/60 border-amber-800/60'}`}>
            <div>
              <p className="text-[10px] text-zinc-500 uppercase tracking-[0.15em] font-bold">
                {margemOk ? 'Margem de lucro' : '⚠ Preço abaixo do custo'}
              </p>
              <p className={`text-2xl font-black mt-0.5 ${margemOk ? 'text-emerald-400' : 'text-amber-400'}`}>
                R$ {margem.toFixed(2)}
              </p>
            </div>
            <p className={`text-3xl font-black ${margemOk ? 'text-emerald-500' : 'text-amber-500'}`}>
              {margemPct.toFixed(1)}%
            </p>
          </div>
        )}

        {/* Data de vencimento */}
        <div>
          <label className="block text-xs text-pink-400 font-bold uppercase tracking-[0.15em] mb-2">
            Data de Vencimento *
          </label>
          <input
            type="date"
            value={venc}
            onChange={e => setVenc(e.target.value)}
            min={new Date().toISOString().split('T')[0]}
            className={`w-full bg-zinc-900 border-2 rounded-2xl px-5 py-4 text-base text-white focus:outline-none transition-colors
              ${erros.venc ? 'border-red-500' : 'border-zinc-700 focus:border-pink-500'}`}
          />
          {erros.venc && <p className="text-red-400 text-xs mt-1.5 ml-1">{erros.venc}</p>}
        </div>

        {/* Botão Salvar */}
        <button
          onClick={salvar}
          disabled={saving}
          className={`w-full py-5 rounded-2xl font-black text-xl text-white transition-all active:scale-95 mt-2
            ${saving
              ? 'bg-pink-700 opacity-60'
              : 'bg-pink-500 hover:bg-pink-400 shadow-[0_0_35px_rgba(236,72,153,0.4)] hover:shadow-[0_0_50px_rgba(236,72,153,0.65)]'}`}
        >
          {saving ? 'Salvando...' : '💾 Salvar Reposição'}
        </button>

      </div>
    </div>
  )
}

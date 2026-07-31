import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { tocarSucesso, tocarErro } from '../../mesa/utils/audio.js'
import { Header } from '../components/Header'
import { ScanBox } from '../components/ScanBox'
import { DateInput } from '../components/DateInput'

const num = (v) => parseFloat(String(v).replace(',', '.')) || 0
const inputCls = 'w-full min-w-0 bg-vallen-dark border border-vallen-border rounded-xl px-3 py-3 text-lg text-vallen-white focus:outline-none focus:border-vallen-green'

// Entrada de estoque (recebimento). Produto conhecido → soma ao estoque (+ custo,
// + validade). Produto novo (ou fora do planograma) → já faz o cadastro com custo.
export function EntradaEstoque({ unidadeId, unidadeNome, onVoltar }) {
  const [modo, setModo]       = useState('scan')  // 'scan' | 'entrada' | 'cadastro'
  const [produto, setProduto] = useState(null)
  const [codigo, setCodigo]   = useState(null)
  const [cats, setCats]       = useState([])
  const [salvando, setSalvando] = useState(false)
  const [toast, setToast] = useState(null)
  const abertoRef = useRef(false)

  const [qtd, setQtd]       = useState('')
  const [custo, setCusto]   = useState('')
  const [validade, setVal]  = useState('')
  const [nome, setNome]     = useState('')
  const [venda, setVenda]   = useState('')
  const [categoria, setCat] = useState('')

  useEffect(() => {
    supabase.rpc('listar_categorias_unidade', { p_unidade_id: unidadeId }).then(({ data }) => setCats(data || []))
  }, [unidadeId])

  function limpar() {
    abertoRef.current = false
    setModo('scan'); setProduto(null); setCodigo(null)
    setQtd(''); setCusto(''); setVal(''); setNome(''); setVenda(''); setCat('')
  }
  // salvou → volta pra câmera na hora (com um aviso rápido) pro próximo produto
  function concluir(msg) { limpar(); setToast(msg); setTimeout(() => setToast(null), 2600) }

  function aoProduto(row) {
    if (abertoRef.current) return
    abertoRef.current = true
    if (row.no_planograma) {              // conhecido no catálogo mas fora desta loja → cadastra/adiciona
      setCodigo(row.codigo_barras); setNome(row.nome); setVenda(row.preco_ref ? String(row.preco_ref) : '')
      setCat(row.categoria || ''); setModo('cadastro')
    } else {
      setProduto(row); setModo('entrada')
    }
  }
  function aoDesconhecido(cod) {
    if (abertoRef.current) return
    abertoRef.current = true
    setCodigo(cod); setModo('cadastro')
  }

  async function darEntrada() {
    const n = parseInt(qtd, 10)
    if (Number.isNaN(n) || n <= 0) { tocarErro(); return }
    setSalvando(true)
    const c = num(custo)
    const { data, error } = await supabase.rpc('registrar_entrada', {
      p_unidade_id: unidadeId, p_produto_id: produto.produto_id, p_qtd: n,
      p_validade: validade || null, p_preco_custo: c > 0 ? c : null,
    })
    setSalvando(false)
    if (error) { tocarErro(); alert(error.message); return }
    const novo = Array.isArray(data) ? data[0] : data
    tocarSucesso(); concluir(`✅ +${n} ${produto.nome} · estoque ${novo}`)
  }

  async function cadastrarComEntrada() {
    const v = num(venda), c = num(custo), n = parseInt(qtd, 10)
    if (!nome.trim()) { tocarErro(); return }
    if (v <= 0) { tocarErro(); return }
    if (Number.isNaN(n) || n <= 0) { tocarErro(); return }
    const markup = c > 0 && v > 0 ? Math.round(((v - c) / c) * 1000) / 10 : null
    const cat = cats.find(x => x.nome === categoria)
    setSalvando(true)
    const { data, error } = await supabase.rpc('cadastrar_produto_pendencia', {
      p_unidade_id: unidadeId, p_codigo_barras: codigo, p_nome: nome.trim(), p_preco_venda: v,
      p_categoria: categoria || '', p_emoji: cat?.emoji || '', p_imagem_url: '', p_restrito_idade: false,
      p_quantidade: n, p_controla_estoque: true, p_preco_custo: c > 0 ? c : null, p_markup: markup,
    })
    if (error) { setSalvando(false); tocarErro(); alert(error.message); return }
    const produtoId = Array.isArray(data) ? data[0] : data
    if (validade && produtoId) {
      await supabase.rpc('registrar_validade', { p_unidade_id: unidadeId, p_produto_id: produtoId, p_data_validade: validade, p_quantidade: n })
    }
    setSalvando(false); tocarSucesso(); concluir(`✅ ${nome.trim()} cadastrado · +${n} no estoque`)
  }

  const markupView = (() => { const c = num(custo), v = num(venda); return c > 0 && v > 0 ? ((v - c) / c) * 100 : null })()

  // ---- entrada (produto conhecido)
  if (modo === 'entrada' && produto) {
    return (
      <div className="flex flex-col h-full bg-vallen-dark">
        <Header titulo="Entrada de estoque" emoji="📥" unidadeNome={unidadeNome} onVoltar={limpar} />
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="text-center">
            <span className="text-5xl">{produto.emoji || '📦'}</span>
            <p className="text-vallen-white font-bold text-xl mt-2">{produto.nome}</p>
            <p className="text-vallen-muted text-sm">Estoque atual: {produto.quantidade ?? 0}</p>
          </div>
          <label className="block">
            <span className="text-vallen-white font-semibold text-sm">Quantas chegaram?</span>
            <div className="mt-1 flex items-center gap-3">
              <button onClick={() => setQtd(q => String(Math.max(0, (parseInt(q, 10) || 0) - 1)))} className="w-14 h-14 rounded-xl bg-vallen-card border border-vallen-border text-vallen-white text-2xl">−</button>
              <input value={qtd} onChange={e => setQtd(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="0" autoFocus
                className="flex-1 h-14 text-center bg-vallen-dark border-2 border-vallen-green rounded-xl text-vallen-white text-3xl font-black focus:outline-none" />
              <button onClick={() => setQtd(q => String((parseInt(q, 10) || 0) + 1))} className="w-14 h-14 rounded-xl bg-vallen-card border border-vallen-border text-vallen-white text-2xl">+</button>
            </div>
          </label>
          <label className="block">
            <span className="text-vallen-white font-semibold text-sm">Preço de custo <span className="text-vallen-muted font-normal">(atualiza se preencher)</span></span>
            <div className="mt-1 flex items-center gap-1">
              <span className="text-vallen-muted text-lg font-bold">R$</span>
              <input value={custo} onChange={e => setCusto(e.target.value.replace(/[^\d.,]/g, ''))} inputMode="decimal" placeholder="0,00" className={inputCls} />
            </div>
          </label>
          <label className="block">
            <span className="text-vallen-white font-semibold text-sm">Validade <span className="text-vallen-muted font-normal">(opcional)</span></span>
            <DateInput key={produto.produto_id} value={validade} onChange={setVal} className={`mt-1 ${inputCls}`} />
          </label>
        </div>
        <div className="p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] border-t border-vallen-border bg-vallen-black">
          <button onClick={darEntrada} disabled={salvando || !qtd || parseInt(qtd, 10) <= 0}
            className="w-full py-4 bg-vallen-green disabled:opacity-40 text-white font-bold rounded-2xl text-lg">
            {salvando ? 'Salvando…' : `Dar entrada${qtd ? ` (+${qtd})` : ''}`}
          </button>
        </div>
      </div>
    )
  }

  // ---- cadastro (produto novo ou fora do planograma)
  if (modo === 'cadastro') {
    return (
      <div className="flex flex-col h-full bg-vallen-dark">
        <Header titulo="Produto novo — entrada" emoji="➕" unidadeNome={unidadeNome} onVoltar={limpar} />
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <p className="text-vallen-muted text-sm text-center">Código: {codigo}</p>
          <label className="block">
            <span className="text-vallen-white font-semibold text-sm">Nome do produto</span>
            <input value={nome} onChange={e => setNome(e.target.value)} autoFocus placeholder="Ex.: Coca-Cola 350ml" className={`mt-1 ${inputCls}`} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-vallen-white font-semibold text-sm">Preço de custo</span>
              <div className="mt-1 flex items-center gap-1"><span className="text-vallen-muted text-lg font-bold">R$</span>
                <input value={custo} onChange={e => setCusto(e.target.value.replace(/[^\d.,]/g, ''))} inputMode="decimal" placeholder="0,00" className={inputCls} /></div>
            </label>
            <label className="block">
              <span className="text-vallen-white font-semibold text-sm">Preço de venda</span>
              <div className="mt-1 flex items-center gap-1"><span className="text-vallen-white text-lg font-bold">R$</span>
                <input value={venda} onChange={e => setVenda(e.target.value.replace(/[^\d.,]/g, ''))} inputMode="decimal" placeholder="0,00" className={inputCls} /></div>
            </label>
          </div>
          {markupView != null && <p className="text-center text-sm font-semibold text-vallen-green -mt-1">Markup: {markupView.toFixed(1).replace('.', ',')}%</p>}
          {cats.length > 0 && (
            <div>
              <span className="text-vallen-white font-semibold text-sm">Categoria</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {cats.map(c => (
                  <button key={c.nome} onClick={() => setCat(c.nome === categoria ? '' : c.nome)}
                    className={`px-4 py-2.5 rounded-xl border font-semibold text-sm ${categoria === c.nome ? 'bg-vallen-green border-vallen-green text-white' : 'bg-vallen-card border-vallen-border text-vallen-white'}`}>
                    {c.emoji} {c.nome}
                  </button>
                ))}
              </div>
            </div>
          )}
          <label className="block">
            <span className="text-vallen-white font-semibold text-sm">Quantidade que chegou</span>
            <input value={qtd} onChange={e => setQtd(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="0" className={`mt-1 ${inputCls}`} />
          </label>
          <label className="block">
            <span className="text-vallen-white font-semibold text-sm">Validade <span className="text-vallen-muted font-normal">(opcional)</span></span>
            <DateInput key={codigo} value={validade} onChange={setVal} className={`mt-1 ${inputCls}`} />
          </label>
        </div>
        <div className="p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] border-t border-vallen-border bg-vallen-black">
          <button onClick={cadastrarComEntrada} disabled={salvando || !nome.trim() || !venda || !qtd}
            className="w-full py-4 bg-vallen-green disabled:opacity-40 text-white font-bold rounded-2xl text-lg">
            {salvando ? 'Salvando…' : 'Cadastrar + dar entrada'}
          </button>
        </div>
      </div>
    )
  }

  // ---- escaneando (câmera aberta pro próximo produto; toast do último salvo)
  return (
    <div className="flex flex-col h-full bg-vallen-dark">
      <Header titulo="Entrada de estoque" emoji="📥" unidadeNome={unidadeNome} onVoltar={onVoltar} />
      {toast && (
        <div className="bg-vallen-green text-white px-4 py-3 text-center font-semibold flex-shrink-0 text-sm">{toast}</div>
      )}
      <ScanBox unidadeId={unidadeId} onProduto={aoProduto} onDesconhecido={aoDesconhecido} hint="Escaneie o próximo produto" />
    </div>
  )
}

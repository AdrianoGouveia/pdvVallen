import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { tocarSucesso, tocarErro } from '../../mesa/utils/audio.js'
import { Header } from '../components/Header'
import { ScanBox } from '../components/ScanBox'
import { DateInput } from '../components/DateInput'

const num = (v) => parseFloat(String(v).replace(',', '.')) || 0

// Cadastro de produto novo. Escaneia um código desconhecido → formulário simples
// (nome digitado, preço, categoria, quantidade e validade opcionais).
export function Cadastro({ unidadeId, unidadeNome, onVoltar }) {
  const [codigo, setCodigo]   = useState(null)  // null = escaneando
  const [jaExiste, setJaExiste] = useState(null)
  const [cats, setCats]       = useState([])
  const [form, setForm]       = useState({ nome: '', custo: '', preco: '', categoria: '', emoji: '', qtd: '', validade: '' })
  const [salvando, setSalvando] = useState(false)
  const [ok, setOk]           = useState(null)

  useEffect(() => {
    supabase.rpc('listar_categorias_unidade', { p_unidade_id: unidadeId })
      .then(({ data }) => setCats(data || []))
  }, [unidadeId])

  function aoDesconhecido(cod) {
    setCodigo(cod)
    setJaExiste(null)
    setForm({ nome: '', custo: '', preco: '', categoria: '', emoji: '', qtd: '', validade: '' })
  }
  function aoProduto(row) {
    tocarErro()
    setJaExiste(row)
    setTimeout(() => setJaExiste(null), 2800)
  }

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  const custoNum = num(form.custo), precoNum = num(form.preco)
  const markupView = custoNum > 0 && precoNum > 0 ? ((precoNum - custoNum) / custoNum) * 100 : null

  async function salvar() {
    const preco = num(form.preco)
    const custo = num(form.custo)
    if (!form.nome.trim()) { tocarErro(); return }
    if (preco <= 0) { tocarErro(); return }
    const markup = custo > 0 && preco > 0 ? Math.round(((preco - custo) / custo) * 1000) / 10 : null
    const qtd = form.qtd === '' ? null : parseInt(form.qtd, 10)
    const controla = qtd !== null && !Number.isNaN(qtd)
    setSalvando(true)
    const cat = cats.find(c => c.nome === form.categoria)
    const { data, error } = await supabase.rpc('cadastrar_produto_pendencia', {
      p_unidade_id: unidadeId, p_codigo_barras: codigo,
      p_nome: form.nome.trim(), p_preco_venda: preco,
      p_categoria: form.categoria || '', p_emoji: cat?.emoji || '', p_imagem_url: '',
      p_restrito_idade: false,
      p_quantidade: controla ? qtd : null, p_controla_estoque: controla,
      p_preco_custo: custo > 0 ? custo : null, p_markup: markup,
    })
    if (error) { setSalvando(false); tocarErro(); alert(error.message); return }
    const produtoId = Array.isArray(data) ? data[0] : data
    // Validade opcional
    if (form.validade && produtoId) {
      await supabase.rpc('registrar_validade', {
        p_unidade_id: unidadeId, p_produto_id: produtoId,
        p_data_validade: form.validade, p_quantidade: controla ? qtd : 1,
      })
    }
    setSalvando(false)
    tocarSucesso()
    setOk({ nome: form.nome.trim() })
    setCodigo(null)
    setTimeout(() => setOk(null), 2200)
  }

  if (ok) {
    return (
      <div className="flex flex-col h-full bg-vallen-dark">
        <Header titulo="Cadastrar produto" emoji="➕" unidadeNome={unidadeNome} onVoltar={onVoltar} />
        <div className="flex-1 flex flex-col items-center justify-center gap-5 text-white bg-vallen-green p-6 text-center">
          <span className="text-7xl">✅</span>
          <p className="text-2xl font-bold">{ok.nome}</p>
          <p className="text-xl font-bold">Cadastrado!</p>
        </div>
      </div>
    )
  }

  // ---- formulário
  if (codigo) {
    return (
      <div className="flex flex-col h-full bg-vallen-dark">
        <Header titulo="Novo produto" emoji="➕" unidadeNome={unidadeNome} onVoltar={() => setCodigo(null)} />
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <p className="text-vallen-muted text-sm text-center">Código: {codigo}</p>

          <label className="block">
            <span className="text-vallen-white font-semibold">Nome do produto</span>
            <input value={form.nome} onChange={e => set('nome', e.target.value)} autoFocus
              placeholder="Ex.: Coca-Cola 350ml"
              className="mt-1 w-full bg-vallen-dark border border-vallen-border rounded-xl px-4 py-3.5 text-lg text-vallen-white focus:outline-none focus:border-vallen-green" />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-vallen-white font-semibold text-sm">Preço de custo</span>
              <div className="mt-1 flex items-center gap-1">
                <span className="text-vallen-muted text-lg font-bold">R$</span>
                <input value={form.custo} onChange={e => set('custo', e.target.value.replace(/[^\d.,]/g, ''))}
                  inputMode="decimal" placeholder="0,00"
                  className="w-full min-w-0 bg-vallen-dark border border-vallen-border rounded-xl px-3 py-3 text-lg font-bold text-vallen-white focus:outline-none focus:border-vallen-green" />
              </div>
            </label>
            <label className="block">
              <span className="text-vallen-white font-semibold text-sm">Preço de venda</span>
              <div className="mt-1 flex items-center gap-1">
                <span className="text-vallen-white text-lg font-bold">R$</span>
                <input value={form.preco} onChange={e => set('preco', e.target.value.replace(/[^\d.,]/g, ''))}
                  inputMode="decimal" placeholder="0,00"
                  className="w-full min-w-0 bg-vallen-dark border border-vallen-border rounded-xl px-3 py-3 text-lg font-black text-vallen-white focus:outline-none focus:border-vallen-green" />
              </div>
            </label>
          </div>
          {markupView != null && (
            <p className="text-center text-sm font-semibold text-vallen-green -mt-1">
              Markup: {markupView.toFixed(1).replace('.', ',')}%
            </p>
          )}

          {cats.length > 0 && (
            <div>
              <span className="text-vallen-white font-semibold">Categoria</span>
              <div className="mt-2 flex flex-wrap gap-2">
                {cats.map(c => (
                  <button key={c.nome} onClick={() => set('categoria', c.nome === form.categoria ? '' : c.nome)}
                    className={`px-4 py-2.5 rounded-xl border font-semibold text-sm
                      ${form.categoria === c.nome ? 'bg-vallen-green border-vallen-green text-white' : 'bg-vallen-card border-vallen-border text-vallen-white'}`}>
                    {c.emoji} {c.nome}
                  </button>
                ))}
              </div>
            </div>
          )}

          <label className="block">
            <span className="text-vallen-white font-semibold text-sm">Quantidade inicial <span className="text-vallen-muted font-normal">(opcional)</span></span>
            <input value={form.qtd} onChange={e => set('qtd', e.target.value.replace(/\D/g, ''))}
              inputMode="numeric" placeholder="opcional"
              className="mt-1 w-full bg-vallen-dark border border-vallen-border rounded-xl px-4 py-3 text-lg text-vallen-white focus:outline-none focus:border-vallen-green" />
          </label>
          <label className="block">
            <span className="text-vallen-white font-semibold text-sm">Validade <span className="text-vallen-muted font-normal">(opcional)</span></span>
            <DateInput value={form.validade} onChange={v => set('validade', v)}
              className="mt-1 w-full bg-vallen-dark border border-vallen-border rounded-xl px-3 py-3 text-base text-vallen-white focus:outline-none focus:border-vallen-green" />
          </label>
        </div>
        <div className="p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] border-t border-vallen-border bg-vallen-black">
          <button onClick={salvar} disabled={salvando || !form.nome.trim() || !form.preco}
            className="w-full py-4 bg-vallen-green disabled:opacity-40 text-white font-bold rounded-2xl text-lg">
            {salvando ? 'Salvando…' : 'Cadastrar produto'}
          </button>
        </div>
      </div>
    )
  }

  // ---- escaneando
  return (
    <div className="flex flex-col h-full bg-vallen-dark">
      <Header titulo="Cadastrar produto" emoji="➕" unidadeNome={unidadeNome} onVoltar={onVoltar} />
      {jaExiste && (
        <div className="bg-orange-500 text-white px-4 py-3 text-center font-semibold flex-shrink-0">
          {jaExiste.nome} já está cadastrado
        </div>
      )}
      <ScanBox unidadeId={unidadeId} onProduto={aoProduto} onDesconhecido={aoDesconhecido}
        hint="Escaneie o código de um produto novo" />
    </div>
  )
}

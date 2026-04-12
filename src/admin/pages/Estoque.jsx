import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { PageHeader } from '../components/PageHeader.jsx'
import { Field, inputCls, Btn } from '../components/Field.jsx'
import { Modal } from '../components/Modal.jsx'

// ─── CSV Parser ───────────────────────────────────────────────────────────────
function parseNF(text) {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []

  const delim = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ';' : ','

  const rawHeaders = lines[0].split(delim).map(h => h.replace(/["\r]/g, '').trim().toUpperCase())

  function findCol(...keywords) {
    return rawHeaders.findIndex(h => keywords.every(k => h.includes(k)))
  }

  const iCodigo = findCol('CODIGO') >= 0 ? findCol('CODIGO') : findCol('COD')
  const iCompra = findCol('PRECO', 'COMPRA') >= 0 ? findCol('PRECO', 'COMPRA') : findCol('COMPRA')
  const iQtd    = findCol('QUANTIDADE') >= 0 ? findCol('QUANTIDADE') : findCol('QTD')
  const iMarkup = findCol('MARKUP')
  const iVenda  = findCol('PRECO', 'VENDA') >= 0 ? findCol('PRECO', 'VENDA') : findCol('VENDA')

  if (iCodigo < 0) return null // headers not recognized

  function num(s) {
    return parseFloat(String(s ?? '').replace(/["\r\s]/g, '').replace(',', '.')) || 0
  }

  const mapa = {}
  for (let i = 1; i < lines.length; i++) {
    const cols   = lines[i].split(delim).map(c => c.replace(/["\r]/g, '').trim())
    const codigo = cols[iCodigo]
    if (!codigo) continue
    const qtd    = num(cols[iQtd])
    if (mapa[codigo]) {
      mapa[codigo].quantidade += qtd
    } else {
      mapa[codigo] = {
        codigo,
        quantidade : qtd,
        preco_custo: num(cols[iCompra]),
        markup     : num(cols[iMarkup]),
        preco      : num(cols[iVenda]),
      }
    }
  }
  return Object.values(mapa)
}

// ─── Tab components ───────────────────────────────────────────────────────────

// Tab 1: Estoque por unidade
function TabEstoque({ unidades }) {
  const [unidade, setUnidade] = useState('')
  const [lista, setLista]     = useState([])
  const [busca, setBusca]     = useState('')
  const [saving, setSaving]   = useState({})

  async function loadEstoque(uid) {
    if (!uid) return
    const { data } = await supabase
      .from('estoque')
      .select('*, produtos(id,nome,codigo_barras,categoria,restrito_idade,preco,preco_custo,markup,unidade_medida)')
      .eq('unidade_id', uid)
      .order('produtos(nome)')
    setLista(data || [])
  }

  async function salvarQtd(item, qtd) {
    setSaving(s => ({ ...s, [item.id]: true }))
    await supabase.from('estoque').update({ quantidade: parseInt(qtd) || 0 }).eq('id', item.id)
    setSaving(s => ({ ...s, [item.id]: false }))
    setLista(l => l.map(i => i.id === item.id ? { ...i, quantidade: parseInt(qtd) || 0 } : i))
  }

  const filtrado = lista.filter(i =>
    !busca ||
    i.produtos?.nome?.toLowerCase().includes(busca.toLowerCase()) ||
    i.produtos?.codigo_barras?.includes(busca)
  )

  return (
    <div>
      <div className="px-6 py-4 flex gap-4 items-end flex-wrap">
        <Field label="Unidade / Condomínio">
          <select value={unidade} onChange={e => { setUnidade(e.target.value); loadEstoque(e.target.value) }}
            className={inputCls + ' w-64'}>
            <option value="">Selecione...</option>
            {unidades.map(u => (
              <option key={u.id} value={u.id}>
                {u.tipo === 'armazem' ? '🏭 ' : '🏢 '}{u.nome}
              </option>
            ))}
          </select>
        </Field>
        {unidade && (
          <Field label="Buscar produto">
            <input value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="Nome ou código..." className={inputCls + ' w-64'} />
          </Field>
        )}
      </div>

      {unidade && (
        <div className="px-6 pb-6">
          <div className="bg-vallen-card border border-vallen-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-vallen-border text-vallen-muted text-left">
                <th className="px-4 py-3">Código</th>
                <th className="px-4 py-3">Produto</th>
                <th className="px-4 py-3">Preço</th>
                <th className="px-4 py-3">Custo</th>
                <th className="px-4 py-3">Markup</th>
                <th className="px-4 py-3 w-32">Estoque</th>
                <th className="px-4 py-3"></th>
              </tr></thead>
              <tbody>
                {filtrado.map(item => (
                  <tr key={item.id} className="border-b border-vallen-border/50">
                    <td className="px-4 py-2 font-mono text-xs text-vallen-muted">{item.produtos?.codigo_barras}</td>
                    <td className="px-4 py-2 text-vallen-white">
                      {item.produtos?.nome}
                      {item.produtos?.restrito_idade && <span className="ml-1 text-xs text-yellow-400">+18</span>}
                      {item.produtos?.unidade_medida && item.produtos.unidade_medida !== 'UN' && (
                        <span className="ml-1 text-xs text-vallen-muted">/{item.produtos.unidade_medida}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-vallen-muted text-xs">
                      {item.produtos?.preco != null ? `R$ ${Number(item.produtos.preco).toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-2 text-vallen-muted text-xs">
                      {item.produtos?.preco_custo != null ? `R$ ${Number(item.produtos.preco_custo).toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-2 text-vallen-muted text-xs">
                      {item.produtos?.markup != null ? `${Number(item.produtos.markup).toFixed(0)}%` : '—'}
                    </td>
                    <td className="px-4 py-2">
                      <input type="number" min="0" defaultValue={item.quantidade}
                        key={item.id + '_' + item.quantidade}
                        onBlur={e => salvarQtd(item, e.target.value)}
                        className="w-20 bg-vallen-dark border border-vallen-border rounded px-2 py-1 text-sm text-vallen-white focus:outline-none focus:border-vallen-green" />
                    </td>
                    <td className="px-4 py-2">
                      {saving[item.id] && <span className="text-xs text-vallen-muted">Salvando...</span>}
                      {item.quantidade === 0 && !saving[item.id] &&
                        <span className="text-xs text-red-400">Sem estoque</span>}
                    </td>
                  </tr>
                ))}
                {!filtrado.length && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-vallen-muted">
                    {lista.length ? 'Nenhum resultado' : 'Nenhum produto nesta unidade'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// Tab 2: Importar NF (CSV)
function TabImportar({ armazemId, onPendentesChange }) {
  const inputRef          = useRef()
  const [parsed, setParsed]     = useState(null)   // rows from CSV
  const [matched, setMatched]   = useState(null)   // { found: [], notFound: [] }
  const [loading, setLoading]   = useState(false)
  const [applying, setApplying] = useState(false)
  const [done, setDone]         = useState(false)
  const [erro, setErro]         = useState('')

  async function handleFile(file) {
    if (!file) return
    setErro(''); setDone(false); setMatched(null); setParsed(null)
    const text = await file.text()
    const rows = parseNF(text)
    if (!rows) { setErro('Cabeçalho não reconhecido. Colunas esperadas: CODIGO, PRECO DE COMPRA, QUANTIDADE, MARKUP, PRECO DE VENDA'); return }
    if (!rows.length) { setErro('Nenhuma linha encontrada no arquivo.'); return }
    setParsed(rows)
    await matchProdutos(rows)
  }

  async function matchProdutos(rows) {
    setLoading(true)
    const codigos = rows.map(r => r.codigo)
    const { data } = await supabase
      .from('produtos')
      .select('id, nome, codigo_barras, preco')
      .in('codigo_barras', codigos)
    setLoading(false)

    const foundMap = {}
    for (const p of (data || [])) foundMap[p.codigo_barras] = p

    const found    = rows.filter(r => foundMap[r.codigo]).map(r => ({ ...r, produto: foundMap[r.codigo] }))
    const notFound = rows.filter(r => !foundMap[r.codigo])
    setMatched({ found, notFound })
  }

  async function aplicar() {
    if (!matched || !armazemId) return
    setApplying(true)

    // Update produtos: preco_custo, markup, preco
    for (const row of matched.found) {
      const upd = {}
      if (row.preco_custo > 0) upd.preco_custo = row.preco_custo
      if (row.markup > 0)      upd.markup       = row.markup
      if (row.preco > 0)       upd.preco        = row.preco
      if (Object.keys(upd).length)
        await supabase.from('produtos').update(upd).eq('id', row.produto.id)
    }

    // Upsert estoque no Armazém (incrementar)
    for (const row of matched.found) {
      if (row.quantidade <= 0) continue
      const { data: existing } = await supabase
        .from('estoque')
        .select('id, quantidade')
        .eq('unidade_id', armazemId)
        .eq('produto_id', row.produto.id)
        .maybeSingle()
      if (existing) {
        await supabase.from('estoque')
          .update({ quantidade: existing.quantidade + row.quantidade })
          .eq('id', existing.id)
      } else {
        await supabase.from('estoque')
          .insert({ unidade_id: armazemId, produto_id: row.produto.id, quantidade: row.quantidade })
      }
    }

    // Salvar pendentes no localStorage
    if (matched.notFound.length) {
      const prev = JSON.parse(localStorage.getItem('estoque_pendentes') || '[]')
      const existing = new Set(prev.map(p => p.codigo))
      const novos = matched.notFound.filter(r => !existing.has(r.codigo))
      const merged = [...prev, ...novos]
      localStorage.setItem('estoque_pendentes', JSON.stringify(merged))
      onPendentesChange(merged.length)
    }

    setApplying(false)
    setDone(true)
  }

  function resetar() {
    setParsed(null); setMatched(null); setDone(false); setErro('')
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="px-6 py-4">
      {!armazemId && (
        <div className="bg-amber-900/30 border border-amber-700 rounded-xl p-4 mb-4 text-amber-300 text-sm">
          Armazém Geral não encontrado. Execute a migration mais recente e recarregue.
        </div>
      )}

      {/* Upload area */}
      {!matched && !done && (
        <div
          className="border-2 border-dashed border-vallen-border hover:border-vallen-green rounded-xl p-10 text-center cursor-pointer transition-colors"
          onClick={() => inputRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]) }}
        >
          <div className="text-4xl mb-3">📥</div>
          <p className="text-vallen-white font-medium">Arraste o arquivo CSV aqui</p>
          <p className="text-vallen-muted text-sm mt-1">ou clique para selecionar</p>
          <p className="text-xs text-vallen-gray mt-3">
            Colunas esperadas: CODIGO · PRECO DE COMPRA · QUANTIDADE · MARKUP · PRECO DE VENDA
          </p>
          <input ref={inputRef} type="file" accept=".csv,.txt" className="hidden"
            onChange={e => handleFile(e.target.files[0])} />
        </div>
      )}

      {erro && (
        <div className="mt-4 bg-red-900/30 border border-red-700 rounded-xl p-4">
          <p className="text-red-400 text-sm">{erro}</p>
          <button onClick={resetar} className="mt-2 text-xs text-vallen-muted hover:text-vallen-white">← Tentar novamente</button>
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-3 mt-6 text-vallen-muted">
          <div className="w-5 h-5 border-2 border-vallen-green border-t-transparent rounded-full animate-spin" />
          Verificando produtos no banco...
        </div>
      )}

      {matched && !done && (
        <div className="space-y-4">
          {/* Resumo */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-vallen-card border border-vallen-border rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-vallen-green">{parsed.length}</p>
              <p className="text-xs text-vallen-muted mt-1">Produtos na NF</p>
            </div>
            <div className="bg-vallen-card border border-vallen-border rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-green-400">{matched.found.length}</p>
              <p className="text-xs text-vallen-muted mt-1">Encontrados no sistema</p>
            </div>
            <div className="bg-vallen-card border border-vallen-border rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-amber-400">{matched.notFound.length}</p>
              <p className="text-xs text-vallen-muted mt-1">Não cadastrados</p>
            </div>
          </div>

          {/* Tabela: encontrados */}
          {matched.found.length > 0 && (
            <div>
              <p className="text-sm font-medium text-vallen-muted mb-2">✅ PRODUTOS ENCONTRADOS — serão atualizados</p>
              <div className="bg-vallen-card border border-vallen-border rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-vallen-border text-vallen-muted text-left">
                    <th className="px-3 py-2">Código</th>
                    <th className="px-3 py-2">Nome</th>
                    <th className="px-3 py-2">Qtd NF</th>
                    <th className="px-3 py-2">Custo</th>
                    <th className="px-3 py-2">Markup</th>
                    <th className="px-3 py-2">Preço venda</th>
                  </tr></thead>
                  <tbody>
                    {matched.found.map(r => (
                      <tr key={r.codigo} className="border-b border-vallen-border/30">
                        <td className="px-3 py-2 font-mono text-vallen-muted">{r.codigo}</td>
                        <td className="px-3 py-2 text-vallen-white">{r.produto.nome}</td>
                        <td className="px-3 py-2 text-vallen-green font-bold">+{r.quantidade}</td>
                        <td className="px-3 py-2 text-vallen-muted">R$ {r.preco_custo.toFixed(2)}</td>
                        <td className="px-3 py-2 text-vallen-muted">{r.markup.toFixed(0)}%</td>
                        <td className="px-3 py-2 text-vallen-white">R$ {r.preco.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tabela: não encontrados */}
          {matched.notFound.length > 0 && (
            <div>
              <p className="text-sm font-medium text-vallen-muted mb-2">⚠️ NÃO CADASTRADOS — serão salvos para cadastro manual</p>
              <div className="bg-vallen-card border border-vallen-border rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead><tr className="border-b border-vallen-border text-vallen-muted text-left">
                    <th className="px-3 py-2">Código</th>
                    <th className="px-3 py-2">Qtd</th>
                    <th className="px-3 py-2">Custo</th>
                    <th className="px-3 py-2">Preço venda</th>
                  </tr></thead>
                  <tbody>
                    {matched.notFound.map(r => (
                      <tr key={r.codigo} className="border-b border-vallen-border/30">
                        <td className="px-3 py-2 font-mono text-amber-400">{r.codigo}</td>
                        <td className="px-3 py-2 text-vallen-muted">{r.quantidade}</td>
                        <td className="px-3 py-2 text-vallen-muted">R$ {r.preco_custo.toFixed(2)}</td>
                        <td className="px-3 py-2 text-vallen-muted">R$ {r.preco.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Btn onClick={aplicar} disabled={applying || !matched.found.length}>
              {applying ? 'Aplicando...' : `✓ Confirmar importação (${matched.found.length} produtos)`}
            </Btn>
            <Btn variant="ghost" onClick={resetar}>Cancelar</Btn>
          </div>
        </div>
      )}

      {done && (
        <div className="bg-green-900/30 border border-green-700 rounded-xl p-6 text-center">
          <div className="text-4xl mb-3">✅</div>
          <p className="text-green-400 font-bold text-lg">Importação concluída!</p>
          <p className="text-vallen-muted text-sm mt-1">
            {matched.found.length} produto(s) atualizados no estoque do Armazém Geral.
            {matched.notFound.length > 0 && ` ${matched.notFound.length} não cadastrados salvos na aba "Não Cadastrados".`}
          </p>
          <button onClick={resetar} className="mt-4 text-sm text-vallen-green hover:underline">
            Importar outro arquivo
          </button>
        </div>
      )}
    </div>
  )
}

// Tab 3: Produtos não cadastrados (pendentes de registro)
function TabPendentes({ onPendentesChange }) {
  const [lista, setLista]       = useState(() => JSON.parse(localStorage.getItem('estoque_pendentes') || '[]'))
  const [modal, setModal]       = useState(null)
  const [form, setForm]         = useState({})
  const [saving, setSaving]     = useState(false)
  const [categorias, setCats]   = useState([])
  const [similares, setSimilares] = useState(null)  // produtos parecidos após salvar

  useEffect(() => {
    supabase.from('v_categorias').select('categoria').then(({ data }) =>
      setCats((data || []).map(r => r.categoria).filter(Boolean))
    )
  }, [])

  // Cálculo automático custo/markup/venda
  function handleCusto(val) {
    const custo = parseFloat(val) || 0
    const markup = parseFloat(form.markup) || 0
    const preco = markup && custo ? (custo * (1 + markup / 100)).toFixed(2) : form.preco
    setForm(p => ({ ...p, preco_custo: val, preco }))
  }
  function handleMarkup(val) {
    const markup = parseFloat(val) || 0
    const custo = parseFloat(form.preco_custo) || 0
    const preco = markup && custo ? (custo * (1 + markup / 100)).toFixed(2) : form.preco
    setForm(p => ({ ...p, markup: val, preco }))
  }
  function handlePreco(val) {
    const preco = parseFloat(val) || 0
    const custo = parseFloat(form.preco_custo) || 0
    const markup = preco && custo ? (((preco / custo) - 1) * 100).toFixed(2) : form.markup
    setForm(p => ({ ...p, preco: val, markup }))
  }

  function abrirCadastro(item) {
    setSimilares(null)
    setForm({
      codigo_barras : item.codigo,
      preco_custo   : item.preco_custo,
      markup        : item.markup,
      preco         : item.preco,
      quantidade    : item.quantidade,
      nome          : '',
      categoria     : '',
      unidade_medida: 'UN',
      imagem_url    : '',
      restrito_idade: false,
    })
    setModal(item)
  }

  async function salvar(e) {
    e.preventDefault()
    setSaving(true)
    const { data: novoProd, error } = await supabase.from('produtos').insert({
      nome          : form.nome,
      preco         : parseFloat(form.preco) || 0,
      codigo_barras : form.codigo_barras,
      categoria     : form.categoria || null,
      unidade_medida: form.unidade_medida || 'UN',
      imagem_url    : form.imagem_url || null,
      restrito_idade: form.restrito_idade,
      preco_custo   : parseFloat(form.preco_custo) || null,
      markup        : parseFloat(form.markup) || null,
    }).select('id, nome').single()

    if (error) { setSaving(false); alert('Erro: ' + error.message); return }

    // Remover da pendentes
    const nova = lista.filter(i => i.codigo !== modal.codigo)
    localStorage.setItem('estoque_pendentes', JSON.stringify(nova))
    setLista(nova)
    onPendentesChange(nova.length)
    setSaving(false)
    setModal(null)

    // Buscar produtos com nome parecido (possíveis duplicatas com código diferente)
    const palavras = form.nome.split(/\s+/).filter(w => w.length > 3)
    if (palavras.length) {
      const { data: parecidos } = await supabase.from('produtos')
        .select('id, nome, preco, codigo_barras')
        .ilike('nome', `%${palavras[0]}%`)
        .neq('id', novoProd.id)
        .limit(10)
      if (parecidos?.length) setSimilares({ novoProd, parecidos })
    }
  }

  function remover(codigo) {
    const nova = lista.filter(i => i.codigo !== codigo)
    localStorage.setItem('estoque_pendentes', JSON.stringify(nova))
    setLista(nova)
    onPendentesChange(nova.length)
  }

  const f = k => e => setForm(p => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  if (!lista.length) return (
    <div className="px-6 py-12 text-center text-vallen-muted">
      <div className="text-4xl mb-3">✅</div>
      <p>Nenhum produto pendente de cadastro.</p>
      <p className="text-sm mt-1">Após importar uma NF, os códigos não encontrados aparecerão aqui.</p>
    </div>
  )

  return (
    <div className="px-6 py-4">
      <p className="text-sm text-vallen-muted mb-4">
        {lista.length} produto(s) importados da NF mas não encontrados no sistema.
        Clique no código para pesquisar o produto ou em <strong className="text-vallen-white">Cadastrar</strong> para registrar.
      </p>
      <div className="bg-vallen-card border border-vallen-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-vallen-border text-vallen-muted text-left">
            <th className="px-4 py-3">Código de barras</th>
            <th className="px-4 py-3">Qtd NF</th>
            <th className="px-4 py-3">Custo</th>
            <th className="px-4 py-3">Markup</th>
            <th className="px-4 py-3">Preço sugerido</th>
            <th className="px-4 py-3"></th>
          </tr></thead>
          <tbody>
            {lista.map(item => (
              <tr key={item.codigo} className="border-b border-vallen-border/50">
                <td className="px-4 py-3">
                  <a
                    href={`https://cosmos.bluesoft.com.br/produtos/${item.codigo}`}
                    target="_blank" rel="noopener noreferrer"
                    className="font-mono text-amber-400 hover:text-amber-300 underline underline-offset-2 text-xs"
                    title="Pesquisar produto no Bluesoft Cosmos"
                  >
                    {item.codigo} ↗
                  </a>
                </td>
                <td className="px-4 py-3 text-vallen-white">{item.quantidade}</td>
                <td className="px-4 py-3 text-vallen-muted">R$ {Number(item.preco_custo).toFixed(2)}</td>
                <td className="px-4 py-3 text-vallen-muted">{Number(item.markup).toFixed(0)}%</td>
                <td className="px-4 py-3 text-vallen-green font-medium">R$ {Number(item.preco).toFixed(2)}</td>
                <td className="px-4 py-3 flex gap-2">
                  <Btn onClick={() => abrirCadastro(item)}>Cadastrar</Btn>
                  <Btn variant="danger" onClick={() => remover(item.codigo)}>Ignorar</Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal cadastro */}
      {modal && (
        <Modal title={`Cadastrar produto`} onClose={() => setModal(null)}>
          <div className="mb-3 p-2 bg-vallen-dark rounded-lg flex items-center gap-2">
            <span className="text-xs text-vallen-muted">Código:</span>
            <a href={`https://cosmos.bluesoft.com.br/produtos/${modal.codigo}`}
              target="_blank" rel="noopener noreferrer"
              className="font-mono text-amber-400 hover:text-amber-300 text-xs underline">
              {modal.codigo} ↗ Pesquisar no Bluesoft
            </a>
          </div>
          <form onSubmit={salvar} className="space-y-3">
            <Field label="Nome do produto *">
              <input required autoFocus className={inputCls} value={form.nome} onChange={f('nome')}
                placeholder="Digite o nome após pesquisar no Bluesoft" />
            </Field>
            <Field label="Categoria">
              <select className={inputCls} value={form.categoria} onChange={f('categoria')}>
                <option value="">— Selecione —</option>
                {categorias.map(c => <option key={c} value={c}>{c}</option>)}
                <option value="__nova__">+ Digitar nova categoria...</option>
              </select>
              {form.categoria === '__nova__' && (
                <input autoFocus className={inputCls + ' mt-2'} placeholder="Nome da nova categoria"
                  onChange={e => setForm(p => ({ ...p, categoria: e.target.value }))} />
              )}
            </Field>
            <Field label="URL da imagem (foto do produto)">
              <input className={inputCls} value={form.imagem_url} onChange={f('imagem_url')}
                placeholder="https://..." />
            </Field>

            {/* Precificação */}
            <div className="bg-vallen-dark/60 border border-vallen-border rounded-xl p-3 space-y-3">
              <p className="text-xs text-vallen-muted font-medium uppercase">Precificação</p>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Custo (R$)">
                  <input type="number" step="0.01" min="0" className={inputCls}
                    value={form.preco_custo} onChange={e => handleCusto(e.target.value)} />
                </Field>
                <Field label="Markup (%)">
                  <input type="number" step="0.1" min="0" className={inputCls}
                    value={form.markup} onChange={e => handleMarkup(e.target.value)} />
                </Field>
                <Field label="Preço venda *">
                  <input required type="number" step="0.01" min="0" className={inputCls + ' border-vallen-green'}
                    value={form.preco} onChange={e => handlePreco(e.target.value)} />
                </Field>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Unidade medida">
                <select className={inputCls} value={form.unidade_medida} onChange={f('unidade_medida')}>
                  {['UN','KG','L','CX','PC','FD','DZ'].map(u => <option key={u}>{u}</option>)}
                </select>
              </Field>
              <label className="flex items-center gap-2 text-sm text-vallen-muted cursor-pointer mt-6">
                <input type="checkbox" checked={form.restrito_idade} onChange={f('restrito_idade')}
                  className="w-4 h-4 accent-yellow-500" />
                Restrito +18
              </label>
            </div>

            <div className="flex gap-3 pt-2">
              <Btn type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar produto'}</Btn>
              <Btn type="button" variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal produtos similares */}
      {similares && (
        <Modal title="Produtos parecidos encontrados" onClose={() => setSimilares(null)}>
          <p className="text-sm text-vallen-muted mb-4">
            Existem produtos com nome parecido com <strong className="text-vallen-white">"{similares.novoProd.nome}"</strong>.
            Podem ser o mesmo produto com código diferente. Deseja atualizar o preço de algum?
          </p>
          <div className="space-y-2">
            {similares.parecidos.map(p => (
              <SimilarItem key={p.id} produto={p} />
            ))}
          </div>
          <div className="pt-4">
            <Btn variant="ghost" onClick={() => setSimilares(null)}>Fechar</Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}

function SimilarItem({ produto }) {
  const [preco, setPreco]   = useState(Number(produto.preco).toFixed(2))
  const [saved, setSaved]   = useState(false)
  const [saving, setSaving] = useState(false)

  async function atualizar() {
    setSaving(true)
    await supabase.from('produtos').update({ preco: parseFloat(preco) }).eq('id', produto.id)
    setSaving(false); setSaved(true)
  }

  return (
    <div className="flex items-center gap-3 bg-vallen-dark rounded-lg px-3 py-2">
      <div className="flex-1">
        <p className="text-sm text-vallen-white">{produto.nome}</p>
        <p className="text-xs text-vallen-muted font-mono">{produto.codigo_barras}</p>
      </div>
      <input type="number" step="0.01" min="0"
        value={preco} onChange={e => setPreco(e.target.value)}
        className="w-24 bg-vallen-card border border-vallen-border rounded px-2 py-1 text-sm text-vallen-green focus:outline-none focus:border-vallen-green" />
      {saved
        ? <span className="text-green-400 text-xs">✓</span>
        : <Btn onClick={atualizar} disabled={saving}>{saving ? '...' : 'Atualizar'}</Btn>
      }
    </div>
  )
}

// Tab 4: Armazém → Transferir para condomínio
function TabArmazem({ unidades, armazemId }) {
  const [destino, setDestino]         = useState('')
  const [estoqueArm, setEstoqueArm]   = useState([])
  const [qtds, setQtds]               = useState({})   // prodId → qtdATransferir
  const [busca, setBusca]             = useState('')
  const [loading, setLoading]         = useState(false)
  const [transferindo, setTransferindo] = useState(false)
  const [msg, setMsg]                 = useState('')
  const [historico, setHistorico]     = useState([])

  useEffect(() => {
    if (!armazemId) return
    loadArmazem()
    loadHistorico()
  }, [armazemId])

  async function loadArmazem() {
    setLoading(true)
    const { data } = await supabase
      .from('estoque')
      .select('*, produtos(id,nome,codigo_barras,unidade_medida)')
      .eq('unidade_id', armazemId)
      .gt('quantidade', 0)
      .order('produtos(nome)')
    setEstoqueArm(data || [])
    setLoading(false)
  }

  async function loadHistorico() {
    const { data } = await supabase
      .from('transferencias_estoque')
      .select('*, origem:unidades!origem_id(nome), destino:unidades!destino_id(nome), produtos(nome)')
      .eq('origem_id', armazemId)
      .order('created_at', { ascending: false })
      .limit(20)
    setHistorico(data || [])
  }

  async function transferir() {
    if (!destino) { alert('Selecione o condomínio de destino'); return }
    const linhas = Object.entries(qtds).filter(([_, q]) => q > 0)
    if (!linhas.length) { alert('Informe a quantidade para pelo menos um produto'); return }

    setTransferindo(true); setMsg('')
    let erros = []
    for (const [prodId, qtd] of linhas) {
      const { error } = await supabase.rpc('transferir_estoque', {
        p_origem_id : armazemId,
        p_destino_id: parseInt(destino),
        p_produto_id: parseInt(prodId),
        p_quantidade: qtd,
      })
      if (error) erros.push(error.message)
    }
    setTransferindo(false)
    if (erros.length) {
      setMsg('Alguns erros: ' + erros.join(' | '))
    } else {
      setMsg(`✅ ${linhas.length} produto(s) transferido(s) com sucesso!`)
      setQtds({})
      loadArmazem()
      loadHistorico()
    }
  }

  const condominios = unidades.filter(u => u.tipo !== 'armazem')
  const filtrado    = estoqueArm.filter(i =>
    !busca ||
    i.produtos?.nome?.toLowerCase().includes(busca.toLowerCase()) ||
    i.produtos?.codigo_barras?.includes(busca)
  )

  if (!armazemId) return (
    <div className="px-6 py-12 text-center text-vallen-muted">
      Armazém Geral não configurado. Execute a migration mais recente.
    </div>
  )

  return (
    <div className="px-6 py-4 space-y-6">
      {/* Transferência */}
      <div className="bg-vallen-card border border-vallen-border rounded-xl p-4">
        <h3 className="font-semibold text-vallen-white mb-4">🏭 Transferir do Armazém Geral</h3>

        <div className="flex gap-4 items-end flex-wrap mb-4">
          <Field label="Condomínio destino">
            <select value={destino} onChange={e => setDestino(e.target.value)} className={inputCls + ' w-64'}>
              <option value="">Selecione...</option>
              {condominios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </Field>
          <Field label="Buscar produto">
            <input value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="Nome ou código..." className={inputCls + ' w-52'} />
          </Field>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-vallen-muted py-4">
            <div className="w-4 h-4 border-2 border-vallen-green border-t-transparent rounded-full animate-spin" />
            Carregando estoque...
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded-lg border border-vallen-border">
              <table className="w-full text-sm">
                <thead><tr className="bg-vallen-dark border-b border-vallen-border text-vallen-muted text-left">
                  <th className="px-3 py-2">Produto</th>
                  <th className="px-3 py-2">Código</th>
                  <th className="px-3 py-2">Disponível</th>
                  <th className="px-3 py-2 w-32">Qtd a enviar</th>
                </tr></thead>
                <tbody>
                  {filtrado.map(item => {
                    const prodId = item.produto_id
                    const qtd    = qtds[prodId] ?? 0
                    return (
                      <tr key={item.id} className="border-b border-vallen-border/30 hover:bg-vallen-dark/40">
                        <td className="px-3 py-2 text-vallen-white">{item.produtos?.nome}</td>
                        <td className="px-3 py-2 font-mono text-xs text-vallen-muted">{item.produtos?.codigo_barras}</td>
                        <td className="px-3 py-2">
                          <span className={`font-bold ${item.quantidade > 5 ? 'text-green-400' : item.quantidade > 0 ? 'text-yellow-400' : 'text-red-400'}`}>
                            {item.quantidade}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" min="0" max={item.quantidade} value={qtd || ''}
                            onChange={e => setQtds(s => ({ ...s, [prodId]: Math.min(parseInt(e.target.value) || 0, item.quantidade) }))}
                            placeholder="0"
                            className="w-20 bg-vallen-dark border border-vallen-border rounded px-2 py-1 text-sm text-vallen-white focus:outline-none focus:border-vallen-green" />
                        </td>
                      </tr>
                    )
                  })}
                  {!filtrado.length && (
                    <tr><td colSpan={4} className="px-3 py-6 text-center text-vallen-muted">
                      {estoqueArm.length ? 'Nenhum resultado' : 'Armazém sem estoque — importe uma NF primeiro'}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {Object.values(qtds).some(q => q > 0) && (
              <div className="flex items-center gap-4 mt-4">
                <Btn onClick={transferir} disabled={transferindo || !destino}>
                  {transferindo ? 'Transferindo...' : `↗ Transferir ${Object.values(qtds).filter(q => q > 0).length} produto(s)`}
                </Btn>
                <button onClick={() => setQtds({})} className="text-sm text-vallen-muted hover:text-vallen-white">
                  Limpar
                </button>
              </div>
            )}

            {msg && (
              <div className={`mt-3 p-3 rounded-lg text-sm ${msg.startsWith('✅') ? 'bg-green-900/30 text-green-400 border border-green-700' : 'bg-red-900/30 text-red-400 border border-red-700'}`}>
                {msg}
              </div>
            )}
          </>
        )}
      </div>

      {/* Histórico de transferências */}
      {historico.length > 0 && (
        <div>
          <h3 className="font-semibold text-vallen-muted mb-3 text-sm">HISTÓRICO DE TRANSFERÊNCIAS</h3>
          <div className="bg-vallen-card border border-vallen-border rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-vallen-border text-vallen-muted text-left">
                <th className="px-3 py-2">Data</th>
                <th className="px-3 py-2">Produto</th>
                <th className="px-3 py-2">Destino</th>
                <th className="px-3 py-2">Qtd</th>
              </tr></thead>
              <tbody>
                {historico.map(t => (
                  <tr key={t.id} className="border-b border-vallen-border/30">
                    <td className="px-3 py-2 text-vallen-muted">{new Date(t.created_at).toLocaleDateString('pt-BR')}</td>
                    <td className="px-3 py-2 text-vallen-white">{t.produtos?.nome}</td>
                    <td className="px-3 py-2 text-vallen-muted">{t.destino?.nome}</td>
                    <td className="px-3 py-2 text-vallen-green font-bold">{t.quantidade}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────
export function Estoque() {
  const [aba, setAba]             = useState('estoque')
  const [unidades, setUnidades]   = useState([])
  const [armazemId, setArmazemId] = useState(null)
  const [pendentesN, setPendentesN] = useState(
    () => JSON.parse(localStorage.getItem('estoque_pendentes') || '[]').length
  )

  useEffect(() => {
    supabase.from('unidades').select('id,nome,tipo').eq('ativo', true).order('nome')
      .then(({ data }) => {
        setUnidades(data || [])
        const arm = (data || []).find(u => u.tipo === 'armazem')
        if (arm) setArmazemId(arm.id)
      })
  }, [])

  const TABS = [
    { key: 'estoque',   label: '📊 Estoque' },
    { key: 'importar',  label: '📥 Importar NF' },
    { key: 'pendentes', label: `⚠️ Não Cadastrados${pendentesN ? ` (${pendentesN})` : ''}` },
    { key: 'armazem',   label: '🏭 Armazém' },
  ]

  return (
    <div>
      <PageHeader title="Estoque" />

      {/* Tab bar */}
      <div className="px-6 pt-4 border-b border-vallen-border flex gap-1 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setAba(t.key)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap rounded-t-lg transition-colors
              ${aba === t.key
                ? 'bg-vallen-card border border-b-vallen-card border-vallen-border text-vallen-white'
                : 'text-vallen-muted hover:text-vallen-white'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {aba === 'estoque'  && <TabEstoque  unidades={unidades} />}
      {aba === 'importar' && <TabImportar armazemId={armazemId} onPendentesChange={setPendentesN} />}
      {aba === 'pendentes'&& <TabPendentes onPendentesChange={setPendentesN} />}
      {aba === 'armazem'  && <TabArmazem  unidades={unidades} armazemId={armazemId} />}
    </div>
  )
}

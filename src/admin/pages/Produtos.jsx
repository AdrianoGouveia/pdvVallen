import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { PageHeader } from '../components/PageHeader.jsx'
import { Modal } from '../components/Modal.jsx'
import { Field, inputCls, Btn } from '../components/Field.jsx'

const empty = {
  nome: '', codigo_barras: '', preco: '', preco_custo: '', markup: '',
  unidade_medida: 'UN', categoria: '', imagem_url: '', restrito_idade: false, destaque: false,
}

export function Produtos() {
  const [lista, setLista]   = useState([])
  const [busca, setBusca]   = useState('')
  const [modal, setModal]   = useState(null)
  const [form, setForm]     = useState(empty)
  const [saving, setSaving] = useState(false)
  const [page, setPage]     = useState(0)
  const [categorias, setCats] = useState([])
  const PAGE = 50

  async function load(termo = busca, pg = page) {
    let q = supabase
      .from('produtos')
      .select('*, stock_records:estoque(quantidade)')
      .range(pg * PAGE, pg * PAGE + PAGE - 1)
    if (termo) q = q.or(`nome.ilike.%${termo}%,codigo_barras.ilike.%${termo}%`)
    const { data } = await q

    // Calcular total de estoque e ordenar: com estoque primeiro, depois por nome
    const enriched = (data || []).map(p => ({
      ...p,
      totalEstoque: (p.stock_records || []).reduce((s, e) => s + (e.quantidade || 0), 0),
    })).sort((a, b) => b.totalEstoque - a.totalEstoque || a.nome.localeCompare(b.nome, 'pt-BR'))

    setLista(enriched)
  }

  useEffect(() => {
    load()
    supabase.from('v_categorias').select('categoria')
      .then(({ data }) => setCats((data || []).map(r => r.categoria).filter(Boolean)))
  }, [])

  // ── Cálculo automático de preço/markup ─────────────────────────────────────
  function handleCusto(val) {
    const custo  = parseFloat(val) || 0
    const markup = parseFloat(form.markup) || 0
    const preco  = markup && custo ? (custo * (1 + markup / 100)).toFixed(2) : form.preco
    setForm(p => ({ ...p, preco_custo: val, preco }))
  }

  function handleMarkup(val) {
    const markup = parseFloat(val) || 0
    const custo  = parseFloat(form.preco_custo) || 0
    const preco  = markup && custo ? (custo * (1 + markup / 100)).toFixed(2) : form.preco
    setForm(p => ({ ...p, markup: val, preco }))
  }

  function handlePreco(val) {
    const preco = parseFloat(val) || 0
    const custo = parseFloat(form.preco_custo) || 0
    const markup = preco && custo ? (((preco / custo) - 1) * 100).toFixed(2) : form.markup
    setForm(p => ({ ...p, preco: val, markup }))
  }

  async function salvar(e) {
    e.preventDefault(); setSaving(true)
    const p = {
      nome          : form.nome,
      codigo_barras : form.codigo_barras,
      preco         : parseFloat(form.preco) || 0,
      preco_custo   : parseFloat(form.preco_custo) || null,
      markup        : parseFloat(form.markup) || null,
      unidade_medida: form.unidade_medida || 'UN',
      categoria     : form.categoria || null,
      imagem_url    : form.imagem_url || null,
      restrito_idade: form.restrito_idade,
      destaque      : form.destaque,
    }
    if (!form.id) await supabase.from('produtos').insert(p)
    else          await supabase.from('produtos').update(p).eq('id', form.id)
    setSaving(false); setModal(null); load()
  }

  const f = k => e => setForm(p => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  return (
    <div>
      <PageHeader title="Produtos"
        action={<Btn onClick={() => { setForm(empty); setModal('new') }}>+ Novo</Btn>} />

      <div className="px-6 py-4">
        <input value={busca} onChange={e => { setBusca(e.target.value); setPage(0); load(e.target.value, 0) }}
          placeholder="Buscar por nome ou código..." className={inputCls} />
      </div>

      <div className="px-6 pb-6">
        <div className="bg-vallen-card border border-vallen-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-vallen-border text-vallen-muted text-left">
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Categoria</th>
              <th className="px-4 py-3">Custo</th>
              <th className="px-4 py-3">Markup</th>
              <th className="px-4 py-3">Preço venda</th>
              <th className="px-4 py-3">Estoque</th>
              <th className="px-4 py-3">Flags</th>
              <th className="px-4 py-3"></th>
            </tr></thead>
            <tbody>
              {lista.map(p => (
                <tr key={p.id} className="border-b border-vallen-border/50 hover:bg-vallen-dark/40">
                  <td className="px-4 py-2 font-mono text-xs text-vallen-muted">{p.codigo_barras}</td>
                  <td className="px-4 py-2 text-vallen-white">{p.nome}</td>
                  <td className="px-4 py-2 text-vallen-muted text-xs">{p.categoria || '—'}</td>
                  <td className="px-4 py-2 text-vallen-muted text-xs">
                    {p.preco_custo != null ? `R$ ${Number(p.preco_custo).toFixed(2)}` : '—'}
                  </td>
                  <td className="px-4 py-2 text-vallen-muted text-xs">
                    {p.markup != null ? `${Number(p.markup).toFixed(0)}%` : '—'}
                  </td>
                  <td className="px-4 py-2 text-vallen-green font-medium">R$ {Number(p.preco).toFixed(2)}</td>
                  <td className="px-4 py-2">
                    <span className={`font-bold text-sm ${p.totalEstoque > 5 ? 'text-green-400' : p.totalEstoque > 0 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {p.totalEstoque}
                    </span>
                  </td>
                  <td className="px-4 py-2 space-x-1">
                    {p.restrito_idade && <span className="text-xs bg-yellow-900/40 text-yellow-400 px-1.5 py-0.5 rounded">+18</span>}
                    {p.destaque && <span className="text-xs bg-vallen-green/20 text-vallen-green px-1.5 py-0.5 rounded">⭐</span>}
                  </td>
                  <td className="px-4 py-2">
                    <Btn variant="ghost" onClick={() => { setForm({ ...p, preco_custo: p.preco_custo ?? '', markup: p.markup ?? '' }); setModal('edit') }}>Editar</Btn>
                  </td>
                </tr>
              ))}
              {!lista.length && <tr><td colSpan={9} className="px-4 py-8 text-center text-vallen-muted">Nenhum produto</td></tr>}
            </tbody>
          </table>
          {lista.length === PAGE && (
            <div className="p-4 flex justify-center gap-3">
              {page > 0 && <Btn variant="ghost" onClick={() => { setPage(p => p-1); load(busca, page-1) }}>← Anterior</Btn>}
              <Btn variant="ghost" onClick={() => { setPage(p => p+1); load(busca, page+1) }}>Próxima →</Btn>
            </div>
          )}
        </div>
      </div>

      {modal && (
        <Modal title={modal === 'new' ? 'Novo Produto' : 'Editar Produto'} onClose={() => setModal(null)}>
          <form onSubmit={salvar} className="space-y-3">
            <Field label="Nome *">
              <input required className={inputCls} value={form.nome} onChange={f('nome')} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Código de barras *">
                <input required className={inputCls} value={form.codigo_barras} onChange={f('codigo_barras')} />
              </Field>
              <Field label="Unidade">
                <select className={inputCls} value={form.unidade_medida} onChange={f('unidade_medida')}>
                  {['UN','KG','L','CX','PC','FD','DZ'].map(u => <option key={u}>{u}</option>)}
                </select>
              </Field>
            </div>

            {/* Precificação com cálculo automático */}
            <div className="bg-vallen-dark/60 border border-vallen-border rounded-xl p-3 space-y-3">
              <p className="text-xs text-vallen-muted font-medium uppercase tracking-wide">Precificação</p>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Custo (R$)">
                  <input type="number" step="0.01" min="0" className={inputCls}
                    value={form.preco_custo} onChange={e => handleCusto(e.target.value)}
                    placeholder="0.00" />
                </Field>
                <Field label="Markup (%)">
                  <input type="number" step="0.1" min="0" className={inputCls}
                    value={form.markup} onChange={e => handleMarkup(e.target.value)}
                    placeholder="0" />
                </Field>
                <Field label="Preço venda *">
                  <input required type="number" step="0.01" min="0" className={inputCls + ' border-vallen-green'}
                    value={form.preco} onChange={e => handlePreco(e.target.value)}
                    placeholder="0.00" />
                </Field>
              </div>
              <p className="text-xs text-vallen-gray">
                Preencha custo + markup → calcula venda. Ou altere venda → recalcula markup.
              </p>
            </div>

            <Field label="Categoria">
              <input className={inputCls} value={form.categoria||''} onChange={f('categoria')}
                list="cats-prod" placeholder="Ex: Bebidas, Snacks..." />
              <datalist id="cats-prod">
                {categorias.map(c => <option key={c} value={c} />)}
              </datalist>
            </Field>
            <Field label="URL da imagem">
              <input className={inputCls} value={form.imagem_url||''} onChange={f('imagem_url')}
                placeholder="https://..." />
            </Field>
            <div className="flex gap-4 pt-1">
              <label className="flex items-center gap-2 text-sm text-vallen-muted cursor-pointer">
                <input type="checkbox" checked={form.restrito_idade} onChange={f('restrito_idade')} className="accent-yellow-500" />
                Restrito +18
              </label>
              <label className="flex items-center gap-2 text-sm text-vallen-muted cursor-pointer">
                <input type="checkbox" checked={form.destaque} onChange={f('destaque')} className="accent-vallen-green" />
                Destaque
              </label>
            </div>
            <div className="flex gap-3 pt-2">
              <Btn type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Btn>
              <Btn type="button" variant="ghost" onClick={() => setModal(null)}>Cancelar</Btn>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

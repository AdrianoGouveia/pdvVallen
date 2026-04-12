import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { PageHeader } from '../components/PageHeader.jsx'
import { Field, inputCls, Btn } from '../components/Field.jsx'

export function Estoque() {
  const [unidades, setUnidades] = useState([])
  const [unidade, setUnidade]   = useState('')
  const [lista, setLista]       = useState([])
  const [busca, setBusca]       = useState('')
  const [saving, setSaving]     = useState({})

  useEffect(() => {
    supabase.from('unidades').select('id,nome').eq('ativo', true).order('nome')
      .then(({ data }) => setUnidades(data || []))
  }, [])

  async function loadEstoque(uid) {
    if (!uid) return
    const { data } = await supabase
      .from('estoque')
      .select('*, produtos(id,nome,codigo_barras,categoria,restrito_idade,preco)')
      .eq('unidade_id', uid)
      .order('produtos(nome)')
    setLista(data || [])
  }

  async function addProduto(prodId) {
    await supabase.from('estoque').upsert({ unidade_id: parseInt(unidade), produto_id: prodId, quantidade: 0 })
    loadEstoque(unidade)
  }

  async function salvarQtd(item, qtd) {
    setSaving(s => ({ ...s, [item.id]: true }))
    await supabase.from('estoque').update({ quantidade: parseInt(qtd) || 0 }).eq('id', item.id)
    setSaving(s => ({ ...s, [item.id]: false }))
    setLista(l => l.map(i => i.id === item.id ? { ...i, quantidade: parseInt(qtd) || 0 } : i))
  }

  const filtrado = lista.filter(i =>
    !busca || i.produtos?.nome?.toLowerCase().includes(busca.toLowerCase()) ||
    i.produtos?.codigo_barras?.includes(busca)
  )

  return (
    <div>
      <PageHeader title="Estoque" />
      <div className="px-6 py-4 flex gap-4 items-end flex-wrap">
        <Field label="Condomínio">
          <select value={unidade} onChange={e => { setUnidade(e.target.value); loadEstoque(e.target.value) }}
            className={inputCls + ' w-64'}>
            <option value="">Selecione...</option>
            {unidades.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
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
                <th className="px-4 py-3">Categoria</th>
                <th className="px-4 py-3 w-36">Estoque</th>
                <th className="px-4 py-3"></th>
              </tr></thead>
              <tbody>
                {filtrado.map(item => (
                  <tr key={item.id} className="border-b border-vallen-border/50">
                    <td className="px-4 py-2 font-mono text-xs text-vallen-muted">{item.produtos?.codigo_barras}</td>
                    <td className="px-4 py-2 text-vallen-white">
                      {item.produtos?.nome}
                      {item.produtos?.restrito_idade && <span className="ml-1 text-xs text-yellow-400">+18</span>}
                    </td>
                    <td className="px-4 py-2 text-vallen-muted text-xs">{item.produtos?.categoria || '—'}</td>
                    <td className="px-4 py-2">
                      <input type="number" min="0" defaultValue={item.quantidade}
                        onBlur={e => salvarQtd(item, e.target.value)}
                        className="w-24 bg-vallen-dark border border-vallen-border rounded px-2 py-1 text-sm text-vallen-white focus:outline-none focus:border-vallen-green" />
                    </td>
                    <td className="px-4 py-2">
                      {saving[item.id] && <span className="text-xs text-vallen-muted">Salvando...</span>}
                      {item.quantidade === 0 && !saving[item.id] &&
                        <span className="text-xs text-red-400">Sem estoque</span>}
                    </td>
                  </tr>
                ))}
                {!filtrado.length && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-vallen-muted">
                    {lista.length ? 'Nenhum resultado' : 'Nenhum produto nesta unidade — adicione produtos via botão abaixo'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-vallen-muted mt-3">
            Clique no campo de quantidade e pressione Tab/Enter para salvar. Para adicionar produtos ao estoque desta unidade, use a página Produtos e depois atualize o estoque aqui.
          </p>
        </div>
      )}
    </div>
  )
}

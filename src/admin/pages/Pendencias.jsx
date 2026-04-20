import { useEffect, useState, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { PageHeader } from '../components/PageHeader.jsx'
import { Modal } from '../components/Modal.jsx'
import { Field, inputCls, Btn } from '../components/Field.jsx'
import { useFranqueado } from '../lib/franqueadoContext.jsx'

export function Pendencias() {
  const { unidadeId } = useFranqueado()
  const [itens, setItens] = useState([])
  const [categorias, setCategorias] = useState([])
  const [loading, setLoading] = useState(true)
  const [erroCarga, setErroCarga] = useState('')
  const [aberto, setAberto] = useState(null) // pendência em edição

  async function carregar() {
    if (!unidadeId) return
    setLoading(true)
    setErroCarga('')
    const [a, b] = await Promise.all([
      supabase.rpc('listar_pendencias', { p_unidade_id: unidadeId }),
      supabase.rpc('listar_categorias_unidade', { p_unidade_id: unidadeId }),
    ])
    if (a.error) setErroCarga(a.error.message)
    setItens(a.data || [])
    setCategorias(b.data || [])
    setLoading(false)
  }

  useEffect(() => { carregar() }, [unidadeId])

  // Realtime: se nova pendência chega, recarrega
  useEffect(() => {
    if (!unidadeId) return
    const ch = supabase
      .channel(`pend-${unidadeId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'pendencias_planograma', filter: `unidade_id=eq.${unidadeId}` },
        () => carregar())
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [unidadeId])

  const cadastrados  = itens.filter(i => i.produto_cadastrado)
  const desconhecidos = itens.filter(i => !i.produto_cadastrado)

  return (
    <div>
      <PageHeader
        title="Pendências do planograma"
        action={<Btn variant="ghost" onClick={carregar}>↻ Recarregar</Btn>}
      />

      <div className="p-6 space-y-8">
        {loading && <p className="text-sm text-vallen-muted">Carregando…</p>}
        {erroCarga && <p className="text-sm text-red-400">{erroCarga}</p>}

        {!loading && itens.length === 0 && (
          <div className="bg-vallen-card border border-vallen-border rounded-xl p-10 text-center">
            <div className="text-4xl mb-2">✨</div>
            <h3 className="text-vallen-white font-bold">Nenhuma pendência</h3>
            <p className="text-sm text-vallen-muted mt-1">
              Todos os códigos lidos nesta unidade estão no planograma.
            </p>
          </div>
        )}

        {cadastrados.length > 0 && (
          <Secao
            titulo="No catálogo — faltam no planograma"
            subtitulo="Produtos já cadastrados; só definir preço e estoque."
          >
            {cadastrados.map(p => (
              <CardCadastrado key={p.id} item={p} onClick={() => setAberto(p)} />
            ))}
          </Secao>
        )}

        {desconhecidos.length > 0 && (
          <Secao
            titulo="Códigos desconhecidos"
            subtitulo="Nunca cadastrados no catálogo. Clique para cadastrar."
          >
            {desconhecidos.map(p => (
              <CardDesconhecido key={p.id} item={p} onClick={() => setAberto(p)} />
            ))}
          </Secao>
        )}
      </div>

      {aberto && (
        <ModalEdicao
          item={aberto}
          categorias={categorias}
          onClose={() => setAberto(null)}
          onSalvo={() => { setAberto(null); carregar() }}
          unidadeId={unidadeId}
        />
      )}
    </div>
  )
}

// ── Seções/cards ────────────────────────────────────────────────────────────
function Secao({ titulo, subtitulo, children }) {
  return (
    <section>
      <header className="mb-3">
        <h2 className="text-vallen-white font-bold text-sm uppercase tracking-wider">{titulo}</h2>
        <p className="text-xs text-vallen-muted mt-0.5">{subtitulo}</p>
      </header>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

function CardCadastrado({ item, onClick }) {
  return (
    <button onClick={onClick}
      className="w-full flex items-center gap-4 bg-vallen-card border border-vallen-border rounded-xl p-3 hover:border-vallen-green transition-colors text-left">
      <div className="w-14 h-14 bg-vallen-dark border border-vallen-border rounded-lg flex items-center justify-center text-2xl shrink-0">
        {item.produto_imagem_url
          ? <img src={item.produto_imagem_url} alt="" className="w-full h-full object-cover rounded-lg" />
          : (item.produto_emoji || '📦')}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-vallen-white font-semibold text-sm truncate">{item.produto_nome}</div>
        <div className="text-xs text-vallen-muted font-mono">{item.codigo_barras}</div>
        {item.produto_categoria && (
          <div className="text-[10px] text-vallen-green font-bold uppercase tracking-wider mt-1">
            {item.produto_categoria}
          </div>
        )}
      </div>
      <TentativasBadge n={item.tentativas} />
    </button>
  )
}

function CardDesconhecido({ item, onClick }) {
  return (
    <button onClick={onClick}
      className="w-full flex items-center gap-4 bg-vallen-card border-2 border-vallen-green rounded-xl p-3 hover:bg-vallen-card/80 transition-colors text-left">
      <div className="w-14 h-14 bg-vallen-green rounded-lg flex items-center justify-center text-2xl shrink-0">
        🔍
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-vallen-white font-bold font-mono">{item.codigo_barras}</div>
        <div className="text-xs text-vallen-green font-semibold mt-0.5">
          Toque para cadastrar
        </div>
      </div>
      <TentativasBadge n={item.tentativas} />
    </button>
  )
}

function TentativasBadge({ n }) {
  return (
    <span className="shrink-0 bg-vallen-dark border border-vallen-border text-vallen-muted text-xs font-bold px-2.5 py-1 rounded-full">
      {n}x
    </span>
  )
}

// ── Modal ───────────────────────────────────────────────────────────────────
function ModalEdicao({ item, categorias, onClose, onSalvo, unidadeId }) {
  const cadastrado = item.produto_cadastrado
  return (
    <Modal
      title={cadastrado ? 'Adicionar ao planograma' : 'Cadastrar produto'}
      onClose={onClose}
    >
      <div className="text-xs text-vallen-muted mb-4 font-mono">{item.codigo_barras}</div>
      {cadastrado
        ? <FormAdicionar item={item} unidadeId={unidadeId} onSalvo={onSalvo} />
        : <FormCadastrar item={item} categorias={categorias} unidadeId={unidadeId} onSalvo={onSalvo} />}
    </Modal>
  )
}

function FormAdicionar({ item, unidadeId, onSalvo }) {
  const [preco, setPreco] = useState(item.produto_preco_ref ? String(item.produto_preco_ref) : '')
  const [controla, setControla] = useState(true)
  const [qtd, setQtd] = useState('0')
  const [erro, setErro] = useState('')
  const [saving, setSaving] = useState(false)

  async function salvar() {
    const p = parseFloat(String(preco).replace(',', '.'))
    if (!p || p <= 0) return setErro('Informe um preço válido')
    const q = controla ? parseInt(qtd, 10) : null
    if (controla && (Number.isNaN(q) || q < 0)) return setErro('Quantidade inválida')
    setErro(''); setSaving(true)
    const { error } = await supabase.rpc('adicionar_ao_planograma', {
      p_unidade_id: unidadeId,
      p_produto_id: item.produto_id,
      p_preco_venda: p,
      p_quantidade: q,
      p_controla_estoque: controla,
    })
    setSaving(false)
    if (error) return setErro(error.message)
    onSalvo()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 bg-vallen-dark border border-vallen-border rounded-lg p-3">
        <div className="w-14 h-14 bg-vallen-card border border-vallen-border rounded-lg flex items-center justify-center text-2xl">
          {item.produto_imagem_url
            ? <img src={item.produto_imagem_url} alt="" className="w-full h-full object-cover rounded-lg" />
            : (item.produto_emoji || '📦')}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-vallen-white font-semibold text-sm truncate">{item.produto_nome}</div>
          {item.produto_categoria && (
            <div className="text-[10px] text-vallen-green font-bold uppercase tracking-wider mt-0.5">
              {item.produto_categoria}
            </div>
          )}
        </div>
      </div>

      <Field label="Preço de venda (R$)">
        <input className={inputCls} value={preco} onChange={e => setPreco(e.target.value)}
          inputMode="decimal" placeholder="0,00" />
      </Field>

      <Switch label="Controlar estoque nesta unidade" valor={controla} onValor={setControla} />

      {controla && (
        <Field label="Quantidade inicial">
          <input className={inputCls} value={qtd} onChange={e => setQtd(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric" />
        </Field>
      )}

      {erro && <p className="text-red-400 text-sm">{erro}</p>}

      <Btn onClick={salvar} disabled={saving} className="w-full">
        {saving ? 'Salvando…' : 'Adicionar ao planograma'}
      </Btn>
    </div>
  )
}

function FormCadastrar({ item, categorias, unidadeId, onSalvo }) {
  const [nome, setNome] = useState('')
  const [preco, setPreco] = useState('')
  const [categoria, setCategoria] = useState('')
  const [emoji, setEmoji] = useState('')
  const [fotoFile, setFotoFile] = useState(null)
  const [fotoPreview, setFotoPreview] = useState('')
  const [restrito, setRestrito] = useState(false)
  const [controla, setControla] = useState(true)
  const [qtd, setQtd] = useState('0')
  const [erro, setErro] = useState('')
  const [saving, setSaving] = useState(false)
  const fileRef = useRef(null)

  function escolherFoto(e) {
    const f = e.target.files?.[0]
    if (!f) return
    setFotoFile(f)
    setFotoPreview(URL.createObjectURL(f))
  }

  async function uploadFoto() {
    if (!fotoFile) return null
    const safe = item.codigo_barras.replace(/[^A-Za-z0-9_-]/g, '_')
    const ext = fotoFile.name.match(/\.(\w+)$/)?.[1] || 'jpg'
    const path = `u${unidadeId}/${safe}_${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('produto-fotos')
      .upload(path, fotoFile, { upsert: true, contentType: fotoFile.type })
    if (error) throw error
    const { data } = supabase.storage.from('produto-fotos').getPublicUrl(path)
    return data.publicUrl
  }

  async function salvar() {
    const p = parseFloat(String(preco).replace(',', '.'))
    if (!nome.trim())       return setErro('Informe o nome')
    if (!p || p <= 0)       return setErro('Informe um preço válido')
    const q = controla ? parseInt(qtd, 10) : null
    if (controla && (Number.isNaN(q) || q < 0)) return setErro('Quantidade inválida')

    setErro(''); setSaving(true)
    try {
      const imagemUrl = await uploadFoto()
      const { error } = await supabase.rpc('cadastrar_produto_pendencia', {
        p_unidade_id: unidadeId,
        p_codigo_barras: item.codigo_barras,
        p_nome: nome.trim(),
        p_preco_venda: p,
        p_categoria: categoria || null,
        p_emoji: emoji.trim() || null,
        p_imagem_url: imagemUrl,
        p_restrito_idade: restrito,
        p_quantidade: q,
        p_controla_estoque: controla,
      })
      if (error) throw error
      onSalvo()
    } catch (e) {
      setErro(e.message || 'Falha ao salvar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* foto */}
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => fileRef.current?.click()}
          className="w-20 h-20 bg-vallen-dark border border-vallen-border rounded-lg flex items-center justify-center text-vallen-muted hover:border-vallen-green overflow-hidden">
          {fotoPreview
            ? <img src={fotoPreview} alt="" className="w-full h-full object-cover" />
            : (emoji || '📷')}
        </button>
        <div className="text-sm space-y-1">
          <div className="text-vallen-white font-semibold">
            {fotoPreview ? 'Foto selecionada' : 'Foto do produto'}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => fileRef.current?.click()}
              className="text-xs text-vallen-green hover:text-vallen-greenLight">
              {fotoPreview ? 'Trocar' : 'Escolher'}
            </button>
            {fotoPreview && (
              <button type="button" onClick={() => { setFotoFile(null); setFotoPreview('') }}
                className="text-xs text-red-400 hover:text-red-300">
                Remover
              </button>
            )}
          </div>
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={escolherFoto} />

      <Field label="Nome do produto">
        <input className={inputCls} value={nome} onChange={e => setNome(e.target.value)} autoFocus />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Preço de venda (R$)">
          <input className={inputCls} value={preco} onChange={e => setPreco(e.target.value)}
            inputMode="decimal" placeholder="0,00" />
        </Field>
        <Field label="Emoji (opcional)">
          <input className={inputCls} value={emoji} onChange={e => setEmoji(e.target.value.slice(0, 4))}
            placeholder="🥤" />
        </Field>
      </div>

      <Field label="Categoria">
        <div className="flex flex-wrap gap-2">
          {categorias.length === 0 && (
            <p className="text-xs text-vallen-muted">Nenhuma categoria cadastrada para este franqueado.</p>
          )}
          {categorias.map(c => {
            const sel = categoria === c.nome
            return (
              <button key={c.nome} type="button"
                onClick={() => setCategoria(sel ? '' : c.nome)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors
                  ${sel
                    ? 'bg-vallen-green text-white border-vallen-green'
                    : 'bg-vallen-dark text-vallen-muted border-vallen-border hover:border-vallen-green'}`}>
                {c.emoji ? `${c.emoji} ${c.nome}` : c.nome}
              </button>
            )
          })}
        </div>
      </Field>

      <Switch label="Restrito +18" valor={restrito} onValor={setRestrito} />
      <Switch label="Controlar estoque" valor={controla} onValor={setControla} />

      {controla && (
        <Field label="Quantidade inicial">
          <input className={inputCls} value={qtd} onChange={e => setQtd(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric" />
        </Field>
      )}

      {erro && <p className="text-red-400 text-sm">{erro}</p>}

      <Btn onClick={salvar} disabled={saving} className="w-full">
        {saving ? 'Salvando…' : 'Cadastrar produto'}
      </Btn>
    </div>
  )
}

function Switch({ label, valor, onValor }) {
  return (
    <button type="button" onClick={() => onValor(!valor)}
      className="w-full flex items-center justify-between bg-vallen-dark border border-vallen-border rounded-lg px-4 py-3 hover:border-vallen-green transition-colors">
      <span className="text-sm text-vallen-white font-semibold">{label}</span>
      <span className={`w-10 h-6 rounded-full relative transition-colors ${valor ? 'bg-vallen-green' : 'bg-vallen-border'}`}>
        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all ${valor ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
    </button>
  )
}

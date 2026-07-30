import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { tocarSucesso, tocarErro } from '../../mesa/utils/audio.js'
import { Header } from '../components/Header'

const brl = v => `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`

// Fila de aprovação de preço (admin). Aprova → aplica; rejeita → arquiva.
export function Aprovacoes({ unidadeId, unidadeNome, onVoltar }) {
  const [lista, setLista] = useState(null)
  const [busy, setBusy]   = useState(null)

  function carregar() {
    supabase.rpc('listar_alteracoes_pendentes', { p_unidade_id: unidadeId })
      .then(({ data }) => setLista(data || []))
  }
  useEffect(() => { carregar() }, [unidadeId])

  async function decidir(id, aprovar) {
    setBusy(id)
    const { error } = await supabase.rpc('decidir_alteracao_preco', { p_id: id, p_aprovar: aprovar })
    setBusy(null)
    if (error) { tocarErro(); alert(error.message); return }
    tocarSucesso()
    carregar()
  }

  return (
    <div className="flex flex-col h-full bg-vallen-dark">
      <Header titulo="Aprovar preços" emoji="✅" unidadeNome={unidadeNome} onVoltar={onVoltar} />
      <div className="flex-1 overflow-y-auto">
        {lista === null ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-4 border-vallen-green border-t-transparent rounded-full animate-spin" />
          </div>
        ) : lista.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-vallen-gray p-6 text-center">
            <span className="text-5xl">👍</span>
            <p>Nenhum preço aguardando aprovação</p>
          </div>
        ) : (
          <div className="divide-y divide-vallen-border">
            {lista.map(a => (
              <div key={a.id} className="px-4 py-4 space-y-3">
                <div>
                  <p className="text-vallen-white font-bold">{a.produto_nome}</p>
                  <p className="text-vallen-muted text-sm">
                    <span className="line-through">{brl(a.preco_antigo)}</span>
                    <span className="mx-2 text-vallen-white">→</span>
                    <span className="text-vallen-green font-bold text-base">{brl(a.preco_novo)}</span>
                  </p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => decidir(a.id, false)} disabled={busy === a.id}
                    className="flex-1 py-3 rounded-xl bg-vallen-card border border-red-500/40 text-red-400 font-bold disabled:opacity-40">
                    Recusar
                  </button>
                  <button onClick={() => decidir(a.id, true)} disabled={busy === a.id}
                    className="flex-1 py-3 rounded-xl bg-vallen-green text-white font-bold disabled:opacity-40">
                    {busy === a.id ? '…' : 'Aprovar'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

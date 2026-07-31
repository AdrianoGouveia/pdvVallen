import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { tocarSucesso, tocarErro } from '../../mesa/utils/audio.js'
import { Header } from '../components/Header'

// Fila de divergências de contagem (gerente valida). Aprovar → atualiza o estoque.
export function Divergencias({ unidadeId, unidadeNome, onVoltar }) {
  const [lista, setLista] = useState(null)
  const [busy, setBusy]   = useState(null)

  function carregar() {
    supabase.rpc('listar_divergencias', { p_unidade_id: unidadeId })
      .then(({ data, error }) => { if (error) { tocarErro(); setLista([]) } else setLista(data || []) })
  }
  useEffect(() => { carregar() }, [unidadeId])

  async function decidir(itemId, aprovar) {
    setBusy(itemId)
    const { error } = await supabase.rpc('aprovar_divergencia', { p_item_id: itemId, p_aprovar: aprovar })
    setBusy(null)
    if (error) { tocarErro(); alert(error.message); return }
    tocarSucesso()
    carregar()
  }

  return (
    <div className="flex flex-col h-full bg-vallen-dark">
      <Header titulo="Validar contagem" emoji="🔍" unidadeNome={unidadeNome} onVoltar={onVoltar} />
      <div className="flex-1 overflow-y-auto">
        {lista === null ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-4 border-vallen-green border-t-transparent rounded-full animate-spin" />
          </div>
        ) : lista.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-vallen-gray p-6 text-center">
            <span className="text-5xl">👍</span>
            <p>Nenhuma divergência aguardando validação</p>
          </div>
        ) : (
          <div className="divide-y divide-vallen-border">
            {lista.map(it => {
              const d = (it.qtd_recontada ?? 0) - (it.qtd_sistema ?? 0)
              const falta = d < 0
              return (
                <div key={it.item_id} className="px-4 py-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{it.emoji || '📦'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-vallen-white font-bold truncate">{it.produto_nome}</p>
                      <p className="text-vallen-muted text-xs">
                        Sistema {it.qtd_sistema ?? '—'} · 1ª contagem {it.qtd_contada} · 2ª contagem <b className="text-vallen-white">{it.qtd_recontada}</b>
                      </p>
                    </div>
                    <span className={`font-black text-lg ${falta ? 'text-red-400' : 'text-orange-400'}`}>
                      {falta ? '↓' : '↑'} {Math.abs(d)}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => decidir(it.item_id, false)} disabled={busy === it.item_id}
                      className="flex-1 py-3 rounded-xl bg-vallen-card border border-red-500/40 text-red-400 font-bold disabled:opacity-40">
                      Recusar
                    </button>
                    <button onClick={() => decidir(it.item_id, true)} disabled={busy === it.item_id}
                      className="flex-1 py-3 rounded-xl bg-vallen-green text-white font-bold disabled:opacity-40">
                      {busy === it.item_id ? '…' : `Aprovar → estoque ${it.qtd_recontada}`}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

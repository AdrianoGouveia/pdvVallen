import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { inputCls, Btn } from './Field.jsx'

// Gerencia as maquininhas (terminais) de uma loja/unidade, com o vínculo ao DWPDV
// (dwpdv_destino = destino do StockInventories, ex.: 1, 155). Sem hard-delete: usa
// ativar/desativar (a RLS de terminais não permite DELETE anon + preserva histórico).
export function MaquininhasLoja({ unidadeId, franqueadoId }) {
  const [lista, setLista] = useState([])
  const [nova, setNova]   = useState({ nome: '', serial: '', dwpdv_destino: '' })

  const load = useCallback(async () => {
    const { data } = await supabase.from('terminais').select('*').eq('unidade_id', unidadeId).order('nome')
    setLista(data || [])
  }, [unidadeId])
  useEffect(() => { if (unidadeId) load() }, [unidadeId, load])

  async function add() {
    if (!nova.nome.trim()) return
    await supabase.from('terminais').insert({
      unidade_id: unidadeId,
      franqueado_id: franqueadoId ?? null,
      nome: nova.nome.trim(),
      serial: nova.serial.trim() || null,
      dwpdv_destino: nova.dwpdv_destino.trim() || null,
      ativo: true,
    })
    setNova({ nome: '', serial: '', dwpdv_destino: '' }); load()
  }
  const upd = async (id, patch) => { await supabase.from('terminais').update(patch).eq('id', id); load() }

  return (
    <div className="border-t border-vallen-border pt-4 mt-4">
      <p className="text-sm font-medium text-vallen-white mb-1">Maquininhas</p>
      <p className="text-xs text-vallen-muted mb-3">
        <b>Destino</b> = ID da maquininha no DWPDV (ex.: 1, 155) — liga as vendas importadas a esta loja.
      </p>

      <div className="space-y-2">
        {lista.map(t => (
          <div key={t.id} className={`flex gap-2 items-center ${t.ativo ? '' : 'opacity-50'}`}>
            <input className={`${inputCls} flex-1`} defaultValue={t.nome}
              onBlur={e => e.target.value.trim() && e.target.value.trim() !== t.nome && upd(t.id, { nome: e.target.value.trim() })}
              placeholder="Nome" />
            <input className={`${inputCls} w-32`} defaultValue={t.serial || ''}
              onBlur={e => (e.target.value.trim() || null) !== t.serial && upd(t.id, { serial: e.target.value.trim() || null })}
              placeholder="Serial" />
            <input className={`${inputCls} w-24`} defaultValue={t.dwpdv_destino || ''}
              onBlur={e => (e.target.value.trim() || null) !== t.dwpdv_destino && upd(t.id, { dwpdv_destino: e.target.value.trim() || null })}
              placeholder="Destino" inputMode="numeric" />
            <Btn type="button" variant={t.ativo ? 'danger' : 'ghost'} onClick={() => upd(t.id, { ativo: !t.ativo })}>
              {t.ativo ? 'Desativar' : 'Ativar'}
            </Btn>
          </div>
        ))}
        {!lista.length && <p className="text-xs text-vallen-muted">Nenhuma maquininha cadastrada.</p>}
      </div>

      <div className="flex gap-2 items-center mt-3">
        <input className={`${inputCls} flex-1`} value={nova.nome} onChange={e => setNova(p => ({ ...p, nome: e.target.value }))} placeholder="Nome" />
        <input className={`${inputCls} w-32`} value={nova.serial} onChange={e => setNova(p => ({ ...p, serial: e.target.value }))} placeholder="Serial" />
        <input className={`${inputCls} w-24`} value={nova.dwpdv_destino} onChange={e => setNova(p => ({ ...p, dwpdv_destino: e.target.value }))} placeholder="Destino" inputMode="numeric" />
        <Btn type="button" onClick={add}>+ Add</Btn>
      </div>
    </div>
  )
}

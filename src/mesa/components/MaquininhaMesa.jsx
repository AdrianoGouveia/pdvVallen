import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'

export function MaquininhaMesa({ cart, total, unidadeId, clienteId, onSuccess, onVoltar }) {
  const [fase, setFase]             = useState('carregando')
  const [terminais, setTerminais]   = useState([])
  const [terminalId, setTerminalId] = useState(null)
  const [pedidoId, setPedidoId]     = useState(null)
  const [segundos, setSegundos]     = useState(0)
  const [erro, setErro]             = useState('')

  // Carrega terminais da unidade
  useEffect(() => {
    if (!unidadeId) return
    supabase.from('terminais')
      .select('id, nome')
      .eq('unidade_id', unidadeId)
      .eq('ativo', true)
      .order('nome')
      .then(({ data, error }) => {
        if (error) { setErro(error.message); setFase('erro'); return }
        const lista = data ?? []
        setTerminais(lista)
        if (lista.length === 0) { setErro('Nenhum terminal cadastrado nesta unidade.'); setFase('erro'); return }
        if (lista.length === 1) enviar(lista[0].id)
        else setFase('escolhendo')
      })
  }, [unidadeId])

  async function enviar(tid) {
    setTerminalId(tid)
    setFase('criando')
    try {
      const { data, error } = await supabase.from('pedidos').insert({
        total,
        status: 'aguardando',
        provider: 'maquininha',
        unidade_id: unidadeId,
        terminal_id: tid,
        ...(clienteId ? { cliente_id: clienteId } : {}),
      }).select('id').single()
      if (error) throw error
      setPedidoId(data.id)
      setFase('aguardando')
    } catch (e) {
      setErro(e.message || 'Erro ao criar pedido')
      setFase('erro')
    }
  }

  const handleAprovado = useCallback(async () => {
    for (const item of cart) {
      try { await supabase.rpc('vender_item', { p_unidade_id: unidadeId, p_produto_id: item.id, p_qtd: item.quantidade }) } catch (_) {}
    }
    onSuccess(pedidoId)
  }, [cart, pedidoId, onSuccess])

  useEffect(() => {
    if (fase !== 'aguardando' || !pedidoId) return
    const timer = setInterval(() => setSegundos(s => s + 1), 1000)

    const channel = supabase.channel(`mesa-pedido-maq-${pedidoId}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'pedidos', filter: `id=eq.${pedidoId}` },
        p => {
          const st = p.new?.status
          if (st === 'aprovado') handleAprovado()
          else if (st === 'recusado' || st === 'cancelado') {
            setErro(st === 'cancelado' ? 'Pagamento cancelado na maquininha.' : 'Pagamento recusado.')
            setFase('erro')
          }
        })
      .subscribe()

    const poll = setInterval(async () => {
      try {
        const { data } = await supabase.from('pedidos').select('status').eq('id', pedidoId).single()
        if (data?.status === 'aprovado') handleAprovado()
        else if (data?.status === 'recusado' || data?.status === 'cancelado') {
          setErro(data.status === 'cancelado' ? 'Pagamento cancelado na maquininha.' : 'Pagamento recusado.')
          setFase('erro')
        }
      } catch (_) {}
    }, 3000)

    return () => { clearInterval(timer); clearInterval(poll); supabase.removeChannel(channel) }
  }, [fase, pedidoId, handleAprovado])

  const mm = String(Math.floor(segundos / 60)).padStart(2, '0')
  const ss = String(segundos % 60).padStart(2, '0')

  if (fase === 'carregando' || fase === 'criando') return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4">
      <div className="w-10 h-10 border-4 border-vallen-green border-t-transparent rounded-full animate-spin" />
      <p className="text-vallen-muted text-sm">
        {fase === 'carregando' ? 'Buscando maquininhas...' : 'Enviando pedido...'}
      </p>
    </div>
  )

  if (fase === 'erro') return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 gap-4">
      <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 w-full">
        <p className="text-red-400 text-sm text-center">{erro}</p>
      </div>
      <button onClick={onVoltar} className="w-full py-3 bg-vallen-card border border-vallen-border text-vallen-white rounded-xl">
        ← Voltar
      </button>
    </div>
  )

  if (fase === 'escolhendo') return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 gap-5">
      <div className="text-6xl">💳</div>
      <h2 className="text-xl font-bold text-center">Escolha a maquininha</h2>
      <div className="bg-vallen-card border border-vallen-border rounded-2xl px-10 py-4 text-center w-full max-w-xs">
        <p className="text-sm text-vallen-muted mb-1">Valor</p>
        <p className="text-3xl font-black text-vallen-green">R$ {total.toFixed(2)}</p>
      </div>
      <div className="w-full max-w-xs flex flex-col gap-2">
        {terminais.map(t => (
          <button key={t.id} onClick={() => enviar(t.id)}
            className="w-full py-4 bg-vallen-green hover:bg-vallen-greenLight text-white font-bold rounded-2xl text-base">
            {t.nome}
          </button>
        ))}
      </div>
      <button onClick={onVoltar} className="text-sm text-vallen-muted hover:text-vallen-white">
        ← Voltar
      </button>
    </div>
  )

  // fase === 'aguardando'
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 gap-6">
      <div className="text-6xl">💳</div>
      <h2 className="text-2xl font-bold text-center">Pague na maquininha</h2>
      <div className="bg-vallen-card border border-vallen-border rounded-2xl px-10 py-6 text-center w-full max-w-xs">
        <p className="text-sm text-vallen-muted mb-1">Valor total</p>
        <p className="text-5xl font-black text-vallen-green">R$ {total.toFixed(2)}</p>
      </div>
      <div className="flex items-center justify-center gap-2">
        <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
        <p className="text-sm text-vallen-muted">Aguardando confirmação... {mm}:{ss}</p>
      </div>
      <p className="text-xs text-vallen-muted text-center max-w-xs">
        Aproxime, insira ou passe o cartão na maquininha{terminais.length > 1 && terminalId ? ` "${terminais.find(t => t.id === terminalId)?.nome || ''}"` : ''}.
      </p>
      <button onClick={onVoltar} className="text-sm text-vallen-muted hover:text-vallen-white">
        Cancelar
      </button>
    </div>
  )
}

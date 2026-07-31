import { getConnector } from './factory.js'

// Ponto ÚNICO e agnóstico de finalização de venda aprovada. Substitui o
// "marca aprovado + loop vender_item" hoje inline no verificar-pix/cartao.
// Em Modo B (INTEGRACAO_POS=none) o comportamento é IDÊNTICO ao atual:
//   marca pedido aprovado + baixa estoque via vender_item.
// Em Modo A (dwpdv): marca aprovado, NÃO baixa local, e enfileira p/ o HUB.
// Idempotente: se já aprovado, não refaz baixa/enfileiramento.
export async function finalizeSale(supabase, pedidoId) {
  const { data: pedido } = await supabase
    .from('pedidos').select('status,unidade_id').eq('id', pedidoId).single()
  if (pedido?.status === 'aprovado') return { jaAprovado: true }

  await supabase.from('pedidos').update({ status: 'aprovado' }).eq('id', pedidoId)

  const { data: itens } = await supabase
    .from('itens_pedido').select('produto_id,quantidade').eq('pedido_id', pedidoId)

  const pos = getConnector()
  const ctx = { pedidoId, unidadeId: pedido?.unidade_id }
  await pos.reservaEstoqueLocal(supabase, ctx, itens ?? [])
  await pos.enfileirarVenda(supabase, { pedidoId, unidadeId: pedido?.unidade_id, itens: itens ?? [] })
  return { ok: true }
}

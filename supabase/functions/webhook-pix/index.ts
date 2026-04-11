import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

serve(async (req) => {
  try {
    const body = await req.json()

    // Asaas envia evento: { event: 'PAYMENT_RECEIVED', payment: { id, status, ... } }
    const { event, payment } = body

    if (event !== 'PAYMENT_RECEIVED' && event !== 'PAYMENT_CONFIRMED') {
      return new Response('ok', { status: 200 })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

    // Buscar pedido pelo asaas_id
    const { data: pedido, error } = await supabase
      .from('pedidos')
      .select('id, status')
      .eq('asaas_id', payment.id)
      .single()

    if (error || !pedido) {
      return new Response('pedido não encontrado', { status: 200 })
    }

    if (pedido.status === 'aprovado') {
      return new Response('já processado', { status: 200 })
    }

    // Atualizar status para aprovado
    await supabase
      .from('pedidos')
      .update({ status: 'aprovado' })
      .eq('id', pedido.id)

    // Baixar estoque dos itens
    const { data: itens } = await supabase
      .from('itens_pedido')
      .select('produto_id, quantidade')
      .eq('pedido_id', pedido.id)

    for (const item of (itens ?? [])) {
      const { data: prod } = await supabase
        .from('produtos')
        .select('estoque')
        .eq('id', item.produto_id)
        .single()

      const novoEstoque = Math.max(0, (prod?.estoque ?? 0) - item.quantidade)
      await supabase
        .from('produtos')
        .update({ estoque: novoEstoque })
        .eq('id', item.produto_id)
    }

    return new Response('ok', { status: 200 })
  } catch (err: any) {
    console.error('Webhook erro:', err.message)
    return new Response('erro interno', { status: 500 })
  }
})

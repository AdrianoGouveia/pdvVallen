import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// EFI envia GET para validar o endpoint — deve retornar 200
serve(async (req) => {
  if (req.method === 'GET') return new Response('ok', { status: 200 })
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })

  try {
    const body = await req.json()

    // EFI Charges webhook payload: { id, status, type, ... }
    // O campo relevante é: body.data.charge_id e body.type = 'charge.link.paid' ou similar
    const chargeId = body?.charge_id ?? body?.data?.charge_id
    const status   = body?.status    ?? body?.data?.status

    if (!chargeId || status !== 'paid') {
      return new Response('ignored', { status: 200 })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

    const { data: pedido } = await supabase
      .from('pedidos')
      .select('id, status')
      .eq('efi_charge_id', chargeId)
      .single()

    if (!pedido || pedido.status === 'aprovado') {
      return new Response('already processed', { status: 200 })
    }

    await supabase.from('pedidos').update({ status: 'aprovado' }).eq('id', pedido.id)

    const { data: itens } = await supabase
      .from('itens_pedido').select('produto_id, quantidade').eq('pedido_id', pedido.id)

    if (itens) {
      for (const item of itens) {
        await supabase.rpc('decrementar_estoque', {
          p_produto_id: item.produto_id,
          p_quantidade: item.quantidade,
        })
      }
    }

    return new Response('ok', { status: 200 })
  } catch (err: any) {
    console.error('webhook-efi-cartao:', err.message)
    return new Response('error', { status: 500 })
  }
})

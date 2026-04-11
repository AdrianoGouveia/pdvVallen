import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// A EFI envia um GET primeiro para validar o endpoint — deve retornar 200
// Depois envia POST com os dados do pagamento
serve(async (req) => {
  if (req.method === 'GET') {
    return new Response('ok', { status: 200 })
  }

  if (req.method !== 'POST') {
    return new Response('method not allowed', { status: 405 })
  }

  try {
    const body = await req.json()
    // Formato EFI: { pix: [{ endToEndId, txid, valor, horario, infoPagador?, ... }] }
    const pixList: any[] = body?.pix ?? []

    if (pixList.length === 0) {
      return new Response('no pix', { status: 200 })
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

    for (const pix of pixList) {
      const txid = pix.txid
      if (!txid) continue

      // Buscar pedido pelo efi_txid
      const { data: pedido } = await supabase
        .from('pedidos')
        .select('id, status')
        .eq('efi_txid', txid)
        .single()

      if (!pedido || pedido.status === 'aprovado') continue

      // Confirmar pagamento
      await supabase
        .from('pedidos')
        .update({ status: 'aprovado' })
        .eq('id', pedido.id)

      // Decrementar estoque dos itens
      const { data: itens } = await supabase
        .from('itens_pedido')
        .select('produto_id, quantidade')
        .eq('pedido_id', pedido.id)

      if (itens) {
        for (const item of itens) {
          await supabase.rpc('decrementar_estoque', {
            p_produto_id: item.produto_id,
            p_quantidade: item.quantidade,
          })
        }
      }
    }

    return new Response('ok', { status: 200 })
  } catch (err: any) {
    console.error('webhook-efi-pix error:', err.message)
    return new Response('error', { status: 500 })
  }
})

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const EFI_URL           = 'https://cobrancas.api.efipay.com.br'
const EFI_CLIENT_ID     = Deno.env.get('EFI_CLIENT_ID')!
const EFI_CLIENT_SECRET = Deno.env.get('EFI_CLIENT_SECRET')!
const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY      = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const cors = {
  'Access-Control-Allow-Origin' : '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function getToken(): Promise<string> {
  const res = await fetch(`${EFI_URL}/oauth/token`, {
    method : 'POST',
    headers: {
      'Authorization': `Basic ${btoa(`${EFI_CLIENT_ID}:${EFI_CLIENT_SECRET}`)}`,
      'Content-Type' : 'application/json',
    },
    body: JSON.stringify({ grant_type: 'client_credentials' }),
  })
  if (!res.ok) throw new Error(`EFI auth: ${await res.text()}`)
  return (await res.json()).access_token
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { pedidoId, chargeId } = await req.json()
    if (!chargeId) throw new Error('chargeId obrigatório')

    const token    = await getToken()
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

    // Consultar status no EFI
    const statusRes = await fetch(`${EFI_URL}/v1/charge/${chargeId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
    if (!statusRes.ok) throw new Error(`EFI status: ${await statusRes.text()}`)
    const statusData = await statusRes.json()
    const efiStatus  = statusData.data?.status as string   // 'new'|'waiting'|'paid'|'unpaid'|...

    const pago = efiStatus === 'paid'

    // Se pago, atualizar pedido no Supabase
    if (pago && pedidoId) {
      const { data: atual } = await supabase
        .from('pedidos').select('status').eq('id', pedidoId).single()

      if (atual?.status !== 'aprovado') {
        await supabase.from('pedidos').update({ status: 'aprovado' }).eq('id', pedidoId)

        // Decrementar estoque
        const { data: itens } = await supabase
          .from('itens_pedido').select('produto_id, quantidade').eq('pedido_id', pedidoId)

        if (itens) {
          for (const item of itens) {
            await supabase.rpc('decrementar_estoque', {
              p_produto_id: item.produto_id,
              p_quantidade: item.quantidade,
            })
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ status: efiStatus, pago }),
      { headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  }
})

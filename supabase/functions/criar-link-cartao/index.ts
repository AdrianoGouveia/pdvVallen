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
    const { items, total, unidadeId } = await req.json()
    if (!total || total <= 0) throw new Error('Valor inválido')

    const token     = await getToken()
    const supabase  = createClient(SUPABASE_URL, SUPABASE_KEY)
    const valorCts  = Math.round(total * 100)   // EFI usa centavos

    // 1. Criar cobrança
    const chargeRes = await fetch(`${EFI_URL}/v1/charge`, {
      method : 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{
          name  : `Compra Vallen Market — ${items.length} item${items.length > 1 ? 's' : ''}`,
          amount: 1,
          value : valorCts,
        }],
        shippings: [],
      }),
    })
    if (!chargeRes.ok) throw new Error(`EFI charge: ${await chargeRes.text()}`)
    const chargeData = await chargeRes.json()
    const chargeId   = chargeData.data.charge_id as number

    // 2. Salvar pedido (rascunho) para obter o ID antes do link
    const { data: pedido, error: pedidoErr } = await supabase
      .from('pedidos')
      .insert({
        total,
        status       : 'aguardando',
        provider     : 'efi_cartao',
        efi_charge_id: chargeId,
        ...(unidadeId ? { unidade_id: unidadeId } : {}),
      })
      .select('id')
      .single()

    if (pedidoErr) throw new Error(`Pedido: ${pedidoErr.message}`)

    // 3. Gerar link de pagamento (expira em 30 min)
    const expireAt = new Date(Date.now() + 30 * 60 * 1000).toISOString().split('T')[0]
    const linkRes  = await fetch(`${EFI_URL}/v1/charge/${chargeId}/link`, {
      method : 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        billet_discount         : 0,
        card_discount           : 0,
        message                 : `Pedido #${pedido.id} — Vallen Market`,
        expire_at               : expireAt,
        request_delivery_address: false,
        payment_method          : 'credit_card',
      }),
    })
    if (!linkRes.ok) throw new Error(`EFI link: ${await linkRes.text()}`)
    const linkData = await linkRes.json()

    // 4. Salvar itens do pedido
    await supabase.from('itens_pedido').insert(
      items.map((i: any) => ({
        pedido_id     : pedido.id,
        produto_id    : i.id,
        quantidade    : i.quantidade,
        preco_unitario: i.preco,
      }))
    )

    return new Response(
      JSON.stringify({
        pedidoId      : pedido.id,
        chargeId,
        linkPagamento : linkData.data.payment_url,
        valor         : total,
      }),
      { headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
    )
  }
})

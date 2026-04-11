import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ASAAS_URL  = Deno.env.get('ASAAS_URL')  // sandbox ou produção
const ASAAS_KEY  = Deno.env.get('ASAAS_API_KEY')
const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin' : '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { items, total } = await req.json()

    if (!total || total <= 0) {
      throw new Error('Valor inválido: ' + total)
    }

    // 1. Criar cobrança PIX no Asaas
    const cobranca = await fetch(`${ASAAS_URL}/v3/payments`, {
      method : 'POST',
      headers: {
        'Content-Type': 'application/json',
        'access_token': ASAAS_KEY!,
      },
      body: JSON.stringify({
        billingType   : 'PIX',
        customer      : 'cus_000170573824', // PDV Vallen Anônimo
        value         : total,
        dueDate       : new Date(Date.now() + 30 * 60 * 1000).toISOString().split('T')[0], // vence em 30min
        description   : `Compra PDV Vallen — ${items.length} item(ns)`,
        externalReference: `PDV-${Date.now()}`,
      }),
    })

    if (!cobranca.ok) {
      const err = await cobranca.text()
      throw new Error(`Asaas: ${err}`)
    }

    const cobrancaData = await cobranca.json()

    // 2. Buscar QR Code PIX
    const qrRes  = await fetch(`${ASAAS_URL}/v3/payments/${cobrancaData.id}/pixQrCode`, {
      headers: { 'access_token': ASAAS_KEY! },
    })
    const qrData = await qrRes.json()

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

    // 3. Salvar pedido com asaas_id para o webhook encontrar
    const { data: pedido, error: pedidoErr } = await supabase
      .from('pedidos')
      .insert({
        total,
        status         : 'aguardando',
        asaas_id       : cobrancaData.id,
        asaas_reference: cobrancaData.externalReference,
      })
      .select('id')
      .single()

    if (pedidoErr) throw new Error(`Pedido: ${pedidoErr.message}`)

    // 4. Atualizar descrição da cobrança no Asaas com número do pedido
    await fetch(`${ASAAS_URL}/v3/payments/${cobrancaData.id}`, {
      method : 'PUT',
      headers: { 'Content-Type': 'application/json', 'access_token': ASAAS_KEY! },
      body: JSON.stringify({
        description: `Pedido #${pedido.id} — Vallen Market (${items.length} item${items.length > 1 ? 's' : ''})`,
      }),
    })

    // 5. Salvar itens do pedido
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
        pedidoId : pedido.id,
        asaasId  : cobrancaData.id,
        qrCode   : qrData.payload,
        valor    : total,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

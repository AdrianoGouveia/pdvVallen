import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── Env vars ──────────────────────────────────────────────────────────────────
const ASAAS_URL  = Deno.env.get('ASAAS_URL')!
const ASAAS_KEY  = Deno.env.get('ASAAS_API_KEY')!

const EFI_URL        = 'https://pix.api.efipay.com.br'
const EFI_CLIENT_ID  = Deno.env.get('EFI_CLIENT_ID')!
const EFI_CLIENT_SECRET = Deno.env.get('EFI_CLIENT_SECRET')!
const EFI_PIX_KEY    = Deno.env.get('EFI_PIX_KEY')!
const EFI_CERT_B64   = Deno.env.get('EFI_CERT_B64')!
const EFI_KEY_B64    = Deno.env.get('EFI_KEY_B64')!

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin' : '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ── EFI Pay ───────────────────────────────────────────────────────────────────
function criarClienteEfi() {
  const cert = atob(EFI_CERT_B64)
  const key  = atob(EFI_KEY_B64)
  // Deno 1.40+: usa 'cert' e 'key' (antigo: certChain / privateKey)
  // deno-lint-ignore no-explicit-any
  return (Deno.createHttpClient as any)({ cert, key })
}

async function obterTokenEfi(client: Deno.HttpClient): Promise<string> {
  const creds = btoa(`${EFI_CLIENT_ID}:${EFI_CLIENT_SECRET}`)
  const res = await fetch(`${EFI_URL}/oauth/token`, {
    method : 'POST',
    client,
    headers: {
      'Authorization': `Basic ${creds}`,
      'Content-Type' : 'application/json',
    },
    body: JSON.stringify({ grant_type: 'client_credentials' }),
  })
  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`EFI auth: ${txt}`)
  }
  const data = await res.json()
  return data.access_token
}

async function criarCobrancaEfi(
  total: number,
  items: any[],
  pedidoId: number,
): Promise<{ qrCode: string; efiTxid: string }> {
  const client = criarClienteEfi()
  const token  = await obterTokenEfi(client)

  const txid = `PDV${pedidoId}T${Date.now()}`

  const cobRes = await fetch(`${EFI_URL}/v2/cob/${txid}`, {
    method : 'PUT',
    client,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type' : 'application/json',
    },
    body: JSON.stringify({
      calendario : { expiracao: 3600 },
      valor      : { original: total.toFixed(2) },
      chave      : EFI_PIX_KEY,
      solicitacaoPagador: `Pedido #${pedidoId} — Vallen Market (${items.length} item${items.length > 1 ? 's' : ''})`,
    }),
  })

  if (!cobRes.ok) {
    const txt = await cobRes.text()
    throw new Error(`EFI cob: ${txt}`)
  }

  // Buscar QR Code
  const qrRes = await fetch(`${EFI_URL}/v2/cob/${txid}/qrcode`, {
    client,
    headers: { 'Authorization': `Bearer ${token}` },
  })
  if (!qrRes.ok) {
    const txt = await qrRes.text()
    throw new Error(`EFI qrcode: ${txt}`)
  }
  const qrData = await qrRes.json()

  return { qrCode: qrData.qrcode, efiTxid: txid }
}

// ── Asaas ─────────────────────────────────────────────────────────────────────
async function criarCobrancaAsaas(
  total: number,
  items: any[],
  pedidoId: number,
): Promise<{ qrCode: string; asaasId: string }> {
  const cobranca = await fetch(`${ASAAS_URL}/v3/payments`, {
    method : 'POST',
    headers: { 'Content-Type': 'application/json', 'access_token': ASAAS_KEY },
    body: JSON.stringify({
      billingType      : 'PIX',
      customer         : 'cus_000170573824',
      value            : total,
      dueDate          : new Date(Date.now() + 30 * 60 * 1000).toISOString().split('T')[0],
      description      : `Pedido #${pedidoId} — Vallen Market (${items.length} item${items.length > 1 ? 's' : ''})`,
      externalReference: `PDV-${pedidoId}`,
    }),
  })
  if (!cobranca.ok) throw new Error(`Asaas payment: ${await cobranca.text()}`)
  const cobData = await cobranca.json()

  const qrRes  = await fetch(`${ASAAS_URL}/v3/payments/${cobData.id}/pixQrCode`, {
    headers: { 'access_token': ASAAS_KEY },
  })
  if (!qrRes.ok) throw new Error(`Asaas qrcode: ${await qrRes.text()}`)
  const qrData = await qrRes.json()

  return { qrCode: qrData.payload, asaasId: cobData.id }
}

// ── Handler ───────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { items, total, unidadeId } = await req.json()
    if (!total || total <= 0) throw new Error('Valor inválido: ' + total)

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

    // 1. Ler configuração de gateway
    const { data: cfg } = await supabase
      .from('config_pagamento')
      .select('provider_modo, limite_efi')
      .eq('id', 1)
      .single()

    const modo      = cfg?.provider_modo  ?? 'asaas'
    const limiteEfi = cfg?.limite_efi     ?? 80

    let provider: 'asaas' | 'efi'
    if      (modo === 'asaas') provider = 'asaas'
    else if (modo === 'efi')   provider = 'efi'
    else                       provider = total <= limiteEfi ? 'efi' : 'asaas'

    // 2. Criar pedido rascunho para obter ID antes de chamar o gateway
    const { data: pedido, error: pedidoErr } = await supabase
      .from('pedidos')
      .insert({
        total,
        status    : 'aguardando',
        provider,
        ...(unidadeId ? { unidade_id: unidadeId } : {}),
      })
      .select('id')
      .single()

    if (pedidoErr) throw new Error(`Pedido: ${pedidoErr.message}`)

    // 3. Criar cobrança no gateway escolhido
    let qrCode: string
    let asaasId: string | null = null
    let efiTxid: string | null = null

    if (provider === 'efi') {
      const res = await criarCobrancaEfi(total, items, pedido.id)
      qrCode   = res.qrCode
      efiTxid  = res.efiTxid
    } else {
      const res = await criarCobrancaAsaas(total, items, pedido.id)
      qrCode  = res.qrCode
      asaasId = res.asaasId
    }

    // 4. Atualizar pedido com IDs do gateway
    await supabase.from('pedidos').update({
      ...(asaasId ? { asaas_id: asaasId, asaas_reference: `PDV-${pedido.id}` } : {}),
      ...(efiTxid ? { efi_txid: efiTxid } : {}),
    }).eq('id', pedido.id)

    // 5. Salvar itens
    await supabase.from('itens_pedido').insert(
      items.map((i: any) => ({
        pedido_id     : pedido.id,
        produto_id    : i.id,
        quantidade    : i.quantidade,
        preco_unitario: i.preco,
      }))
    )

    return new Response(
      JSON.stringify({ pedidoId: pedido.id, qrCode, valor: total, provider }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

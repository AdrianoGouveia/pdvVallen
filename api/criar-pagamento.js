// Vercel Serverless Function — Node.js (OpenSSL, tolerante ao TLS close_notify da EFI)
import https from 'https'
import { randomBytes } from 'crypto'
import { createClient } from '@supabase/supabase-js'

// ── Agentes HTTP ──────────────────────────────────────────────────────────────
const certPem = Buffer.from(process.env.EFI_CERT_B64 ?? '', 'base64').toString()
const keyPem  = Buffer.from(process.env.EFI_KEY_B64  ?? '', 'base64').toString()

// Ambas as APIs EFI precisam de mTLS; rejectUnauthorized:false tolera a chain da EFI
const efiAgent  = new https.Agent({ cert: certPem, key: keyPem, rejectUnauthorized: false })
// Asaas usa HTTPS normal
const plainAgent = new https.Agent()

// ── Helper HTTP ───────────────────────────────────────────────────────────────
function req(hostname, path, method, headers, body, agent = plainAgent) {
  const bodyBuf = body ? Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)) : null
  return new Promise((resolve, reject) => {
    const options = {
      hostname, path, method,
      headers: {
        ...headers,
        ...(bodyBuf ? { 'Content-Length': bodyBuf.length } : {}),
      },
      agent,
    }
    const r = https.request(options, (res) => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString()
        let data
        try { data = JSON.parse(text) } catch { data = text }
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, data })
      })
    })
    r.on('error', reject)
    if (bodyBuf) r.write(bodyBuf)
    r.end()
  })
}

// ── EFI PIX ───────────────────────────────────────────────────────────────────
async function getEfiPixToken() {
  const creds = Buffer.from(`${process.env.EFI_CLIENT_ID}:${process.env.EFI_CLIENT_SECRET}`).toString('base64')
  const { ok, data } = await req(
    'pix.api.efipay.com.br', '/oauth/token', 'POST',
    { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    'grant_type=client_credentials',
    efiAgent
  )
  if (!ok || !data.access_token) throw new Error(`EFI PIX auth: ${JSON.stringify(data)}`)
  return data.access_token
}

async function criarCobPix(total, items, pedidoId) {
  const token = await getEfiPixToken()
  // txid deve ter 26-35 chars alfanuméricos: ^[a-zA-Z0-9]{26,35}$
  const txid  = randomBytes(16).toString('hex')  // 32 chars [0-9a-f] ✓

  const { ok: cobOk, data: cobData } = await req(
    'pix.api.efipay.com.br', `/v2/cob/${txid}`, 'PUT',
    { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    {
      calendario : { expiracao: 3600 },
      valor      : { original: total.toFixed(2) },
      chave      : process.env.EFI_PIX_KEY,
      solicitacaoPagador: `Pedido #${pedidoId} — Vallen Market (${items.length} item${items.length > 1 ? 's' : ''})`,
    },
    efiAgent
  )
  if (!cobOk) throw new Error(`EFI PIX cob: ${JSON.stringify(cobData)}`)

  // QR Code: o endpoint correto usa loc.id (não o txid)
  const locId = cobData.loc?.id
  if (!locId) throw new Error(`EFI PIX sem loc.id: ${JSON.stringify(cobData)}`)

  const { ok: qrOk, data: qrData } = await req(
    'pix.api.efipay.com.br', `/v2/loc/${locId}/qrcode`, 'GET',
    { 'Authorization': `Bearer ${token}` },
    null, efiAgent
  )
  if (!qrOk) throw new Error(`EFI PIX qrcode: ${JSON.stringify(qrData)}`)

  return { qrCode: qrData.qrcode, efiTxid: cobData.txid ?? txid }
}

// ── EFI Cartão ────────────────────────────────────────────────────────────────
async function getEfiCartoToken() {
  const creds = Buffer.from(`${process.env.EFI_CLIENT_ID}:${process.env.EFI_CLIENT_SECRET}`).toString('base64')
  const { ok, data } = await req(
    'cobrancas.api.efipay.com.br', '/v1/authorize', 'POST',
    { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    'grant_type=client_credentials',
    plainAgent  // Cobranças não usa mTLS
  )
  if (!ok || !data.access_token) throw new Error(`EFI Cartão auth: ${JSON.stringify(data)}`)
  return data.access_token
}

async function criarLinkCartao(total, items, pedidoId) {
  const token      = await getEfiCartoToken()
  const valorCts   = Math.round(total * 100)
  const expireAt   = new Date(Date.now() + 30 * 60 * 1000).toISOString().split('T')[0]

  const { ok: chOk, data: chData } = await req(
    'cobrancas.api.efipay.com.br', '/v1/charge', 'POST',
    { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    {
      items: [{
        name  : `Compra Vallen Market — ${items.length} item${items.length > 1 ? 's' : ''}`,
        amount: 1,
        value : valorCts,
      }],
      shippings: [],
    },
    plainAgent  // sem mTLS
  )
  if (!chOk) throw new Error(`EFI Cartão charge: ${JSON.stringify(chData)}`)
  const chargeId = chData.data.charge_id

  const { ok: lkOk, data: lkData } = await req(
    'cobrancas.api.efipay.com.br', `/v1/charge/${chargeId}/link`, 'POST',
    { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    {
      billet_discount: 0, card_discount: 0,
      message        : `Pedido #${pedidoId} — Vallen Market`,
      expire_at      : expireAt,
      request_delivery_address: false,
      payment_method : 'credit_card',
    },
    plainAgent  // sem mTLS
  )
  if (!lkOk) throw new Error(`EFI Cartão link: ${JSON.stringify(lkData)}`)

  return { linkPagamento: lkData.data.payment_url, chargeId }
}

// ── Asaas PIX ─────────────────────────────────────────────────────────────────
async function criarCobAsaas(total, items, pedidoId) {
  const asaasHost = new URL(process.env.ASAAS_URL).hostname

  const { ok: pOk, data: pData } = await req(
    asaasHost, '/v3/payments', 'POST',
    { 'Content-Type': 'application/json', 'access_token': process.env.ASAAS_API_KEY },
    {
      billingType      : 'PIX',
      customer         : 'cus_000170573824',
      value            : total,
      dueDate          : new Date(Date.now() + 30 * 60 * 1000).toISOString().split('T')[0],
      description      : `Pedido #${pedidoId} — Vallen Market (${items.length} item${items.length > 1 ? 's' : ''})`,
      externalReference: `PDV-${pedidoId}`,
    }
  )
  if (!pOk) throw new Error(`Asaas payment: ${JSON.stringify(pData)}`)

  const { ok: qOk, data: qData } = await req(
    asaasHost, `/v3/payments/${pData.id}/pixQrCode`, 'GET',
    { 'access_token': process.env.ASAAS_API_KEY }
  )
  if (!qOk) throw new Error(`Asaas qrcode: ${JSON.stringify(qData)}`)

  return { qrCode: qData.payload, asaasId: pData.id }
}

// ── Handler principal ─────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })

  try {
    const { items, total, unidadeId, tipo } = req.body
    if (!total || total <= 0) throw new Error('Valor inválido')

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    // Decidir provider
    let provider
    if (tipo === 'cartao') {
      provider = 'efi_cartao'
    } else {
      // Ler configuração de gateway para PIX
      const { data: cfg } = await supabase
        .from('config_pagamento').select('provider_modo,limite_efi').eq('id', 1).single()
      const modo      = cfg?.provider_modo ?? 'asaas'
      const limiteEfi = cfg?.limite_efi    ?? 80
      if      (modo === 'asaas') provider = 'asaas'
      else if (modo === 'efi')   provider = 'efi_pix'
      else                       provider = total <= limiteEfi ? 'efi_pix' : 'asaas'
    }

    // Criar pedido rascunho
    const { data: pedido, error: pedidoErr } = await supabase
      .from('pedidos')
      .insert({
        total, status: 'aguardando', provider,
        ...(unidadeId ? { unidade_id: unidadeId } : {}),
      })
      .select('id').single()
    if (pedidoErr) throw new Error(`Pedido: ${pedidoErr.message}`)

    // Chamar gateway
    let result = {}
    if (provider === 'efi_pix') {
      const { qrCode, efiTxid } = await criarCobPix(total, items, pedido.id)
      await supabase.from('pedidos').update({ efi_txid: efiTxid }).eq('id', pedido.id)
      result = { qrCode, efiTxid, tipo: 'pix' }
    } else if (provider === 'efi_cartao') {
      const { linkPagamento, chargeId } = await criarLinkCartao(total, items, pedido.id)
      await supabase.from('pedidos').update({ efi_charge_id: chargeId }).eq('id', pedido.id)
      result = { linkPagamento, chargeId, tipo: 'cartao' }
    } else {
      const { qrCode, asaasId } = await criarCobAsaas(total, items, pedido.id)
      await supabase.from('pedidos').update({
        asaas_id: asaasId, asaas_reference: `PDV-${pedido.id}`
      }).eq('id', pedido.id)
      result = { qrCode, tipo: 'pix' }
    }

    // Salvar itens
    await supabase.from('itens_pedido').insert(
      items.map(i => ({
        pedido_id: pedido.id, produto_id: i.id,
        quantidade: i.quantidade, preco_unitario: i.preco,
      }))
    )

    res.status(200).json({ pedidoId: pedido.id, valor: total, provider, ...result })
  } catch (err) {
    console.error('criar-pagamento:', err.message)
    res.status(400).json({ error: err.message })
  }
}

// Vercel Serverless Function — verifica status do pagamento via cartão EFI
import https from 'https'
import { createClient } from '@supabase/supabase-js'

// Cobranças API não usa mTLS — agente padrão do Node.js é suficiente

function req(hostname, path, headers, agent) {
  return new Promise((resolve, reject) => {
    const r = https.request({ hostname, path, method: 'GET', headers, agent }, (res) => {
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString()
        let data; try { data = JSON.parse(text) } catch { data = text }
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, data })
      })
    })
    r.on('error', reject)
    r.end()
  })
}

async function getToken() {
  const creds = Buffer.from(`${process.env.EFI_CLIENT_ID}:${process.env.EFI_CLIENT_SECRET}`).toString('base64')
  const body  = Buffer.from('grant_type=client_credentials')
  return new Promise((resolve, reject) => {
    const r = https.request(
      {
        hostname: 'cobrancas.api.efipay.com.br', path: '/v1/authorize', method: 'POST',
        headers: {
          'Authorization' : `Basic ${creds}`,
          'Content-Type'  : 'application/x-www-form-urlencoded',
          'Content-Length': body.length,
        },
        // Cobranças não usa mTLS
      },
      (res) => {
        const chunks = []
        res.on('data', c => chunks.push(c))
        res.on('end', () => {
          const data = JSON.parse(Buffer.concat(chunks).toString())
          if (!data.access_token) reject(new Error(`EFI auth: ${JSON.stringify(data)}`))
          else resolve(data.access_token)
        })
      }
    )
    r.on('error', reject)
    r.write(body)
    r.end()
  })
}

export default async function handler(request, res) {
  if (request.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })

  try {
    const { pedidoId, chargeId } = request.body
    if (!chargeId) throw new Error('chargeId obrigatório')

    const token = await getToken()
    const { ok, data } = await req(
      'cobrancas.api.efipay.com.br',
      `/v1/charge/${chargeId}`,
      { 'Authorization': `Bearer ${token}` },
    )
    if (!ok) throw new Error(`EFI status: ${JSON.stringify(data)}`)

    const efiStatus = data.data?.status
    const pago = efiStatus === 'paid'

    if (pago && pedidoId) {
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
      const { data: atual } = await supabase.from('pedidos').select('status').eq('id', pedidoId).single()
      if (atual?.status !== 'aprovado') {
        await supabase.from('pedidos').update({ status: 'aprovado' }).eq('id', pedidoId)
        const { data: itens } = await supabase.from('itens_pedido').select('produto_id,quantidade').eq('pedido_id', pedidoId)
        for (const item of itens ?? []) {
          await supabase.rpc('decrementar_estoque', { p_produto_id: item.produto_id, p_quantidade: item.quantidade })
        }
      }
    }

    res.status(200).json({ status: efiStatus, pago })
  } catch (err) {
    console.error('verificar-cartao:', err.message)
    res.status(400).json({ error: err.message })
  }
}

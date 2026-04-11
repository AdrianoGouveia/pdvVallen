// Verifica status do PIX EFI diretamente na API (sem depender de webhook)
import https from 'https'
import { createClient } from '@supabase/supabase-js'

const certPem  = Buffer.from(process.env.EFI_CERT_B64 ?? '', 'base64').toString()
const keyPem   = Buffer.from(process.env.EFI_KEY_B64  ?? '', 'base64').toString()
const efiAgent = new https.Agent({ cert: certPem, key: keyPem, rejectUnauthorized: false })

async function getToken() {
  const creds = Buffer.from(`${process.env.EFI_CLIENT_ID}:${process.env.EFI_CLIENT_SECRET}`).toString('base64')
  return new Promise((resolve, reject) => {
    const body = Buffer.from('grant_type=client_credentials')
    const r = https.request(
      {
        hostname: 'pix.api.efipay.com.br', path: '/oauth/token', method: 'POST',
        headers: {
          'Authorization' : `Basic ${creds}`,
          'Content-Type'  : 'application/x-www-form-urlencoded',
          'Content-Length': body.length,
        },
        agent: efiAgent,
      },
      (res) => {
        const chunks = []
        res.on('data', c => chunks.push(c))
        res.on('end', () => {
          const data = JSON.parse(Buffer.concat(chunks).toString())
          data.access_token ? resolve(data.access_token) : reject(new Error(JSON.stringify(data)))
        })
      }
    )
    r.on('error', reject)
    r.write(body)
    r.end()
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })

  try {
    const { pedidoId, efiTxid } = req.body
    if (!pedidoId) return res.status(400).json({ error: 'pedidoId obrigatório' })

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

    // 1. Checar Supabase primeiro (rápido, sem chamada à EFI)
    const { data: pedido } = await supabase
      .from('pedidos').select('status').eq('id', pedidoId).single()

    if (pedido?.status === 'aprovado') {
      return res.status(200).json({ pago: true, status: 'CONCLUIDA' })
    }

    // 2. Se não aprovado e temos txid, consultar EFI diretamente
    if (!efiTxid) return res.status(200).json({ pago: false, status: 'ATIVA' })

    const token = await getToken()

    await new Promise((resolve, reject) => {
      const r = https.request(
        {
          hostname: 'pix.api.efipay.com.br',
          path    : `/v2/cob/${efiTxid}`,
          method  : 'GET',
          headers : { 'Authorization': `Bearer ${token}` },
          agent   : efiAgent,
        },
        (response) => {
          const chunks = []
          response.on('data', c => chunks.push(c))
          response.on('end', async () => {
            const data = JSON.parse(Buffer.concat(chunks).toString())
            const status = data.status  // 'ATIVA' | 'CONCLUIDA' | 'REMOVIDA_...'
            const pago   = status === 'CONCLUIDA'

            if (pago) {
              // Atualizar Supabase e decrementar estoque
              await supabase.from('pedidos').update({ status: 'aprovado' }).eq('id', pedidoId)

              const { data: itens } = await supabase
                .from('itens_pedido').select('produto_id,quantidade').eq('pedido_id', pedidoId)
              for (const item of itens ?? []) {
                await supabase.rpc('decrementar_estoque', {
                  p_produto_id: item.produto_id,
                  p_quantidade: item.quantidade,
                })
              }
            }

            res.status(200).json({ pago, status })
            resolve()
          })
        }
      )
      r.on('error', reject)
      r.end()
    })
  } catch (err) {
    console.error('verificar-pix:', err.message)
    res.status(400).json({ error: err.message })
  }
}

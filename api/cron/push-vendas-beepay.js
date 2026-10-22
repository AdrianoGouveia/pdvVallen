import { createClient } from '@supabase/supabase-js'
import { BeepayConnector } from '../_pos/BeepayConnector.js'
import { drenarVendasBeepay } from '../_pos/beepay/vendas.js'

// Worker (serverless) Vallen → Beepay: drena integracao.venda_beepay_outbox (alimentada
// pelo trigger trg_pedido_venda_beepay) e grava cada venda aprovada como cupom no Beepay
// (API cupom/save). ADORMECIDO: sem credencial/usuário/terminal responde ok:false com o
// que falta e NÃO toca na fila. Chamado pelo cron da VPS (scripts/cron-beepay.sh).
//   GET/POST /api/cron/push-vendas-beepay[?dry=1&limite=20]   Authorization: Bearer CRON_SECRET
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET, BEEPAY_EMAIL/PASSWORD,
//      BEEPAY_CLIENT_ID/SECRET, BEEPAY_USUARIO, BEEPAY_TERMINAL, BEEPAY_FORMA_PIX|CREDITO|DEBITO.
export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET
  if (!secret) return res.status(503).json({ error: 'CRON_SECRET não configurado' }) // fail-closed (mexe com venda)
  if (req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'unauthorized' })

  const URL = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!URL || !KEY) return res.status(500).json({ error: 'faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' })
  const sb = createClient(URL, KEY, { auth: { persistSession: false } })

  try {
    const r = await drenarVendasBeepay(sb, new BeepayConnector(), {
      dry: req.query?.dry === '1',
      limite: Math.min(Number(req.query?.limite) || 20, 100),
      prazoMs: Number(process.env.BEEPAY_CRON_PRAZO_MS) || 8000,
    })
    res.status(200).json(r)
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e).slice(0, 400) })
  }
}

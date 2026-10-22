import { createClient } from '@supabase/supabase-js'
import { BeepayConnector } from '../_pos/BeepayConnector.js'
import { importarCuponsBeepay } from '../_pos/beepay/vendas.js'

// Worker (serverless) Beepay → Vallen: lê as vendas do PDV Legal/totem (API cupom/get,
// janelas ≤ 10 dias) e importa em integracao.venda_externa (origem='beepay') via RPC
// idempotente importar_vendas_beepay. Pula os cupons que o próprio Vallen mandou (senão a
// venda do app conta 2x no relatório). Default: últimos 3 dias (re-sync cobre estornos).
//   GET /api/cron/sync-vendas-beepay[?desde=AAAA-MM-DD&ate=AAAA-MM-DD&dry=1]
//   Authorization: Bearer CRON_SECRET
// ADORMECIDO: sem BEEPAY_CLIENT_ID/SECRET responde ok:false e não toca em nada.
export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET
  if (!secret) return res.status(503).json({ error: 'CRON_SECRET não configurado' })
  if (req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'unauthorized' })

  const URL = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!URL || !KEY) return res.status(500).json({ error: 'faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' })
  const sb = createClient(URL, KEY, { auth: { persistSession: false } })

  try {
    const q = req.query || {}
    const r = await importarCuponsBeepay(sb, new BeepayConnector(), {
      ...(q.desde ? { desde: String(q.desde) } : {}),
      ...(q.ate ? { ate: String(q.ate) } : {}),
      dry: q.dry === '1',
    })
    res.status(200).json(r)
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e).slice(0, 400) })
  }
}

import { createClient } from '@supabase/supabase-js'
import { BeepayConnector } from '../_pos/BeepayConnector.js'
import { drenarProdutosBeepay } from '../_pos/beepay/produtos.js'

// Worker (serverless) do push de produto Vallen → Beepay: drena
// integracao.produto_beepay_outbox (triggers em produtos/planograma) e cria/atualiza no
// painel do Beepay (login BEEPAY_EMAIL/PASSWORD — não precisa do client_secret).
// Substitui o push-produtos.js (DWPDV). Chamado pelo cron da VPS (scripts/cron-beepay.sh).
//   GET /api/cron/push-produtos-beepay[?dry=1&limite=5&prazo=50000]   Authorization: Bearer CRON_SECRET
//   prazo (ms) ≤ 55 s: maxDuration desta função é 60 s (vercel.json) — usado no backfill
export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET
  if (!secret) return res.status(503).json({ error: 'CRON_SECRET não configurado' })
  if (req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'unauthorized' })

  const URL = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!URL || !KEY) return res.status(500).json({ error: 'faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' })
  const sb = createClient(URL, KEY, { auth: { persistSession: false } })

  try {
    const r = await drenarProdutosBeepay(sb, new BeepayConnector(), {
      dry: req.query?.dry === '1',
      limite: Math.min(Number(req.query?.limite) || 5, 30),
      prazoMs: Math.min(Number(req.query?.prazo) || Number(process.env.BEEPAY_CRON_PRAZO_MS) || 8000, 55_000),
    })
    res.status(200).json(r)
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e).slice(0, 400) })
  }
}
